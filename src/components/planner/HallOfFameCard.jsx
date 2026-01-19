// src/components/planner/HallOfFameCard.jsx
import React from "react";

export default function HallOfFameCard({ hofLoading, hof, meId, cutName6 }) {
  return (
    <div className="hof-card">
      <div className="hof-head">
        <span className="hof-title">오늘 함께 해낸 친구들</span>
      </div>

      {hofLoading ? (
        <div className="hof-empty">불러오는 중...</div>
      ) : hof.length === 0 ? (
        <div className="hof-empty">오늘의 첫 친구가 되어볼까?</div>
      ) : (
        <div className="hof-chips" aria-label="오늘 함께 공부한 친구들">
          {hof.map((x) => {
            const isMe = meId && x.user_id === meId;

            return (
              <div
                key={`${x.user_id}-${x.finished_at}`}
                className={`hof-chip ${isMe ? "is-me" : ""}`}
                title={x.nickname ?? ""}
              >
                <span className="hof-chip-name">{cutName6(x.nickname)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
