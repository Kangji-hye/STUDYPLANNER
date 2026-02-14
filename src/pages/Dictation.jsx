// src/pages/Dictation.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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

const TTS_SPEED_PRESETS = [
  { key: "slow", label: "느리게", rate: 0.6 },
  { key: "normal", label: "보통", rate: 0.95 },
  { key: "fast", label: "빠르게", rate: 1.8 },
];
const DEFAULT_TTS_SPEED_KEY = "normal";

const TTS_PUNCT_PRESETS = [
  { key: "off", label: "X", value: false },
  { key: "on", label: "O", value: true },
];

const PUNCT_REGEX = /[,.!?，。！？…]/;

const PER_ITEM_SECONDS = 120;

const ANSWER_PIN = "486";
const ANSWER_BTN_DELAY_MS = 60_000;

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

    if (!out) return;

    const u = new SpeechSynthesisUtterance(out);
    u.lang = "ko-KR";
    u.rate = rate;
    u.volume = volume;
    u.pitch = endP === "?" ? 1.25 : 1.0;

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

  const [loading, setLoading] = useState(true);
  const [gradeCode, setGradeCode] = useState(null);
  const [nickname, setNickname] = useState("");
  const [list, setList] = useState([]);

  const [ttsSpeedKey, setTtsSpeedKey] = useState(() => {
    try {
      const saved = localStorage.getItem(TTS_SPEED_STORAGE_KEY);
      return saved || DEFAULT_TTS_SPEED_KEY;
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
    return TTS_SPEED_PRESETS.find((x) => x.key === ttsSpeedKey) || TTS_SPEED_PRESETS[1];
  }, [ttsSpeedKey]);

  useEffect(() => {
    try {
      localStorage.setItem(TTS_SPEED_STORAGE_KEY, ttsSpeedKey);
    } catch {}
  }, [ttsSpeedKey]);

  useEffect(() => {
    try {
      localStorage.setItem(TTS_PUNCT_STORAGE_KEY, punctReadOn ? "1" : "0");
    } catch {}
  }, [punctReadOn]);

  const today = useMemo(() => ymd(new Date()), []);

  // 문항별 타이머
  const [remainById, setRemainById] = useState({});
  const [startedById, setStartedById] = useState({});
  const timersRef = useRef({});

  const pauseAllTimersExcept = (keepId) => {
    const all = timersRef.current || {};
    Object.keys(all).forEach((k) => {
      if (k !== String(keepId)) {
        clearInterval(all[k]);
        delete all[k];
      }
    });
  };

  const clearAllTimers = () => {
    const all = timersRef.current || {};
    Object.keys(all).forEach((k) => clearInterval(all[k]));
    timersRef.current = {};
  };

  const startTimerFor = (id) => {
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
  };

  const resetPerItemStates = () => {
    clearAllTimers();
    setRemainById({});
    setStartedById({});
  };

  // 정답 게이트
  const [pressedById, setPressedById] = useState({});
  const [showAnswerGateBtn, setShowAnswerGateBtn] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");

  const gateTimerRef = useRef(null);

  const clearGateTimer = () => {
    if (gateTimerRef.current) {
      clearTimeout(gateTimerRef.current);
      gateTimerRef.current = null;
    }
  };

  const resetAnswerGate = () => {
    clearGateTimer();
    setPressedById({});
    setShowAnswerGateBtn(false);
    setUnlocked(false);
    setPinOpen(false);
    setPin("");
  };

  const allSpeakersPressedAtLeastOnce = useMemo(() => {
    if (!list || list.length === 0) return false;
    for (const r of list) {
      if (!pressedById?.[r.id]) return false;
    }
    return true;
  }, [list, pressedById]);

  // 핵심: 마지막 스피커를 누를 때마다 “1분 뒤 버튼”을 다시 예약
  const scheduleAnswerGateFromNow = () => {
    clearGateTimer();
    setShowAnswerGateBtn(false);

    if (unlocked) return;
    if (!allSpeakersPressedAtLeastOnce) return;

    gateTimerRef.current = setTimeout(() => {
      setShowAnswerGateBtn(true);
    }, ANSWER_BTN_DELAY_MS);
  };

  const onPressSpeaker = (id, text) => {
    setPressedById((prev) => ({ ...prev, [id]: true }));

    // pressedById가 바로 반영되지 않을 수 있으니 다음 틱에서 “모두 눌렀는지” 기준으로 예약
    setTimeout(() => {
      scheduleAnswerGateFromNow();
    }, 0);

    startTimerFor(id);
    speakKoreanWithQuestionLift(text, { rate: ttsSpeed.rate, punctReadOn });
  };

  const pressDigit = (d) => {
    setPin((prev) => {
      const next = String(prev ?? "");
      if (next.length >= 6) return next;
      return next + String(d);
    });
  };
  const backspacePin = () => setPin((prev) => String(prev ?? "").slice(0, -1));
  const clearPin = () => setPin("");

  const confirmPin = () => {
    if (String(pin) === ANSWER_PIN) {
      setUnlocked(true);
      setPinOpen(false);
      setShowAnswerGateBtn(false);
      setPin("");
      clearGateTimer();
      return;
    }
    alert("비밀번호가 달라요.");
  };

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
        .eq("ymd", today)
        .order("item_no", { ascending: true });

      if (dErr) {
        console.error(dErr);
        alert("받아쓰기 데이터를 불러오지 못했어요.");
        setList([]);
        resetPerItemStates();
        resetAnswerGate();
        setLoading(false);
        return;
      }

      resetPerItemStates();
      resetAnswerGate();
      setList(rows ?? []);
      setLoading(false);
    };

    run();

    try {
      window.speechSynthesis?.getVoices?.();
    } catch {}

    return () => {
      stopSpeaking();
      clearAllTimers();
      clearGateTimer();
    };
  }, [navigate, today]);

  // allSpeakersPressedAtLeastOnce가 true가 되는 순간에도 예약이 필요함(마지막 문항을 막 눌렀을 때)
  useEffect(() => {
    if (!unlocked && allSpeakersPressedAtLeastOnce) {
      scheduleAnswerGateFromNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSpeakersPressedAtLeastOnce]);

  const canUseTTS = useMemo(() => {
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }, []);

  const hasAnyPunct = useMemo(() => {
    return (list || []).some((r) => PUNCT_REGEX.test(String(r?.text ?? "")));
  }, [list]);

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
            {today}
            {nickname ? ` · ${nickname}` : ""}
          </div>
        </div>

        <div className="dictationHeaderRight">
          <HamburgerMenu />
        </div>
      </div>

      <div className="dictationSpeedBar">
        <span className="dictationSpeedLabel">속도 :</span>

        {TTS_SPEED_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`dictationSpeedBtn ${ttsSpeedKey === p.key ? "is-active" : ""}`}
            onClick={() => setTtsSpeedKey(p.key)}
            disabled={!canUseTTS}
            title={`읽기 속도: ${p.label}`}
          >
            {p.label}
          </button>
        ))}

        {hasAnyPunct && (
          <>
            <span className="dictationSpeedLabel">문장부호 말해주기 : </span>
            {TTS_PUNCT_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`dictationSpeedBtn ${punctReadOn === p.value ? "is-active" : ""}`}
                onClick={() => setPunctReadOn(p.value)}
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
        <div className="dictationEmpty">오늘({today}) {gradeCode ?? ""}학년 받아쓰기 문장이 아직 없어요.</div>
      ) : (
        <div className="dictationList">
          {list.map((r) => {
            const started = !!startedById?.[r.id];
            const remain = remainById?.[r.id];
            const hasRemain = typeof remain === "number";
            const expired = started && hasRemain && remain <= 0;

            return (
                <div key={r.id} className="dictationRow">
                <div className="dictationNo">{r.item_no}번</div>

                <button
                    className="dictationSpeakBtn"
                    onClick={() => onPressSpeaker(r.id, r.text)}
                    disabled={!canUseTTS}
                    type="button"
                >
                    🔊
                </button>

                {/* 정답은 시스템 폰트로 표시 (CSS에서 처리) */}
                {unlocked && <span className="dictationInlineAnswer">{String(r.text ?? "")}</span>}

                {/* 정답이 풀린(unlocked) 순간에는 초(타이머)를 아예 안 보여줌 */}
                {!unlocked && started && (
                    <div className={`dictationTimer ${expired ? "is-expired" : ""}`}>
                    {expired ? "시간 종료" : fmtMMSS(remain)}
                    </div>
                )}
                </div>
            );
            })}

        </div>
      )}

      {showAnswerGateBtn && !unlocked && (
        <div className="dictationAnswerGateBar">
          <button type="button" className="dictationAnswerGateBtn" onClick={() => setPinOpen(true)}>
            정답보기
          </button>
        </div>
      )}

      {pinOpen && !unlocked && (
        <div className="dictationPinOverlay" role="dialog" aria-modal="true">
          <div className="dictationPinModal">
            <div className="dictationPinTitle">비밀번호를 입력해요</div>
            <div className="dictationPinHint">힌트: 사랑해를 숫자로?</div>

            <div className="dictationPinDisplay">{pin ? pin : " "}</div>

            <div className="dictationPinPad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button key={n} type="button" className="dictationPinKey" onClick={() => pressDigit(n)}>
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
