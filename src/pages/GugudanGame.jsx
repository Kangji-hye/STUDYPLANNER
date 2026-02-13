// src/pages/GugudanGame.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import "./GugudanGame.css";
import supabase from "../supabaseClient";
import { saveBestScore } from "../utils/saveBestScore";

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
  const [finished, setFinished] = useState(false);

  const [a, setA] = useState(2);
  const [b, setB] = useState(1);
  const [choices, setChoices] = useState([]);
  const [msg, setMsg] = useState("시작해 볼까요? 🙂");

  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const correct = useMemo(() => a * b, [a, b]);

  const rules = useMemo(() => {
    if (level === "easy") {
      return { label: "쉬움", choiceCount: 3, timePerQuestion: 12, rightBase: 10, wrongPenalty: 5 };
    }
    if (level === "normal") {
      return { label: "보통", choiceCount: 4, timePerQuestion: 10, rightBase: 12, wrongPenalty: 7 };
    }
    return { label: "어려움", choiceCount: 5, timePerQuestion: 8, rightBase: 15, wrongPenalty: 10 };
  }, [level]);

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

  const makeQuestion = useCallback(() => {
    const nextA = randInt(danMin, danMax);
    const nextB = randInt(1, mulMax);
    const nextCorrect = nextA * nextB;

    setA(nextA);
    setB(nextB);

    const wrongs = [];
    while (wrongs.length < rules.choiceCount - 1) {
      const w = makeWrong(nextCorrect, wrongs);
      wrongs.push(w);
    }

    setChoices(shuffle([nextCorrect, ...wrongs]));
    setTimeLeft(rules.timePerQuestion);
    setMsg(`${rules.label} 난이도! 골라보자 🙂`);
  }, [danMin, danMax, mulMax, rules.choiceCount, rules.timePerQuestion, rules.label]);

  const resetGame = useCallback(() => {
    stopTimer();
    setIdx(0);
    setScore(0);
    setStreak(0);
    setFinished(false);
    setSaving(false);
    setSaved(false);
    setSaveMsg("");
    makeQuestion();
    startTimer();
  }, [makeQuestion]);

  useEffect(() => {
    resetGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, danMin, danMax, mulMax, totalQuestions]);

  useEffect(() => {
    if (finished) stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [finished]);

    useEffect(() => {
    if (finished) return;

    if (choices.length === 0) return;

    if (timeLeft > 0) return;
    applyWrong("시간 끝! 😅");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, finished, choices.length]);

  const goNext = () => {
    const nextIdx = idx + 1;

    if (nextIdx >= totalQuestions) {
      setFinished(true);
      stopTimer();
      setMsg("끝! 오늘도 잘했어요 🎉");
      return;
    }
    setIdx(nextIdx);
    makeQuestion();
  };

  const applyRight = () => {
    const bonus = Math.min(10, streak * 2);
    setScore((s) => s + rules.rightBase + bonus);
    setStreak((st) => st + 1);
    setMsg(streak >= 2 ? "연속 정답! 🔥" : "정답! 👍");
    goNext();
  };

  const applyWrong = (prefix) => {
    setScore((s) => Math.max(0, s - rules.wrongPenalty));
    setStreak(0);
    setMsg(`${prefix} 정답은 ${correct} 🙂`);
    goNext();
  };

  const onPick = (picked) => {
    if (finished) return;
    const userAnswer = Number(picked);
    if (userAnswer === correct) applyRight();
    else applyWrong("아깝다!");
  };

  const saveRanking = useCallback(async () => {
    if (!finished) return;
    if (saving || saved) return;

    setSaving(true);
    setSaveMsg("");

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;

      const me = authData?.user;
      if (!me?.id) {
        setSaveMsg("로그인이 필요해요.");
        setSaving(false);
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
        setSaving(false);
        return;
      }

      const nickname = String(prof?.nickname ?? "").trim() || "익명";

      const result = await saveBestScore({
        supabase,
        user_id: me.id,
        nickname,
        game_key: "gugudan",
        level: String(level),
        score: Number(score ?? 0),
      });

      if (!result.saved) {
        setSaveMsg(`저장했어요. (현재 내 최고점 ${result.prevBest}점)`);
        setSaving(false);
        return;
      }

      setSaved(true);
      setSaveMsg(`최고 기록으로 저장했어요. (이번 ${result.newBest}점)`);
    } catch (e) {
      console.error("gugudan save error:", e);
      setSaveMsg("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }, [finished, saving, saved, level, score]);

  const danOptions = [2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <div className="gugu-page">
      <div className="gugu-head">
        <button type="button" className="gugu-back" onClick={() => navigate("/gugudan-ranking")}>
          구구단 랭킹
        </button>

        <div className="gugu-title">✖️ 구구단 놀이</div>

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
            <select value={level} onChange={(e) => setLevel(e.target.value)} disabled={saving}>
              <option value="easy">쉬움 (선택지 3개)</option>
              <option value="normal">보통 (선택지 4개)</option>
              <option value="hard">어려움 (선택지 5개)</option>
            </select>
          </div>
        </div>

        <div className="gugu-row">
          <div className="gugu-label">단 범위</div>
          <div className="gugu-controls">
            <select value={danMin} onChange={(e) => setDanMin(Number(e.target.value))} disabled={saving}>
              {danOptions.map((v) => (
                <option key={`min-${v}`} value={v}>
                  {v}단부터
                </option>
              ))}
            </select>

            <span className="gugu-sep">~</span>

            <select value={danMax} onChange={(e) => setDanMax(Number(e.target.value))} disabled={saving}>
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
            <select value={mulMax} onChange={(e) => setMulMax(Number(e.target.value))} disabled={saving}>
              <option value={9}>1~9</option>
              <option value={12}>1~12</option>
            </select>
          </div>
        </div>

        <div className="gugu-row">
          <div className="gugu-label">문제 수</div>
          <div className="gugu-controls">
            <select value={totalQuestions} onChange={(e) => setTotalQuestions(Number(e.target.value))} disabled={saving}>
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

            {saveMsg ? <div className="gugu-msg" style={{ marginTop: 8 }}>{saveMsg}</div> : null}

            <div className="gugu-finish-actions">
              <button type="button" className="gugu-submit" onClick={resetGame} disabled={saving}>
                한 판 더!
              </button>

              <button type="button" className="gugu-submit" onClick={saveRanking} disabled={saving || saved}>
                {saved ? "저장 완료" : saving ? "저장 중..." : "랭킹에 저장"}
              </button>

              <button type="button" className="gugu-choice" onClick={() => navigate("/gugudan-ranking")} disabled={saving}>
                랭킹 보기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function randInt(min, max) {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function makeWrong(correct, existingWrongs) {
  let w = correct;

  while (w === correct || existingWrongs.includes(w) || w <= 0) {
    const delta = randInt(-6, 6);
    w = correct + delta;

    if (w <= 0) w = correct + Math.abs(delta) + 1;

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
