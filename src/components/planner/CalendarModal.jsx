// src/components/planner/CalendarModal.jsx
// 달력 드롭다운 — 버튼 바로 아래에 팝오버로 표시

import React, { useMemo, useEffect, useRef, useState } from "react";
import { toKstDayKey, normalizeNoon } from "../../utils/dateKst";

// ── 월 그리드 생성 ──────────────────────────────────
const buildMonthGrid = (year, monthIndex) => {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  const startDay = first.getDay();   // 0(일) ~ 6(토)
  const totalDays = last.getDate();

  const cells = [];
  // 첫 주 앞 빈칸
  for (let i = 0; i < startDay; i++) cells.push(null);
  // 실제 날짜 (정오로 고정 → KST 변환 안정)
  for (let d = 1; d <= totalDays; d++)
    cells.push(new Date(year, monthIndex, d, 12, 0, 0, 0));
  // 마지막 줄 빈칸 채우기
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

// 두 Date가 같은 날인지 비교
const isSameDay = (a, b) =>
  a && b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

// ── 컴포넌트 ────────────────────────────────────────
export default function CalendarModal({
  open,
  onClose,
  anchorRef,       // 달력 버튼의 ref — 위치 계산에 사용
  selectedDate,
  setSelectedDate,
  calMonth,
  setCalMonth,
  doneDayKeys,
}) {
  // 드롭다운의 픽셀 위치 (fixed 기준)
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef(null);

  // open 될 때마다 버튼 위치를 읽어서 드롭다운 좌표 계산
  useEffect(() => {
    if (!open || !anchorRef?.current) return;

    const calc = () => {
      const btn = anchorRef.current.getBoundingClientRect();
      const DROPDOWN_W = 340; // 드롭다운 너비 (CSS와 맞춰야 함)
      const GAP = 6;           // 버튼과의 간격(px)

      // 디바이스(뷰포트) 가로 중앙 정렬
      let left = (window.innerWidth - DROPDOWN_W) / 2;
      let top  = btn.bottom + GAP;

      // 화면 밖 넘침 보정
      if (left < 8) left = 8;
      if (left + DROPDOWN_W > window.innerWidth - 8) {
        left = window.innerWidth - DROPDOWN_W - 8;
      }

      setPos({ top, left });
    };

    calc();
    // 스크롤·리사이즈 시 재계산
    window.addEventListener("resize", calc, { passive: true });
    return () => window.removeEventListener("resize", calc);
  }, [open, anchorRef]);

  // 월 그리드 (useMemo로 불필요한 재계산 방지)
  const monthCells = useMemo(
    () => buildMonthGrid(calMonth.y, calMonth.m),
    [calMonth.y, calMonth.m]
  );

  // 닫혀 있으면 아무것도 렌더링하지 않음
  if (!open) return null;

  return (
    <>
      {/* ── 투명 오버레이: 바깥 클릭 시 닫기 ── */}
      <div className="cal-dropdown-overlay" onClick={onClose} />

      {/* ── 달력 드롭다운 본체 ── */}
      <div
        ref={dropdownRef}
        className="cal-dropdown"
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()} // 내부 클릭이 overlay로 전파되지 않게
      >

        {/* 월 이동 헤더 */}
        <div className="cal-head">
          <button
            type="button"
            className="cal-nav"
            onClick={() => {
              const nm = calMonth.m - 1;
              if (nm < 0) setCalMonth({ y: calMonth.y - 1, m: 11 });
              else        setCalMonth({ y: calMonth.y, m: nm });
            }}
          >
            ◀
          </button>

          <div className="cal-month-label">
            {calMonth.y}년 {calMonth.m + 1}월
          </div>

          <button
            type="button"
            className="cal-nav"
            onClick={() => {
              const nm = calMonth.m + 1;
              if (nm > 11) setCalMonth({ y: calMonth.y + 1, m: 0 });
              else         setCalMonth({ y: calMonth.y, m: nm });
            }}
          >
            ▶
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="cal-week">
          <span className="sun">일</span>
          <span>월</span>
          <span>화</span>
          <span>수</span>
          <span>목</span>
          <span>금</span>
          <span className="sat">토</span>
        </div>

        {/* 날짜 그리드 */}
        <div className="cal-grid">
          {monthCells.map((d, idx) => {
            const isSelected = d && isSameDay(d, selectedDate);
            const isToday    = d && isSameDay(d, new Date());
            const isSunday   = idx % 7 === 0;
            const isSaturday = idx % 7 === 6;

            const dayKey = d ? toKstDayKey(d) : "";
            const isDone = Boolean(d && doneDayKeys && doneDayKeys.has(dayKey));

            return (
              <button
                key={idx}
                type="button"
                className={[
                  "cal-cell",
                  !d        ? "empty"    : "",
                  isSelected ? "selected" : "",
                  isToday    ? "today"    : "",
                  isSunday   ? "sun"      : "",
                  isSaturday ? "sat"      : "",
                ].join(" ")}
                disabled={!d}
                onClick={() => {
                  if (!d) return;
                  setSelectedDate(normalizeNoon(d));
                  requestAnimationFrame(() => onClose());
                }}
              >
                {d ? d.getDate() : ""}
                {/* 완료한 날에는 참잘했어요 도장 */}
                {isDone && (
                  <span className="cal-stamp" aria-label="참 잘했어요" title="참 잘했어요">
                    <span className="stamp-line1">참</span>
                    <span className="stamp-line2">잘했어요</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 오늘로 가기 버튼 */}
        <div className="cal-actions">
          <button
            type="button"
            className="cal-today-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();

              const now = new Date();
              const todayNoon = new Date(
                now.getFullYear(), now.getMonth(), now.getDate(),
                12, 0, 0, 0
              );

              setSelectedDate(todayNoon);
              setCalMonth({ y: todayNoon.getFullYear(), m: todayNoon.getMonth() });
              requestAnimationFrame(() => onClose());
            }}
          >
            오늘로 가기
          </button>
        </div>

      </div>
    </>
  );
}
