// src/pages/OmokGame.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import "./OmokGame.css";

/**
 * ✅ 초등학생용 오목(5목)
 * - 판: 11x11
 * - 난이도(체감 조정 2차)
 *   하(easy):
 *     1) 내가 바로 이길 수 있으면 이김(너무 바보 방지)
 *     2) 상대가 바로 이기면 막음(필수 방어)
 *     3) 그 외는 "상위 후보 중 랜덤" + 가운데 선호(조금은 그럴듯하게)
 *
 *   중(normal):
 *     1) 내가 바로 이길 수 있으면 이김
 *     2) 상대가 바로 이기면 막음
 *     3) 그 외는 "일부러 실수 확률" + 방어 가중치 크게 낮춘 점수로 상위 후보 랜덤
 *        → 중이 너무 완벽 방어가 되지 않게 만들기
 *
 *   상(hard):
 *     기존 강한 느낌 유지: 후보 넓게 + topK + 2수 미니맥스
 *
 * ✅ UI
 * - 오른쪽 상단: 다시하기 + 햄버거 메뉴 고정
 * - 마지막 수 표시: 방금 둔 칸/돌 강조
 */

export default function OmokGame() {
  const navigate = useNavigate();

  const SIZE = 11;
  const WIN = 5;

  const [level, setLevel] = useState("easy"); // easy / normal / hard
  const [board, setBoard] = useState(() => makeEmptyBoard(SIZE));
  const [turn, setTurn] = useState("P"); // P(사람) / AI
  const [winner, setWinner] = useState(null); // "P" | "AI" | "DRAW" | null
  const [msg, setMsg] = useState("검은돌(나)부터 시작 🙂");

  // ✅ 마지막으로 둔 수(방금 둔 돌 표시용)
  const [lastMove, setLastMove] = useState(null); // { r, c, stone: "B" | "W" }

  const stonesCount = useMemo(() => countStones(board), [board]);

  const reset = () => {
    setBoard(makeEmptyBoard(SIZE));
    setTurn("P");
    setWinner(null);
    setMsg("검은돌(나)부터 시작 🙂");
    setLastMove(null);
  };

  // ✅ AI 차례면 자동으로 한 수 둠
  useEffect(() => {
    if (winner) return;
    if (turn !== "AI") return;

    const t = setTimeout(() => {
      const move = pickAiMove(board, level, SIZE, WIN);

      if (!move) {
        setWinner("DRAW");
        setMsg("비겼어요! 🙂");
        return;
      }

      const next = place(board, move.r, move.c, "W");
      const win = checkWinner(next, WIN);

      setBoard(next);

      // ✅ 컴퓨터가 방금 둔 수 표시
      setLastMove({ r: move.r, c: move.c, stone: "W" });

      if (win === "W") {
        setWinner("AI");
        setMsg("컴퓨터 승리! 다음에는 이길 수 있어요 🙂");
        return;
      }

      if (isFull(next)) {
        setWinner("DRAW");
        setMsg("비겼어요! 🙂");
        return;
      }

      setTurn("P");
      setMsg("내 차례! 검은돌 두기 🙂");
    }, 350);

    return () => clearTimeout(t);
  }, [turn, winner, board, level]);

  const onClickCell = (r, c) => {
    if (winner) return;
    if (turn !== "P") return;
    if (board[r][c] !== null) return;

    const next = place(board, r, c, "B");
    const win = checkWinner(next, WIN);

    setBoard(next);

    // ✅ 내가 방금 둔 수 표시
    setLastMove({ r, c, stone: "B" });

    if (win === "B") {
      setWinner("P");
      setMsg("내가 이겼다! 🎉");
      return;
    }

    if (isFull(next)) {
      setWinner("DRAW");
      setMsg("비겼어요! 🙂");
      return;
    }

    setTurn("AI");
    setMsg("컴퓨터 차례… 🤖");
  };

  return (
    <div className="omok-page">
      <div className="omok-head">
        <button
          type="button"
          className="omok-back"
          onClick={() => navigate("/planner")}
        >
          ← 플래너
        </button>

        <div className="omok-title">⚫ 오목</div>

        {/* ✅ 오른쪽 끝: 다시하기 + 햄버거 메뉴 */}
        <div className="omok-head-right">
          <button type="button" className="omok-restart" onClick={reset}>
            다시하기
          </button>

          <div className="omok-menu">
            <HamburgerMenu />
          </div>
        </div>
      </div>

      <div className="omok-card">
        <div className="omok-row">
          <div className="omok-label">난이도</div>
          <div className="omok-controls">
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="easy">하 (쉬움)</option>
              <option value="normal">중 (보통)</option>
              <option value="hard">상 (어려움)</option>
            </select>

            <div className="omok-mini">
              돌 {stonesCount}개 ·{" "}
              {winner ? "게임 끝" : turn === "P" ? "내 차례" : "컴퓨터 차례"}
            </div>
          </div>
        </div>

        <div className="omok-msg" aria-live="polite">
          {msg}
        </div>
      </div>

      <div className="omok-board" role="grid" aria-label="오목판">
        {board.map((row, r) => (
          <div className="omok-rowline" role="row" key={`r-${r}`}>
            {row.map((cell, c) => {
              const isLast = !!lastMove && lastMove.r === r && lastMove.c === c;

              return (
                <button
                  key={`c-${r}-${c}`}
                  type="button"
                  className={`omok-cell ${isLast ? "last" : ""}`}
                  role="gridcell"
                  onClick={() => onClickCell(r, c)}
                  aria-label={`${r + 1}행 ${c + 1}열`}
                >
                  {cell === "B" ? (
                    <span className={`stone black ${isLast ? "last-stone" : ""}`} />
                  ) : cell === "W" ? (
                    <span className={`stone white ${isLast ? "last-stone" : ""}`} />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {winner && (
        <div className="omok-finish">
          <div className="omok-finish-title">
            {winner === "P"
              ? "내가 이겼어요! 🎉"
              : winner === "AI"
              ? "컴퓨터가 이겼어요 🙂"
              : "비겼어요 🙂"}
          </div>
          <div className="omok-finish-actions">
            <button type="button" className="omok-restart" onClick={reset}>
              한 판 더!
            </button>
            <button
              type="button"
              className="omok-back"
              onClick={() => navigate("/planner")}
            >
              플래너로
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------
   보드/승리 판정 유틸
---------------------------- */

function makeEmptyBoard(size) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null)
  );
}

function place(board, r, c, stone) {
  const next = board.map((row) => [...row]);
  next[r][c] = stone;
  return next;
}

function isFull(board) {
  for (const row of board) for (const v of row) if (v === null) return false;
  return true;
}

function countStones(board) {
  let n = 0;
  for (const row of board) for (const v of row) if (v) n++;
  return n;
}

function checkWinner(board, need) {
  const size = board.length;
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const s = board[r][c];
      if (!s) continue;

      for (const [dr, dc] of dirs) {
        let cnt = 1;
        let rr = r + dr;
        let cc = c + dc;

        while (
          rr >= 0 &&
          rr < size &&
          cc >= 0 &&
          cc < size &&
          board[rr][cc] === s
        ) {
          cnt++;
          rr += dr;
          cc += dc;
        }

        if (cnt >= need) return s;
      }
    }
  }
  return null;
}

/* ---------------------------
   AI 로직(난이도 조절 핵심)
---------------------------- */

function pickAiMove(board, level, size, need) {
  // 하/중은 후보를 좁게(자연스럽게 약화), 상은 넓게(강화)
  const dist = level === "hard" ? 2 : 1;
  const moves = getCandidateMoves(board, size, dist);
  if (moves.length === 0) return null;

  // 1) 즉시 승리 / 즉시 차단은 모든 난이도에서 공통으로 처리
  const winMove = findImmediateWin(board, moves, "W", need);
  if (winMove) return winMove;

  const blockMove = findImmediateWin(board, moves, "B", need);
  if (blockMove) return blockMove;

  // ✅ 하: 너무 랜덤이 아니라 "그럴듯한 랜덤"
  if (level === "easy") {
    // 하에서는 방어/공격을 깊게 계산하지 말고,
    // 상위 후보 몇 개 중 랜덤(가운데 선호)으로만 선택하게 해서
    // "너무 쉽다"를 줄이고, "그래도 이길 수 있다"는 느낌을 유지합니다.
    return pickFromTopKBy(board, moves, size, 10, heuristicScoreEasy);
  }

  // ✅ 중: 아직 어렵다면 "실수 확률"을 줘서 체감을 확 낮춥니다.
  if (level === "normal") {
    // 실수 확률(여기 숫자가 중 난이도 체감을 크게 좌우)
    // 0.30이면 30% 확률로 그냥 무난한 랜덤(가운데 선호) 선택
    const MISTAKE_RATE = 0.35;

    if (Math.random() < MISTAKE_RATE) {
      const weighted = weightToCenter(moves, size);
      return pickWeighted(weighted);
    }

    // 방어 가중치를 확 낮춘 점수로 상위 후보 중 랜덤
    return pickFromTopKBy(board, moves, size, 12, heuristicScoreNormal);
  }

  // ✅ 상: 기존 강한 흐름 유지
  const top = topKByHeuristic(board, moves, size, 10);
  return minimax2(board, top, size);
}

function getCandidateMoves(board, size, dist) {
  // 돌이 없으면 가운데
  const stones = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) if (board[r][c]) stones.push([r, c]);

  if (stones.length === 0) {
    const mid = Math.floor(size / 2);
    return [{ r: mid, c: mid }];
  }

  const set = new Set();
  for (const [sr, sc] of stones) {
    for (let dr = -dist; dr <= dist; dr++) {
      for (let dc = -dist; dc <= dist; dc++) {
        const r = sr + dr;
        const c = sc + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        if (board[r][c] !== null) continue;
        set.add(`${r},${c}`);
      }
    }
  }

  return Array.from(set).map((key) => {
    const [r, c] = key.split(",").map(Number);
    return { r, c };
  });
}

function findImmediateWin(board, moves, stone, need) {
  for (const m of moves) {
    const next = place(board, m.r, m.c, stone);
    const win = checkWinner(next, need);
    if (win === stone) return m;
  }
  return null;
}

/* ---------------------------
   난이도용 점수/선택 helpers
---------------------------- */

// ✅ 하 전용 점수: 아주 단순(공격 조금 + 가운데 선호)
// 방어(opp)는 거의 안 봐서, 하에서도 충분히 이길 구멍이 생깁니다.
function heuristicScoreEasy(board, r, c, size) {
  const my = quickPoint(board, r, c, "W", size);
  const mid = (size - 1) / 2;
  const dist = Math.abs(r - mid) + Math.abs(c - mid);
  const center = Math.max(0, 7 - dist) * 3;
  return my * 0.35 + center;
}

// ✅ 중 전용 점수: 방어 가중치를 더 내림(중이 어려운 핵심 원인 해결)
// 여기 숫자를 더 낮추면 더 쉬워집니다. (0.35~0.55 추천)
function heuristicScoreNormal(board, r, c, size) {
  const my = quickPoint(board, r, c, "W", size);
  const opp = quickPoint(board, r, c, "B", size);
  return my + opp * 0.45;
}

// ✅ 함수 포인터로 topK 랜덤 선택(하/중 공통으로 쓰기 좋게)
function pickFromTopKBy(board, moves, size, k, scoreFn) {
  const scored = moves
    .map((m) => ({ ...m, s: scoreFn(board, m.r, m.c, size) }))
    .sort((a, b) => b.s - a.s);

  const top = scored.slice(0, Math.min(k, scored.length));

  // top 후보 중에서도 "가운데"를 더 선호하게 가중치
  const weighted = top.map((m) => {
    const mid = (size - 1) / 2;
    const dist = Math.abs(m.r - mid) + Math.abs(m.c - mid);
    return { ...m, w: Math.max(1, 12 - dist) + Math.max(0, m.s / 220) };
  });

  return pickWeighted(weighted);
}

function topKByHeuristic(board, moves, size, k) {
  const scored = moves
    .map((m) => ({ ...m, s: heuristicScoreHard(board, m.r, m.c, size) }))
    .sort((a, b) => b.s - a.s);

  return scored
    .slice(0, Math.min(k, scored.length))
    .map(({ r, c }) => ({ r, c }));
}

// ✅ 상 난이도 점수: 내 공격 + 상대 방어도 꽤 챙김
function heuristicScoreHard(board, r, c, size) {
  const my = quickPoint(board, r, c, "W", size);
  const opp = quickPoint(board, r, c, "B", size);
  return my + opp * 1.15;
}

/* ---------------------------
   상 난이도: 2수 미니맥스
---------------------------- */

function minimax2(board, moves, size) {
  let best = moves[0];
  let bestVal = -Infinity;

  for (const m of moves) {
    const afterAi = place(board, m.r, m.c, "W");

    const oppMoves = getCandidateMoves(afterAi, size, 2);
    let worstForMe = Infinity;

    for (const om of oppMoves) {
      const afterOpp = place(afterAi, om.r, om.c, "B");
      const v = boardValue(afterOpp, size);
      if (v < worstForMe) worstForMe = v;
    }

    if (worstForMe > bestVal) {
      bestVal = worstForMe;
      best = m;
    }
  }

  return best;
}

function boardValue(board, size) {
  let v = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== null) continue;
      v += quickPoint(board, r, c, "W", size);
      v -= quickPoint(board, r, c, "B", size);
    }
  }
  return v;
}

/* ---------------------------
   빠른 점수(라인 평가)
---------------------------- */

function quickPoint(board, r, c, stone, size) {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  let score = 0;
  for (const [dr, dc] of dirs) {
    const line = countLine(board, r, c, dr, dc, stone, size);
    score += lineToScore(line.len, line.openEnds);
  }

  // 가운데 선호(초등용 재미 포인트)
  const mid = (size - 1) / 2;
  const dist = Math.abs(r - mid) + Math.abs(c - mid);
  score += Math.max(0, 6 - dist) * 2;

  return score;
}

function countLine(board, r, c, dr, dc, stone, size) {
  let len = 1;
  let openEnds = 0;

  // 정방향
  let rr = r + dr;
  let cc = c + dc;
  while (
    rr >= 0 &&
    rr < size &&
    cc >= 0 &&
    cc < size &&
    board[rr][cc] === stone
  ) {
    len++;
    rr += dr;
    cc += dc;
  }
  if (
    rr >= 0 &&
    rr < size &&
    cc >= 0 &&
    cc < size &&
    board[rr][cc] === null
  )
    openEnds++;

  // 역방향
  rr = r - dr;
  cc = c - dc;
  while (
    rr >= 0 &&
    rr < size &&
    cc >= 0 &&
    cc < size &&
    board[rr][cc] === stone
  ) {
    len++;
    rr -= dr;
    cc -= dc;
  }
  if (
    rr >= 0 &&
    rr < size &&
    cc >= 0 &&
    cc < size &&
    board[rr][cc] === null
  )
    openEnds++;

  return { len, openEnds };
}

function lineToScore(len, openEnds) {
  if (len >= 5) return 100000;
  if (len === 4 && openEnds === 2) return 12000;
  if (len === 4 && openEnds === 1) return 3500;
  if (len === 3 && openEnds === 2) return 900;
  if (len === 3 && openEnds === 1) return 250;
  if (len === 2 && openEnds === 2) return 120;
  if (len === 2 && openEnds === 1) return 30;
  return 5;
}

/* ---------------------------
   랜덤 가중 선택(가운데 선호)
---------------------------- */

function weightToCenter(moves, size) {
  const mid = (size - 1) / 2;
  return moves.map((m) => {
    const dist = Math.abs(m.r - mid) + Math.abs(m.c - mid);
    const w = Math.max(1, 10 - dist);
    return { ...m, w };
  });
}

function pickWeighted(moves) {
  const sum = moves.reduce((a, m) => a + (m.w ?? 1), 0);
  let x = Math.random() * sum;
  for (const m of moves) {
    x -= m.w ?? 1;
    if (x <= 0) return { r: m.r, c: m.c };
  }
  return { r: moves[0].r, c: moves[0].c };
}
