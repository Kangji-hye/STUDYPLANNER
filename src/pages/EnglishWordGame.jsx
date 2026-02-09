// src/pages/EnglishWordGame.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./EnglishWordGame.css";
import HamburgerMenu from "../components/common/HamburgerMenu";
import supabase from "../supabaseClient";
import { WORDS } from "../data/englishWords";
import { saveBestScore } from "../utils/saveBestScore";

const GAME_KEY = "english";
const BEST_STREAK_KEY = "eng_game_best_streak_v1";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeMeaning(item) {
  if (!item) return "";
  // 1) { meaning: "apple" } 형태
  if (typeof item.meaning === "string" && item.meaning.trim()) return item.meaning.trim();
  // 2) { meanings: ["apple", "사과"] } 형태
  if (Array.isArray(item.meanings) && item.meanings.length) {
    const s = item.meanings.map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
    if (s) return s;
  }
  // 3) 혹시 { answer: ... } 같은 변형이 있을 때 대비
  if (typeof item.answer === "string" && item.answer.trim()) return item.answer.trim();
  return "";
}

function normalizeWord(item) {
  const w = String(item?.word ?? "").trim();
  return w;
}

export default function EnglishWordGame() {
  const navigate = useNavigate();

  // ✅ 쉬움/어려움 2단계
  const [level, setLevel] = useState("easy");

  const [order, setOrder] = useState([]);
  const [pos, setPos] = useState(0);

  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);

  const [bestStreak, setBestStreak] = useState(() => {
    const b = Number(localStorage.getItem(BEST_STREAK_KEY) || 0);
    return Number.isFinite(b) ? b : 0;
  });

  const [result, setResult] = useState(null);
  const [locked, setLocked] = useState(false);
  const [showAnswer, setShowAnswer] = useState(null);

  const [qNo, setQNo] = useState(1);
  const [finished, setFinished] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const endTimerRef = useRef(null);

  // ✅ 쉬움 10문제 / 어려움 15문제
  const totalQuestions = useMemo(() => (level === "easy" ? 10 : 15), [level]);

  // ✅ 단어 풀 만들기
  // - 쉬움: low(또는 easy가 있으면 easy)
  // - 어려움: mid + high(또는 hard가 있으면 hard)
  const pool = useMemo(() => {
    const low = Array.isArray(WORDS?.easy) ? WORDS.easy : Array.isArray(WORDS?.low) ? WORDS.low : [];
    const mid = Array.isArray(WORDS?.mid) ? WORDS.mid : [];
    const high = Array.isArray(WORDS?.high) ? WORDS.high : [];
    const hard = Array.isArray(WORDS?.hard) ? WORDS.hard : [];

    if (level === "easy") return low;
    if (hard.length) return hard;
    return [...mid, ...high];
  }, [level]);

  const current = useMemo(() => {
    if (!pool.length) return null;
    const idx = order[pos];
    if (typeof idx !== "number") return null;
    return pool[idx] ?? null;
  }, [pool, order, pos]);

  const correctText = useMemo(() => normalizeMeaning(current), [current]);

  // ✅ 보기(선택지) 4개를 항상 만들기: 정답 1 + 오답 3
  // - current.wrong가 있으면 그것도 활용
  // - 없으면 pool에서 랜덤으로 뽑아 오답을 구성
  const choices = useMemo(() => {
    if (!current) return [];

    const correct = normalizeMeaning(current);
    if (!correct) return [];

    const used = new Set([correct]);
    const wrongs = [];

    // 1) current.wrong 형태 지원(배열이든 문자열이든 최대한 살림)
    const rawWrong = current?.wrong;
    if (Array.isArray(rawWrong)) {
      for (const w of rawWrong) {
        const t = Array.isArray(w)
          ? w.map((x) => String(x ?? "").trim()).filter(Boolean).join(", ")
          : String(w ?? "").trim();
        if (!t) continue;
        if (used.has(t)) continue;
        used.add(t);
        wrongs.push(t);
        if (wrongs.length >= 3) break;
      }
    } else if (typeof rawWrong === "string") {
      const t = rawWrong.trim();
      if (t && !used.has(t)) {
        used.add(t);
        wrongs.push(t);
      }
    }

    // 2) 부족하면 pool에서 랜덤 오답 채우기
    let guard = 0;
    while (wrongs.length < 3 && guard < 3000) {
      guard += 1;
      const cand = pool[Math.floor(Math.random() * pool.length)];
      const t = normalizeMeaning(cand);
      if (!t) continue;
      if (used.has(t)) continue;
      used.add(t);
      wrongs.push(t);
    }

    const items = [
      { text: correct, isCorrect: true },
      ...wrongs.slice(0, 3).map((t) => ({ text: t, isCorrect: false })),
    ];

    // 혹시 오답이 부족하면 최소 2개라도 보여주게 안전장치
    const final = items.filter((x) => String(x.text ?? "").trim());
    return shuffle(final);
  }, [current, pool]);

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
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text ?? ""));
      u.lang = "en-US";
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    } catch (e) {
      console.warn("speakWord error:", e);
    }
  };

  const startGame = (lv = level) => {
    const nextPool = (() => {
      const low = Array.isArray(WORDS?.easy) ? WORDS.easy : Array.isArray(WORDS?.low) ? WORDS.low : [];
      const mid = Array.isArray(WORDS?.mid) ? WORDS.mid : [];
      const high = Array.isArray(WORDS?.high) ? WORDS.high : [];
      const hard = Array.isArray(WORDS?.hard) ? WORDS.hard : [];

      if (lv === "easy") return low;
      if (hard.length) return hard;
      return [...mid, ...high];
    })();

    const idxs = shuffle(nextPool.map((_, i) => i));
    const limit = lv === "easy" ? 10 : 15;
    const sliced = idxs.slice(0, Math.min(limit, idxs.length));

    setOrder(sliced);
    setPos(0);
    setQNo(1);

    setScore(0);
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
    localStorage.setItem(BEST_STREAK_KEY, "0");
    setBestStreak(0);
  };

  const saveRanking = async () => {
    if (!finished) return;
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
      const nextScore = Number(score ?? 0);

      const result = await saveBestScore({
        supabase,
        user_id: me.id,
        nickname,
        game_key: String(GAME_KEY),
        level: String(level), // easy | hard
        score: nextScore,
      });

      if (!result?.ok) throw result?.error ?? new Error(result?.reason ?? "save_failed");

      setSaved(true);
      if (result.updated) {
        const prev = result.prevBest ?? null;
        if (prev !== null && Number.isFinite(Number(prev))) {
          setSaveMsg(`점수를 업데이트했어요. (이전 ${prev}점 → 이번 ${nextScore}점)`);
        } else {
          setSaveMsg("랭킹에 저장했어요.");
        }
      } else {
        const best = result.prevBest ?? 0;
        setSaveMsg(`이미 더 높은 기록이 있어요. (내 최고점 ${best}점)`);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("english save error:", e);
      setSaveMsg("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const wordText = normalizeWord(current);

  return (
    <div className="gugu-page english-game notranslate">
      <div className="gugu-head">
        <button type="button" className="gugu-back" onClick={() => navigate("/english-word-ranking")}>
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
        {["easy", "hard"].map((lv) => (
          <button
            key={lv}
            type="button"
            className={level === lv ? "active" : ""}
            onClick={() => changeLevel(lv)}
            disabled={saving}
          >
            {lv === "easy" ? "쉬움(10문제)" : "어려움(15문제)"}
          </button>
        ))}
      </div>

      {!finished ? (
        current ? (
          <div className="english-play">
            <div className="english-word-row">
              <span className="english-word-text">{wordText || "단어 없음"}</span>
              <button type="button" className="english-speaker" onClick={() => speakWord(wordText)}>
                🔊
              </button>
            </div>

            {/* ✅ choices가 비어있으면 “데이터 문제” 메시지를 화면에 보여줌 */}
            {choices.length > 0 ? (
              <div className="english-choices">
                {choices.map((c, i) => (
                  <button key={i} type="button" onClick={() => onSelect(c.isCorrect)} disabled={locked}>
                    {c.text}
                  </button>
                ))}
              </div>
            ) : (
              <div className="english-data-warning">
                보기가 만들어지지 않았어요. 영어 단어 데이터에 meaning/meanings 값이 있는지 확인해 주세요.
              </div>
            )}

            {result ? <div className="english-result">{result}</div> : null}
            {showAnswer ? <div className="english-answer">정답: {showAnswer}</div> : null}
          </div>
        ) : (
          <div className="english-play">
            <div className="english-result">문제가 비어 있어요. 영어 단어 데이터를 확인해 주세요.</div>
          </div>
        )
      ) : (
        <div className="english-play">
          <div className="english-finish-title">끝! 최종 점수는 {score}점 입니다.</div>

          {saveMsg ? <div className="english-answer english-save-msg">{saveMsg}</div> : null}

          <div className="english-finish-actions">
            <button type="button" className="gugu-restart" onClick={saveRanking} disabled={saving || saved}>
              {saved ? "저장 완료" : saving ? "저장 중..." : "랭킹에 저장"}
            </button>

            <button type="button" className="gugu-restart ghost" onClick={() => navigate("/english-word-ranking")}>
              랭킹 보기
            </button>

            <button type="button" className="gugu-restart ghost" onClick={() => startGame(level)}>
              한 번 더
            </button>

            <button type="button" className="gugu-restart ghost" onClick={() => navigate("/planner")}>
              플래너
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
