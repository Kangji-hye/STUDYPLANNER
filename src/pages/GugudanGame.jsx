// src/pages/GugudanGame.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./GugudanGame.css";
import HamburgerMenu from "../components/common/HamburgerMenu";

export default function GugudanGame() {
  const navigate = useNavigate();

  const [level, setLevel] = useState("easy");

  const [danMin, setDanMin] = useState(2);
  const [danMax, setDanMax] = useState(9);

  const [mulMax, setMulMax] = useState(9);

  const [totalQuestions, setTotalQuestions] = useState(10);

  const [idx, setIdx] = useState(0);

  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);

  const [msg, setMsg] = useState("시작해 볼까요? 🙂");

  const [a, setA] = useState(2);
  const [b, setB] = useState(1);

  const [answer, setAnswer] = useState("");

  const [choices, setChoices] = useState([]);

  const [finished, setFinished] = useState(false);

  const [timeLeft, setTimeLeft] = useState(30);
  const timerRef = useRef(null);

  const correct = useMemo(() => a * b, [a, b]);

  const makeQuestion = () => {
    const nextA = randInt(danMin, danMax);

    const nextB = randInt(1, mulMax);

    setA(nextA);
    setB(nextB);

    if (level === "easy") {
      const nextCorrect = nextA * nextB;

      const w1 = makeWrong(nextCorrect);
      const w2 = makeWrong(nextCorrect, w1);

      const arr = shuffle([nextCorrect, w1, w2]);
      setChoices(arr);
    } else {
      setChoices([]);
    }

    setAnswer("");
  };

  const resetGame = () => {
    setIdx(0);
    setScore(0);
    setStreak(0);
    setFinished(false);
    setMsg("좋아요! 시작 🙂");

    // 상 난이도는 타이머 초기화
    if (level === "hard") setTimeLeft(30);

    makeQuestion();
  };

  useEffect(() => {
    resetGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, danMin, danMax, mulMax, totalQuestions]);

  useEffect(() => {
    // hard가 아니면 타이머 끔
    if (level !== "hard" || finished) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    // 이미 타이머가 있으면 중복 생성 방지
    if (timerRef.current) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((t) => t - 1);
    }, 1000);

    return () => {
      clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [level, finished]);

  useEffect(() => {
    if (level === "hard" && !finished && timeLeft <= 0) {
      setFinished(true);
      setMsg("시간 끝! 다음에는 더 빠르게 해보자 🙂");
    }
  }, [timeLeft, level, finished]);

  const submit = (picked) => {
    if (finished) return;

    const userAnswer = Number(picked);
    const ok = userAnswer === correct;

    if (ok) {
      // 점수 규칙: 기본 10점, 연속 정답이면 보너스
      const bonus = Math.min(10, streak); // 0~10
      setScore((s) => s + 10 + bonus);
      setStreak((st) => st + 1);

      // 칭찬 문구는 너무 길지 않게
      const praise = streak >= 3 ? "연속 정답 최고! 🔥" : "정답! 👍";
      setMsg(praise);
    } else {
      setStreak(0);
      setMsg(`아깝다! 정답은 ${correct} 🙂`);
    }

    // 다음 문제로 이동(마지막이면 종료)
    const nextIdx = idx + 1;
    if (nextIdx >= totalQuestions) {
      setFinished(true);
      return;
    }

    setIdx(nextIdx);

    makeQuestion();
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (answer.trim() === "") return;
      submit(answer.trim());
    }
  };

  const danOptions = [2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <div className="gugu-page">
      <div className="gugu-head">
        <button type="button" className="gugu-back" onClick={() => navigate("/planner")}>
          ← 플래너
        </button>

        <div className="gugu-title">✖️ 구구단 놀이</div>

        {/* ✅ 오른쪽 고정 햄버거 메뉴 */}
        <div className="gugu-menu">
          <HamburgerMenu />
        </div>
      </div>

      <div className="gugu-card">
        <div className="gugu-row">
          <div className="gugu-label">난이도</div>
          <div className="gugu-controls">
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="easy">하 (선택)</option>
              <option value="normal">중 (입력)</option>
              <option value="hard">상 (시간+혼합)</option>
            </select>
          </div>
        </div>

        <div className="gugu-row">
          <div className="gugu-label">단 범위</div>
          <div className="gugu-controls">
            <select value={danMin} onChange={(e) => setDanMin(Number(e.target.value))}>
              {danOptions.map((v) => (
                <option key={`min-${v}`} value={v}>{v}단부터</option>
              ))}
            </select>

            <span className="gugu-sep">~</span>

            <select value={danMax} onChange={(e) => setDanMax(Number(e.target.value))}>
              {danOptions.map((v) => (
                <option key={`max-${v}`} value={v}>{v}단까지</option>
              ))}
            </select>
          </div>
        </div>

        <div className="gugu-row">
          <div className="gugu-label">곱 범위</div>
          <div className="gugu-controls">
            <select value={mulMax} onChange={(e) => setMulMax(Number(e.target.value))}>
              <option value={9}>1~9</option>
              <option value={12}>1~12</option>
            </select>

            <span className="gugu-hint">상 난이도는 12까지도 추천 🙂</span>
          </div>
        </div>

        <div className="gugu-row">
          <div className="gugu-label">문제 수</div>
          <div className="gugu-controls">
            <select value={totalQuestions} onChange={(e) => setTotalQuestions(Number(e.target.value))}>
              <option value={5}>5문제</option>
              <option value={10}>10문제</option>
              <option value={15}>15문제</option>
              <option value={20}>20문제</option>
            </select>
          </div>
        </div>
      </div>

      <div className="gugu-card gugu-play">
        <div className="gugu-topline">
          <div className="gugu-progress">
            {finished ? "끝!" : `${idx + 1} / ${totalQuestions}`}
          </div>

          <div className="gugu-score">
            점수 <b>{score}</b> · 연속 <b>{streak}</b>
          </div>

          {level === "hard" && (
            <div className={`gugu-timer ${timeLeft <= 5 ? "danger" : ""}`}>
              ⏱ {Math.max(0, timeLeft)}초
            </div>
          )}
        </div>

        <div className="gugu-question" aria-label="문제">
          <span className="gugu-q">{a}</span>
          <span className="gugu-q">×</span>
          <span className="gugu-q">{b}</span>
          <span className="gugu-q">=</span>
          <span className="gugu-q">?</span>
        </div>

        <div className="gugu-msg" aria-live="polite">
          {msg}
        </div>

        {level === "easy" && !finished && (
          <div className="gugu-choices">
            {choices.map((c) => (
              <button
                key={`c-${c}`}
                type="button"
                className="gugu-choice"
                onClick={() => submit(c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {level !== "easy" && !finished && (
          <div className="gugu-input-row">
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={onKeyDown}
              inputMode="numeric"
              placeholder="정답을 숫자로 입력하고 엔터!"
              aria-label="정답 입력"
            />
            <button
              type="button"
              className="gugu-submit"
              onClick={() => {
                if (answer.trim() === "") return;
                submit(answer.trim());
              }}
            >
              확인
            </button>
          </div>
        )}

        {finished && (
          <div className="gugu-finish">
            <div className="gugu-finish-title">오늘도 수고했어요 🎉</div>
            <div className="gugu-finish-sub">
              점수는 <b>{score}</b>점 입니다.
            </div>

            <div className="gugu-finish-actions">
              <button type="button" className="gugu-submit" onClick={resetGame}>
                한 판 더!
              </button>
              <button type="button" className="gugu-choice" onClick={() => navigate("/planner")}>
                플래너로
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="gugu-tip">
        너무 쉽거나 어렵다면 “단 범위”를 좁히거나 넓혀보세요.
        아이가 지치면 문제 수를 5개로 줄이는 게 제일 잘 먹힙니다 🙂
      </div>
    </div>
  );
}

function randInt(min, max) {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function makeWrong(correct, avoid) {
  let w = correct;

  while (w === correct || w === avoid || w <= 0) {
    const delta = randInt(-5, 5);
    w = correct + delta;

    if (w === correct || w === avoid || w <= 0) {
      w = randInt(Math.max(1, correct - 8), correct + 8);
    }
  }
  return w;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
