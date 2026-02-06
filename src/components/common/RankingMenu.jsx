// src/components/common/RankingMenu.jsx
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

const DEFAULT_GAMES = [
  { label: "한자", value: "hanja", path: "/hanja-ranking" },
  { label: "오목", value: "omok", path: "/omok-ranking" },
  { label: "바둑", value: "baduk", path: "/baduk-ranking" },
];

export default function RankingMenu({
  gameKey,
  onChangeGameKey,
  level,
  onChangeLevel,
  levels,
  games,
  showGameSelect = true,
  gameLabel = "선택",
  levelLabel = "난이도 선택",
}) {
  const navigate = useNavigate();

  const gameItems = useMemo(() => {
    const list = Array.isArray(games) && games.length > 0 ? games : DEFAULT_GAMES;
    return list.map((g) => ({
      label: g.label,
      value: g.value,
      path: g.path,
    }));
  }, [games]);

  const handleGameChange = (nextKey) => {
    onChangeGameKey?.(nextKey);

    const found = gameItems.find((g) => g.value === nextKey);
    if (found?.path) navigate(found.path);
  };

  return (
    <div className="ranking-tip" style={{ margin: "0 0 10px 0" }}>
      <div style={{ display: "grid", gap: 10 }}>
        {showGameSelect && (
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 700 }}>{gameLabel}</div>
            <div className="select-wrap">
              <select
                className="sound-select"
                value={gameKey}
                onChange={(e) => handleGameChange(e.target.value)}
              >
                {gameItems.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>{levelLabel}</div>
          <div className="select-wrap">
            <select
              className="sound-select"
              value={level}
              onChange={(e) => onChangeLevel?.(e.target.value)}
            >
              {(levels ?? []).map((lv) => (
                <option key={lv.value} value={lv.value}>
                  {lv.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
