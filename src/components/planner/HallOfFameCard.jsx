// src/components/planner/HallOfFameCard.jsx
//오늘 함께 해낸 친구들 명예의 전당
import React from "react";

export default function HallOfFameCard({ hofLoading, hof, meId, cutName6 }) {
  // ✅ 닉네임 앞에 붙은 메달/이모지를 분리해서 폭을 안정화
  // 예: "🥇 지혜" → badge="🥇", name="지혜"
  // 예: "🏅민준" (띄어쓰기 없음) → 분리 어려워서 name으로 그대로 둠(그래도 CSS로 폭 확보)
  const splitBadgeAndName = (nickname) => {
    const s = String(nickname ?? "").trim();
    if (!s) return { badge: "", name: "익명" };

    const parts = s.split(/\s+/);
    // 첫 토큰이 이모지처럼 보이고(길이 짧음), 뒤에 이름이 있으면 badge로 분리
    if (parts.length >= 2 && Array.from(parts[0]).length <= 3) {
      return { badge: parts[0], name: parts.slice(1).join(" ") };
    }

    return { badge: "", name: s };
  };


  return (
    <div className="hof-card">
      <div className="hof-head">
        <span className="hof-title">오늘 공부를 완료 한 친구들</span>
      </div>

      {hofLoading ? (
        <div className="hof-empty">불러오는 중...</div>
      ) : hof.length === 0 ? (
        <div className="hof-empty">오늘의 처음으로 공부를 끝내서 내 닉네임을 여기에 올려볼까? </div>
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
                <span className="hof-medal" aria-hidden="true">🏅</span>

                {(() => {
                  const { badge, name } = splitBadgeAndName(x.nickname);
                  return (
                    <>
                      {badge && <span className="hof-chip-badge" aria-hidden="true">{badge}</span>}
                      <span className="hof-chip-name">{cutName6(name)}</span>
                    </>
                  );
                })()}

                
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
