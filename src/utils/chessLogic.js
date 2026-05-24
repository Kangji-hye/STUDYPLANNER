// src/utils/chessLogic.js — 체스 순수 로직

// 기물 타입: K(킹), Q(퀸), R(룩), B(비숍), N(나이트), P(폰)
// 색상: 'w'(흰색=host), 'b'(검은색=guest)
// 보드: 8×8 이중 배열, 각 칸은 null 또는 { type, color }

/** 체스 초기 배치 생성 (host=흰색=아래쪽 row 7~6) */
export function makeInitialBoard() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));

  // 검은색(위쪽, row 0~1)
  const backRow = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: backRow[c], color: "b" };
    board[1][c] = { type: "P", color: "b" };
  }

  // 흰색(아래쪽, row 6~7)
  for (let c = 0; c < 8; c++) {
    board[6][c] = { type: "P", color: "w" };
    board[7][c] = { type: backRow[c], color: "w" };
  }

  return board;
}

/** 보드 깊은 복사 */
export function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

/** (r,c) 기물의 유효 이동 목록 — 체크 필터링 포함 */
export function getValidMoves(board, r, c, castlingRights, enPassantTarget) {
  const piece = board[r][c];
  if (!piece) return [];

  const raw = getRawMoves(board, r, c, castlingRights, enPassantTarget);
  return raw.filter(({ r: tr, c: tc, special }) => {
    const sim = cloneBoard(board);
    applyMoveOnBoard(sim, r, c, tr, tc, special, castlingRights, enPassantTarget);
    return !isInCheck(sim, piece.color);
  });
}

/** 체크 무시한 원시 이동 목록 */
export function getRawMoves(board, r, c, castlingRights, enPassantTarget) {
  const piece = board[r][c];
  if (!piece) return [];
  const { type, color } = piece;

  switch (type) {
    case "P": return getPawnMoves(board, r, c, color, enPassantTarget);
    case "N": return getKnightMoves(board, r, c, color);
    case "B": return getSlidingMoves(board, r, c, color, [[1,1],[1,-1],[-1,1],[-1,-1]]);
    case "R": return getSlidingMoves(board, r, c, color, [[0,1],[0,-1],[1,0],[-1,0]]);
    case "Q": return getSlidingMoves(board, r, c, color, [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]);
    case "K": return getKingMoves(board, r, c, color, castlingRights);
    default: return [];
  }
}

/** 이동 적용 (실제 DB 저장용) — 캐슬링·앙파상·프로모션 처리 */
export function applyMove(board, fromR, fromC, toR, toC, castlingRights, enPassantTarget) {
  const newBoard = cloneBoard(board);
  const piece = newBoard[fromR][fromC];
  const newCastling = { ...castlingRights };
  let newEnPassant = null;
  let promotion = false;

  // 캐슬링 권한 갱신
  if (piece.type === "K") {
    if (piece.color === "w") { newCastling.wK = false; newCastling.wQ = false; }
    else { newCastling.bK = false; newCastling.bQ = false; }
  }
  if (piece.type === "R") {
    if (fromR === 7 && fromC === 0) newCastling.wQ = false;
    if (fromR === 7 && fromC === 7) newCastling.wK = false;
    if (fromR === 0 && fromC === 0) newCastling.bQ = false;
    if (fromR === 0 && fromC === 7) newCastling.bK = false;
  }

  // 앙파상 — 2칸 전진 폰
  if (piece.type === "P" && Math.abs(toR - fromR) === 2) {
    newEnPassant = { r: (fromR + toR) / 2, c: fromC };
  }

  const special = detectSpecial(piece, fromR, fromC, toR, toC, enPassantTarget);
  applyMoveOnBoard(newBoard, fromR, fromC, toR, toC, special, castlingRights, enPassantTarget);

  // 폰 프로모션 감지
  if (piece.type === "P" && (toR === 0 || toR === 7)) {
    promotion = true;
  }

  return { board: newBoard, castlingRights: newCastling, enPassantTarget: newEnPassant, promotion };
}

/** 프로모션 기물 교체 */
export function promotePawn(board, r, c, newType) {
  const newBoard = cloneBoard(board);
  if (newBoard[r][c]) newBoard[r][c].type = newType;
  return newBoard;
}

/** 특정 색이 체크 상태인지 */
export function isInCheck(board, color) {
  // 킹 위치 찾기
  let kr = -1, kc = -1;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.type === "K" && board[r][c]?.color === color) { kr = r; kc = c; }
  if (kr === -1) return false;
  return isSquareAttacked(board, kr, kc, color === "w" ? "b" : "w");
}

/** (r,c)가 byColor에게 공격받는지 */
export function isSquareAttacked(board, r, c, byColor) {
  // 나이트
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = board[nr][nc];
      if (p?.color === byColor && p?.type === "N") return true;
    }
  }
  // 슬라이딩(룩·퀸)
  for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === byColor && (p.type === "R" || p.type === "Q")) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  // 슬라이딩(비숍·퀸)
  for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === byColor && (p.type === "B" || p.type === "Q")) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  // 킹
  for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = board[nr][nc];
      if (p?.color === byColor && p?.type === "K") return true;
    }
  }
  // 폰
  const pawnDir = byColor === "w" ? 1 : -1; // 흰 폰은 위로 공격 (row 감소)
  for (const dc of [-1, 1]) {
    const nr = r + pawnDir, nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = board[nr][nc];
      if (p?.color === byColor && p?.type === "P") return true;
    }
  }
  return false;
}

