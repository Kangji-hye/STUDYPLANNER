// src/pages/Dictation.jsx
import { useEffect, useMemo, useState } from "react";
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
const TTS_SPEED_PRESETS = [
  { key: "slow", label: "느리게", rate: 0.6 },
  { key: "normal", label: "보통", rate: 0.95 },
  { key: "fast", label: "빠르게", rate: 1.8 },
];
const DEFAULT_TTS_SPEED_KEY = "normal";

function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel?.();
  } catch {
    // ignore
  }
}

function speakKorean(text, { rate = 0.9, pitch = 1.0, volume = 1.0 } = {}) {
  if (!text) return;

  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    alert("이 기기/브라우저는 음성 읽기를 지원하지 않아요.");
    return;
  }

  stopSpeaking();

  const u = new SpeechSynthesisUtterance(String(text));
  u.lang = "ko-KR";
  u.rate = rate;
  u.pitch = pitch;
  u.volume = volume;

  const voices = window.speechSynthesis.getVoices?.() || [];
  const koVoice = voices.find((v) => (v.lang || "").toLowerCase().startsWith("ko")) || null;

  if (koVoice) u.voice = koVoice;

  window.speechSynthesis.speak(u);
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

  const ttsSpeed = useMemo(() => {
    return TTS_SPEED_PRESETS.find((x) => x.key === ttsSpeedKey) || TTS_SPEED_PRESETS[1];
  }, [ttsSpeedKey]);

  useEffect(() => {
    try {
      localStorage.setItem(TTS_SPEED_STORAGE_KEY, ttsSpeedKey);
    } catch {
      // ignore
    }
  }, [ttsSpeedKey]);

  const today = useMemo(() => ymd(new Date()), []);

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
        setLoading(false);
        return;
      }

      setList(rows ?? []);
      setLoading(false);
    };

    run();

    try {
      window.speechSynthesis?.getVoices?.();
    } catch {
      // ignore
    }

    return () => stopSpeaking();
  }, [navigate, today]);

  const canUseTTS = useMemo(() => {
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }, []);

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


      {/* 속도 버튼은 여기만 수정하면 됩니다: label, rate 추가/변경 */}
      <div className="dictationSpeedBar">
        {TTS_SPEED_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`dictationSpeedBtn ${ttsSpeedKey === p.key ? "is-active" : ""}`}
            onClick={() => setTtsSpeedKey(p.key)}
            disabled={!canUseTTS}
          >
            {p.label}
          </button>
        ))}
      </div>

      {!canUseTTS && (
        <div className="dictationNotice">
          이 기기/브라우저는 음성 읽기를 지원하지 않아요.
          <br />
          크롬/엣지/웨일에서 다시 시도해보세요.
        </div>
      )}

      {loading ? (
        <div className="dictationLoading">불러오는 중...</div>
      ) : list.length === 0 ? (
        <div className="dictationEmpty">
          오늘({today}) {gradeCode ?? ""}학년 받아쓰기 문장이 아직 없어요.
          <br />
          관리자에서 먼저 입력해 주세요.
        </div>
      ) : (
        <div className="dictationList">
          {list.map((r) => (
            <div key={r.id} className="dictationRow">
              <div className="dictationNo">{r.item_no}번</div>

              <button
                className="dictationSpeakBtn"
                onClick={() => speakKorean(r.text, { rate: ttsSpeed.rate })}
                disabled={!canUseTTS}
                type="button"
                aria-label={`${r.item_no}번 읽기`}
                title={`읽어주기 (${ttsSpeed.label})`}
              >
                🔊
              </button>

              <button className="dictationStopBtn" onClick={() => stopSpeaking()} disabled={!canUseTTS} type="button">
                정지
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
