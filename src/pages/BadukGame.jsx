// src/pages/BadukGame.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import "./BadukGame.css";

/*
  초등용 "간단 바둑" 규칙
  - 하/중: 9x9, 상: 13x13
  - 흑(나) vs 백(AI)
  - 놓은 뒤 상대 돌(그룹)의 자유도(숨구멍)가 0이면 잡아서 제거
  - 자살수(내 그룹 자유도 0) 금지(단, 상대를 잡아서 살아나면 허용)
  - 게임 종료: 판이 꽉 차거나, 연속 2번 패스하면 종료
  - 승부: 잡은 돌 수가 더 많은 쪽 승리
  - 집 계산/패 규칙은 생략
*/

export default function BadukGame() {
  const navigate = useNavigate();

  // 오목과 동일한 난이도 값 이름 사용
  const [level, setLevel] = useState("easy"); // easy | normal | hard

  // 상(hard)만 13x13으로 확장
  const boardSize = level === "hard" ? 13 : 9;

  const [board, setBoard] = useState(() => makeEmptyBoard(boardSize));
  const [turn, setTurn] = useState("P"); // P: player(흑) / AI: 컴퓨터(백)
  const [winner, setWinner] = useState(null); // "P" | "AI" | "DRAW"
  const [msg, setMsg] = useState("흑돌(나)부터 시작");

  const [lastMove, setLastMove] = useState(null);

  // 잡은 돌 개수(점수)
  const [capB, setCapB] = useState(0); // 내가 잡은 백돌 수
  const [capW, setCapW] = useState(0); // 컴퓨터가 잡은 흑돌 수

  // 연속 패스 횟수(2면 종료)
  const [passStreak, setPassStreak] = useState(0);

  // 화면 표시용 돌 개수
  const stonesCount = useMemo(() => countStones(board), [board]);

  // 판이 커지거나 작아지면(난이도 변경으로) 자동으로 리셋
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
  };

  const reset = () => {
    resetToFreshBoard();
  };

  // 내(흑) 패스
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

  // AI 차례 자동 진행
  useEffect(() => {
    if (winner) return;
    if (turn !== "AI") return;

    const t = setTimeout(() => {
      const move = pickAiMove(board, level, boardSize);

      // 둘 수가 없으면(합법 수 0) 종료 처리
      if (!move) {
        finishByCaptureScore(capB, capW);
        return;
      }

      const placed = tryPlaceAndCapture(board, move.r, move.c, "W");
      if (!placed.ok) {
        // 아주 드물게 합법성이 깨지면 패스로 처리
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

      // AI가 두면 패스 연속 끊김
      setPassStreak(0);

      // 판이 꽉 찼으면 종료
      if (isFull(placed.board)) {
        finishByCaptureScore(
          capB,
          capW + (placed.captured > 0 ? placed.captured : 0)
        );
        return;
      }

      setTurn("P");
      setMsg("내 차례: 흑돌 두기");
    }, 380);

    return () => clearTimeout(t);
  }, [turn, winner, board, level, boardSize, capB, capW, passStreak]);

  // 내가 클릭했을 때
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

    // 내가 두면 패스 연속 끊김
    setPassStreak(0);

    // 판이 꽉 찼으면 종료
    if (isFull(placed.board)) {
      finishByCaptureScore(
        capB + (placed.captured > 0 ? placed.captured : 0),
        capW
      );
      return;
    }

    setTurn("AI");
    setMsg("컴퓨터 차례");
  };

  // 잡은 돌 점수로 승부 결정
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

  // 보드 크기에 따라 칸 크기 자동 조절(13x13일 때 너무 커지지 않게)
  const cellPx = boardSize === 13 ? 24 : 30;
  const stonePx = boardSize === 13 ? 16 : 20;

  return (
    <div className="baduk-page">
      <div className="baduk-head">
        <button
          type="button"
          className="baduk-back"
          onClick={() => navigate("/planner")}
        >
          ← 플래너
        </button>

        <div className="baduk-title">⚫ 바둑</div>

        <div className="baduk-head-right">
          <button type="button" className="baduk-pass" onClick={passTurn}>
            패스
          </button>

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
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="easy">하 (쉬움) · 9×9</option>
              <option value="normal">중 (보통) · 9×9</option>
              <option value="hard">상 (어려움) · 13×13</option>
            </select>

            <div className="baduk-mini">
              돌 {stonesCount}개 ·{" "}
              {winner ? "게임 끝" : turn === "P" ? "내 차례" : "컴퓨터 차례"}
              {" · "}
              <span className="baduk-score">
                내가 잡은 돌 {capB} · 컴퓨터 {capW}
              </span>
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
        style={{
            "--cell": `${cellPx}px`,
            "--stone": `${stonePx}px`,
            }}
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
                    <span
                      className={`stone black ${isLast ? "last-stone" : ""}`}
                    />
                  ) : cell === "W" ? (
                    <span
                      className={`stone white ${isLast ? "last-stone" : ""}`}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {winner && (
        <div className="baduk-finish">
          <div className="baduk-finish-title">
            {winner === "P"
              ? "내가 이겼어요"
              : winner === "AI"
              ? "컴퓨터가 이겼어요"
              : "비겼어요"}
          </div>

          <div className="baduk-finish-sub">
            잡은 돌로 승부했어요 (내 {capB} : 컴퓨터 {capW})
          </div>

          <div className="baduk-finish-actions">
            <button type="button" className="baduk-restart" onClick={reset}>
              한 판 더
            </button>

            <button
              type="button"
              className="baduk-back"
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

/* 바둑 로직 */

function makeEmptyBoard(size) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null)
  );
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

function getGroup(board, r, c) {
  const size = board.length;
  const color = board[r][c];
  if (!color) return { stones: [], liberties: 0 };

  const q = [[r, c]];
  const visited = new Set([`${r},${c}`]);
  const stones = [];
  const libSet = new Set();

  while (q.length) {
    const [cr, cc] = q.pop();
    stones.push([cr, cc]);

    for (const [nr, nc] of neighbors(cr, cc, size)) {
      const v = board[nr][nc];
      if (v === null) {
        libSet.add(`${nr},${nc}`);
      } else if (v === color) {
        const key = `${nr},${nc}`;
        if (!visited.has(key)) {
          visited.add(key);
          q.push([nr, nc]);
        }
      }
    }
  }

  return { stones, liberties: libSet.size };
}

function tryPlaceAndCapture(board, r, c, stone) {
  const size = board.length;
  if (!inRange(r, c, size)) return { ok: false, board, captured: 0 };
  if (board[r][c] !== null) return { ok: false, board, captured: 0 };

  const next = board.map((row) => row.slice());
  next[r][c] = stone;

  const opp = stone === "B" ? "W" : "B";

  let captured = 0;
  const toRemove = [];

  for (const [nr, nc] of neighbors(r, c, size)) {
    if (next[nr][nc] !== opp) continue;
    const g = getGroup(next, nr, nc);
    if (g.liberties === 0) {
      for (const [sr, sc] of g.stones) toRemove.push([sr, sc]);
    }
  }

  const uniq = new Set();
  for (const [sr, sc] of toRemove) {
    const key = `${sr},${sc}`;
    if (uniq.has(key)) continue;
    uniq.add(key);
    next[sr][sc] = null;
    captured++;
  }

  const myGroup = getGroup(next, r, c);
  if (myGroup.liberties === 0) {
    return { ok: false, board, captured: 0 };
  }

  return { ok: true, board: next, captured };
}

/* AI */

function listLegalMoves(board, stone) {
  const size = board.length;
  const out = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== null) continue;
      const placed = tryPlaceAndCapture(board, r, c, stone);
      if (placed.ok) out.push({ r, c, captured: placed.captured, board: placed.board });
    }
  }
  return out;
}

