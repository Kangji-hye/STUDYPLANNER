// src/utils/omokLogic.js — 오목 순수 로직 (OmokGame.jsx에서 추출)

/** 빈 보드 생성 */
export function makeEmptyBoard(size) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => null));
}

/** 돌 놓기 (불변) */
export function place(board, r, c, stone) {
  const next = board.map((row) => [...row]);
  next[r][c] = stone;
  return next;
}

/** 판이 가득 찼는지 */
export function isFull(board) {
  for (const row of board) for (const v of row) if (v === null) return false;
  return true;
}

/** 전체 돌 수 */
export function countStones(board) {
  let n = 0;
  for (const row of board) for (const v of row) if (v) n++;
  return n;
}

/** 특정 색 돌 수 */
export function countStoneOf(board, stone) {
  let n = 0;
  for (const row of board) for (const v of row) if (v === stone) n++;
  return n;
}

/** 승자 판정 — need개 이상 연속이면 그 돌 색 반환, 없으면 null */
export function checkWinner(board, need) {
  const size = board.length;
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const s = board[r][c];
      if (!s) continue;
      for (const [dr, dc] of dirs) {
        let cnt = 1, rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr][cc] === s) {
          cnt++; rr += dr; cc += dc;
        }
        if (cnt >= need) return s;
      }
    }
  }
  return null;
}

/** AI 이동 선택 */
export function pickAiMove(board, level, size, need) {
  const dist = level === "hard" ? 2 : 1;
  const moves = getCandidateMoves(board, size, dist);
  if (moves.length === 0) return null;

  const winMove = findImmediateWin(board, moves, "W", need);
  if (winMove) return winMove;

  const blockMove = findImmediateWin(board, moves, "B", need);
  if (blockMove) return blockMove;

  if (level === "easy") return pickFromTopKBy(board, moves, size, 10, heuristicScoreEasy);

  if (level === "normal") {
    if (Math.random() < 0.35) return pickWeighted(weightToCenter(moves, size));
    return pickFromTopKBy(board, moves, size, 12, heuristicScoreNormal);
  }

  const top = topKByHeuristic(board, moves, size, 10);
  return minimax2(board, top, size);
}

export function getCandidateMoves(board, size, dist) {
  const stones = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (board[r][c]) stones.push([r, c]);
  if (stones.length === 0) { const mid = Math.floor(size / 2); return [{ r: mid, c: mid }]; }
  const set = new Set();
  for (const [sr, sc] of stones) {
    for (let dr = -dist; dr <= dist; dr++) {
      for (let dc = -dist; dc <= dist; dc++) {
        const r = sr + dr, c = sc + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        if (board[r][c] !== null) continue;
        set.add(`${r},${c}`);
      }
    }
  }
  return Array.from(set).map((key) => { const [r, c] = key.split(",").map(Number); return { r, c }; });
}

export function findImmediateWin(board, moves, stone, need) {
  for (const m of moves) {
    if (checkWinner(place(board, m.r, m.c, stone), need) === stone) return m;
  }
  return null;
}

function heuristicScoreEasy(board, r, c, size) {
  const mid = (size - 1) / 2;
  return quickPoint(board, r, c, "W", size) * 0.35 + Math.max(0, 7 - Math.abs(r - mid) - Math.abs(c - mid)) * 3;
}

function heuristicScoreNormal(board, r, c, size) {
  return quickPoint(board, r, c, "W", size) + quickPoint(board, r, c, "B", size) * 0.45;
}

function heuristicScoreHard(board, r, c, size) {
  return quickPoint(board, r, c, "W", size) + quickPoint(board, r, c, "B", size) * 1.15;
}

function pickFromTopKBy(board, moves, size, k, scoreFn) {
  const scored = moves.map((m) => ({ ...m, s: scoreFn(board, m.r, m.c, size) })).sort((a, b) => b.s - a.s);
  const top = scored.slice(0, Math.min(k, scored.length));
  const mid = (size - 1) / 2;
  const weighted = top.map((m) => ({ ...m, w: Math.max(1, 12 - Math.abs(m.r - mid) - Math.abs(m.c - mid)) + Math.max(0, m.s / 220) }));
  return pickWeighted(weighted);
}

function topKByHeuristic(board, moves, size, k) {
  return moves.map((m) => ({ ...m, s: heuristicScoreHard(board, m.r, m.c, size) }))
    .sort((a, b) => b.s - a.s).slice(0, Math.min(k, moves.length)).map(({ r, c }) => ({ r, c }));
}

function minimax2(board, moves, size) {
  let best = moves[0], bestVal = -Infinity;
  for (const m of moves) {
    const afterAi = place(board, m.r, m.c, "W");
    const oppMoves = getCandidateMoves(afterAi, size, 2);
    let worstForMe = Infinity;
    for (const om of oppMoves) {
      const v = boardValue(place(afterAi, om.r, om.c, "B"), size);
      if (v < worstForMe) worstForMe = v;
    }
    if (worstForMe > bestVal) { bestVal = worstForMe; best = m; }
  }
  return best;
}

function boardValue(board, size) {
  let v = 0;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (!board[r][c]) { v += quickPoint(board, r, c, "W", size); v -= quickPoint(board, r, c, "B", size); }
  return v;
}

function quickPoint(board, r, c, stone, size) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  let score = 0;
  for (const [dr, dc] of dirs) {
    const line = countLine(board, r, c, dr, dc, stone, size);
    score += lineToScore(line.len, line.openEnds);
  }
  const mid = (size - 1) / 2;
  score += Math.max(0, 6 - Math.abs(r - mid) - Math.abs(c - mid)) * 2;
  return score;
}

function countLine(board, r, c, dr, dc, stone, size) {
  let len = 1, openEnds = 0;
  let rr = r + dr, cc = c + dc;
  while (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr][cc] === stone) { len++; rr += dr; cc += dc; }
  if (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr][cc] === null) openEnds++;
  rr = r - dr; cc = c - dc;
  while (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr][cc] === stone) { len++; rr -= dr; cc -= dc; }
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

function weightToCenter(moves, size) {
  const mid = (size - 1) / 2;
  return moves.map((m) => ({ ...m, w: Math.max(1, 10 - Math.abs(m.r - mid) - Math.abs(m.c - mid)) }));
}

function pickWeighted(moves) {
  const sum = moves.reduce((a, m) => a + (m.w ?? 1), 0);
  let x = Math.random() * sum;
  for (const m of moves) { x -= m.w ?? 1; if (x <= 0) return { r: m.r, c: m.c }; }
  return { r: moves[0].r, c: moves[0].c };
}
