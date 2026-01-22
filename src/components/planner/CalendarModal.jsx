// src/components/planner/CalendarModal.jsx
//달력 모달
import React, { useMemo } from "react";

const normalizeNoon = (dateObj) => {
  if (!dateObj) return null;
  return new Date(
    dateObj.getFullYear(),
    dateObj.getMonth(),
    dateObj.getDate(),
    12, 0, 0, 0
  );
};

/* KST 기준 YYYY-MM-DD 만들기 */
const toKstDayKey = (dateObj) => {
  if (!dateObj) return "";
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


const buildMonthGrid = (year, monthIndex) => {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);

  const startDay = first.getDay();
  const totalDays = last.getDate();

  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  // for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, monthIndex, d));
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, monthIndex, d, 12, 0, 0, 0));

  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

const isSameDay = (a, b) =>
  a && b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export default function CalendarModal({
  open,
  onClose,
  selectedDate,
  setSelectedDate,
  calMonth,
  setCalMonth,
  doneDayKeys,
}) {
  const monthCells = useMemo(
    () => buildMonthGrid(calMonth.y, calMonth.m),
    [calMonth.y, calMonth.m]
  );

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card calendar-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">날짜 선택</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="cal-head">
          <button
            type="button"
            className="cal-nav"
            onClick={() => {
              const nm = calMonth.m - 1;
              if (nm < 0) setCalMonth({ y: calMonth.y - 1, m: 11 });
              else setCalMonth({ y: calMonth.y, m: nm });
            }}
          >
            ◀
          </button>

          <div className="cal-month-label">{calMonth.y}년 {calMonth.m + 1}월</div>

          <button
            type="button"
            className="cal-nav"
            onClick={() => {
              const nm = calMonth.m + 1;
              if (nm > 11) setCalMonth({ y: calMonth.y + 1, m: 0 });
              else setCalMonth({ y: calMonth.y, m: nm });
            }}
          >
            ▶
          </button>
        </div>

        <div className="cal-week">
          <span className="sun">일</span>
          <span>월</span>
          <span>화</span>
          <span>수</span>
          <span>목</span>
          <span>금</span>
          <span className="sat">토</span>
        </div>

        <div className="cal-grid">
          {monthCells.map((d, idx) => {
            const isSelected = d && isSameDay(d, selectedDate);
            const isToday = d && isSameDay(d, new Date());
            const isSunday = idx % 7 === 0;
            const isSaturday = idx % 7 === 6;

            const dayKey = d ? toKstDayKey(d) : "";
            const isDone = Boolean(d && doneDayKeys && doneDayKeys.has(dayKey));

            return (
              <button
                key={idx}
                type="button"
                className={`cal-cell
                            ${!d ? "empty" : ""}
                            ${isSelected ? "selected" : ""}
                            ${isToday ? "today" : ""}
                            ${isSunday ? "sun" : ""}
                            ${isSaturday ? "sat" : ""}
                          `}
                disabled={!d}
                onClick={() => {
                  if (!d) return;
                  // setSelectedDate(d);
                  // onClose();
                  // ✅ 선택한 날짜를 정오로 고정해서 안정화
                  setSelectedDate(normalizeNoon(d));

                  // ✅ 닫기는 한 프레임 뒤 (iOS에서 클릭/닫힘 타이밍 충돌 방지)
                  requestAnimationFrame(() => onClose());
                  
                }}
              >
                {d ? d.getDate() : ""}
                {/* ✅ 완료한 날이면 "참 잘했어요" 도장 */}
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

        <div className="cal-actions">
          {/* <button
            type="button"
            className="cal-today-btn"
            onClick={() => {
              const d = new Date();
              setSelectedDate(d);
              setCalMonth({ y: d.getFullYear(), m: d.getMonth() });
              onClose();
            }}
          >
            오늘로 가기
          </button> */}

          <button
            type="button"
            className="cal-today-btn"
            onClick={(e) => {
              // ✅ 바깥(backdrop) 클릭으로 닫히는 이벤트와 섞이지 않게 안전장치
              e.preventDefault();
              e.stopPropagation();

              const now = new Date();

              // ✅ "오늘"을 시간 포함(Date.now())으로 넣지 말고, 날짜만 뽑아서 정오로 고정
              const todayNoon = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                12, 0, 0, 0
              );

              setSelectedDate(todayNoon);
              setCalMonth({ y: todayNoon.getFullYear(), m: todayNoon.getMonth() });

              // ✅ 닫기는 한 프레임 뒤 (상태 반영 안정화)
              requestAnimationFrame(() => onClose());
            }}
          >
            오늘로 가기
          </button>

        </div>
      </div>
    </div>
  );
}
