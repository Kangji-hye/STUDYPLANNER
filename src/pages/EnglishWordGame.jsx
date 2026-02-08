// src/pages/EnglishWordGame.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./EnglishWordGame.css";
import HamburgerMenu from "../components/common/HamburgerMenu";
import supabase from "../supabaseClient";
import { WORDS } from "../data/englishWords";

const GAME_KEY = "english";
const SCORE_KEY = "eng_game_score_v1";
const BEST_STREAK_KEY = "eng_game_best_streak_v1";

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export default function EnglishWordGame() {
  const navigate = useNavigate();

  const [level, setLevel] = useState("low");

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

  const [qNo, setQNo] = useState(1);
  const [finished, setFinished] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const endTimerRef = useRef(null);

  const totalQuestions = useMemo(() => (level === "low" ? 10 : 15), [level]);

  const list = WORDS[level] ?? [];
  const current = list[order[pos]];

  useEffect(() => {
    localStorage.setItem(SCORE_KEY, String(score));
  }, [score]);

  useEffect(() => {
    localStorage.setItem(BEST_STREAK_KEY, String(bestStreak));
  }, [bestStreak]);

  useEffect(() => {
    return () => {
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    };
  }, []);

  const speakWord = (text) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  };

  const correctText = useMemo(() => {
    if (!current) return "";
    return (current.meanings ?? []).join(", ");
  }, [current]);

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

  const startGame = (lv = level) => {
    const nextList = WORDS[lv] ?? [];
    const idxs = shuffle(nextList.map((_, i) => i));

    const limit = lv === "low" ? 10 : 15;
    const sliced = idxs.slice(0, Math.min(limit, idxs.length));

    setOrder(sliced);
    setPos(0);
    setQNo(1);

    setResult(null);
    setShowAnswer(null);
    setLocked(false);

    setStreak(0);
    setFinished(false);

    setSaved(false);
    setSaving(false);
    setSaveMsg("");
  };

  useEffect(() => {
    startGame(level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const finishNow = () => {
    setFinished(true);
    setLocked(true);
    setResult(null);
    setShowAnswer(null);
  };

  const goNext = () => {
    const nextNo = qNo + 1;
    if (nextNo > order.length || nextNo > totalQuestions) {
      finishNow();
      return;
    }

    setQNo(nextNo);
    setPos((p) => p + 1);
  };

  const onSelect = (isCorrect) => {
    if (locked) return;
    if (finished) return;

    setLocked(true);

    if (isCorrect) {
      applyCorrect();
      setResult("정답입니다.");
    } else {
      applyWrong();
      setResult("오답입니다.");
      setShowAnswer(correctText);
    }

    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    endTimerRef.current = setTimeout(() => {
      setResult(null);
      setShowAnswer(null);
      setLocked(false);
      goNext();
    }, 850);
  };

  const changeLevel = (lv) => {
    setLevel(lv);
    startGame(lv);
  };

  const resetScore = () => {
    setScore(0);
    setStreak(0);
    localStorage.setItem(SCORE_KEY, "0");
    localStorage.setItem(BEST_STREAK_KEY, "0");
    setBestStreak(0);
  };

  const saveRanking = async () => {
    if (saving) return;
    if (saved) return;

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

      const { data: prof } = await supabase
        .from("profiles")
        .select("nickname, is_admin")
        .eq("id", me.id)
        .maybeSingle();

      if (prof?.is_admin) {
        setSaveMsg("관리자 계정은 랭킹에서 제외되어 저장하지 않아요.");
        setSaved(true);
        setSaving(false);
        return;
      }

      const nickname = String(prof?.nickname ?? "").trim() || "익명";

      const { error } = await supabase.from("game_scores").insert([
        {
          user_id: me.id,
          nickname,
          game_key: GAME_KEY,
          level: String(level),
          score: Number(score),
        },
      ]);

      if (error) throw error;

      setSaved(true);
      setSaveMsg("랭킹에 저장했어요.");
    } catch (e) {
      console.error("english save error:", e);
      setSaveMsg("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="gugu-page english-game notranslate">
      <div className="gugu-head">
        <button
          type="button"
          className="gugu-back"
          onClick={() => navigate("/english-word-ranking")}
        >
          영어 랭킹
        </button>

        <div className="gugu-title">영어 단어</div>

        <div className="gugu-head-right">
          <button type="button" className="gugu-restart" onClick={resetScore}>
            점수 초기화
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
        <span>
          문제 {Math.min(qNo, totalQuestions)} / {totalQuestions}
        </span>
      </div>

      <div className="english-levels">
        {["low", "mid", "high"].map((lv) => (
          <button
            key={lv}
            type="button"
            className={level === lv ? "active" : ""}
            onClick={() => changeLevel(lv)}
            disabled={saving}
          >
            {lv === "low" ? "하(10문제)" : lv === "mid" ? "중(15문제)" : "상(15문제)"}
          </button>
        ))}
      </div>

      {!finished ? (
        current ? (
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
          </div>
        ) : (
          <div className="english-play">
            <div className="english-result">문제가 비어 있어요. 단어 데이터를 확인해 주세요.</div>
          </div>
        )
      ) : (
        <div className="english-play">
          <div className="english-result" style={{ fontWeight: 900 }}>
            끝! 최종 점수는 {score}점 입니다.
          </div>

          {saveMsg ? (
            <div className="english-answer" style={{ marginTop: 8 }}>
              {saveMsg}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button
              type="button"
              className="gugu-restart"
              onClick={saveRanking}
              disabled={saving || saved}
            >
              {saved ? "저장 완료" : saving ? "저장 중..." : "랭킹에 저장"}
            </button>

            <button
              type="button"
              className="gugu-restart"
              onClick={() => navigate("/english-word-ranking")}
            >
              랭킹 보기
            </button>

            <button type="button" className="gugu-restart" onClick={() => startGame(level)}>
              한 번 더
            </button>

            <button type="button" className="gugu-restart" onClick={() => navigate("/planner")}>
              플래너
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
