// src/utils/badukLogic.js
// 바둑 핵심 로직 — BadukGame(1인용)과 BadukBattle(2인 대전) 공통 사용

export function makeEmptyBoard(size) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null)
  );
}

function inRange(r, c, size) {
  return r >= 0 && r < size && c >= 0 && c < size;
}

function neighbors(r, c, size) {
  const d = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const out = [];
  for (const [dr, dc] of d) {
    const rr = r + dr;
    const cc = c + dc;
    if (inRange(rr, cc, size)) out.push([rr, cc]);
  }
  return out;
}

export function floodGroup(board, r, c, size) {
  const color = board[r][c];
  if (!color) return { stones: [], liberties: 0 };

  const q = [[r, c]];
  const seen = new Set([`${r},${c}`]);
  const stones = [];
  let liberties = 0;

  while (q.length) {
    const [cr, cc] = q.pop();
    stones.push([cr, cc]);

    for (const [nr, nc] of neighbors(cr, cc, size)) {
      const v = board[nr][nc];
      if (v === null) { liberties++; continue; }
      if (v !== color) continue;

      const key = `${nr},${nc}`;
      if (seen.has(key)) continue;
      seen.add(key);
      q.push([nr, nc]);
    }
  }

  return { stones, liberties };
}

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

function removeStones(board, stones) {
  for (const [r, c] of stones) board[r][c] = null;
}

export function tryPlaceAndCapture(board, r, c, stone) {
  const size = board.length;
  if (board[r][c] !== null) return { ok: false, board, captured: 0 };

  const next = cloneBoard(board);
  next[r][c] = stone;

  const opp = stone === "B" ? "W" : "B";
  let captured = 0;

  for (const [nr, nc] of neighbors(r, c, size)) {
    if (next[nr][nc] !== opp) continue;
    const g = floodGroup(next, nr, nc, size);
    if (g.liberties === 0) {
      captured += g.stones.length;
      removeStones(next, g.stones);
    }
  }

  const myGroup = floodGroup(next, r, c, size);
  if (myGroup.liberties === 0) {
    return { ok: false, board, captured: 0 };
  }

  return { ok: true, board: next, captured };
}
