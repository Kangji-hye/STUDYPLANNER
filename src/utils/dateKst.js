// src/utils/dateKst.js

/**
 * KST 기준 YYYY-MM-DD 문자열 반환
 */
export const toKstDayKey = (dateObj = new Date()) => {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(dateObj);

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;

  return `${y}-${m}-${d}`;
};

/**
 * 날짜를 "정오(12:00)"로 고정
 * - iOS/타임존/자정 경계에서 날짜가 흔들리는 현상을 줄여줍니다.
 */
export const normalizeNoon = (dateObj) => {
  if (!dateObj) return null;
  return new Date(
    dateObj.getFullYear(),
    dateObj.getMonth(),
    dateObj.getDate(),
    12, 0, 0, 0
  );
};
