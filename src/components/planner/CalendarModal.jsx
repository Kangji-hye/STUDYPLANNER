// src/components/planner/CalendarModal.jsx
//달력 모달
import React, { useMemo } from "react";

const buildMonthGrid = (year, monthIndex) => {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);

  const startDay = first.getDay();
  const totalDays = last.getDate();

  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, monthIndex, d));
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
                  setSelectedDate(d);
                  onClose();
                }}
              >
                {d ? d.getDate() : ""}
              </button>
            );
          })}
        </div>

        <div className="cal-actions">
          <button
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
          </button>
        </div>
      </div>
    </div>
  );
}
