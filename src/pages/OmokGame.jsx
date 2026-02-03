// src/pages/OmokGame.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./OmokGame.css";
import HamburgerMenu from "../components/common/HamburgerMenu";

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
    }, 350); // 아이가 “컴퓨터가 생각한다” 느낌

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
        <button type="button" className="omok-back" onClick={() => navigate("/planner")}>
            ← 플래너
        </button>
        <div className="omok-title">⚫ 오목</div>
        <div className="omok-menu">
            <HamburgerMenu />
        </div>
      </div>

      <div className="omok-card">
        <div className="omok-row">
          <div className="omok-label">난이도</div>
          <div className="omok-controls">
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="easy">하 (랜덤)</option>
              <option value="normal">중 (막기/이기기)</option>
              <option value="hard">상 (똑똑하게)</option>
            </select>

            <div className="omok-mini">
              돌 {stonesCount}개 · {winner ? "게임 끝" : turn === "P" ? "내 차례" : "컴퓨터 차례"}
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
                {cell === "B" ? <span className="stone black" /> : cell === "W" ? <span className="stone white" /> : null}
              </button>
            ))}
          </div>
        ))}
      </div>

      {winner && (
        <div className="omok-finish">
          <div className="omok-finish-title">
            {winner === "P" ? "내가 이겼어요! 🎉" : winner === "AI" ? "컴퓨터가 이겼어요 🙂" : "비겼어요 🙂"}
          </div>
          <div className="omok-finish-actions">
            <button type="button" className="omok-restart" onClick={reset}>한 판 더!</button>
            <button type="button" className="omok-back" onClick={() => navigate("/planner")}>플래너로</button>
          </div>
        </div>
      )}
    </div>
  );
}

function makeEmptyBoard(size) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => null));
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
        while (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr][cc] === s) {
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

/**
 * ✅ AI가 돌을 둘 곳을 고르는 함수
 */
function pickAiMove(board, level, size, need) {
  const empties = getCandidateMoves(board, size, 2);
  if (empties.length === 0) return null;

  if (level === "easy") {
    // 하: 후보 중 랜덤 (단, 가운데 근처가 조금 더 잘 나오게)
    const weighted = weightToCenter(empties, size);
    return pickWeighted(weighted);
  }

  // 공통: 1) 내가 이길 수 있으면 이김
  const winMove = findImmediateWin(board, empties, "W", need);
  if (winMove) return winMove;

  // 공통: 2) 상대가 다음에 이길 수 있으면 막음
  const blockMove = findImmediateWin(board, empties, "B", need);
  if (blockMove) return blockMove;

  if (level === "normal") {
    // 중: 점수 계산으로 가장 좋아 보이는 곳 선택
    return bestByHeuristic(board, empties, size);
  }

  // 상: 후보를 조금 줄이고(성능), 2수 미니맥스로 선택
  const top = topKByHeuristic(board, empties, size, 10);
  return minimax2(board, top, size);
}

function getCandidateMoves(board, size, dist) {
  // 돌이 하나도 없으면 정가운데
  const stones = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (board[r][c]) stones.push([r, c]);
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

function bestByHeuristic(board, moves, size) {
  let best = null;
  let bestScore = -Infinity;
  for (const m of moves) {
    const s = heuristicScore(board, m.r, m.c, size);
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best || moves[0];
}

function topKByHeuristic(board, moves, size, k) {
  const scored = moves
    .map((m) => ({ ...m, s: heuristicScore(board, m.r, m.c, size) }))
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, Math.min(k, scored.length)).map(({ r, c }) => ({ r, c }));
}

/**
 * ✅ 상 난이도: 아주 가벼운 2수 미니맥스(깊이 2)
 * - 내가 두고(W), 상대가 최선으로 막는(B) 걸 가정
 * - 상대의 최고 점수를 “빼는” 방식으로 선택
 */
function minimax2(board, moves, size) {
  let best = moves[0];
  let bestVal = -Infinity;

  for (const m of moves) {
    const afterAi = place(board, m.r, m.c, "W");

    // 상대가 둘 후보도 주변만
    const oppMoves = getCandidateMoves(afterAi, size, 2);
    let worstForMe = Infinity;

    // 상대가 가장 아프게 두는 수를 찾고(=내 점수 최저)
    for (const om of oppMoves) {
      const afterOpp = place(afterAi, om.r, om.c, "B");
      const v = boardValue(afterOpp, size);
      if (v < worstForMe) worstForMe = v;
    }

    // 내가 고른 수의 최종 평가는 “상대가 최선을 다 했을 때”를 기준으로
    if (worstForMe > bestVal) {
      bestVal = worstForMe;
      best = m;
    }
  }

  return best;
}

/**
 * ✅ 현재 판 전체의 점수(내가 유리하면 +, 상대가 유리하면 -)
 * - W(컴퓨터)에게 좋은 모양이 많을수록 +
 * - B(사람)에게 좋은 모양이 많을수록 -
 */
function boardValue(board, size) {
  // 판 전체를 훑는 대신 “간단 점수”만
  // 빈칸 기준으로 W가 유리한 자리 - B가 유리한 자리
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

function heuristicScore(board, r, c, size) {
  // 내가 두면 좋은 점수 + 상대가 두면 좋은 점수(막기)
  // “막기”도 중요해서 상대 점수에 가중치를 줌
  const my = quickPoint(board, r, c, "W", size);
  const opp = quickPoint(board, r, c, "B", size);
  return my + opp * 1.15;
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
  // 가운데 근처 선호(아이들은 중앙 싸움이 재밌음)
  const mid = (size - 1) / 2;
  const dist = Math.abs(r - mid) + Math.abs(c - mid);
  score += Math.max(0, 6 - dist) * 2;
  return score;
}

function countLine(board, r, c, dr, dc, stone, size) {
  // (r,c)에 stone을 둔다고 가정하고, 양방향으로 같은 돌을 세어봄
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
  // 초등용이라 너무 복잡하게 안 하고, “체감”이 좋은 가중치만
  if (len >= 5) return 100000;
  if (len === 4 && openEnds === 2) return 12000;
  if (len === 4 && openEnds === 1) return 3500;
  if (len === 3 && openEnds === 2) return 900;
  if (len === 3 && openEnds === 1) return 250;
  if (len === 2 && openEnds === 2) return 120;
  if (len === 2 && openEnds === 1) return 30;
  return 5;
}

function weightToCenter(moves, size) {
  const mid = (size - 1) / 2;
  return moves.map((m) => {
    const dist = Math.abs(m.r - mid) + Math.abs(m.c - mid);
    const w = Math.max(1, 10 - dist); // 가운데 가까울수록 가중치 ↑
    return { ...m, w };
  });
}

function pickWeighted(moves) {
  const sum = moves.reduce((a, m) => a + m.w, 0);
  let x = Math.random() * sum;
  for (const m of moves) {
    x -= m.w;
    if (x <= 0) return { r: m.r, c: m.c };
  }
  return { r: moves[0].r, c: moves[0].c };
}
