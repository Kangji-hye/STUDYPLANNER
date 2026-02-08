// src/pages/BibleQuiz.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import supabase from "../supabaseClient";
import "./BibleQuiz.css";

/*
  이 파일은 "한자게임 상단 구조" 그대로 사용합니다.
  - 좌측: 랭킹 버튼
  - 가운데: 타이틀
  - 우측: 다시하기 + 햄버거

  변경 요청 반영:
  - 쉬움(easy)  : 10문제
  - 어려움(hard): 15문제

  구성:
  - 책(잠언/창세기/요한복음) => public.bible_quiz_questions 테이블 사용
  - 성경인물                 => public.bible_person_quiz_questions 테이블 사용
*/

const QUESTION_COUNT_BY_DIFFICULTY = {
  easy: 10,
  hard: 15,
};

const TIME_LIMIT_EASY = 15;
const TIME_LIMIT_HARD = 12; // 어려움은 살짝 압박 주기
const AUTO_NEXT_DELAY_MS = 450;

const GAME_KEY = "bible_quiz";
const DEFAULT_BOOK = "proverbs";
const DEFAULT_DIFFICULTY = "easy"; // 처음 화면은 쉬움

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// "__BLANK__"를 화면에 보이는 빈칸으로 바꾸기
function renderTextWithBlank(text) {
  return String(text ?? "").split("__BLANK__").join("_______");
}

// DB에 저장된 "단어|뜻" 형태를 파싱
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

// 어려움 보기: 괄호 뜻을 숨겨서 문맥으로 맞히게 만들기
function formatHardChoice(word) {
  return String(word ?? "").trim();
}

