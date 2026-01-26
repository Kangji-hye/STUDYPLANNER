// src/utils/leveling.js
//  도장(참 잘했어요) 개수로 레벨(1~99)을 계산하는 유틸

export const MAX_LEVEL = 99;

export function stampsNeededForNextLevel(level) {
  const lv = Math.max(1, Math.min(MAX_LEVEL, Number(level) || 1));
  const x = lv - 1;

  // 레벨 99 ≈ 도장 1000개 밸런스
  const need = Math.ceil(
    1 + x * 0.12 + Math.pow(x, 1.15) / 12
  );

  return Math.max(1, need);
}

export function calcLevelFromStamps(stamps) {
  const s = Math.max(0, Number(stamps) || 0);

  let level = 1;
  let remaining = s;

  while (level < MAX_LEVEL) {
    const need = stampsNeededForNextLevel(level);
    if (remaining >= need) {
      remaining -= need;
      level += 1;
    } else {
      const progress = need === 0 ? 0 : remaining / need;
      return {
        level,
        stampsTotal: s,
        stampsIntoThisLevel: remaining,
        stampsToNext: need - remaining,
        needForNext: need,
        progress: Math.max(0, Math.min(1, progress)),
      };
    }
  }

  return {
    level: MAX_LEVEL,
    stampsTotal: s,
    stampsIntoThisLevel: 0,
    stampsToNext: 0,
    needForNext: 0,
    progress: 1,
  };
}

export function levelToRatio(level) {
  const lv = Math.max(1, Math.min(MAX_LEVEL, Number(level) || 1));
  return (lv - 1) / (MAX_LEVEL - 1);
}
