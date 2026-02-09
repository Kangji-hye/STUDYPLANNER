// src/utils/rankingBest.js

function timeMs(v) {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function bestByNickname(list) {
  const map = new Map();

  (list ?? []).forEach((r) => {
    const user_id = r?.user_id ?? null;
    const nickname = String(r?.nickname ?? "").trim();
    const score = Number(r?.score ?? 0);
    const created_at = r?.created_at ?? null;

    const compact = nickname.replace(/\s+/g, "");
    if (!nickname) return;
    if (compact === "익명") return;
    if (compact.startsWith("익명")) return;
    if (compact === "닉네임") return;

    const prev = map.get(nickname);
    if (!prev) {
      map.set(nickname, { user_id, nickname, score, created_at });
      return;
    }

    const prevScore = Number(prev?.score ?? 0);
    if (score > prevScore) {
      map.set(nickname, { user_id, nickname, score, created_at });
      return;
    }

    // 동점이면 더 나중(created_at 최신) 기록을 남김
    if (score === prevScore) {
      const pT = timeMs(prev?.created_at);
      const nT = timeMs(created_at);
      if (nT >= pT) map.set(nickname, { user_id, nickname, score, created_at });
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const ds = Number(b?.score ?? 0) - Number(a?.score ?? 0);
    if (ds !== 0) return ds;
    return timeMs(b?.created_at) - timeMs(a?.created_at);
  });
}

export function bestByUserId(list) {
  const map = new Map();

  for (const r of list ?? []) {
    const userId = r?.user_id ?? "";
    if (!userId) continue;

    const score = Number(r?.score ?? 0);
    const created_at = r?.created_at ?? null;

    const prev = map.get(userId);
    if (!prev) {
      map.set(userId, r);
      continue;
    }

    const prevScore = Number(prev?.score ?? 0);
    if (score > prevScore) {
      map.set(userId, r);
      continue;
    }

    // 동점이면 더 나중(created_at 최신) 기록을 남김
    if (score === prevScore) {
      if (timeMs(created_at) >= timeMs(prev?.created_at)) map.set(userId, r);
    }
  }

  return Array.from(map.values());
}
