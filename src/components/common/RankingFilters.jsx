// src/components/common/RankingFilters.jsx
import React, { useEffect, useMemo } from "react";

export const DEFAULT_GAME_OPTIONS = [
  { label: "구구단 놀이", value: "gugudan" },
  { label: "한글 끝말잇기", value: "wordchain" },
  { label: "영어 놀이", value: "english" },
  { label: "한자 놀이", value: "hanja" },
  { label: "성경퀴즈", value: "bible_quiz" },
  { label: "오목", value: "omok" },
  { label: "바둑", value: "baduk" },
];

export const DEFAULT_LEVELS_BY_GAME = {
  gugudan: [
    { label: "하 (쉬움)", value: "low" },
    { label: "중 (보통)", value: "mid" },
    { label: "상 (어려움)", value: "high" },
  ],
  wordchain: [
    { label: "기록", value: "default" },
  ],
  english: [
    { label: "하 (쉬움)", value: "low" },
    { label: "중 (보통)", value: "mid" },
    { label: "상 (어려움)", value: "high" },
  ],
  hanja: [
    { label: "8급", value: "8" },
    { label: "7급", value: "7" },
    { label: "6급", value: "6" },
  ],
  bible_quiz: [
    { label: "잠언 · 쉬움", value: "proverbs_easy" },
    { label: "잠언 · 어려움", value: "proverbs_hard" },
    { label: "성경인물 · 쉬움", value: "people_easy" },
    { label: "성경인물 · 어려움", value: "people_hard" },
  ],
  omok: [
    { label: "하 (쉬움)", value: "easy" },
    { label: "중 (보통)", value: "normal" },
    { label: "상 (어려움)", value: "hard" },
  ],
  baduk: [
    { label: "하 (쉬움)", value: "easy" },
    { label: "중 (보통)", value: "normal" },
    { label: "상 (어려움)", value: "hard" },
  ],
};

export default function RankingFilters({
  gameLabel = "선택",
  levelLabel = "난이도 선택",
  gameKey,
  onChangeGameKey,
  level,
  onChangeLevel,
  gameOptions = DEFAULT_GAME_OPTIONS,
  levelsByGame = DEFAULT_LEVELS_BY_GAME,
  hideLevelSelectOnSingleLevel = true,

  disabled = false,
}) {
  const safeGameKey = String(gameKey ?? "");

  // 현재 게임에 해당하는 레벨 목록
  const levels = useMemo(() => {
    return levelsByGame?.[safeGameKey] ?? [];
  }, [levelsByGame, safeGameKey]);

  const showGameSelect = Array.isArray(gameOptions) && gameOptions.length > 0;

  // 레벨 셀렉트를 보여줄지 결정
  const showLevelSelect = useMemo(() => {
    if (!Array.isArray(levels) || levels.length === 0) return false;
    if (hideLevelSelectOnSingleLevel && levels.length === 1) return false;
    return true;
  }, [levels, hideLevelSelectOnSingleLevel]);

  // 게임이 바뀌면: 레벨을 그 게임의 첫 번째 값으로 자동 맞춤
  useEffect(() => {
    if (!onChangeLevel) return;

    const first = levels?.[0]?.value;
    if (!first) return;

    // 현재 level이 비어있거나, 새 게임의 레벨 목록에 없는 값이면 첫 값으로 강제
    const current = String(level ?? "");
    const ok = (levels ?? []).some((x) => String(x.value) === current);

    if (!current || !ok) {
      onChangeLevel(first);
    }
  }, [safeGameKey, levels, level, onChangeLevel]);

  // 게임 선택이 처음 비어있을 때도 안전하게 첫 게임으로 맞춰 줌
  useEffect(() => {
    if (!onChangeGameKey) return;

    const current = String(gameKey ?? "");
    if (current) return;

    const firstGame = gameOptions?.[0]?.value;
    if (firstGame) onChangeGameKey(firstGame);
  }, [gameKey, onChangeGameKey, gameOptions]);

  return (
    <div className="ranking-filters">
      {/* 1) 게임 선택 */}
      {showGameSelect ? (
        <div className="ranking-filter-row">
          <div className="ranking-filter-label">{gameLabel}</div>
          <select
            className="ranking-filter-select"
            value={safeGameKey}
            onChange={(e) => onChangeGameKey?.(e.target.value)}
            disabled={disabled}
          >
            {gameOptions.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* 2) 레벨(난이도/급수) 선택 */}
      {showLevelSelect ? (
        <div className="ranking-filter-row">
          <div className="ranking-filter-label">{levelLabel}</div>
          <select
            className="ranking-filter-select"
            value={String(level ?? "")}
            onChange={(e) => onChangeLevel?.(e.target.value)}
            disabled={disabled}
          >
            {(levels ?? []).map((lv) => (
              <option key={lv.value} value={lv.value}>
                {lv.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
