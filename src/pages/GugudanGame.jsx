// src/pages/GugudanGame.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import "./GugudanGame.css";

/**
 * ✅ 숫자놀이(구구단) - 초등학생용
 * - 난이도 3개 모두 "타이머" 있음
 * - 난이도 3개 모두 "선택형(객관식)"만 사용 (입력 없음)
 * - 난이도에 따라 선택지 수가 3/4/5개로 증가
 * - 틀리면 즉시 점수 깎임(바로 반영)
 * - 시간 0초가 되면 자동 오답 처리(점수 깎임) 후 다음 문제
 */
export default function GugudanGame() {
  const navigate = useNavigate();

  // ✅ 난이도
  // easy: 선택지 3개
  // normal: 선택지 4개
  // hard: 선택지 5개
  const [level, setLevel] = useState("easy");

  // ✅ 단 범위 (2~9)
  const [danMin, setDanMin] = useState(2);
  const [danMax, setDanMax] = useState(9);

  // ✅ 곱 범위 (1~9, 1~12)
  const [mulMax, setMulMax] = useState(9);

  // ✅ 한 판 문제 수
  const [totalQuestions, setTotalQuestions] = useState(10);

  // ✅ 진행 상태
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [finished, setFinished] = useState(false);

  // ✅ 문제 숫자
  const [a, setA] = useState(2);
  const [b, setB] = useState(1);

  // ✅ 보기(객관식)
  const [choices, setChoices] = useState([]);

  // ✅ 안내 문구
  const [msg, setMsg] = useState("시작해 볼까요? 🙂");

  // ✅ 타이머
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef(null);

  // ✅ 정답
  const correct = useMemo(() => a * b, [a, b]);

  // ✅ 난이도별 설정 (선택지 수 / 문제당 제한시간 / 점수)
  const rules = useMemo(() => {
    if (level === "easy") {
      return {
        label: "하",
        choiceCount: 3,
        timePerQuestion: 12,
        rightBase: 10,
        wrongPenalty: 5,
      };
    }
    if (level === "normal") {
      return {
        label: "중",
        choiceCount: 4,
        timePerQuestion: 10,
        rightBase: 12,
        wrongPenalty: 7,
      };
    }
    return {
      label: "상",
      choiceCount: 5,
      timePerQuestion: 8,
      rightBase: 15,
      wrongPenalty: 10,
    };
  }, [level]);

  // ✅ 랜덤 문제 생성 + 선택지 생성
  const makeQuestion = () => {
    const nextA = randInt(danMin, danMax);
    const nextB = randInt(1, mulMax);
    const nextCorrect = nextA * nextB;

    setA(nextA);
    setB(nextB);

    // ✅ 선택지 만들기
    // - 정답 1개 + 오답 (choiceCount-1)개
    const wrongs = [];
    while (wrongs.length < rules.choiceCount - 1) {
      const w = makeWrong(nextCorrect, wrongs);
      wrongs.push(w);
    }
    const arr = shuffle([nextCorrect, ...wrongs]);
    setChoices(arr);

    // ✅ 타이머 리셋
    setTimeLeft(rules.timePerQuestion);

    // ✅ 문구(너무 길지 않게)
    setMsg(`${rules.label} 난이도! 골라보자 🙂`);
  };

  // ✅ 타이머 시작/정리
  const stopTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const startTimer = () => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => t - 1);
    }, 1000);
  };

  // ✅ 게임 리셋
  const resetGame = () => {
    stopTimer();
    setIdx(0);
    setScore(0);
    setStreak(0);
    setFinished(false);

    makeQuestion();
    startTimer();
  };

  // ✅ 난이도/범위/문제수가 바뀌면 새로 시작
  useEffect(() => {
    resetGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, danMin, danMax, mulMax, totalQuestions]);

  // ✅ 게임 종료 시 타이머 정지
  useEffect(() => {
    if (finished) stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  // ✅ 시간 0초가 되면 자동 오답 처리
  useEffect(() => {
    if (finished) return;
    if (timeLeft > 0) return;

    // 타임아웃 = 오답 처리 (즉시 점수 깎기)
    applyWrong("시간 끝! 😅");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, finished]);

  // ✅ 다음 문제로 이동 공통
  const goNext = () => {
    const nextIdx = idx + 1;

    // 마지막 문제면 종료
    if (nextIdx >= totalQuestions) {
      setFinished(true);
      stopTimer();
      setMsg("끝! 오늘도 잘했어요 🎉");
      return;
    }

    setIdx(nextIdx);
    makeQuestion(); // 타이머도 함께 리셋됨
  };

  // ✅ 정답 처리
  const applyRight = () => {
    // 연속 정답 보너스(너무 과하지 않게)
    const bonus = Math.min(10, streak * 2); // 0,2,4,6...
    setScore((s) => s + rules.rightBase + bonus);
    setStreak((st) => st + 1);
    setMsg(streak >= 2 ? "연속 정답! 🔥" : "정답! 👍");
    goNext();
  };

  // ✅ 오답 처리(즉시 점수 깎기)
  const applyWrong = (prefix) => {
    setScore((s) => Math.max(0, s - rules.wrongPenalty)); // 점수는 0 아래로 안 내려가게
    setStreak(0);
    setMsg(`${prefix} 정답은 ${correct} 🙂`);
    goNext();
  };

  // ✅ 선택지 클릭
  const onPick = (picked) => {
    if (finished) return;

    const userAnswer = Number(picked);
    if (userAnswer === correct) applyRight();
    else applyWrong("아깝다!");
  };

  // ✅ 단 옵션
  const danOptions = [2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <div className="gugu-page">
      <div className="gugu-head">
        <button type="button" className="gugu-back" onClick={() => navigate("/planner")}>
          ← 플래너
        </button>

        <div className="gugu-title">✖️ 숫자놀이</div>

        {/* ✅ 오른쪽 끝: 항상 같은 자리 */}
        <div className="gugu-head-right">
          <button type="button" className="gugu-restart" onClick={resetGame}>
            다시하기
          </button>
          <div className="gugu-menu">
            <HamburgerMenu />
          </div>
        </div>
      </div>

      <div className="gugu-card">
        <div className="gugu-row">
          <div className="gugu-label">난이도</div>
          <div className="gugu-controls">
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="easy">하 (선택지 3개)</option>
              <option value="normal">중 (선택지 4개)</option>
              <option value="hard">상 (선택지 5개)</option>
            </select>
          </div>
        </div>

        <div className="gugu-row">
          <div className="gugu-label">단 범위</div>
          <div className="gugu-controls">
            <select value={danMin} onChange={(e) => setDanMin(Number(e.target.value))}>
              {danOptions.map((v) => (
                <option key={`min-${v}`} value={v}>
                  {v}단부터
                </option>
              ))}
            </select>

            <span className="gugu-sep">~</span>

            <select value={danMax} onChange={(e) => setDanMax(Number(e.target.value))}>
              {danOptions.map((v) => (
                <option key={`max-${v}`} value={v}>
                  {v}단까지
                </option>
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
          <div className="gugu-progress">{finished ? "끝!" : `${idx + 1} / ${totalQuestions}`}</div>

          <div className="gugu-score">
            점수 <b>{score}</b> · 연속 <b>{streak}</b>
          </div>

          {/* ✅ 모든 난이도 공통 타이머 */}
          <div className={`gugu-timer ${timeLeft <= 3 ? "danger" : ""}`}>
            ⏱ {Math.max(0, timeLeft)}초
          </div>
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

        {/* ✅ 세 난이도 모두 선택형 */}
        {!finished && (
          <div className={`gugu-choices gugu-choices-${rules.choiceCount}`}>
            {choices.map((c) => (
              <button key={`c-${idx}-${c}`} type="button" className="gugu-choice" onClick={() => onPick(c)}>
                {c}
              </button>
            ))}
          </div>
        )}

        {finished && (
          <div className="gugu-finish">
            <div className="gugu-finish-title">오늘도 수고했어요 🎉</div>
            <div className="gugu-finish-sub">
              최종 점수는 <b>{score}</b>점 입니다.
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
    </div>
  );
}

/* ---------------------------
   유틸 함수들
---------------------------- */

function randInt(min, max) {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

// ✅ 오답 만들기(정답과 너무 멀지 않게, 중복 방지)
function makeWrong(correct, existingWrongs) {
  let w = correct;

  while (w === correct || existingWrongs.includes(w) || w <= 0) {
    // 정답 주변 흔들기
    const delta = randInt(-6, 6);
    w = correct + delta;

    // 너무 작은/이상한 값이면 다시
    if (w <= 0) w = correct + Math.abs(delta) + 1;

    // 가끔 더 넓게
    if (w === correct || existingWrongs.includes(w)) {
      w = randInt(Math.max(1, correct - 10), correct + 10);
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
