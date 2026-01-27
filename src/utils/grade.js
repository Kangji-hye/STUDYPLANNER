// src/utils/grade.js

export const GRADE_OTHER = 99;

export function calcGradeCodeFromBirthdate(birthdateStr) {
  const s = String(birthdateStr ?? "").trim();
  if (!s) return null;

  const y = Number(s.slice(0, 4));
  if (!Number.isFinite(y)) return null;

  const currentYear = new Date().getFullYear();

  const code = currentYear - y - 6;

  if (code < -1) return null; // 너무 어림(예: 2022년생)
  if (code > 6) return null;  // 너무 많음(예: 1988년생)

  return code;
}
