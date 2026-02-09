// src/pages/BadukGame.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import "./BadukGame.css";
import supabase from "../supabaseClient";
import { saveBestScore } from "../utils/saveBestScore";

/*
  난이도 버튼은 "상-중-하" 순서로 보여주고,
  내부 값은 기존처럼 hard/normal/easy 를 그대로 씁니다.
*/
const BADUK_LEVELS = [
  { label: "하 · 9×9", value: "easy" },
  { label: "중 · 9×9", value: "normal" },
  { label: "상 · 13×13", value: "hard" },
];

export default function BadukGame() {
  const navigate = useNavigate();

  const [level, setLevel] = useState("easy");

  const boardSize = level === "hard" ? 13 : 9;

  const [board, setBoard] = useState(() => makeEmptyBoard(boardSize));
  const [turn, setTurn] = useState("P");
  const [winner, setWinner] = useState(null);
  const [msg, setMsg] = useState("흑돌(나)부터 시작");

  const [lastMove, setLastMove] = useState(null);

  const [capB, setCapB] = useState(0);
  const [capW, setCapW] = useState(0);

  const [passStreak, setPassStreak] = useState(0);

  const stonesCount = useMemo(() => countStones(board), [board]);

  const [saveMsg, setSaveMsg] = useState("");

  const levels = useMemo(() => BADUK_LEVELS, []);

  // 진행 중(내 차례가 아니거나 끝났을 때)에는 난이도 변경 막기
  const levelLocked = winner !== null || turn !== "P";

  // 보드 크기가 바뀌면(상 난이도 13x13 등) 새 판으로 리셋
  useEffect(() => {
    resetToFreshBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardSize]);

  const resetToFreshBoard = () => {
    setBoard(makeEmptyBoard(boardSize));
    setTurn("P");
    setWinner(null);
    setMsg("흑돌(나)부터 시작");
    setLastMove(null);
    setCapB(0);
    setCapW(0);
    setPassStreak(0);
    setSaveMsg("");
  };

  const reset = () => {
    resetToFreshBoard();
  };

  const passTurn = () => {
    if (winner) return;
    if (turn !== "P") return;

    const nextStreak = passStreak + 1;
    setPassStreak(nextStreak);

    if (nextStreak >= 2) {
      finishByCaptureScore(capB, capW);
      return;
    }

    setTurn("AI");
    setMsg("컴퓨터 차례");
  };

  useEffect(() => {
    if (winner) return;
    if (turn !== "AI") return;

    const t = setTimeout(() => {
      const move = pickAiMove(board, level, boardSize);

      if (!move) {
        finishByCaptureScore(capB, capW);
        return;
      }

      const placed = tryPlaceAndCapture(board, move.r, move.c, "W");
      if (!placed.ok) {
        const nextStreak = passStreak + 1;
        setPassStreak(nextStreak);

        if (nextStreak >= 2) {
          finishByCaptureScore(capB, capW);
          return;
        }

        setTurn("P");
        setMsg("내 차례: 흑돌 두기");
        return;
      }

      setBoard(placed.board);
      setLastMove({ r: move.r, c: move.c, stone: "W" });

      if (placed.captured > 0) setCapW((v) => v + placed.captured);

      setPassStreak(0);

      if (isFull(placed.board)) {
        finishByCaptureScore(capB, capW + (placed.captured > 0 ? placed.captured : 0));
        return;
      }

      setTurn("P");
      setMsg("내 차례: 흑돌 두기");
    }, 380);

    return () => clearTimeout(t);
  }, [turn, winner, board, level, boardSize, capB, capW, passStreak]);

  const onClickCell = (r, c) => {
    if (winner) return;
    if (turn !== "P") return;
    if (board[r][c] !== null) return;

    const placed = tryPlaceAndCapture(board, r, c, "B");
    if (!placed.ok) {
      setMsg("여기는 놓을 수 없어요");
      return;
    }

    setBoard(placed.board);
    setLastMove({ r, c, stone: "B" });

    if (placed.captured > 0) setCapB((v) => v + placed.captured);

    setPassStreak(0);

    if (isFull(placed.board)) {
      finishByCaptureScore(capB + (placed.captured > 0 ? placed.captured : 0), capW);
      return;
    }

    setTurn("AI");
    setMsg("컴퓨터 차례");
  };

  const finishByCaptureScore = (b, w) => {
    if (b === w) {
      setWinner("DRAW");
      setMsg("비겼어요");
      return;
    }
    if (b > w) {
      setWinner("P");
      setMsg("내가 이겼어요");
      return;
    }
    setWinner("AI");
    setMsg("컴퓨터가 이겼어요");
  };

  const calcBadukScore = () => {
    const diff = capB - capW;
    const base = Math.max(0, diff) * 10;
    const bonus = winner === "P" ? 50 : winner === "DRAW" ? 25 : 0;
    return base + bonus;
  };

  // 오목이랑 똑같이: saveBestScore() 반환값(ok/updated/prevBest)을 기준으로 메시지 정확히 표시
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
      const score = calcBadukScore();

      const result = await saveBestScore({
        supabase,
        user_id: me.id,
        nickname,
        game_key: "baduk",
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
      console.error("baduk save error:", e);
      setSaveMsg("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  const cellPx = boardSize === 13 ? 24 : 30;
  const stonePx = boardSize === 13 ? 16 : 20;

  const finalScore = winner ? calcBadukScore() : null;

  const currentLevelLabel = useMemo(() => {
    const found = levels.find((x) => x.value === level);
    return found?.label ?? "";
  }, [levels, level]);

  const levelText = useMemo(() => {
    return level === "hard" ? "상" : level === "normal" ? "중" : "하";
  }, [level]);

  return (
    <div className="baduk-page">
      <div className="baduk-head">
        <button type="button" className="baduk-back" onClick={() => navigate("/baduk-ranking")}>
          바둑랭킹
        </button>

        <div className="baduk-title">⚫ 바둑</div>

        <div className="baduk-head-right">
          <button type="button" className="baduk-restart" onClick={reset}>
            다시하기
          </button>

          <div className="baduk-menu">
            <HamburgerMenu />
          </div>
        </div>
      </div>

      <div className="baduk-card">
        <div className="baduk-row">
          <div className="baduk-label">난이도</div>

          <div className="baduk-controls">
            {/* 오목이랑 동일한 버튼 구조 */}
            <div className="baduk-level-buttons" role="group" aria-label="난이도 선택">
              {levels.map((lv) => (
                <button
                  key={lv.value}
                  type="button"
                  className={`baduk-level-btn ${level === lv.value ? "on" : ""}`}
                  onClick={() => setLevel(lv.value)}
                  disabled={levelLocked}
                  title={lv.label}
                >
                  {/* 여기 줄만 바꾸는게 아니라, 버튼 클래스까지 같이 바꿔야 느낌이 같아져요 */}
                  {lv.value === "hard" ? "상" : lv.value === "normal" ? "중" : "하"}
                </button>
              ))}
            </div>

            <div className="baduk-mini">
              {currentLevelLabel} · 돌 {stonesCount}개 · {winner ? "끝" : turn === "P" ? "내 차례" : "컴퓨터 차례"} ·{" "}
              <span className="baduk-score">
                내가 잡은 돌 {capB} · 컴퓨터 {capW}
              </span>
              <span className="baduk-mini-level"> (현재: {levelText})</span>
            </div>
          </div>
        </div>

        <div className="baduk-msg" aria-live="polite">
          {msg}
        </div>
      </div>

      <div
        className="baduk-board"
        role="grid"
        aria-label="바둑판"
        style={{ "--cell": `${cellPx}px`, "--stone": `${stonePx}px` }}
      >
        {board.map((row, r) => (
          <div className="baduk-rowline" role="row" key={`r-${r}`}>
            {row.map((cell, c) => {
              const isLast = !!lastMove && lastMove.r === r && lastMove.c === c;

              return (
                <button
                  key={`c-${r}-${c}`}
                  type="button"
                  className={`baduk-cell ${isLast ? "last" : ""}`}
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

      {!winner && (
        <div className="baduk-actions">
          <button type="button" className="baduk-pass" onClick={passTurn} disabled={turn !== "P"}>
            패스
          </button>

          <button type="button" className="baduk-restart" onClick={reset}>
            다시하기
          </button>
        </div>
      )}

      {winner && (
        <div className="baduk-finish">
          <div className="baduk-finish-title">
            {winner === "P" ? "내가 이겼어요" : winner === "AI" ? "컴퓨터가 이겼어요" : "비겼어요"}
          </div>

          <div className="baduk-finish-sub">
            잡은 돌 (내 {capB} : 컴퓨터 {capW}) · 점수 {finalScore}점
          </div>

          <div className="baduk-finish-actions">
            <button type="button" className="baduk-restart" onClick={reset}>
              한 판 더
            </button>

            <button type="button" className="baduk-pass" onClick={saveRanking}>
              랭킹 저장
            </button>

            <button type="button" className="baduk-back" onClick={() => navigate("/baduk-ranking")}>
              바둑 랭킹
            </button>
          </div>

          {saveMsg ? <div className="baduk-save-msg">{saveMsg}</div> : null}
        </div>
      )}
    </div>
  );
}

function makeEmptyBoard(size) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => null));
}

function countStones(board) {
  let n = 0;
  for (const row of board) for (const v of row) if (v) n++;
  return n;
}

function isFull(board) {
  for (const row of board) for (const v of row) if (v === null) return false;
  return true;
}

function inRange(r, c, size) {
  return r >= 0 && r < size && c >= 0 && c < size;
}

function neighbors(r, c, size) {
  const d = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const out = [];
  for (const [dr, dc] of d) {
    const rr = r + dr;
    const cc = c + dc;
    if (inRange(rr, cc, size)) out.push([rr, cc]);
  }
  return out;
}

function floodGroup(board, r, c, size) {
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
      if (v === null) {
        liberties++;
        continue;
      }
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

function tryPlaceAndCapture(board, r, c, stone) {
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

/* 아래 AI 관련 함수들은 기존 그대로 사용 */
function pickAiMove(board, level, size) {
  const candidates = getCandidateMoves(board, size, level === "hard" ? 2 : 1);
  if (!candidates.length) return null;

  if (level === "easy") return pickRandom(candidates);

  if (level === "normal") {
    if (Math.random() < 0.35) return pickRandom(candidates);
    return pickBestByCapture(board, candidates, size, "W");
  }

  return pickBestByCapture(board, candidates, size, "W");
}

function getCandidateMoves(board, size, dist) {
  const stones = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (board[r][c]) stones.push([r, c]);

  if (!stones.length) {
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

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickBestByCapture(board, moves, size, stone) {
  let best = moves[0];
  let bestScore = -Infinity;

  for (const m of moves) {
    const placed = tryPlaceAndCapture(board, m.r, m.c, stone);
    if (!placed.ok) continue;

    const score = placed.captured * 10 + centerBonus(m.r, m.c, size);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }

  return best;
}

function centerBonus(r, c, size) {
  const mid = (size - 1) / 2;
  const dist = Math.abs(r - mid) + Math.abs(c - mid);
  return Math.max(0, 7 - dist);
}
