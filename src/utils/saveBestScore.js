// src/utils/saveBestScore.js

/**
 * 내 점수 "대표 1개"만 남기면서 갱신합니다.
 *
 * 목표
 * - user_id + game_key + level 조합에서 내 기록을 1개만 유지
 * - 점수가 이전보다 높으면 갱신
 * - 점수가 같아도 '더 나중에 한 사람'이 우선되도록(동점 정렬) 기록 시간을 새로 반영
 *   → 기존 행을 지우고 새로 insert 해서 created_at이 최신으로 찍히게 합니다.
 *
 * 주의
 * - game_scores 테이블에 created_at(기본 now())가 있다고 가정합니다.
 * - RLS 정책상 본인(user_id)의 행은 select/insert/delete 가능해야 합니다.
 */
export async function saveBestScore({
  supabase,
  user_id,
  nickname,
  game_key,
  level,
  score,
  maxScan = 300,
}) {
  const safeGameKey = String(game_key ?? "").trim();
  const safeLevel = String(level ?? "").trim();
  const safeUserId = String(user_id ?? "").trim();
  const safeNickname = String(nickname ?? "").trim() || "익명";
  const safeScore = Number(score ?? 0);

  if (!safeUserId || !safeGameKey || !safeLevel) {
    return { ok: false, updated: false, reason: "missing_key" };
  }
  if (!Number.isFinite(safeScore)) {
    return { ok: false, updated: false, reason: "invalid_score" };
  }

  // 1) 내 기존 기록(여러 개가 있을 수 있음)을 가져와서 JS에서 최고점 계산
  const { data: mine, error: readErr } = await supabase
    .from("game_scores")
    .select("id, score, created_at")
    .eq("user_id", safeUserId)
    .eq("game_key", safeGameKey)
    .eq("level", safeLevel)
    .order("created_at", { ascending: false })
    .limit(maxScan);

  if (readErr) {
    return { ok: false, updated: false, reason: "read_failed", error: readErr };
  }

  let bestScore = -Infinity;
  for (const r of mine ?? []) {
    const s = Number(r?.score ?? 0);
    if (Number.isFinite(s)) bestScore = Math.max(bestScore, s);
  }
  if (!Number.isFinite(bestScore)) bestScore = -Infinity;

  // 2) 점수가 더 낮으면 저장하지 않음
  if (mine?.length && safeScore < bestScore) {
    return { ok: true, updated: false, reason: "lower_than_best", prevBest: bestScore };
  }

  // 3) 점수가 같거나 높으면: 기존 내 기록을 정리하고 1개만 새로 insert
  //    (동점도 최신 기록이 우선되게 하려면 timestamp가 갱신되어야 해서 insert로 처리)
  const { error: delErr } = await supabase
    .from("game_scores")
    .delete()
    .eq("user_id", safeUserId)
    .eq("game_key", safeGameKey)
    .eq("level", safeLevel);

  // delete가 실패해도, insert 시도는 해봅니다(중복이 남을 수는 있음)
  if (delErr) {
    // 그래도 insert는 진행
    // eslint-disable-next-line no-console
    console.warn("saveBestScore delete failed:", delErr);
  }

  const { error: insErr } = await supabase.from("game_scores").insert([
    {
      user_id: safeUserId,
      nickname: safeNickname,
      game_key: safeGameKey,
      level: safeLevel,
      score: safeScore,
    },
  ]);

  if (insErr) {
    return { ok: false, updated: false, reason: "insert_failed", error: insErr };
  }

  const isTie = mine?.length && safeScore === bestScore;
  const isUp = !mine?.length || safeScore > bestScore;

  return {
    ok: true,
    updated: true,
    reason: isUp ? "updated_higher" : isTie ? "refreshed_same_score" : "updated",
    prevBest: mine?.length ? bestScore : null,
    score: safeScore,
  };
}