/** 체크메이트 여부 */
export function isCheckmate(board, color, castlingRights, enPassantTarget) {
  if (!isInCheck(board, color)) return false;
  return !hasAnyValidMove(board, color, castlingRights, enPassantTarget);
}

/** 스테일메이트 여부 */
export function isStalemate(board, color, castlingRights, enPassantTarget) {
  if (isInCheck(board, color)) return false;
  return !hasAnyValidMove(board, color, castlingRights, enPassantTarget);
}

/** 유효한 이동이 하나라도 있는지 */
function hasAnyValidMove(board, color, castlingRights, enPassantTarget) {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.color === color)
        if (getValidMoves(board, r, c, castlingRights, enPassantTarget).length > 0) return true;
  return false;
}

// ─── 기물별 이동 ──────────────────────────────────────────────

function getPawnMoves(board, r, c, color, enPassantTarget) {
  const moves = [];
  const dir = color === "w" ? -1 : 1; // 흰색은 row 감소
  const startRow = color === "w" ? 6 : 1;

  // 전진
  const nr = r + dir;
  if (nr >= 0 && nr < 8 && !board[nr][c]) {
    moves.push({ r: nr, c });
    // 2칸 전진
    const nr2 = r + dir * 2;
    if (r === startRow && !board[nr2][c]) moves.push({ r: nr2, c });
  }

  // 대각 잡기
  for (const dc of [-1, 1]) {
    const nc = c + dc;
    if (nc < 0 || nc >= 8) continue;
    if (board[nr]?.[nc]?.color && board[nr][nc].color !== color)
      moves.push({ r: nr, c: nc });
    // 앙파상
    if (enPassantTarget && enPassantTarget.r === nr && enPassantTarget.c === nc)
      moves.push({ r: nr, c: nc, special: "enpassant" });
  }

  return moves;
}

function getKnightMoves(board, r, c, color) {
  const moves = [];
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
    if (board[nr][nc]?.color === color) continue;
    moves.push({ r: nr, c: nc });
  }
  return moves;
}

function getSlidingMoves(board, r, c, color, dirs) {
  const moves = [];
  for (const [dr, dc] of dirs) {
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const target = board[nr][nc];
      if (target) {
        if (target.color !== color) moves.push({ r: nr, c: nc });
        break;
      }
      moves.push({ r: nr, c: nc });
      nr += dr; nc += dc;
    }
  }
  return moves;
}

function getKingMoves(board, r, c, color, castlingRights) {
  const moves = [];
  for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
    if (board[nr][nc]?.color === color) continue;
    moves.push({ r: nr, c: nc });
  }

  // 캐슬링
  const oppColor = color === "w" ? "b" : "w";
  const kingRow = color === "w" ? 7 : 0;
  if (r !== kingRow || c !== 4) return moves; // 킹이 원위치에 없으면 스킵
  if (isSquareAttacked(board, r, c, oppColor)) return moves; // 체크 중이면 스킵

  // 킹사이드
  const kKey = color === "w" ? "wK" : "bK";
  if (castlingRights?.[kKey] && !board[r][5] && !board[r][6]) {
    if (!isSquareAttacked(board, r, 5, oppColor) && !isSquareAttacked(board, r, 6, oppColor))
      moves.push({ r, c: 6, special: "castleK" });
  }
  // 퀸사이드
  const qKey = color === "w" ? "wQ" : "bQ";
  if (castlingRights?.[qKey] && !board[r][3] && !board[r][2] && !board[r][1]) {
    if (!isSquareAttacked(board, r, 3, oppColor) && !isSquareAttacked(board, r, 2, oppColor))
      moves.push({ r, c: 2, special: "castleQ" });
  }

  return moves;
}

// ─── 내부 헬퍼 ────────────────────────────────────────────────

function detectSpecial(piece, fromR, fromC, toR, toC, enPassantTarget) {
  if (piece.type === "K" && Math.abs(toC - fromC) === 2) {
    return toC > fromC ? "castleK" : "castleQ";
  }
  if (piece.type === "P" && enPassantTarget && toR === enPassantTarget.r && toC === enPassantTarget.c) {
    return "enpassant";
  }
  return null;
}

function applyMoveOnBoard(board, fromR, fromC, toR, toC, special, castlingRights, enPassantTarget) {
  const piece = board[fromR][fromC];
  board[toR][toC] = piece;
  board[fromR][fromC] = null;

  // 캐슬링: 룩도 이동
  if (special === "castleK") {
    const row = fromR;
    board[row][5] = board[row][7];
    board[row][7] = null;
  } else if (special === "castleQ") {
    const row = fromR;
    board[row][3] = board[row][0];
    board[row][0] = null;
  }

  // 앙파상: 잡힌 폰 제거
  if (special === "enpassant" && enPassantTarget) {
    const capturedRow = fromR; // 잡힌 폰은 이동 전 행에 있음
    board[capturedRow][toC] = null;
  }
}

/** 유니코드 기물 문자 반환 */
export function getPieceSymbol(type, color) {
  const symbols = {
    w: { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙" },
    b: { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" },
  };
  return symbols[color]?.[type] ?? "";
}
