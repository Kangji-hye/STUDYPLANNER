// src/pages/ChessGame.jsx — 체스 AI 1인용
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import supabase from "../supabaseClient";
import {
  makeInitialBoard, cloneBoard,
  getValidMoves, applyMove, promotePawn,
  isInCheck, isCheckmate, isStalemate,
  getPieceSymbol,
} from "../utils/chessLogic";
import { saveBestScore } from "../utils/saveBestScore";
import "./ChessGame.css";

const INIT_CASTLING = { wK: true, wQ: true, bK: true, bQ: true };

// 기물 가치 (centipawn)
const PIECE_VALUE = { K: 20000, Q: 900, R: 500, B: 330, N: 320, P: 100 };

// 위치 보너스 테이블 (흑 기준, 흰색은 뒤집어서 사용)
const POS_BONUS = {
  P: [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5,  5,  10, 27, 27, 10,  5,  5],
    [0,  0,   0, 25, 25,  0,  0,  0],
    [5, -5, -10,  0,  0,-10, -5,  5],
    [5, 10,  10,-25,-25, 10, 10,  5],
    [0,  0,   0,  0,  0,  0,  0,  0],
  ],
  N: [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50],
  ],
  B: [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20],
  ],
  R: [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [5, 10, 10, 10, 10, 10, 10,  5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [0,  0,  0,  5,  5,  0,  0,  0],
  ],
  Q: [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [ -5,  0,  5,  5,  5,  5,  0, -5],
    [  0,  0,  5,  5,  5,  5,  0, -5],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20],
  ],
  K: [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [ 20, 20,  0,  0,  0,  0, 20, 20],
    [ 20, 30, 10,  0,  0, 10, 30, 20],
  ],
};

// 보드 평가 (흑 관점: 양수=흑 유리)
function evaluateBoard(board) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const val = PIECE_VALUE[p.type] ?? 0;
      const posRow = p.color === "b" ? r : 7 - r; // 흰색은 뒤집기
      const posBonus = POS_BONUS[p.type]?.[posRow]?.[c] ?? 0;
      if (p.color === "b") score += val + posBonus;
      else score -= val + posBonus;
    }
  }
  return score;
}

// 해당 색의 모든 유효 이동 수집
function getAllMovesForColor(board, color, castling, ep) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.color !== color) continue;
      const valid = getValidMoves(board, r, c, castling, ep);
      for (const m of valid) moves.push({ fromR: r, fromC: c, toR: m.r, toC: m.c });
    }
  }
  return moves;
}

