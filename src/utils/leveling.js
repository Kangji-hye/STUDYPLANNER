// src/utils/leveling.js
//  도장(참 잘했어요) 개수로 레벨(1~99)을 계산하는 유틸

export const MAX_LEVEL = 99;

/**
 * 레벨 -> 다음 레벨로 가기 위해 필요한 도장 수
 * level=1이면 (1->2) 필요한 수
 * level=98이면 (98->99) 필요한 수
 * - 아래 수식의 계수를 올리면 뒤 레벨이 더 어려워집니다.
 * - 줄이면 더 쉬워짐.
 */
export function stampsNeededForNextLevel(level) {
  const lv = Math.max(1, Math.min(MAX_LEVEL, Number(level) || 1));

  // 초반은 1~2개 정도로 쉽게,
  // 뒤로 갈수록 조금씩 더 많이 필요하도록 증가
  // (완만한 증가 + 뒤로 갈수록 더 증가하는 형태)
  const x = lv - 1;

  // 예: lv1->2: 1~2개 / lv10대: 3~5개 / lv50대: 8~12개 / lv90대: 15~20개 정도
  const need = Math.ceil(1 + x * 0.18 + Math.pow(x, 1.25) / 7);

  return Math.max(1, need);
}

/**
 * 도장 총 개수 -> 현재 레벨, 다음 레벨까지 남은 도장, 진행률(0~1)
 */
export function calcLevelFromStamps(stamps) {
  const s = Math.max(0, Number(stamps) || 0);

  let level = 1;
  let remaining = s;

  // 레벨 1부터 시작해서, 다음 레벨로 올라갈 수 있으면 계속 깎아나감
  while (level < MAX_LEVEL) {
    const need = stampsNeededForNextLevel(level);
    if (remaining >= need) {
      remaining -= need;
      level += 1;
    } else {
      // 더 못 올라가면 여기서 멈춤
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

  // 레벨 99 도달
  return {
    level: MAX_LEVEL,
    stampsTotal: s,
    stampsIntoThisLevel: 0,
    stampsToNext: 0,
    needForNext: 0,
    progress: 1,
  };
}

/**
 * 레벨(1~99)을 0~1 위치로 바꿔서 막대에서 화살표 위치 잡을 때 씀
 */
export function levelToRatio(level) {
  const lv = Math.max(1, Math.min(MAX_LEVEL, Number(level) || 1));
  return (lv - 1) / (MAX_LEVEL - 1);
}
