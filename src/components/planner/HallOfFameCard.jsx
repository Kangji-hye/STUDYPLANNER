// src/components/planner/HallOfFameCard.jsx
// 오늘 함께 해낸 친구들 명예의 전당
import React from "react";

export default function HallOfFameCard({ hofLoading, hof, meId, cutName6 }) {
  const splitBadgeAndName = (nickname) => {
    const s = String(nickname ?? "").trim();
    if (!s) return { badge: "", name: "익명" };

    const parts = s.split(/\s+/);
    if (parts.length >= 2 && Array.from(parts[0]).length <= 3) {
      return { badge: parts[0], name: parts.slice(1).join(" ") };
    }
    return { badge: "", name: s };
  };

  const sortedByTime = React.useMemo(() => {
    if (!hof || hof.length === 0) return [];
    return [...hof].sort(
      (a, b) => new Date(a.finished_at) - new Date(b.finished_at)
    );
  }, [hof]);

  const topThree = React.useMemo(() => sortedByTime.slice(0, 3), [sortedByTime]);

  const shuffledRest = React.useMemo(() => {
    const rest = sortedByTime.slice(3);
    if (rest.length <= 1) return rest;

    const arr = [...rest];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [sortedByTime]);

  const displayHof = React.useMemo(() => {
    return [...topThree, ...shuffledRest];
  }, [topThree, shuffledRest]);

  return (
    <div className="hof-card">
      <div className="hof-head">
        <span className="hof-title">오늘 공부를 완료 한 친구들</span>
      </div>

      {hofLoading ? (
        <div className="hof-empty">불러오는 중...</div>
      ) : (hof?.length ?? 0) === 0 ? (
        <div className="hof-empty">
          오늘의 처음으로 공부를 끝내서 내 이름을 여기에 올려볼까?
        </div>
      ) : (
        <div className="hof-chips" aria-label="오늘 함께 공부한 친구들">
          {displayHof.map((x, idx) => {
            const isMe = meId && x.user_id === meId;

            return (
              <div
                key={`${x.user_id}-${x.finished_at}`}
                className={`hof-chip ${isMe ? "is-me" : ""}`}
                title={x.nickname ?? ""}
              >
                <span className="hof-medal" aria-hidden="true">
                  {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "🏅"}
                </span>

                {(() => {
                  const { badge, name } = splitBadgeAndName(x.nickname);
                  return (
                    <>
                      {badge && (
                        <span className="hof-chip-badge" aria-hidden="true">
                          {badge}
                        </span>
                      )}
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
