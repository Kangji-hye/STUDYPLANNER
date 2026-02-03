// src/pages/OmokGame.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import "./OmokGame.css";

/**
 * ✅ 초등학생용 오목(5목)
 * - 판: 11x11 (초등용으로 너무 크지 않게)
 * - 난이도(체감 균형 조절)
 *   하: "상대가 당장 이기는 수"만 1번 막고, 나머지는 랜덤(가운데 선호)
 *   중: 이기기/막기는 하되, 최적 1개만 고르지 않고 "상위 후보 중 랜덤"으로 살짝 실수도 함
 *   상: 후보를 줄여서(성능) 2수 미니맥스 + 점수 계산(기존 강한 느낌 유지)
 *
 * ✅ UI 요청 반영
 * - 판은 나무색(칸도 갈색)
 * - 흰돌 테두리도 흰색
 * - 오른쪽 상단에 햄버거 메뉴 고정
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

  const stonesCount = useMemo(() => countStones(board), [board]);

  const reset = () => {
    setBoard(makeEmptyBoard(SIZE));
    setTurn("P");
    setWinner(null);
    setMsg("검은돌(나)부터 시작 🙂");
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
    }, 350); // 컴퓨터가 “생각하는 느낌”

    return () => clearTimeout(t);
  }, [turn, winner, board, level]);

  const onClickCell = (r, c) => {
    if (winner) return;
    if (turn !== "P") return;
    if (board[r][c] !== null) return;

    const next = place(board, r, c, "B");
    const win = checkWinner(next, WIN);

    setBoard(next);

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

        {/* ✅ 오른쪽 끝: "다시하기 + 햄버거" (햄버거는 항상 같은 자리) */}
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
              {winner
                ? "게임 끝"
                : turn === "P"
                ? "내 차례"
                : "컴퓨터 차례"}
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
            {row.map((cell, c) => (
              <button
                key={`c-${r}-${c}`}
                type="button"
                className="omok-cell"
                role="gridcell"
                onClick={() => onClickCell(r, c)}
                aria-label={`${r + 1}행 ${c + 1}열`}
              >
                {cell === "B" ? (
                  <span className="stone black" />
                ) : cell === "W" ? (
                  <span className="stone white" />
                ) : null}
              </button>
            ))}
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
   AI 로직(난이도 튜닝 핵심)
---------------------------- */

function pickAiMove(board, level, size, need) {
  // ✅ 하/중은 후보를 가까운 곳(dist=1)만 보게 해서 자연스럽게 약해짐
  // ✅ 상은 dist=2로 더 넓게 봐서 강해짐
  const dist = level === "hard" ? 2 : 1;
  const moves = getCandidateMoves(board, size, dist);
  if (moves.length === 0) return null;

  // ✅ 하 난이도: "상대가 바로 이기는 수"만 1번 막고, 나머지는 랜덤
  if (level === "easy") {
    const blockMove = findImmediateWin(board, moves, "B", need);
    if (blockMove) return blockMove;

    const weighted = weightToCenter(moves, size);
    return pickWeighted(weighted);
  }

  // ✅ 중/상 공통: 내가 바로 이길 수 있으면 이김
  const winMove = findImmediateWin(board, moves, "W", need);
  if (winMove) return winMove;

  // ✅ 중/상 공통: 상대가 다음 수에 이기면 막음
  const blockMove = findImmediateWin(board, moves, "B", need);
  if (blockMove) return blockMove;

  // ✅ 중 난이도: "최적 1개"로만 두지 말고, 상위 후보 중 랜덤
  if (level === "normal") {
    return pickFromTopK(board, moves, size, 6);
  }

  // ✅ 상 난이도: 후보 줄이고 2수 미니맥스
  const top = topKByHeuristic(board, moves, size, 10);
  return minimax2(board, top, size);
}

function getCandidateMoves(board, size, dist) {
  // 돌이 하나도 없으면 가운데
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

// ✅ 중 난이도용: 상위 후보 K개 중 랜덤 선택(“가끔 실수”가 생겨서 체감이 부드러워짐)
function pickFromTopK(board, moves, size, k) {
  const scored = moves
    .map((m) => ({ ...m, s: heuristicScoreNormal(board, m.r, m.c, size) }))
    .sort((a, b) => b.s - a.s);

  const top = scored.slice(0, Math.min(k, scored.length));

  // 가운데 선호 + 점수도 조금 반영해서 자연스럽게
  const weighted = top.map((m) => {
    const mid = (size - 1) / 2;
    const dist = Math.abs(m.r - mid) + Math.abs(m.c - mid);
    return { ...m, w: Math.max(1, 10 - dist) + Math.max(0, m.s / 200) };
  });

  return pickWeighted(weighted);
}

function topKByHeuristic(board, moves, size, k) {
  const scored = moves
    .map((m) => ({ ...m, s: heuristicScore(board, m.r, m.c, size) }))
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, Math.min(k, scored.length)).map(({ r, c }) => ({ r, c }));
}

// ✅ 상 난이도: 아주 가벼운 2수 미니맥스(깊이 2)
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

// 판 전체 점수(내 유리 + / 상대 유리 -)
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

// ✅ (상/기본) 점수: 내 공격 + 상대 방어(막기)도 중요하게
function heuristicScore(board, r, c, size) {
  const my = quickPoint(board, r, c, "W", size);
  const opp = quickPoint(board, r, c, "B", size);
  return my + opp * 1.15;
}

// ✅ (중 전용) 점수: 방어 가중치를 낮춰서 “중이 너무 완벽하게 막는 느낌” 완화
// - 숫자를 더 낮추면 더 쉬워집니다. (0.65~0.8 사이 추천)
function heuristicScoreNormal(board, r, c, size) {
  const my = quickPoint(board, r, c, "W", size);
  const opp = quickPoint(board, r, c, "B", size);
  return my + opp * 0.75;
}

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
  while (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr][cc] === stone) {
    len++;
    rr += dr;
    cc += dc;
  }
  if (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr][cc] === null) openEnds++;

  // 역방향
  rr = r - dr;
  cc = c - dc;
  while (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr][cc] === stone) {
    len++;
    rr -= dr;
    cc -= dc;
  }
  if (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr][cc] === null) openEnds++;

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

// 하 난이도에서 가운데를 조금 더 선호하게 하는 가중치
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
