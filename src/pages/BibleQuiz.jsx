// src/pages/BibleQuiz.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import supabase from "../supabaseClient";
import { saveBestScore } from "../utils/saveBestScore";
import "./BibleQuiz.css";

const QUESTION_COUNT_BY_DIFFICULTY = {
  easy: 10,
  hard: 15,
};

const TIME_LIMIT_EASY = 60;
const TIME_LIMIT_HARD = 15;
const AUTO_NEXT_DELAY_MS = 450;

const GAME_KEY = "bible_quiz";
const DEFAULT_BOOK = "proverbs";
const DEFAULT_DIFFICULTY = "easy";

const BOOKS = [
  { key: "proverbs", label: "잠언", enabled: true },
  { key: "people", label: "인물", enabled: true },
  { key: "genesis", label: "창세기", enabled: false },
  { key: "john", label: "요한복음", enabled: false },
];

const DIFFICULTIES = [
  { key: "easy", label: "쉬움" },
  { key: "hard", label: "어려움" },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderTextWithBlank(text) {
  return String(text ?? "").split("__BLANK__").join("_______");
}

function parseChoiceWithHint(s) {
  const raw = String(s ?? "").trim();
  const [word, hint] = raw.split("|").map((x) => String(x ?? "").trim());
  return { word: word || raw, hint: hint || "" };
}

function formatEasyChoice(word, hint) {
  const w = String(word ?? "").trim();
  const h = String(hint ?? "").trim();
  return h ? `${w} (${h})` : `${w} (뜻을 생각해요)`;
}

function formatHardChoice(word) {
  return String(word ?? "").trim();
}

function makeChoicesByDifficulty(row, difficulty) {
  const answer = String(row?.answer ?? "").trim();
  const answerHint = String(row?.answer_hint ?? "").trim();

  const wrongParsed = (row?.wrong_choices ?? []).map(parseChoiceWithHint).filter((x) => x.word);

  if (difficulty === "hard") {
    const correctLabel = formatHardChoice(answer);
    const wrongWordPool = wrongParsed.map((x) => x.word).filter((w) => w && w !== correctLabel);
    const wrongs = shuffle(wrongWordPool).slice(0, 3).map((w) => formatHardChoice(w));
    return { correctLabel, choices: shuffle([correctLabel, ...wrongs]) };
  }

  const correctLabel = formatEasyChoice(answer, answerHint);

  const wrongPool = wrongParsed
    .map((x) => formatEasyChoice(x.word, x.hint))
    .filter((label) => label && label !== correctLabel);

  const wrongs = shuffle(wrongPool).slice(0, 2);
  return { correctLabel, choices: shuffle([correctLabel, ...wrongs]) };
}

export default function BibleQuiz() {
  const navigate = useNavigate();

  const [book, setBook] = useState(DEFAULT_BOOK);
  const [difficulty, setDifficulty] = useState(DEFAULT_DIFFICULTY);

  const maxQuestions = QUESTION_COUNT_BY_DIFFICULTY[difficulty] ?? 15;
  const timeLimit = difficulty === "hard" ? TIME_LIMIT_HARD : TIME_LIMIT_EASY;
  const choiceCount = difficulty === "hard" ? 4 : 3;

  const [pool, setPool] = useState([]);
  const [loading, setLoading] = useState(true);

  const [score, setScore] = useState(0);
  const [questionNo, setQuestionNo] = useState(1);
  const [current, setCurrent] = useState(null);

  const [picked, setPicked] = useState(null);
  const [locked, setLocked] = useState(false);
  const [needNext, setNeedNext] = useState(false);
  const [resultMsg, setResultMsg] = useState("");

  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const [finished, setFinished] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const timerRef = useRef(null);
  const autoNextRef = useRef(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearAutoNext = useCallback(() => {
    if (autoNextRef.current) {
      clearTimeout(autoNextRef.current);
      autoNextRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    setTimeLeft(timeLimit);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }, [stopTimer, timeLimit]);

  const titleText = useMemo(() => {
    if (book === "proverbs") return "성경퀴즈 (잠언)";
    if (book === "genesis") return "성경퀴즈 (창세기)";
    if (book === "john") return "성경퀴즈 (요한복음)";
    if (book === "people") return "성경퀴즈 (성경인물)";
    return "성경퀴즈";
  }, [book]);

  const refText = useMemo(() => {
    if (!current) return "";
    if (book === "people") return "성경인물";
    const bookLabel =
      book === "proverbs" ? "잠언" : book === "genesis" ? "창세기" : book === "john" ? "요한복음" : String(book);
    return `${bookLabel} ${current.chapter}:${current.verse}`;
  }, [book, current]);

  const fetchQuestions = useCallback(
    async (nextBook, nextDifficulty) => {
      const b = nextBook ?? book;
      const d = nextDifficulty ?? difficulty;
      const mq = QUESTION_COUNT_BY_DIFFICULTY[d] ?? 15;

      setLoading(true);
      try {
        stopTimer();
        clearAutoNext();

        setScore(0);
        setQuestionNo(1);
        setFinished(false);

        setPicked(null);
        setLocked(false);
        setNeedNext(false);
        setResultMsg("");

        setSaving(false);
        setSaved(false);
        setSaveMsg("");

        if (b === "people") {
          const { data, error } = await supabase
            .from("bible_person_quiz_questions")
            .select("id, prompt, answer, answer_hint, wrong_choices")
            .eq("active", true);

          if (error) throw error;

          const sliced = shuffle(data ?? []).slice(0, mq);

          const normalized = sliced.map((r) => ({
            ...r,
            text_with_blank: String(r?.prompt ?? ""),
            chapter: null,
            verse: null,
          }));

          setPool(normalized);
          setCurrent(normalized?.[0] ?? null);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("bible_quiz_questions")
          .select("id, book, chapter, verse, text_with_blank, answer, answer_hint, wrong_choices")
          .eq("book", b)
          .eq("active", true);

        if (error) throw error;

        const sliced = shuffle(data ?? []).slice(0, mq);

        setPool(sliced);
        setCurrent(sliced?.[0] ?? null);
      } catch (e) {
        console.error("bible quiz fetch error:", e);
        setPool([]);
        setCurrent(null);
      } finally {
        setLoading(false);
      }
    },
    [stopTimer, clearAutoNext, book, difficulty]
  );

  useEffect(() => {
    fetchQuestions(book, difficulty);
    return () => {
      stopTimer();
      clearAutoNext();
    };
  }, []);

  useEffect(() => {
    setTimeLeft(timeLimit);
  }, [timeLimit]);

  useEffect(() => {
    if (finished) return;
    if (!current) return;

    setPicked(null);
    setLocked(false);
    setNeedNext(false);
    setResultMsg("");

    clearAutoNext();
    startTimer();
  }, [current, finished, clearAutoNext, startTimer]);

  useEffect(() => {
    if (finished) return;
    if (!current) return;
    if (locked) return;
    if (timeLeft !== 0) return;

    stopTimer();
    setLocked(true);
    setPicked("__TIMEOUT__");
    setNeedNext(true);

    setScore((s) => s - 5);

    const { correctLabel } = makeChoicesByDifficulty(current, difficulty);
    setResultMsg(`시간 초과예요. 정답은 "${correctLabel}" 이에요. -5점`);
  }, [timeLeft, finished, current, locked, stopTimer, difficulty]);

  const onReset = () => {
    fetchQuestions(book, difficulty);
  };

  const onPickBook = (nextBook) => {
    const info = BOOKS.find((x) => x.key === nextBook);
    if (!info?.enabled) {
      setResultMsg("아직 준비 중이에요.");
      return;
    }
    setResultMsg("");
    setBook(nextBook);
    fetchQuestions(nextBook, difficulty);
  };

  const onPickDifficulty = (nextDifficulty) => {
    setResultMsg("");
    setDifficulty(nextDifficulty);
    fetchQuestions(book, nextDifficulty);
  };

  const goNext = () => {
    if (finished) return;
    if (!current) return;

    if (questionNo >= maxQuestions) {
      stopTimer();
      clearAutoNext();
      setFinished(true);
      return;
    }

    const next = pool?.[questionNo] ?? null;
    if (!next) {
      stopTimer();
      clearAutoNext();
      setFinished(true);
      return;
    }

    setQuestionNo((n) => n + 1);
    setCurrent(next);
  };

  const onPickChoice = (choice) => {
    if (!current) return;
    if (finished) return;
    if (locked) return;

    stopTimer();
    setLocked(true);
    setPicked(choice);

    const { correctLabel } = makeChoicesByDifficulty(current, difficulty);
    const isCorrect = choice === correctLabel;

    if (isCorrect) {
      const base = difficulty === "hard" ? 12 : 10;
      const bonus = Math.max(0, timeLeft);

      setScore((s) => s + base + bonus);
      setResultMsg(`정답이에요. +${base}점 + 보너스 ${bonus}점`);

      clearAutoNext();
      autoNextRef.current = setTimeout(() => {
        goNext();
      }, AUTO_NEXT_DELAY_MS);
    } else {
      setScore((s) => s - 5);
      setNeedNext(true);
      setResultMsg(`틀렸어요. 정답은 "${correctLabel}" 이에요. -5점`);
    }
  };

  const saveScore = useCallback(async () => {
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
        game_key: GAME_KEY,
        level: `${book}_${difficulty}`,
        score: Number(score ?? 0),
      });

      if (!result?.ok) {
        throw result?.error ?? new Error(result?.reason ?? "save_failed");
      }

      setSaved(true);

      if (result.updated) {
        const prev = result.prevBest;
        if (prev !== null && prev !== undefined) {
          setSaveMsg(`최고 기록으로 저장했어요. (이전 ${prev}점 → 이번 ${score}점)`);
        } else {
          setSaveMsg(`최고 기록으로 저장했어요. (이번 ${score}점)`);
        }
        return;
      }

      const best = result.prevBest ?? 0;
      setSaveMsg(`저장했어요. (내 최고점 ${best}점)`);


      if (!result.saved) {
        setSaved(true);
        setSaveMsg(`저장했어요. (내 최고점 ${result.prevBest}점)`);
        return;
      }

      setSaved(true);
      setSaveMsg(`최고 기록으로 저장했어요. (이번 ${result.newBest}점)`);
    } catch (e) {
      console.error("save score error:", e);
      setSaveMsg("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }, [saving, saved, score, book, difficulty]);

  const ui = useMemo(() => {
    if (!current) return null;
    return makeChoicesByDifficulty(current, difficulty);
  }, [current, difficulty]);

  const mainText = useMemo(() => {
    if (!current) return "";
    if (book === "people") return String(current.text_with_blank ?? "");
    return renderTextWithBlank(current.text_with_blank);
  }, [book, current]);

  const bookButtons = useMemo(() => BOOKS, []);
  const diffButtons = useMemo(() => DIFFICULTIES, []);

  if (loading) {
    return (
      <div className="gugu-page notranslate bible-page">
        <div className="gugu-head">
          <button type="button" className="gugu-back" onClick={() => navigate("/bible-ranking")}>
            성경랭킹
          </button>

          <div className="gugu-title">{titleText}</div>

          <div className="gugu-head-right">
            <button type="button" className="gugu-restart" onClick={onReset}>
              다시하기
            </button>
            <div className="gugu-menu">
              <HamburgerMenu />
            </div>
          </div>
        </div>

        <div className="hanja-card">
          <div className="hanja-loading">문제를 불러오는 중이에요...</div>
        </div>
      </div>
    );
  }

  if (!current || !ui) {
    return (
      <div className="gugu-page notranslate bible-page">
        <div className="gugu-head">
          <button type="button" className="gugu-back" onClick={() => navigate("/bible-ranking")}>
            성경랭킹
          </button>

          <div className="gugu-title">{titleText}</div>

          <div className="gugu-head-right">
            <button type="button" className="gugu-restart" onClick={onReset}>
              다시하기
            </button>
            <div className="gugu-menu">
              <HamburgerMenu />
            </div>
          </div>
        </div>

        <div className="hanja-card">
          <div className="hanja-loading">문제가 없어요. 해당 카테고리에 문제를 먼저 등록해 주세요.</div>
        </div>

        <div className="bible-copyright">저작권 문제로 개역한글 성경을 사용하였습니다.</div>
      </div>
    );
  }

  return (
    <div className="gugu-page notranslate bible-page">
      <div className="gugu-head">
        <button type="button" className="gugu-back" onClick={() => navigate("/bible-ranking")}>
          성경랭킹
        </button>

        <div className="gugu-title">{titleText}</div>

        <div className="gugu-head-right">
          <button type="button" className="gugu-restart" onClick={onReset}>
            다시하기
          </button>

          <div className="gugu-menu">
            <HamburgerMenu />
          </div>
        </div>
      </div>

      <div className="hanja-card">
        <div className="hanja-row" style={{ alignItems: "flex-start" }}>
          <div className="hanja-label">종류</div>

          <div className="wc-level-buttons" style={{ marginTop: 2 }}>
            {bookButtons.map((b) => (
              <button
                key={b.key}
                type="button"
                className={`wc-pill ${book === b.key ? "on" : ""}`}
                onClick={() => onPickBook(b.key)}
                disabled={!b.enabled || finished}
                title={b.enabled ? b.label : "준비 중"}
                style={!b.enabled ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div className="hanja-row" style={{ alignItems: "flex-start", marginTop: 10 }}>
          <div className="hanja-label">난이도</div>

          <div className="wc-level-buttons" style={{ marginTop: 2 }}>
            {diffButtons.map((d) => (
              <button
                key={d.key}
                type="button"
                className={`wc-pill ${difficulty === d.key ? "on" : ""}`}
                onClick={() => onPickDifficulty(d.key)}
                disabled={finished}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="hanja-score">
          점수: <b>{score}</b>
          <span className="hanja-mini">
            (문제: {Math.min(questionNo, maxQuestions)}/{maxQuestions} · 남은시간: {timeLeft}초)
          </span>
        </div>

        {!finished ? (
          <>
            <div className="hanja-word-box" aria-label="퀴즈">
              <div className="hanja-word">{mainText}</div>
              <div className="hanja-hint">{refText}</div>
            </div>

            <div className="hanja-choices" aria-label={difficulty === "hard" ? "보기 4개" : "보기 3개"}>
              {ui.choices.map((c) => {
                const isPicked = picked === c;
                const isCorrect = c === ui.correctLabel;

                let cls = "hanja-choice";
                if (picked) {
                  if (isCorrect) cls += " correct";
                  if (isPicked && !isCorrect) cls += " wrong";
                } else if (isPicked) {
                  cls += " picked";
                }

                return (
                  <button
                    key={`${c}-${choiceCount}`}
                    type="button"
                    className={cls}
                    onClick={() => onPickChoice(c)}
                  >
                    {book === "people" ? (
                      (() => {
                        const s = String(c ?? "");
                        const open = s.indexOf("(");
                        const close = s.lastIndexOf(")");

                        if (open === -1 || close === -1 || close < open) return s;

                        const name = s.slice(0, open).trim();
                        const hint = s.slice(open, close + 1);

                        return (
                          <>
                            {name}
                            <span className="choice-hint">{hint}</span>
                          </>
                        );
                      })()
                    ) : (
                      c
                    )}
                  </button>
                );
              })}
            </div>

            {resultMsg && <div className="hanja-result">{resultMsg}</div>}

            <div className="hanja-actions">
              <button type="button" className="hanja-btn" onClick={goNext} disabled={!needNext || finished}>
                {questionNo >= maxQuestions ? "끝내기" : "다음 문제"}
              </button>

              <button type="button" className="hanja-btn ghost" onClick={onReset}>
                처음부터
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="hanja-word-box" aria-label="게임 종료">
              <div className="hanja-word">끝!</div>
              <div className="hanja-hint">최종 점수: {score}점</div>
            </div>

            {saveMsg && <div className="hanja-result">{saveMsg}</div>}

            <div className="hanja-actions">
              <button type="button" className="hanja-btn" onClick={saveScore} disabled={saving || saved}>
                {saved ? "저장 완료" : saving ? "저장 중..." : "랭킹에 저장"}
              </button>

              <button type="button" className="hanja-btn ghost" onClick={() => navigate("/bible-ranking")}>
                랭킹 보기
              </button>

              <button type="button" className="hanja-btn ghost" onClick={onReset}>
                다시하기
              </button>
            </div>
          </>
        )}
      </div>

      <div className="bible-copyright">저작권 문제로 개역한글 성경을 사용하였습니다.</div>
    </div>
  );
}