// 미니맥스 (alpha-beta 포함)
function minimax(board, depth, alpha, beta, isMaximizing, castling, ep) {
  if (depth === 0) return evaluateBoard(board);

  const color = isMaximizing ? "b" : "w";
  const moves = getAllMovesForColor(board, color, castling, ep);

  if (moves.length === 0) {
    if (isInCheck(board, color)) return isMaximizing ? -99999 : 99999;
    return 0; // 스테일메이트
  }

  if (isMaximizing) {
    let best = -Infinity;
    for (const m of moves) {
      const res = applyMove(board, m.fromR, m.fromC, m.toR, m.toC, castling, ep);
      // AI 프로모션은 자동으로 퀸
      let nb = res.board;
      if (res.promotion) nb = promotePawn(nb, m.toR, m.toC, "Q");
      const val = minimax(nb, depth - 1, alpha, beta, false, res.castlingRights, res.enPassantTarget);
      best = Math.max(best, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      const res = applyMove(board, m.fromR, m.fromC, m.toR, m.toC, castling, ep);
      let nb = res.board;
      if (res.promotion) nb = promotePawn(nb, m.toR, m.toC, "Q");
      const val = minimax(nb, depth - 1, alpha, beta, true, res.castlingRights, res.enPassantTarget);
      best = Math.min(best, val);
      beta = Math.min(beta, val);
      if (beta <= alpha) break;
    }
    return best;
  }
}

// AI 최선의 이동 선택
function minimaxRoot(board, depth, castling, ep) {
  const moves = getAllMovesForColor(board, "b", castling, ep);
  if (moves.length === 0) return null;

  let bestMove = moves[0];
  let bestVal = -Infinity;

  for (const m of moves) {
    const res = applyMove(board, m.fromR, m.fromC, m.toR, m.toC, castling, ep);
    let nb = res.board;
    if (res.promotion) nb = promotePawn(nb, m.toR, m.toC, "Q");
    const val = minimax(nb, depth - 1, -Infinity, Infinity, false, res.castlingRights, res.enPassantTarget);
    if (val > bestVal) { bestVal = val; bestMove = m; }
  }
  return bestMove;
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 난이도별 AI 이동 선택
function pickAiMove(board, level, castling, ep) {
  const moves = getAllMovesForColor(board, "b", castling, ep);
  if (moves.length === 0) return null;

  if (level === "easy") {
    if (Math.random() < 0.30) return randomFrom(moves);
    return minimaxRoot(board, 1, castling, ep);
  }
  if (level === "normal") {
    if (Math.random() < 0.15) return randomFrom(moves);
    return minimaxRoot(board, 2, castling, ep);
  }
  // hard
  return minimaxRoot(board, 3, castling, ep);
}

// 점수 계산
function calcChessScore(winner, level, playerMoveCount) {
  if (winner !== "player") return winner === "stalemate" ? 80 : 0;
  const base = 300;
  const diff = level === "hard" ? 200 : level === "normal" ? 100 : 0;
  const speed = Math.max(0, (50 - playerMoveCount) * 3);
  return base + diff + speed;
}

export default function ChessGame() {
  const navigate = useNavigate();

  const [level, setLevel] = useState("easy");
  const [board, setBoard] = useState(() => makeInitialBoard());
  const [castling, setCastling] = useState(INIT_CASTLING);
  const [ep, setEp] = useState(null); // enPassantTarget

  const [turn, setTurn] = useState("player"); // "player" | "ai"
  const [winner, setWinner] = useState(null); // null | "player" | "ai" | "stalemate"

  const [selectedCell, setSelectedCell] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [promotionState, setPromotionState] = useState(null); // { fromR, fromC, toR, toC }

  const [checkMsg, setCheckMsg] = useState("");
  const [msg, setMsg] = useState("내 차례! 백(♔)을 움직여 보세요 🙂");

  const [playerMoveCount, setPlayerMoveCount] = useState(0);
  const [saveMsg, setSaveMsg] = useState("");

  const finalScore = useMemo(
    () => winner ? calcChessScore(winner, level, playerMoveCount) : null,
    [winner, level, playerMoveCount]
  );

  // 게임 리셋
  const reset = () => {
    setBoard(makeInitialBoard());
    setCastling(INIT_CASTLING);
    setEp(null);
    setTurn("player");
    setWinner(null);
    setSelectedCell(null);
    setValidMoves([]);
    setLastMove(null);
    setPromotionState(null);
    setCheckMsg("");
    setMsg("내 차례! 백(♔)을 움직여 보세요 🙂");
    setPlayerMoveCount(0);
    setSaveMsg("");
  };

  const onPickLevel = (next) => {
    setLevel(next);
    reset();
  };

  // AI 이동 처리
  useEffect(() => {
    if (winner || turn !== "ai" || promotionState) return;

    const t = setTimeout(() => {
      const move = pickAiMove(board, level, castling, ep);
      if (!move) {
        // AI가 움직일 수 없음
        if (isInCheck(board, "b")) {
          setWinner("player");
          setMsg("체크메이트! 내가 이겼어요! 🎉");
        } else {
          setWinner("stalemate");
          setMsg("스테일메이트! 무승부예요 🙂");
        }
        return;
      }

      const res = applyMove(board, move.fromR, move.fromC, move.toR, move.toC, castling, ep);
      let nb = res.board;
      if (res.promotion) nb = promotePawn(nb, move.toR, move.toC, "Q");

      setBoard(nb);
      setCastling(res.castlingRights);
      setEp(res.enPassantTarget);
      setLastMove({ fromR: move.fromR, fromC: move.fromC, toR: move.toR, toC: move.toC });
      setSelectedCell(null);
      setValidMoves([]);

      // 플레이어 체크/체크메이트/스테일메이트 확인
      if (isCheckmate(nb, "w", res.castlingRights, res.enPassantTarget)) {
        setWinner("ai");
        setCheckMsg("");
        setMsg("체크메이트! 컴퓨터가 이겼어요 🙂");
      } else if (isStalemate(nb, "w", res.castlingRights, res.enPassantTarget)) {
        setWinner("stalemate");
        setCheckMsg("");
        setMsg("스테일메이트! 무승부예요 🙂");
      } else if (isInCheck(nb, "w")) {
        setCheckMsg("체크! 왕이 위험해요! ⚠️");
        setMsg("내 차례! 체크를 피하세요!");
      } else {
        setCheckMsg("");
        setMsg("내 차례! 백(♔)을 움직여 보세요 🙂");
      }

      setTurn("player");
    }, 400);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, winner, board, level, castling, ep, promotionState]);

  // 칸 클릭
  const onClickCell = (r, c) => {
    if (winner || turn !== "player" || promotionState) return;

    if (selectedCell) {
      const isTarget = validMoves.some((m) => m.r === r && m.c === c);

      if (isTarget) {
        const piece = board[selectedCell.r][selectedCell.c];
        // 플레이어 프로모션 감지
        if (piece?.type === "P" && r === 0) {
          setPromotionState({ fromR: selectedCell.r, fromC: selectedCell.c, toR: r, toC: c });
          setSelectedCell(null); setValidMoves([]);
          return;
        }
        executePlayerMove(selectedCell.r, selectedCell.c, r, c);
        return;
      }

      // 같은 팀 기물 재선택
      if (board[r]?.[c]?.color === "w") {
        selectCell(r, c); return;
      }

      setSelectedCell(null); setValidMoves([]);
      return;
    }

    if (board[r]?.[c]?.color === "w") selectCell(r, c);
  };

  function selectCell(r, c) {
    setSelectedCell({ r, c });
    try { setValidMoves(getValidMoves(board, r, c, castling, ep)); }
    catch { setValidMoves([]); }
  }

  function executePlayerMove(fromR, fromC, toR, toC, promotionType = null) {
    let res;
    try { res = applyMove(board, fromR, fromC, toR, toC, castling, ep); }
    catch (e) { console.error("이동 오류:", e); return; }

    let nb = res.board;
    if (res.promotion && promotionType) nb = promotePawn(nb, toR, toC, promotionType);

    setBoard(nb);
    setCastling(res.castlingRights);
    setEp(res.enPassantTarget);
    setLastMove({ fromR, fromC, toR, toC });
    setSelectedCell(null); setValidMoves([]);
    setPlayerMoveCount((n) => n + 1);

    // AI 체크/체크메이트 확인
    if (isCheckmate(nb, "b", res.castlingRights, res.enPassantTarget)) {
      setWinner("player");
      setCheckMsg("");
      setMsg("체크메이트! 내가 이겼어요! 🎉");
      return;
    }
    if (isStalemate(nb, "b", res.castlingRights, res.enPassantTarget)) {
      setWinner("stalemate");
      setCheckMsg("");
      setMsg("스테일메이트! 무승부예요 🙂");
      return;
    }

    setCheckMsg("");
    setMsg("컴퓨터 생각 중... 🤖");
    setTurn("ai");
  }

  // 프로모션 기물 선택
  const handlePromotion = (type) => {
    if (!promotionState) return;
    const { fromR, fromC, toR, toC } = promotionState;
    setPromotionState(null);
    executePlayerMove(fromR, fromC, toR, toC, type);
  };

  // 기권
  const handleResign = () => {
    if (winner) return;
    const ok = window.confirm("기권하시겠습니까?");
    if (!ok) return;
    setWinner("ai");
    setMsg("기권했어요. 다음엔 이길 수 있어요! 🙂");
  };

  // 랭킹 저장
  const saveRanking = async () => {
    setSaveMsg("");
    if (!winner || winner === "ai") return;
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const me = authData?.user;
      if (!me?.id) { setSaveMsg("로그인이 필요해요."); return; }

      const { data: prof } = await supabase.from("profiles").select("nickname, is_admin").eq("id", me.id).maybeSingle();
      if (prof?.is_admin) { setSaveMsg("관리자 계정은 랭킹에서 제외되어 저장하지 않아요."); return; }

      const nickname = String(prof?.nickname ?? "").trim() || "익명";
      const score = finalScore ?? 0;
      const result = await saveBestScore({ supabase, user_id: me.id, nickname, game_key: "chess", level: String(level), score });

      if (!result?.ok) throw result?.error ?? new Error(result?.reason ?? "save_failed");

      if (result.updated) {
        const prev = result.prevBest;
        setSaveMsg(prev == null ? `최고 기록 저장! (${score}점)` : `최고 기록 갱신! (${prev}점 → ${score}점)`);
      } else {
        setSaveMsg(`저장 안 됨. 내 최고점: ${result.prevBest ?? 0}점`);
      }
    } catch (e) {
      console.error("chess save error:", e);
      setSaveMsg("저장에 실패했어요.");
    }
  };

  // 체스판 렌더링
  const renderBoard = () => (
    <div className="chess-game-board-wrap">
      <div className="chess-game-board">
        {[...Array(8).keys()].map((r) => (
          <div className="chess-game-row" key={`r-${r}`}>
            {[...Array(8).keys()].map((c) => {
              const piece = board[r]?.[c];
              const isLight = (r + c) % 2 === 0;
              const isSel = selectedCell?.r === r && selectedCell?.c === c;
              const isMovable = validMoves.some((m) => m.r === r && m.c === c);
              const isLastFrom = lastMove?.fromR === r && lastMove?.fromC === c;
              const isLastTo = lastMove?.toR === r && lastMove?.toC === c;
              const isCapturable = isMovable && !!piece;

              let cls = `chess-game-cell ${isLight ? "light" : "dark"}`;
              if (isSel) cls += " selected";
              else if (isLastFrom || isLastTo) cls += " last-move";
              if (isMovable) cls += isCapturable ? " capturable" : " movable";

              return (
                <button
                  key={`c-${r}-${c}`}
                  type="button"
                  className={cls}
                  onClick={() => onClickCell(r, c)}
                  aria-label={`${r + 1}행 ${String.fromCharCode(97 + c)}열`}
                  disabled={turn !== "player" || !!winner || !!promotionState}
                >
                  {piece && (
                    <span className={`chess-game-piece chess-game-piece--${piece.color}`}>
                      {getPieceSymbol(piece.type, piece.color)}
                    </span>
                  )}
                  {isMovable && !isCapturable && <span className="chess-game-move-dot" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {/* 좌표 레이블 */}
      <div className="chess-game-labels-col">
        {[...Array(8).keys()].map((r) => <span key={r}>{8 - r}</span>)}
      </div>
      <div className="chess-game-labels-row">
        {[...Array(8).keys()].map((c) => <span key={c}>{String.fromCharCode(97 + c)}</span>)}
      </div>
    </div>
  );

  // 프로모션 모달
  const renderPromotionModal = () => {
    if (!promotionState) return null;
    const types = ["Q", "R", "B", "N"];
    return (
      <div className="chess-game-promotion-overlay">
        <div className="chess-game-promotion-modal">
          <p className="chess-game-promotion-title">어떤 기물로 바꿀까요?</p>
          <div className="chess-game-promotion-choices">
            {types.map((t) => (
              <button key={t} type="button" className="chess-game-promotion-btn" onClick={() => handlePromotion(t)}>
                <span className="chess-game-piece chess-game-piece--w">{getPieceSymbol(t, "w")}</span>
                <span className="chess-game-promotion-label">
                  {t === "Q" ? "퀸" : t === "R" ? "룩" : t === "B" ? "비숍" : "나이트"}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const levelLabel = level === "easy" ? "쉬움" : level === "normal" ? "보통" : "어려움";
  const isPlayerTurn = turn === "player" && !winner && !promotionState;

  return (
    <div className="chess-game-page">
      {/* 헤더 */}
      <div className="chess-game-head">
        <button type="button" className="chess-game-back" onClick={() => navigate("/chess-ranking")}>
          체스랭킹
        </button>
        <div className="chess-game-title">♔ 체스</div>
        <div className="chess-game-head-right">
          <button type="button" className="chess-game-restart" onClick={reset}>다시하기</button>
          <div className="chess-game-menu"><HamburgerMenu /></div>
        </div>
      </div>

      {/* 설정 카드 */}
      <div className="chess-game-info-card">
        <div className="chess-game-info-row">
          <div className="chess-game-label">난이도</div>
          <div className="chess-game-controls">
            <div className="chess-game-level-buttons" role="group" aria-label="난이도 선택">
              {["easy", "normal", "hard"].map((lv, i) => (
                <button
                  key={lv}
                  type="button"
                  className={`chess-game-level-btn${level === lv ? " on" : ""}`}
                  onClick={() => onPickLevel(lv)}
                >
                  {["하", "중", "상"][i]}
                </button>
              ))}
            </div>
            <div className="chess-game-mini">
              {winner ? "끝" : isPlayerTurn ? "내 차례" : "AI 생각 중"} · {levelLabel}
            </div>
          </div>
        </div>
        <div className="chess-game-msg" aria-live="polite">{msg}</div>
      </div>

      {/* 플레이어 vs AI 배너 */}
      <div className="chess-game-player-banner">
        <div className={`chess-game-player${isPlayerTurn ? " active-turn" : ""}`}>
          <span className="chess-game-color-badge">백</span>
          <div className="chess-game-player-name">나 (플레이어)</div>
        </div>
        <div className="chess-game-vs">VS</div>
        <div className={`chess-game-player${turn === "ai" && !winner ? " active-turn" : ""}`}>
          <span className="chess-game-color-badge" style={{ background: "#333", color: "#fff", borderColor: "#111" }}>흑</span>
          <div className="chess-game-player-name">컴퓨터 🤖</div>
        </div>
      </div>

      {/* 체크 메시지 */}
      {checkMsg && <div className="chess-game-check-msg">{checkMsg}</div>}

      {/* 체스판 */}
      {renderBoard()}

      {/* 프로모션 모달 */}
      {renderPromotionModal()}

      {/* 게임 중 기권 버튼 */}
      {!winner && (
        <div className="chess-game-actions">
          <button type="button" className="chess-game-resign" onClick={handleResign}>기권</button>
        </div>
      )}

      {/* 결과 화면 */}
      {winner && (
        <div className="chess-game-finish">
          <div className="chess-game-finish-title">
            {winner === "player" ? "내가 이겼어요! 🎉"
              : winner === "ai" ? "컴퓨터가 이겼어요 🙂"
              : "무승부예요 🙂"}
          </div>
          {finalScore !== null && finalScore > 0 && (
            <div className="chess-game-finish-sub">점수 {finalScore}점</div>
          )}
          {winner === "ai" && (
            <div className="chess-game-finish-encourage">
              {level === "easy" ? "조금 더 연습하면 이길 수 있어요!"
                : level === "normal" ? "보통 난이도에 도전 중이에요! 대단해요 👍"
                : "어려움에 도전하다니 정말 용감해요! 💪"}
            </div>
          )}
          <div className="chess-game-finish-actions">
            <button type="button" className="chess-game-restart" onClick={reset}>한 판 더!</button>
            {(winner === "player" || winner === "stalemate") && (
              <button type="button" className="chess-game-restart" onClick={saveRanking}>랭킹 저장</button>
            )}
            <button type="button" className="chess-game-back" onClick={() => navigate("/chess-ranking")}>랭킹 보기</button>
          </div>
          {saveMsg && <div className="chess-game-save-msg">{saveMsg}</div>}
        </div>
      )}
    </div>
  );
}
