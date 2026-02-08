// src/utils/rankingBest.js

// 같은 닉네임이 여러 번 저장되어도 "최고 점수" 1개만 남깁니다.
// (모든 게임 랭킹 공통 규칙)
export function bestByNickname(list) {
  const map = new Map();

  (list ?? []).forEach((r) => {
    const user_id = r?.user_id ?? null;
    const nickname = String(r?.nickname ?? "").trim();
    const score = Number(r?.score ?? 0);

    const compact = nickname.replace(/\s+/g, "");
    if (!nickname) return;
    if (compact === "익명") return;
    if (compact.startsWith("익명")) return;
    if (compact === "닉네임") return;

    const prev = map.get(nickname);
    if (!prev || score > prev.score) {
      map.set(nickname, { user_id, nickname, score });
    }
  });

  return Array.from(map.values()).sort((a, b) => b.score - a.score);
}