function pickAiMove(board, level, size) {
  const legal = listLegalMoves(board, "W");
  if (legal.length === 0) return null;

  if (level === "easy") {
    const weighted = legal.map((m) => ({
      r: m.r,
      c: m.c,
      w: centerWeight(m.r, m.c, size) * 1.2 + (m.captured > 0 ? 3 : 0),
    }));
    return pickWeighted(weighted);
  }

  if (level === "normal") {
    const MISTAKE_RATE = 0.30;

    const captures = legal.filter((m) => m.captured > 0);
    if (captures.length > 0 && Math.random() > MISTAKE_RATE) {
      captures.sort((a, b) => b.captured - a.captured);
      return { r: captures[0].r, c: captures[0].c };
    }

    const weighted = legal.map((m) => ({
      r: m.r,
      c: m.c,
      w: centerWeight(m.r, m.c, size) + (m.captured > 0 ? 2 : 0),
    }));
    return pickWeighted(weighted);
  }

  let best = legal[0];
  let bestScore = -Infinity;

  for (const m of legal) {
    const myLib = getGroup(m.board, m.r, m.c).liberties;
    const myGain = m.captured;

    const oppLegal = listLegalMoves(m.board, "B");
    let oppMaxCap = 0;
    for (const om of oppLegal) oppMaxCap = Math.max(oppMaxCap, om.captured);

    const score =
      myGain * 120 +
      myLib * 2 +
      centerWeight(m.r, m.c, size) * 0.9 -
      oppMaxCap * 130;

    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }

  return { r: best.r, c: best.c };
}

function centerWeight(r, c, size) {
  const mid = (size - 1) / 2;
  const dist = Math.abs(r - mid) + Math.abs(c - mid);
  return Math.max(1, 10 - dist);
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
