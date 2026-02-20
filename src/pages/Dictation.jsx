// src/pages/Dictation.jsx (모바일 발음 보정 + 모바일/PC 속도 5단계 적용)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import supabase from "../supabaseClient";
import HamburgerMenu from "../components/common/HamburgerMenu";
import "./Dictation.css";

function ymd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const TTS_SPEED_STORAGE_KEY = "dictation_tts_speed_v1";
const TTS_PUNCT_STORAGE_KEY = "dictation_tts_punct_v1";

const TTS_SPEED_PRESETS_MOBILE = [
  { key: "m2", label: "-2", rate: 0.45 },
  { key: "m1", label: "-1 (느리게)", rate: 0.6 },
  { key: "m0", label: "보통", rate: 0.78 },
  { key: "p1", label: "+1", rate: 0.95 },
  { key: "p2", label: "+2 (빠르게)", rate: 1.12 },
];

const TTS_SPEED_PRESETS_DESKTOP = [
  { key: "m2", label: "-2", rate: 0.6 },
  { key: "m1", label: "-1 (느리게)", rate: 0.8 },
  { key: "m0", label: "보통", rate: 1.0 },
  { key: "p1", label: "+1", rate: 1.3 },
  { key: "p2", label: "+2 (빠르게)", rate: 1.6 },
];

const DEFAULT_TTS_SPEED_KEY = "m0";

function isMobileLike() {
  try {
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
    const small = window.matchMedia?.("(max-width: 820px)")?.matches;
    return Boolean(coarse && small);
  } catch {
    return false;
  }
}

const TTS_PUNCT_PRESETS = [
  { key: "off", label: "X", value: false },
  { key: "on", label: "O", value: true },
];

const PUNCT_REGEX = /[,.!?，。！？…]/;

const PER_ITEM_SECONDS = 120;

const ANSWER_PIN = "486";

function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel?.();
  } catch {
    // ignore
  }
}

function normalizePunctToWords(text) {
  let out = String(text ?? "");
  out = out
    .replace(/，/g, ",")
    .replace(/。/g, ".")
    .replace(/？/g, "?")
    .replace(/！/g, "!")
    .replace(/…/g, "…")
    .replace(/,/g, " 쉼표 ")
    .replace(/\./g, " 마침표 ")
    .replace(/\?/g, " 물음표 ")
    .replace(/!/g, " 느낌표 ")
    .replace(/…/g, " 줄임표 ");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

function normalizeForTts(text) {
  let out = String(text ?? "");
  out = out.replace(/맨발로/g, "맨 발로");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

function pickKoreanVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return voices.find((v) => (v.lang || "").toLowerCase().startsWith("ko")) || null;
}

function speakKoreanWithQuestionLift(
  originalText,
  { rate = 0.95, volume = 1.0, punctReadOn = false } = {}
) {
  if (!originalText) return;

  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    alert("이 기기/브라우저는 음성 읽기를 지원하지 않아요.");
    return;
  }

  stopSpeaking();

  const voice = pickKoreanVoice();
  const raw = String(originalText);

  const parts = [];
  const re = /([^.!?…]+)([.!?…]?)/g;
  let m;

  while ((m = re.exec(raw))) {
    const chunk = String(m[1] ?? "").trim();
    const endP = String(m[2] ?? "");
    if (!chunk && !endP) continue;
    parts.push({ chunk, endP });
  }

  const toUtter = parts.length ? parts : [{ chunk: raw, endP: "" }];

  toUtter.forEach(({ chunk, endP }) => {
    let out = chunk;

    if (punctReadOn) {
      out = normalizePunctToWords(out + (endP || ""));
    } else {
      out = (out + (endP || "")).replace(/\s+/g, " ").trim();
    }

    out = normalizeForTts(out);

    if (!out) return;

    const u = new SpeechSynthesisUtterance(out);
    u.lang = "ko-KR";
    u.rate = rate;
    u.volume = volume;

    if (endP === "?") {
      u.pitch = 1.45;
      u.rate = rate * 0.98;
    } else {
      u.pitch = 1.0;
    }

    if (voice) u.voice = voice;

    window.speechSynthesis.speak(u);
  });
}

