// src/utils/saveBestScore.js


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

  if (mine?.length && safeScore < bestScore) {
    return { ok: true, updated: false, reason: "lower_than_best", prevBest: bestScore };
  }

  const { error: delErr } = await supabase
    .from("game_scores")
    .delete()
    .eq("user_id", safeUserId)
    .eq("game_key", safeGameKey)
    .eq("level", safeLevel);

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
    prevBest: mine?.length ? bestScore : 0, // 여기만 null -> 0으로
    score: safeScore,
  };
}