/*
  난이도에 따라 보기 만들기
  - 말씀 퀴즈(row: bible_quiz_questions):
      answer, answer_hint, wrong_choices(text[])
  - 인물 퀴즈(row: bible_person_quiz_questions):
      answer, answer_hint, wrong_choices(text[])
*/
function makeChoicesByDifficulty(row, difficulty) {
  const answer = String(row?.answer ?? "").trim();
  const answerHint = String(row?.answer_hint ?? "").trim();

  const wrongParsed = (row?.wrong_choices ?? []).map(parseChoiceWithHint).filter((x) => x.word);

  if (difficulty === "hard") {
    // 어려움: 보기 4개, 뜻 숨김(단어만)
    const correctLabel = formatHardChoice(answer);
    const wrongWordPool = wrongParsed.map((x) => x.word).filter((w) => w && w !== correctLabel);
    const wrongs = shuffle(wrongWordPool).slice(0, 3).map((w) => formatHardChoice(w));
    return { correctLabel, choices: shuffle([correctLabel, ...wrongs]) };
  }

  // 쉬움: 보기 3개, 정답/오답 모두 괄호 뜻 보이게
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

  // 쉬움 10문제 / 어려움 15문제
  const maxQuestions = QUESTION_COUNT_BY_DIFFICULTY[difficulty] ?? 15;

  // 타이머도 난이도별로
  const timeLimit = difficulty === "hard" ? TIME_LIMIT_HARD : TIME_LIMIT_EASY;

  // 보기 개수도 난이도별로 (쉬움 3개 / 어려움 4개)
  const choiceCount = difficulty === "hard" ? 4 : 3;

  // 문제 풀(랜덤으로 뽑아 둔 maxQuestions개)
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

  // 책(잠언/창세기/요한복음) or 인물에 따라 다른 테이블에서 가져오기
  const fetchQuestions = useCallback(
    async (nextBook, nextDifficulty) => {
      const d = nextDifficulty ?? difficulty;
      const mq = QUESTION_COUNT_BY_DIFFICULTY[d] ?? 15;

      setLoading(true);
      try {
        stopTimer();
        clearAutoNext();

        // 공통 초기화
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

        // 1) 성경인물 퀴즈
        if (nextBook === "people") {
          const { data, error } = await supabase
            .from("bible_person_quiz_questions")
            .select("id, prompt, answer, answer_hint, wrong_choices")
            .eq("active", true);

          if (error) throw error;

          // 인물도 maxQuestions만큼 랜덤
          const sliced = shuffle(data ?? []).slice(0, mq);

          // current 형태를 말씀 퀴즈와 비슷하게 맞춰두면 UI가 편함
          // 인물은 text_with_blank 대신 prompt를 보여주면 됩니다.
          const normalized = sliced.map((r) => ({
            ...r,
            // UI에서 헷갈리지 않게 필드 하나 맞춰두기
            text_with_blank: String(r?.prompt ?? ""),
            chapter: null,
            verse: null,
          }));

          setPool(normalized);
          setCurrent(normalized?.[0] ?? null);
          setLoading(false);
          return;
        }

        // 2) 잠언/창세기/요한복음 퀴즈
        const { data, error } = await supabase
          .from("bible_quiz_questions")
          .select("id, book, chapter, verse, text_with_blank, answer, answer_hint, wrong_choices")
          .eq("book", nextBook)
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
    [stopTimer, clearAutoNext, difficulty]
  );

  // 첫 진입: 기본(book/difficulty)로 한 판 세팅
  useEffect(() => {
    fetchQuestions(book, difficulty);
    return () => {
      stopTimer();
      clearAutoNext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 난이도 바뀌면 timeLimit도 바뀌니까, timeLeft 초기값도 맞춰주기
  useEffect(() => {
    setTimeLeft(timeLimit);
  }, [timeLimit]);

  // current 바뀌면 타이머/상태 리셋
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

  // 시간 초과 처리
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

  const onChangeBook = (nextBook) => {
    setBook(nextBook);
    fetchQuestions(nextBook, difficulty);
  };

  const onChangeDifficulty = (nextDifficulty) => {
    setDifficulty(nextDifficulty);
    fetchQuestions(book, nextDifficulty);
  };

  const goNext = () => {
    if (finished) return;
    if (!current) return;

    // 쉬움이면 10에서 끝, 어려움이면 15에서 끝
    if (questionNo >= maxQuestions) {
      stopTimer();
      clearAutoNext();
      setFinished(true);
      return;
    }

    // 다음 문제는 pool에서 순서대로 꺼내기
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

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("id", me.id)
        .maybeSingle();

      if (profErr) throw profErr;

      const nickname = String(prof?.nickname ?? "").trim() || "익명";

      // 누적 점수: 책+난이도 별로 따로 쌓기
      // 예: proverbs_easy / genesis_hard / people_easy ...
      const levelKey = `${book}_${difficulty}`;

      const { data: existing, error: exErr } = await supabase
        .from("game_scores")
        .select("id, score")
        .eq("user_id", me.id)
        .eq("game_key", GAME_KEY)
        .eq("level", levelKey)
        .limit(1);

      if (exErr) throw exErr;

      const row = existing?.[0] ?? null;
      const prev = Number(row?.score ?? 0);
      const nextTotal = prev + Number(score ?? 0);

      if (row?.id) {
        const { error: upErr } = await supabase
          .from("game_scores")
          .update({
            score: nextTotal,
            nickname,
            level: levelKey,
          })
          .eq("id", row.id);

        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await supabase.from("game_scores").insert([
          {
            user_id: me.id,
            nickname,
            game_key: GAME_KEY,
            level: levelKey,
            score: nextTotal,
          },
        ]);

        if (insErr) throw insErr;
      }

      setSaved(true);
      setSaveMsg(`누적 점수로 저장했어요. (이번 판 ${score}점, 총 ${nextTotal}점)`);
    } catch (e) {
      console.error("bible score save error:", e);
      const msg =
        String(e?.message ?? "").trim() ||
        String(e?.error_description ?? "").trim() ||
        "저장에 실패했어요. 잠시 후 다시 시도해 주세요.";
      setSaveMsg(msg);
    } finally {
      setSaving(false);
    }
  }, [saving, saved, score, book, difficulty]);

  // 현재 문제의 보기/정답 만들기
  const ui = useMemo(() => {
    if (!current) return null;
    return makeChoicesByDifficulty(current, difficulty);
  }, [current, difficulty]);

  // 상단에 표시할 제목(선택한 책에 맞춰서)
  const titleText = useMemo(() => {
    if (book === "proverbs") return "성경퀴즈 (잠언)";
    if (book === "genesis") return "성경퀴즈 (창세기)";
    if (book === "john") return "성경퀴즈 (요한복음)";
    if (book === "people") return "성경퀴즈 (성경인물)";
    return "성경퀴즈";
  }, [book]);

  // 레퍼런스(몇 장 몇 절) 또는 "성경인물"
  const refText = useMemo(() => {
    if (!current) return "";
    if (book === "people") return "성경인물";
    const bookLabel =
      book === "proverbs" ? "잠언" : book === "genesis" ? "창세기" : book === "john" ? "요한복음" : String(book);
    return `${bookLabel} ${current.chapter}:${current.verse}`;
  }, [book, current]);

  if (loading) {
    return (
      <div className={`gugu-page notranslate bible-page ${book === "people" ? "people-mode" : ""}`}>

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
          <div className="hanja-loading">
            문제가 없어요. 해당 카테고리에 문제를 먼저 등록해 주세요.
          </div>
        </div>

        <div className="bible-copyright">
          저작권 문제로 개역한글 성경을 사용하였습니다.
        </div>
      </div>
    );
  }

  // 화면에서 보기 텍스트는 난이도에 따라 다르게 보여줘야 함
  // 쉬움: "단어 (뜻)" / 어려움: "단어"
  const renderChoiceText = (choiceLabel) => {
    if (difficulty === "hard") return choiceLabel;

    // 쉬움은 "단어 (뜻)" 라벨 그대로 보여주면 됨
    // (이미 makeChoicesByDifficulty에서 괄호 붙여서 만든 값이 들어옴)
    return choiceLabel;
  };

  // 사람(인물) 퀴즈는 구절을 renderTextWithBlank로 처리할 필요는 없지만,
  // 같은 박스 UI를 쓰기 위해 current.text_with_blank로 통일해 둠.
  const mainText = book === "people"
    ? String(current.text_with_blank ?? "")
    : renderTextWithBlank(current.text_with_blank);

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
        <div className="hanja-row">
          <div className="hanja-label">종류</div>
          <select
            className="hanja-select"
            value={book}
            onChange={(e) => onChangeBook(e.target.value)}
            disabled={finished}
          >
            <option value="proverbs">잠언</option>
            {/* <option value="genesis">창세기</option> */}
            {/* <option value="john">요한복음</option> */}
            <option value="people">성경인물</option>
          </select>
        </div>

        <div className="hanja-row">
          <div className="hanja-label">난이도</div>
          <select
            className="hanja-select"
            value={difficulty}
            onChange={(e) => onChangeDifficulty(e.target.value)}
            disabled={finished}
          >
            <option value="easy">쉬움</option>
            <option value="hard">어려움</option>
          </select>
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
                    key={`${c}-${choiceCount}`} // 보기 수 바뀌면 키 충돌 방지
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

                            const name = s.slice(0, open).trim();       // 이름
                            const hint = s.slice(open, close + 1);      // (설명)

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
              <button
                type="button"
                className="hanja-btn"
                onClick={goNext}
                disabled={!needNext || finished}
              >
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
                {saved ? "저장 완료" : saving ? "저장 중..." : "랭킹에 저장(누적)"}
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

      <div className="bible-copyright">
        저작권 문제로 개역한글 성경을 사용하였습니다.
      </div>
    </div>
  );
}