function fmtMMSS(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function Dictation() {
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [gradeCode, setGradeCode] = useState(null);
  const [nickname, setNickname] = useState("");
  const [list, setList] = useState([]);

  const speedPresets = useMemo(() => {
    return isMobileLike() ? TTS_SPEED_PRESETS_MOBILE : TTS_SPEED_PRESETS_DESKTOP;
  }, []);

  const [ttsSpeedKey, setTtsSpeedKey] = useState(() => {
    try {
      const saved = localStorage.getItem(TTS_SPEED_STORAGE_KEY);
      if (!saved) return DEFAULT_TTS_SPEED_KEY;
      const ok = speedPresets.some((x) => x.key === saved);
      return ok ? saved : DEFAULT_TTS_SPEED_KEY;
    } catch {
      return DEFAULT_TTS_SPEED_KEY;
    }
  });

  const [punctReadOn, setPunctReadOn] = useState(() => {
    try {
      return (localStorage.getItem(TTS_PUNCT_STORAGE_KEY) || "0") === "1";
    } catch {
      return false;
    }
  });

  const ttsSpeed = useMemo(() => {
    return speedPresets.find((x) => x.key === ttsSpeedKey) || speedPresets[2];
  }, [ttsSpeedKey, speedPresets]);

  useEffect(() => {
    try {
      localStorage.setItem(TTS_SPEED_STORAGE_KEY, ttsSpeedKey);
    } catch {
      // ignore
    }
  }, [ttsSpeedKey]);

  useEffect(() => {
    try {
      localStorage.setItem(TTS_PUNCT_STORAGE_KEY, punctReadOn ? "1" : "0");
    } catch {
      // ignore
    }
  }, [punctReadOn]);

  const viewYmd = useMemo(() => {
    const qs = new URLSearchParams(location.search);
    const q = String(qs.get("ymd") ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    return ymd(new Date());
  }, [location.search]);

  const [remainById, setRemainById] = useState({});
  const [startedById, setStartedById] = useState({});
  const timersRef = useRef({});

  const [unlocked, setUnlocked] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);

  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");

  const pauseAllTimersExcept = useCallback((keepId) => {
    const all = timersRef.current || {};
    Object.keys(all).forEach((k) => {
      if (k !== String(keepId)) {
        clearInterval(all[k]);
        delete all[k];
      }
    });
  }, []);

  const clearAllTimers = useCallback(() => {
    const all = timersRef.current || {};
    Object.keys(all).forEach((k) => clearInterval(all[k]));
    timersRef.current = {};
  }, []);

  const startTimerFor = useCallback(
    (id) => {
      if (!id) return;

      pauseAllTimersExcept(id);

      const old = timersRef.current[id];
      if (old) {
        clearInterval(old);
        delete timersRef.current[id];
      }

      setStartedById((prev) => ({ ...prev, [id]: true }));
      setRemainById((prev) => ({ ...prev, [id]: PER_ITEM_SECONDS }));

      const intervalId = setInterval(() => {
        setRemainById((prev) => {
          const cur = Number(prev?.[id] ?? 0);

          if (cur <= 1) {
            clearInterval(intervalId);
            delete timersRef.current[id];
            return { ...prev, [id]: 0 };
          }

          return { ...prev, [id]: cur - 1 };
        });
      }, 1000);

      timersRef.current[id] = intervalId;
    },
    [pauseAllTimersExcept]
  );

  const resetPerItemStates = useCallback(() => {
    clearAllTimers();
    setRemainById({});
    setStartedById({});
  }, [clearAllTimers]);

  const onPressSpeaker = useCallback(
    (id, text) => {
      startTimerFor(id);
      speakKoreanWithQuestionLift(text, { rate: ttsSpeed.rate, punctReadOn });
    },
    [startTimerFor, ttsSpeed.rate, punctReadOn]
  );

  const pressDigit = useCallback((d) => {
    setPin((prev) => {
      const next = String(prev ?? "");
      if (next.length >= 6) return next;
      return next + String(d);
    });
  }, []);

  const backspacePin = useCallback(() => {
    setPin((prev) => String(prev ?? "").slice(0, -1));
  }, []);

  const clearPin = useCallback(() => {
    setPin("");
  }, []);

  const confirmPin = useCallback(() => {
    if (String(pin) === ANSWER_PIN) {
      setUnlocked(true);
      setShowAnswers(true);
      setPinOpen(false);
      setPin("");
      clearAllTimers();
      return;
    }
    alert("비밀번호가 달라요.");
  }, [pin, clearAllTimers]);

  const openAnswerUI = useCallback(() => {
    if (!unlocked) {
      setPinOpen(true);
      setPin("");
      return;
    }
    setShowAnswers((v) => !v);
  }, [unlocked]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;

      if (!user) {
        alert("로그인이 필요해요.");
        navigate("/login");
        return;
      }

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("grade_code, nickname")
        .eq("id", user.id)
        .maybeSingle();

      if (pErr) {
        console.error(pErr);
        alert("내 정보(학년)를 불러오지 못했어요.");
        setLoading(false);
        return;
      }

      const g = profile?.grade_code ?? null;
      setGradeCode(g);
      setNickname(profile?.nickname ?? "");

      const { data: rows, error: dErr } = await supabase
        .from("dictation_items")
        .select("id, item_no, text")
        .eq("grade_code", g)
        .eq("ymd", viewYmd)
        .order("item_no", { ascending: true });

      if (dErr) {
        console.error(dErr);
        alert("받아쓰기 데이터를 불러오지 못했어요.");
        setList([]);
        resetPerItemStates();
        setUnlocked(false);
        setShowAnswers(false);
        setPinOpen(false);
        setPin("");
        setLoading(false);
        return;
      }

      resetPerItemStates();
      setUnlocked(false);
      setShowAnswers(false);
      setPinOpen(false);
      setPin("");
      setList(rows ?? []);
      setLoading(false);
    };

    run();

    try {
      window.speechSynthesis?.getVoices?.();
    } catch {
      // ignore
    }

    return () => {
      stopSpeaking();
      clearAllTimers();
    };
  }, [navigate, viewYmd, resetPerItemStates, clearAllTimers]);

  const canUseTTS = useMemo(() => {
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }, []);

  const hasAnyPunct = useMemo(() => {
    return (list || []).some((r) => PUNCT_REGEX.test(String(r?.text ?? "")));
  }, [list]);

  const answerBtnText = useMemo(() => {
    if (!unlocked) return "정답보기";
    return showAnswers ? "정답 숨기기" : "정답 보기";
  }, [unlocked, showAnswers]);

  return (
    <div className="dictationPage">
      <div className="dictationHeader">
        <div className="dictationHeaderLeft">
          <button className="dictationBack" onClick={() => navigate(-1)}>
            뒤로
          </button>
        </div>

        <div className="dictationHeaderCenter">
          <div className="dictationTitle">오늘의 받아쓰기</div>
          <div className="dictationMeta">
            {viewYmd}
            {nickname ? ` · ${nickname}` : ""}
          </div>
        </div>

        <div className="dictationHeaderRight">
          <HamburgerMenu />
        </div>
      </div>

      <div className="dictationGuideBox">
        <p className="keypoint">
          소리 버튼을 누르면 받아쓰기 문장을 읽어줍니다.
          <br />
          다 받아 적었으면, 타이머와 상관 없이 다음 소리 버튼을 눌러 주세요.
          <br />
          정답은 아래의 ‘정답보기’ 버튼을 눌러 비밀번호로 확인할 수 있고, 확인 후에는 다시 숨길 수
          있습니다.
        </p>
      </div>

      <div className="dictationSpeedBar">
        <span className="dictationSpeedLabel">속도 :</span>

        {speedPresets.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`dictationSpeedBtn ${ttsSpeedKey === p.key ? "is-active" : ""}`}
            onClick={() => {
              stopSpeaking();
              setTtsSpeedKey(p.key);
            }}
            disabled={!canUseTTS}
            title={`읽기 속도: ${p.label}`}
          >
            {p.label}
          </button>
        ))}

        {hasAnyPunct && (
          <>
            <span className="dictationSpeedLabel">문장부호 말해주기 :</span>

            {TTS_PUNCT_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`dictationSpeedBtn ${punctReadOn === p.value ? "is-active" : ""}`}
                onClick={() => {
                  stopSpeaking();
                  setPunctReadOn(p.value);
                }}
                disabled={!canUseTTS}
                title="쉼표/마침표/물음표 등을 말로 읽어줍니다"
              >
                {p.label}
              </button>
            ))}
          </>
        )}
      </div>

      {loading ? (
        <div className="dictationLoading">불러오는 중...</div>
      ) : list.length === 0 ? (
        <div className="dictationEmpty">
          선택한 날({viewYmd}) {gradeCode ?? ""}학년 받아쓰기 문장이 아직 없어요.
        </div>
      ) : (
        <div className="dictationList">
          {list.map((r) => {
            const started = !!startedById?.[r.id];
            const remain = remainById?.[r.id];
            const expired = started && typeof remain === "number" && remain <= 0;

            return (
              <div key={r.id} className="dictationRow">
                <div className="dictationRowLeft">
                  <div className="dictationNo">{r.item_no}번</div>

                  <button
                    className="dictationSpeakBtn"
                    onClick={() => onPressSpeaker(r.id, r.text)}
                    disabled={!canUseTTS}
                    type="button"
                    aria-label={`${r.item_no}번 읽기`}
                    title={`읽어주기 (${ttsSpeed.label}${punctReadOn ? " + 문장부호" : ""})`}
                  >
                    🔊
                  </button>
                </div>

                <div className="dictationRowRight">
                  {unlocked && showAnswers && (
                    <span className="dictationInlineAnswer">{String(r.text ?? "")}</span>
                  )}

                  {(!unlocked || !showAnswers) && started && (
                    <div className={`dictationTimer ${expired ? "is-expired" : ""}`}>
                      {expired ? "시간 종료" : fmtMMSS(remain)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="dictationAnswerGateBar">
        <button type="button" className="dictationAnswerGateBtn" onClick={openAnswerUI}>
          {answerBtnText}
        </button>
      </div>

      {pinOpen && !unlocked && (
        <div className="dictationPinOverlay" role="dialog" aria-modal="true">
          <div className="dictationPinModal">
            <div className="dictationPinTitle">비밀번호를 입력해요</div>
            <div className="dictationPinHint">힌트: 사랑해를 숫자로?</div>

            <div className="dictationPinDisplay">{pin ? pin : " "}</div>

            <div className="dictationPinPad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="dictationPinKey"
                  onClick={() => pressDigit(n)}
                >
                  {n}
                </button>
              ))}
              <button type="button" className="dictationPinKey" onClick={backspacePin}>
                ⌫
              </button>
              <button type="button" className="dictationPinKey" onClick={() => pressDigit(0)}>
                0
              </button>
              <button type="button" className="dictationPinKey" onClick={clearPin}>
                C
              </button>
            </div>

            <div className="dictationPinActions">
              <button type="button" className="dictationPinCancel" onClick={() => setPinOpen(false)}>
                닫기
              </button>
              <button type="button" className="dictationPinOk" onClick={confirmPin}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}