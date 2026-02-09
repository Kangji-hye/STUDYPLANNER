// src/pages/OmokGame.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import "./OmokGame.css";
import supabase from "../supabaseClient";
import { saveBestScore } from "../utils/saveBestScore";

export default function OmokGame() {
  const navigate = useNavigate();

  const SIZE = 11;
  const WIN = 5;

  const [level, setLevel] = useState("easy");
  const [board, setBoard] = useState(() => makeEmptyBoard(SIZE));
  const [turn, setTurn] = useState("P");
  const [winner, setWinner] = useState(null);
  const [msg, setMsg] = useState("검은돌(나)부터 시작 🙂");

  const [lastMove, setLastMove] = useState(null);

  const stonesCount = useMemo(() => countStones(board), [board]);

  const [saveMsg, setSaveMsg] = useState("");

  const reset = () => {
    setBoard(makeEmptyBoard(SIZE));
    setTurn("P");
    setWinner(null);
    setMsg("검은돌(나)부터 시작 🙂");
    setLastMove(null);
    setSaveMsg("");
  };

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

  const calcOmokScore = () => {
    if (!winner) return 0;

    const myStone = countStoneOf(board, "B");
    const fastBonus = Math.max(0, 70 - myStone) * 2;

    const diff = winner === "P" ? 200 : winner === "DRAW" ? 60 : 0;
    const levelBonus = level === "hard" ? 60 : level === "normal" ? 30 : 0;

    return Math.max(0, diff + levelBonus + fastBonus);
  };

  const saveRanking = async () => {
    setSaveMsg("");

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;

      const me = authData?.user;
      if (!me?.id) {
        setSaveMsg("로그인이 필요해요.");
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("nickname, is_admin")
        .eq("id", me.id)
        .maybeSingle();

      if (profErr) throw profErr;

      if (prof?.is_admin) {
        setSaveMsg("관리자 계정은 랭킹에서 제외되어 저장하지 않아요.");
        return;
      }

      const nickname = String(prof?.nickname ?? "").trim() || "익명";
      const score = calcOmokScore();

      const result = await saveBestScore({
        supabase,
        user_id: me.id,
        nickname,
        game_key: "omok",
        level: String(level),
        score,
      });

      if (!result?.ok) {
        throw result?.error ?? new Error(result?.reason ?? "save_failed");
      }

      if (result.updated) {
        const prev = result.prevBest;
        if (prev === null || prev === undefined) {
          setSaveMsg(`최고 기록으로 저장했어요. (이번 ${score}점)`);
        } else {
          setSaveMsg(`최고 기록으로 저장했어요. (이전 ${prev}점 → 이번 ${score}점)`);
        }
        return;
      }

      const best = result.prevBest;
      const bestText = best === null || best === undefined ? "기록 없음" : `${best}점`;
      setSaveMsg(`이번 점수는 저장되지 않았어요. 내 최고점은 ${bestText}예요.`);
    } catch (e) {
      console.error("omok save error:", e);
      setSaveMsg("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  const finalScore = winner ? calcOmokScore() : null;

  const onPickLevel = (next) => {
    setLevel(next);
    // 원하면 난이도 바꾸면 바로 새 판 시작하게 할 수도 있어요.
    // 지금은 진행 중에도 난이도만 바뀌게 유지합니다.
  };

  return (
    <div className="omok-page">
      <div className="omok-head">
        <button type="button" className="omok-back" onClick={() => navigate("/omok-ranking")}>
          오목랭킹
        </button>

        <div className="omok-title">⚫ 오목</div>

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
            <div className="omok-level-buttons" role="group" aria-label="난이도 선택">
              <button
                type="button"
                className={`omok-level-btn ${level === "hard" ? "on" : ""}`}
                onClick={() => onPickLevel("hard")}
              >
                상
              </button>
              <button
                type="button"
                className={`omok-level-btn ${level === "normal" ? "on" : ""}`}
                onClick={() => onPickLevel("normal")}
              >
                중
              </button>
              <button
                type="button"
                className={`omok-level-btn ${level === "easy" ? "on" : ""}`}
                onClick={() => onPickLevel("easy")}
              >
                하
              </button>
            </div>

            <div className="omok-mini">
              돌 {stonesCount}개 · {winner ? "끝" : turn === "P" ? "내 차례" : "컴퓨터 차례"}
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
            {winner === "P" ? "내가 이겼어요! 🎉" : winner === "AI" ? "컴퓨터가 이겼어요 🙂" : "비겼어요 🙂"}
          </div>

          <div className="omok-finish-sub">점수 {finalScore}점</div>

          <div className="omok-finish-actions">
            <button type="button" className="omok-restart" onClick={reset}>
              한 판 더!
            </button>

            <button type="button" className="omok-restart" onClick={saveRanking}>
              랭킹 저장
            </button>

            <button type="button" className="omok-back" onClick={() => navigate("/omok-ranking")}>
              오목 랭킹
            </button>
          </div>

          {saveMsg ? <div className="omok-save-msg">{saveMsg}</div> : null}
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

function countStoneOf(board, stone) {
  let n = 0;
  for (const row of board) for (const v of row) if (v === stone) n++;
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

function pickAiMove(board, level, size, need) {
  const dist = level === "hard" ? 2 : 1;
  const moves = getCandidateMoves(board, size, dist);
  if (moves.length === 0) return null;

  const winMove = findImmediateWin(board, moves, "W", need);
  if (winMove) return winMove;

  const blockMove = findImmediateWin(board, moves, "B", need);
  if (blockMove) return blockMove;

  if (level === "easy") {
    return pickFromTopKBy(board, moves, size, 10, heuristicScoreEasy);
  }

  if (level === "normal") {
    const MISTAKE_RATE = 0.35;

    if (Math.random() < MISTAKE_RATE) {
      const weighted = weightToCenter(moves, size);
      return pickWeighted(weighted);
    }

    return pickFromTopKBy(board, moves, size, 12, heuristicScoreNormal);
  }

  const top = topKByHeuristic(board, moves, size, 10);
  return minimax2(board, top, size);
}

function getCandidateMoves(board, size, dist) {
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

function heuristicScoreEasy(board, r, c, size) {
  const my = quickPoint(board, r, c, "W", size);
  const mid = (size - 1) / 2;
  const dist = Math.abs(r - mid) + Math.abs(c - mid);
  const center = Math.max(0, 7 - dist) * 3;
  return my * 0.35 + center;
}

function heuristicScoreNormal(board, r, c, size) {
  const my = quickPoint(board, r, c, "W", size);
  const opp = quickPoint(board, r, c, "B", size);
  return my + opp * 0.45;
}

function pickFromTopKBy(board, moves, size, k, scoreFn) {
  const scored = moves.map((m) => ({ ...m, s: scoreFn(board, m.r, m.c, size) })).sort((a, b) => b.s - a.s);

  const top = scored.slice(0, Math.min(k, scored.length));

  const weighted = top.map((m) => {
    const mid = (size - 1) / 2;
    const dist = Math.abs(m.r - mid) + Math.abs(m.c - mid);
    return { ...m, w: Math.max(1, 12 - dist) + Math.max(0, m.s / 220) };
  });

  return pickWeighted(weighted);
}

function topKByHeuristic(board, moves, size, k) {
  const scored = moves.map((m) => ({ ...m, s: heuristicScoreHard(board, m.r, m.c, size) })).sort((a, b) => b.s - a.s);
  return scored.slice(0, Math.min(k, scored.length)).map(({ r, c }) => ({ r, c }));
}

function heuristicScoreHard(board, r, c, size) {
  const my = quickPoint(board, r, c, "W", size);
  const opp = quickPoint(board, r, c, "B", size);
  return my + opp * 1.15;
}

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

  const mid = (size - 1) / 2;
  const dist = Math.abs(r - mid) + Math.abs(c - mid);
  score += Math.max(0, 6 - dist) * 2;

  return score;
}

function countLine(board, r, c, dr, dc, stone, size) {
  let len = 1;
  let openEnds = 0;

  let rr = r + dr;
  let cc = c + dc;
  while (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr][cc] === stone) {
    len++;
    rr += dr;
    cc += dc;
  }
  if (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr][cc] === null) openEnds++;

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
