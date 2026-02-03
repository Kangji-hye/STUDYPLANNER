// src/pages/EnglishWordGame.jsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./EnglishWordGame.css";
import HamburgerMenu from "../components/common/HamburgerMenu";
import { WORDS } from "../data/englishWords";

/* 배열 섞기 */
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

/* 로컬 저장 키 */
const SCORE_KEY = "eng_game_score_v1";
const BEST_STREAK_KEY = "eng_game_best_streak_v1";

export default function EnglishWordGame() {
  const navigate = useNavigate();

  const [level, setLevel] = useState("low");

  /* 랜덤 순서 & 위치 */
  const [order, setOrder] = useState([]);
  const [pos, setPos] = useState(0);

  const [score, setScore] = useState(() => {
    const s = Number(localStorage.getItem(SCORE_KEY) || 0);
    return Number.isFinite(s) ? s : 0;
  });

  const [bestStreak, setBestStreak] = useState(() => {
    const b = Number(localStorage.getItem(BEST_STREAK_KEY) || 0);
    return Number.isFinite(b) ? b : 0;
  });

  const [streak, setStreak] = useState(0);
  const [result, setResult] = useState(null);
  const [locked, setLocked] = useState(false);
  const [showAnswer, setShowAnswer] = useState(null);

  const list = WORDS[level] ?? [];

  /* ✅ 현재 문제 */
  const current = list[order[pos]];

  /* 점수 저장 (외부 시스템 → useEffect 허용) */
  useMemo(() => {
    localStorage.setItem(SCORE_KEY, String(score));
  }, [score]);

  useMemo(() => {
    localStorage.setItem(BEST_STREAK_KEY, String(bestStreak));
  }, [bestStreak]);

  /* 발음 */
  const speakWord = (text) => {
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  };

  /* 정답 텍스트 */
  const correctText = useMemo(() => {
    if (!current) return "";
    return (current.meanings ?? []).join(", ");
  }, [current]);

  /* 보기 */
  const choices = useMemo(() => {
    if (!current) return [];

    const correct = {
      text: (current.meanings ?? []).join(", "),
      isCorrect: true,
    };

    const wrongs = (current.wrong ?? []).map((w) => ({
      text: (w ?? []).join(", "),
      isCorrect: false,
    }));

    return shuffle([correct, ...wrongs]).slice(0, 3);
  }, [current]);

  /* 게임 초기화 + 랜덤 세팅 */
  const startGame = (lv = level) => {
    const nextList = WORDS[lv] ?? [];
    const idxs = shuffle(nextList.map((_, i) => i));

    setOrder(idxs);
    setPos(0);
    setResult(null);
    setShowAnswer(null);
    setLocked(false);
    setStreak(0);
  };

  /* 최초 진입 시 한 번만 */
  useMemo(() => {
    startGame(level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 정답 처리 */
  const applyCorrect = () => {
    setStreak((prev) => {
      const next = prev + 1;
      const bonus = Math.min(10, Math.max(0, next - 1));
      setScore((s) => s + 10 + bonus);
      setBestStreak((b) => (next > b ? next : b));
      return next;
    });
  };

  const applyWrong = () => {
    setScore((s) => Math.max(0, s - 5));
    setStreak(0);
  };

  const goNext = () => {
    setPos((p) => (p + 1) % order.length);
  };

  const onSelect = (isCorrect) => {
    if (locked) return;
    setLocked(true);

    if (isCorrect) {
      applyCorrect();
      setResult("정답입니다.");
    } else {
      applyWrong();
      setResult("오답입니다.");
      setShowAnswer(correctText);
    }

    setTimeout(() => {
      setResult(null);
      setShowAnswer(null);
      goNext();
      setLocked(false);
    }, 900);
  };

  const changeLevel = (lv) => {
    setLevel(lv);
    startGame(lv);
  };

  const resetScore = () => {
    setScore(0);
    setStreak(0);
    localStorage.setItem(SCORE_KEY, "0");
  };

  return (
    <div className="gugu-page english-game notranslate">
      {/* 구구단과 동일 헤더 */}
      <div className="gugu-head">
        <button type="button" className="gugu-back" onClick={() => navigate("/planner")}>
          ← 플래너
        </button>

        <div className="gugu-title">영어 단어 게임</div>

        <div className="gugu-head-right">
          <button type="button" className="gugu-restart" onClick={resetScore}>
            다시하기
          </button>
          <div className="gugu-menu">
            <HamburgerMenu />
          </div>
        </div>
      </div>

      <div className="english-scoreboard">
        <span>점수 {score}</span>
        <span>연속 {streak}</span>
        <span>최고 {bestStreak}</span>
      </div>

      <div className="english-levels">
        {["low", "mid", "high"].map((lv) => (
          <button
            key={lv}
            type="button"
            className={level === lv ? "active" : ""}
            onClick={() => changeLevel(lv)}
          >
            {lv === "low" ? "하" : lv === "mid" ? "중" : "상"}
          </button>
        ))}
      </div>

      {current && (
        <div className="english-play">
          <div className="english-word-row">
            <span className="english-word-text">{current.word}</span>
            <button
              type="button"
              className="english-speaker"
              onClick={() => speakWord(current.word)}
            >
              🔊
            </button>
          </div>

          <div className="english-choices">
            {choices.map((c, i) => (
              <button key={i} onClick={() => onSelect(c.isCorrect)} disabled={locked}>
                {c.text}
              </button>
            ))}
          </div>

          {result && <div className="english-result">{result}</div>}
          {showAnswer && <div className="english-answer">정답: {showAnswer}</div>}

          <div className="english-progress">
            {pos + 1} / {order.length}
          </div>
        </div>
      )}
    </div>
  );
}
