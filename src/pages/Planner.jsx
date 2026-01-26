// src/pages/Planner.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import TodoItem from "../components/TodoItem";
import supabase from "../supabaseClient";
import "./Planner.css";
import { useWeatherYongin } from "../hooks/useWeatherYongin";
import WeatherIcon from "../components/WeatherIcon";
import { useSoundSettings } from "../context/SoundSettingsContext";

import LoadScheduleModal from "../components/planner/LoadScheduleModal";
import MyListSaveModal from "../components/planner/MyListSaveModal";
import CalendarModal from "../components/planner/CalendarModal";
import HelpModal from "../components/planner/HelpModal";
import OnboardingTour from "../components/planner/OnboardingTour";

import HallOfFameCard from "../components/planner/HallOfFameCard";
import StudyTools from "../components/planner/StudyTools";

import { toKstDayKey } from "../utils/dateKst";
import { useBootSplash } from "../hooks/useBootSplash";
import { useRestoreToToday } from "../hooks/useRestoreToToday";
import { useAudioUnlock } from "../hooks/useAudioUnlock";
import { useDoneDaysForMonth } from "../hooks/useDoneDaysForMonth";
import { calcLevelFromStamps } from "../utils/leveling";
import ConfirmModal from "../components/common/ConfirmModal";

// =======================
// 이모지 풀
// =======================
const EMOJI_POOL = [
  "👍", "😀", "😄", "😁", "😆", "🙂", "😊", "🥰", "😍", "🤩", "🤗", "😎", "🥳",
  "😺", "🐶", "🐰", "🐻", "🐼", "🐯", "🦁", "🐣", "🦅", "🦄",
  "🐝", "🐞", "🐜", "🪲", "🦕", "🐠", "🦈", "🐬", "🐋", "🐘",
  "🌼", "🌻", "🌷", "🌹", "🌱", "🌿", "🍀", "🌈", "🌟", "✨", "⚡", "🔥", "☃️",
  "🎈", "🎉", "🎊", "🎁", "🎀", "🍰", "🍭", "🍬", "🍉", "🍇", "🍓", "🍒", "🥕", "🎲", "🧩",
  "🚗", "🚌", "🚓", "🚒", "🚜", "🚀", "✈️", "🚁", "🚲", "⚽", "🏀", "🏈", "🎯",
];

// 명예의 전당 
const cutName6 = (name) => {
  const s = String(name ?? "").trim();
  if (!s) return "익명";

  const chars = Array.from(s); // 이모지/한글 안전하게 자르기
  if (chars.length <= 6) return s;
  return chars.slice(0, 6).join(""); // 6글자까지만 (…는 원하면 붙일 수 있음)
};

function calcGradeCodeFromBirthdate(birthdateStr) {
  const s = String(birthdateStr ?? "").trim();
  if (!s) return null;

  const y = Number(s.slice(0, 4));
  if (!Number.isFinite(y)) return null;

  const currentYear = new Date().getFullYear();
  const code = currentYear - y - 6;

  if (code < -1) return -1;
  if (code > 6) return 6;
  return code;
}

// 첫 진입 샘플 주입 여부(로컬에서 1회만)
const FIRST_VISIT_SEED_KEY = "planner_seeded_v1";

// =======================
// 세션 대기 (Auth 세션이 늦게 잡히는 기기 대비)
// =======================
async function waitForAuthSession({ timeoutMs = 1500 } = {}) {
  const { data: s1 } = await supabase.auth.getSession();
  if (s1?.session) return s1.session;

  return await new Promise((resolve) => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        data.subscription.unsubscribe();
        resolve(session);
      }
    });

    setTimeout(() => {
      data.subscription.unsubscribe();
      resolve(null);
    }, timeoutMs);
  });
}

function Planner() {
  const navigate = useNavigate();
  const { finishEnabled } = useSoundSettings();
  const DEFAULT_FINISH_SOUND = "/finish1.mp3";

  // =======================
  // 기본 상태
  // =======================
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [todo, setTodo] = useState("");
  const [todos, setTodos] = useState([]);
  const [filter, setFilter] = useState("all");
  const [reorderMode, setReorderMode] = useState(false);
  const [usedEmojis, setUsedEmojis] = useState([]);
  const [afterStudyText, setAfterStudyText] = useState("");
  const [afterStudyEditing, setAfterStudyEditing] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState(() => new Set());
  const [verseLines, setVerseLines] = useState([]); 
  const [verseRef, setVerseRef] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  
  // 부트 스플래시 제거(한 번만)
  useBootSplash(loading);

  // =======================
  // 데일리: 선택 날짜
  // =======================
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  // 탭 복원 대비: "날이 바뀐 복원 상황"에서만 오늘로 복귀
  useRestoreToToday(setSelectedDate);

  const selectedDayKey = useMemo(() => toKstDayKey(selectedDate), [selectedDate]);

  // "오늘/과거/미래" 판별 (KST day_key는 YYYY-MM-DD라 문자열 비교가 안전해요)
  const todayDayKey = toKstDayKey(new Date());     // 오늘(한국시간) 키
  const isPastSelected = selectedDayKey < todayDayKey;   // 과거(지난 날짜)
  const isFutureSelected = selectedDayKey > todayDayKey; // 미래(내일 이후)
  const canEditSelectedDate = !isPastSelected;           // 오늘+미래는 수정 가능

  //  기존 함수는 "오늘만"이 아니라 "과거만 막기"에 쓰면 돼요
  const isEditableDate = () => canEditSelectedDate;

  // fetch 레이스 방지(마지막 요청만 반영)
  const selectedDayKeyRef = useRef(selectedDayKey);
  useEffect(() => {
    selectedDayKeyRef.current = selectedDayKey;
  }, [selectedDayKey]);

  const fetchTodosSeqRef = useRef(0);

  const isTodaySelected = () => selectedDayKey === toKstDayKey(new Date());

  // =======================
  // 달력 모달
  // =======================
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // 달력 도장(완료한 날짜 Set)
  const doneDayKeys = useDoneDaysForMonth({
    open: showCalendarModal,
    userId: me?.id,
    calMonth,
  });

//말씀
 const VERSE_COLORS = ["#e11d48", "#2563eb", "#16a34a", "#f97316", "#7c3aed", "#0f766e"];

function pickStableColor(seedText) {
  // 아주 간단한 해시(문자 코드 합) → 같은 seed는 같은 색
  const s = String(seedText ?? "");
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
  return VERSE_COLORS[sum % VERSE_COLORS.length];
}

// 샘플 말씀(그 날짜에 DB 말씀이 0개일 때 사용)
const SAMPLE_VERSES = [
  {
    ref: "시편 23편 1절",
    lines: ["여호와는 나의 목자시니", "내게 부족함이 없으리로다"],
  },
  {
    ref: "빌립보서 4장 13절",
    lines: ["내게 능력 주시는 자 안에서", "내가 모든 것을 할 수 있느니라"],
  },
  {
    ref: "잠언 3장 5절",
    lines: ["너는 마음을 다하여 여호와를 신뢰하고", "네 명철을 의지하지 말라"],
  },
  {
    ref: "이사야 41장 10절",
    lines: ["두려워하지 말라 내가 너와 함께 함이라", "놀라지 말라 나는 네 하나님이 됨이라"],
  },
];

// 날짜 기반 "고정 랜덤" (같은 날짜면 항상 같은 결과)
function pickIndexBySeed(seedText, mod) {
  const s = String(seedText ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return mod <= 0 ? 0 : h % mod;
}

//도움말
const [showHelpModal, setShowHelpModal] = useState(false);

const openHelp = () => setShowHelpModal(true);
const closeHelp = () => setShowHelpModal(false);


  // =======================
  // 프로필(캐시)
  // =======================
  const PROFILE_CACHE_KEY = "planner_profile_cache_v1";
  const [profile, setProfile] = useState(() => {
    try {
      const cached = localStorage.getItem(PROFILE_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  // 날씨
  const weatherCode = useWeatherYongin();

  // 완료 사운드(재사용)
  const finishAudioRef = useRef(null);

  // 오디오 언락(중복 useEffect 제거)
  useAudioUnlock(finishAudioRef, profile?.finish_sound ?? DEFAULT_FINISH_SOUND);

  // 최신 todos 참조
  const todosRef = useRef([]);
  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);




    // =======================
  // 목록 불러오기 모달
  // =======================
  const [showLoadModal, setShowLoadModal] = useState(false);

  // "my" | "vacation" | "weekday" | "weekend"
  const [loadChoice, setLoadChoice] = useState("vacation");

  // 샘플(테이블 3개)
  const [sampleModeReplace, setSampleModeReplace] = useState(false); // true면 교체
  const [importingSample, setImportingSample] = useState(false);

  const SAMPLE_SETS = [
    { key: "vacation", label: "방학 샘플" },
    { key: "weekday", label: "평일 샘플" },
    { key: "weekend", label: "주말 샘플" },
  ];

  const SAMPLE_TABLE_BY_KEY = {
    vacation: "todo_templates_vacation",
    weekday: "todo_templates_weekday",
    weekend: "todo_templates_weekend",
  };

  const [selectedSampleKey, setSelectedSampleKey] = useState(SAMPLE_SETS[0].key);

  // 내 목록 모달(저장만 유지)
  const [showMyListModal, setShowMyListModal] = useState(false);
  const [_myListMode, setMyListMode] = useState("save"); // save만 사용할 예정
  const [loadReplace, setLoadReplace] = useState(false);
  const [busyMyList, setBusyMyList] = useState(false);
  const [hasMyList, setHasMyList] = useState(false);

  const openLoadModal = () => {
    // 내 목록이 있으면 기본을 "내가 만든 목록"으로, 없으면 방학 샘플로
    setLoadChoice(hasMyList ? "my" : "vacation");
    // 체크박스(교체) 기본은 OFF
    setSampleModeReplace(false);
    setLoadReplace(false);
    setShowLoadModal(true);
  };

  const closeLoadModal = () => {
    if (importingSample || busyMyList) return;
    setShowLoadModal(false);
  };

  
  // ✅ 레벨업(트로피) 모달
const [levelUpOpen, setLevelUpOpen] = useState(false);
const [levelUpNewLevel, setLevelUpNewLevel] = useState(1);
const closeLevelUp = () => setLevelUpOpen(false);

  // ✅ 내 도장(참 잘했어요) 총 개수
const [stampCount, setStampCount] = useState(0);

// ✅ 닉네임 옆에 보여줄 내 레벨 정보
const myLevelInfo = useMemo(() => calcLevelFromStamps(stampCount), [stampCount]);



  // =======================
  // 명예의 전당
  // =======================
  const [hof, setHof] = useState([]);
  const [hofLoading, setHofLoading] = useState(false);
  

  const shuffleArray = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const fetchHallOfFame = async (dayKey) => {
    setHofLoading(true);
    try {
      const { data, error } = await supabase
        .from("hall_of_fame")
        .select("user_id, nickname, finished_at")
        .eq("day_key", dayKey);

      if (error) throw error;
      setHof(shuffleArray(data ?? []));
    } catch (err) {
      console.error("fetchHallOfFame error:", err);
      setHof([]);
    } finally {
      setHofLoading(false);
    }
  };

  const recordCompletionForDay = async (dayKey) => {
    if (!me?.id) return;
    const nickname = profile?.nickname ?? "익명";

    try {
      const { error } = await supabase
        .from("hall_of_fame")
        .upsert(
          [{ day_key: dayKey, user_id: me.id, nickname, finished_at: new Date().toISOString() }],
          { onConflict: "day_key,user_id", ignoreDuplicates: true }
        );

      if (error) throw error;
      await fetchHallOfFame(dayKey);
    } catch (err) {
      console.error("recordCompletionForDay error:", err);
    }
  };


// ✅ 내 도장(=hall_of_fame 기록) 개수만 숫자로 가져오기
const fetchMyStampCountNumber = async (userId) => {
  const { count, error } = await supabase
    .from("hall_of_fame")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw error;
  return count ?? 0;
};


  const removeCompletionForDay = async (dayKey) => {
    if (!me?.id) return;

    try {
      const { error } = await supabase
        .from("hall_of_fame")
        .delete()
        .eq("day_key", dayKey)
        .eq("user_id", me.id);

      if (error) throw error;
      await fetchHallOfFame(dayKey);
    } catch (err) {
      console.error("removeCompletionForDay error:", err);
    }
  };

  // =======================
  // UI: 날짜 표시
  // =======================
  const formatSelectedKorean = () => {
    const d = selectedDate;
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const day = days[d.getDay()];
    return `${y}-${m}-${dd} (${day})`;
  };

  // =======================
  // 랜덤 이모지
  // =======================
  const getRandomEmoji = () => {
    const available = EMOJI_POOL.filter((emoji) => !usedEmojis.includes(emoji));
    const pool = available.length > 0 ? available : EMOJI_POOL;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    setUsedEmojis((prev) => (available.length > 0 ? [...prev, selected] : [selected]));
    return selected;
  };

  // =======================
  // 폭죽 & 사운드
  // =======================
  const fireConfetti = () => {
    confetti({
      particleCount: 140,
      spread: 90,
      origin: { y: 0.62 },
      colors: ["#ff7aa2", "#ffb86b", "#ffd166", "#a0e7e5"],
    });
  };

  //  모두 완료 효과음
const playFinishSound = (overrideSrc) => {
  try {
    // 소리 설정 OFF면 재생하지 않음
    if (typeof finishEnabled === "boolean" && finishEnabled === false) return;

    // 1) 재생할 소스 결정 (우선순위: override > profile > 기본값)
    let src = String(overrideSrc ?? profile?.finish_sound ?? DEFAULT_FINISH_SOUND).trim();
    if (!src) src = DEFAULT_FINISH_SOUND;

    // 2) 확장자 체크(지금 프로젝트는 mp3만 쓰는 전제)
    //    혹시 다른 값이 들어오면 기본값으로 되돌림
    if (!src.toLowerCase().endsWith(".mp3")) {
      src = DEFAULT_FINISH_SOUND;
    }

    // 3) 오디오 객체는 재사용 (매번 new Audio 하면 모바일에서 불안정해질 수 있어요)
    if (!finishAudioRef.current) {
      finishAudioRef.current = new Audio();
      finishAudioRef.current.preload = "auto";
    }

    const a = finishAudioRef.current;

    // 4) src가 바뀌면 교체 + 로드
    const nextHref = new URL(src, window.location.origin).href;
    if (a.src !== nextHref) {
      a.src = src;
      a.load();
    }

    // 5) 볼륨/되감기
    a.volume = 0.9;
    try { a.pause(); } catch {
      //
    }
    a.currentTime = 0;

    // 6) 재생 (실패하면 기본값으로 1번 더 시도)
    a.play().catch((e) => {
      console.warn("finish sound blocked:", e);

      // NotSupportedError면 대부분 "파일 없음/오디오 아님/코덱 문제"라서
      // 기본값으로 한 번 더 바꿔서 재생 시도
      if (String(e?.name) === "NotSupportedError") {
        try {
          const fallbackHref = new URL(DEFAULT_FINISH_SOUND, window.location.origin).href;
          if (a.src !== fallbackHref) {
            a.src = DEFAULT_FINISH_SOUND;
            a.load();
          }
          a.currentTime = 0;
          a.play().catch((e2) => console.warn("finish sound fallback failed:", e2));
        } catch (e3) {
          console.warn("finish sound fallback error:", e3);
        }
      }
    });
  } catch (e) {
    console.warn("finish sound error:", e);
  }
};

  // =======================
  // 날짜별 todos 조회(레이스 방지)
  // =======================
  const fetchTodos = async (userId, dayKey) => {
    const mySeq = ++fetchTodosSeqRef.current;

    const { data, error } = await supabase
      .from("todos")
      .select("id, user_id, day_key, title, completed, created_at, sort_order, template_item_key, source_set_item_key")
      .eq("user_id", userId)
      .eq("day_key", dayKey)
      .order("sort_order", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetchTodos error:", error);
      alert(error.message);
      return [];
    }

    const rows = data ?? [];

    // 마지막 요청 + 현재 보고 있는 날짜만 화면 반영
    if (mySeq === fetchTodosSeqRef.current && dayKey === selectedDayKeyRef.current) {
      setTodos(rows);
    }
    return rows;
  };

  // =======================
  // 첫 진입 샘플 자동 주입
  // =======================
  const seedSampleTodosIfEmpty = async ({ userId, dayKey, existingCount }) => {
    const seededKey = `${FIRST_VISIT_SEED_KEY}:${userId}`;

    try {
      if (existingCount > 0) return;

      const alreadySeeded = localStorage.getItem(seededKey) === "true";
      if (alreadySeeded) return;

      localStorage.setItem(seededKey, "true");

      const samples = [
        "오늘의 할 일을 추가해 보세요",
        "완료 버튼을 눌러 보세요",
        "모두 완료가 되면 폭죽이 터집니다",
        "마이 페이지에서 효과음을 설정해보세요",
      ];

      const rows = samples.map((text) => ({
        user_id: userId,
        day_key: dayKey,
        title: `${getRandomEmoji()} ${text}`,
        completed: false,
      }));

      const rowsWithOrder = rows.map((r, idx) => ({ ...r, sort_order: idx + 1 }));

      const { error } = await supabase.from("todos").insert(rowsWithOrder);
      if (error) throw error;
    } catch (err) {
      console.error("seedSampleTodosIfEmpty error:", err);
      try {
        localStorage.removeItem(seededKey);
      // eslint-disable-next-line no-empty
      } catch {}
    }
  };

  // 내 목록 존재 여부
  const fetchMySingleListInfo = async (userId) => {
    const { data, error } = await supabase
      .from("todo_sets")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "single")
      .maybeSingle();

    if (error) {
      console.error("fetchMySingleListInfo error:", error);
      setHasMyList(false);
      return { id: null };
    }

    setHasMyList(!!data?.id);
    return { id: data?.id ?? null };
  };

  // =======================
  // 초기 로딩
  // =======================
  useEffect(() => {
    let mounted = true;

    const loadAll = async () => {
      if (!mounted) return;
      setLoading(true);

      const session = await waitForAuthSession({ timeoutMs: 1500 });
      if (!session?.user) {
        if (!mounted) return;
        setLoading(false);
        navigate("/login", { replace: true });
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        if (!mounted) return;
        setLoading(false);
        navigate("/login", { replace: true });
        return;
      }

      const user = userData.user;
      if (mounted) setMe(user);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, nickname, birthdate, is_male, finish_sound, grade_code, grade_manual, is_admin")
        .eq("id", user.id)
        .maybeSingle();

      const nextProfile =
        profileError || !profileData
          ? {
              id: user.id,
              nickname: user.user_metadata?.nickname ?? "닉네임",
              birthdate: user.user_metadata?.birthdate ?? null,
              is_male: user.user_metadata?.is_male ?? true,
              finish_sound: user.user_metadata?.finish_sound ?? DEFAULT_FINISH_SOUND,
            }
          : profileData;
      
          // 생년월일이 있는데 grade_code가 비어있고(수동 설정도 안 했으면) 자동으로 채우기
          try {
            const hasBirth = String(nextProfile?.birthdate ?? "").trim().length > 0;
            const gradeManual = Boolean(nextProfile?.grade_manual);
            const hasGrade = Number.isFinite(Number(nextProfile?.grade_code));

            if (hasBirth && !gradeManual && !hasGrade) {
              const autoCode = calcGradeCodeFromBirthdate(nextProfile.birthdate);

              if (Number.isFinite(autoCode)) {
                // nextProfile에 먼저 반영(화면에서 바로 적용)
                nextProfile.grade_code = autoCode;
                nextProfile.grade_manual = false;

                // DB에도 저장(이미 생년월일 넣은 기존 사용자도 자동 반영되게)
                const { error: gErr } = await supabase
                  .from("profiles")
                  .update({ grade_code: autoCode, grade_manual: false })
                  .eq("id", user.id);

                if (gErr) console.warn("auto grade update failed:", gErr);
              }
            }
          } catch (e) {
            console.warn("auto grade calc failed:", e);
          }
       
      if (mounted) setProfile(nextProfile);

      try {
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(nextProfile));
      // eslint-disable-next-line no-empty
      } catch {}

      if (!profileData) {
        const { error: upsertErr } = await supabase
          .from("profiles")
          .upsert(
            {
              id: user.id,
              nickname: nextProfile.nickname,
              birthdate: nextProfile.birthdate,
              is_male: nextProfile.is_male,
              finish_sound: nextProfile.finish_sound || DEFAULT_FINISH_SOUND,

            grade_code: Number.isFinite(autoCode) ? autoCode : null,
            grade_manual: false,
            },
            { onConflict: "id" }
          );
        if (upsertErr) console.error("profiles upsert error:", upsertErr);
      }

      const loaded = await fetchTodos(user.id, selectedDayKey);

      // 내 목록 상태 확인(1회)
      const { id: myListId } = await fetchMySingleListInfo(user.id);

      // 내 목록이 없고, 오늘 할 일도 없으면 샘플 주입
      if (!myListId && loaded.length === 0) {
        await seedSampleTodosIfEmpty({
          userId: user.id,
          dayKey: selectedDayKey,
          existingCount: loaded.length,
        });
        await fetchTodos(user.id, selectedDayKey);
      }

      // 명예의 전당 로딩
      await fetchHallOfFame(selectedDayKey);

      if (mounted) setLoading(false);
    };

    loadAll();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // 날짜 바뀌면 재조회
  useEffect(() => {
    if (!me?.id) return;

    const run = async () => {
      const rows = await fetchTodos(me.id, selectedDayKey);
      await fetchHallOfFame(selectedDayKey);
      // await autoPopulateIfEmpty(me.id, selectedDayKey, rows ?? []);
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayKey, me?.id, hasMyList]);

  // 명예의 전당 자동 새로고침
  useEffect(() => {
    if (!me?.id) return;

    const INTERVAL_MS = 5 * 60 * 1000;
    const intervalId = setInterval(() => {
      fetchHallOfFame(selectedDayKey);
    }, INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [me?.id, selectedDayKey]);

  // 내 도장 개수 불러오기 (hall_of_fame에서 내 기록 개수 세기)
useEffect(() => {
  if (!me?.id) return;

  const fetchMyStampCount = async () => {
    try {
      const { count, error } = await supabase
        .from("hall_of_fame")
        .select("*", { count: "exact", head: true })
        .eq("user_id", me.id);

      if (error) throw error;
      setStampCount(count ?? 0);
    } catch (e) {
      console.warn("fetchMyStampCount error:", e);
      setStampCount(0);
    }
  };

  fetchMyStampCount();
}, [me?.id]);


  // 메모 불러오기
  useEffect(() => {
    if (!me?.id) return;

    const key = `afterStudyText:${me.id}:${selectedDayKey}`;
    try {
      const saved = localStorage.getItem(key);
      setAfterStudyText(saved ?? "");
    } catch {
      setAfterStudyText("");
    }
  }, [me?.id, selectedDayKey]);

  // =======================
  // 샘플/내목록 불러오기 공통
  // =======================
  const makeImportBatchId = () => {
    try {
      return crypto.randomUUID();
    } catch {
      return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
  };

  const importSampleTodos = async (sampleKeyOverride) => {
    if (!me?.id) return;
    if (importingSample) return;

    // 과거(지난 날짜)만 금지, 오늘+미래(내일)는 미리 셋팅 허용
    if (isPastSelected) {
      alert("지난 날짜에는 샘플 숙제 불러오기를 사용할 수 없습니다.\n(내일 날짜는 미리 셋팅할 수 있어요!)");
      return;
    }


    const useKey = sampleKeyOverride || selectedSampleKey;
    const tableName = SAMPLE_TABLE_BY_KEY[useKey];
    if (!tableName) {
      alert("샘플 테이블 설정이 올바르지 않습니다.");
      return;
    }

    setSelectedSampleKey(useKey);

    try {
      setImportingSample(true);

      if (sampleModeReplace) {
        const { error: delErr } = await supabase
          .from("todos")
          .delete()
          .eq("user_id", me.id)
          .eq("day_key", selectedDayKey);

        if (delErr) throw delErr;
        await removeCompletionForDay(selectedDayKey);
      }

      const { data: templates, error: tplErr } = await supabase
        .from(tableName)
        .select("item_key, title, sort_order")
        .order("sort_order", { ascending: true });

      if (tplErr) throw tplErr;

      const maxSort = (todosRef.current ?? [])
        .map((t) => Number(t.sort_order ?? 0))
        .reduce((a, b) => Math.max(a, b), 0);

      const rows = (templates ?? [])
        .map((x) => {
          const base = Number(x.sort_order ?? 0) || 0;
          const itemKey = String(x.item_key ?? "").trim();
          const batchId = makeImportBatchId();

          const tplKey = sampleModeReplace
            ? `${selectedDayKey}:${useKey}:${itemKey}`
            : `${selectedDayKey}:${useKey}:${itemKey}:${batchId}`;

          return {
            user_id: me.id,
            day_key: selectedDayKey,
            template_item_key: tplKey,
            title: String(x.title ?? "").trim(),
            completed: false,
            sort_order: sampleModeReplace ? base : maxSort + base,
          };
        })
        .filter((x) => x.template_item_key && x.title);

      if (rows.length === 0) {
        alert("샘플 템플릿이 비어있습니다. Supabase 샘플 테이블을 확인해주세요.");
        return;
      }

      const { error: upErr } = await supabase.from("todos").upsert(rows, {
        onConflict: "user_id,template_item_key",
        ignoreDuplicates: true,
      });
      if (upErr) throw upErr;

      await fetchTodos(me.id, selectedDayKey);

      alert(sampleModeReplace ? "샘플 일정으로 교체했습니다." : "샘플 일정을 추가했습니다.");
      setShowLoadModal(false);
    } catch (err) {
      console.error("importSampleTodos error:", err);
      alert(String(err?.message ?? "") || "샘플 일정 불러오기 중 오류가 발생했습니다.");
    } finally {
      setImportingSample(false);
    }
  };

  // 내 목록 저장 모달
  const openMyListSaveModal = () => {
    setMyListMode("save");
    setShowMyListModal(true);
  };

  const closeMyListModal = () => {
    if (busyMyList) return;
    setShowMyListModal(false);
  };

  const saveMySingleList = async () => {
    if (!me?.id) return;

    const { data } = await supabase.auth.getSession();
    if (!data?.session) {
      navigate("/login", { replace: true });
      return;
    }

    const currentTodos = todosRef.current ?? [];
    if (currentTodos.length === 0) {
      alert("저장할 할 일이 없습니다.");
      return;
    }

    try {
      setBusyMyList(true);

      const { data: setRow, error: setErr } = await supabase
        .from("todo_sets")
        .upsert([{ user_id: me.id, kind: "single", name: "내 목록" }], { onConflict: "user_id,kind" })
        .select("id")
        .single();

      if (setErr) throw setErr;

      const { error: delItemsErr } = await supabase
        .from("todo_set_items")
        .delete()
        .eq("set_id", setRow.id);

      if (delItemsErr) throw delItemsErr;

      const items = currentTodos
        .map((t, idx) => ({
          set_id: setRow.id,
          item_key: String(idx + 1).padStart(3, "0"),
          title: String(t.title ?? "").trim(),
          sort_order: idx + 1,
        }))
        .filter((x) => x.title.length > 0);

      const { error: insertItemsErr } = await supabase.from("todo_set_items").insert(items);
      if (insertItemsErr) throw insertItemsErr;

      setHasMyList(true);
      alert("내 목록으로 저장했습니다.");
      setShowMyListModal(false);
    } catch (err) {
      console.error("saveMySingleList error:", err);
      alert(err?.message ?? "내 목록 저장 중 오류가 발생했습니다.");
    } finally {
      setBusyMyList(false);
    }
  };

  const importMySingleList = async () => {
    if (!me?.id) return;

    if (isPastSelected) {
      alert("지난 날짜에는 불러오기 기능을 사용할 수 없습니다.\n(내일 날짜는 미리 셋팅할 수 있어요!)");
      return;
    }

    const { data } = await supabase.auth.getSession();
    if (!data?.session) {
      navigate("/login", { replace: true });
      return;
    }

    try {
      const { id: setId } = await fetchMySingleListInfo(me.id);
      if (!setId) {
        alert("저장된 내가 만든 목록이 없습니다. 먼저 '내 목록 저장'을 해주세요.");
        return;
      }

      setBusyMyList(true);

      if (loadReplace) {
        const { error: delErr } = await supabase
          .from("todos")
          .delete()
          .eq("user_id", me.id)
          .eq("day_key", selectedDayKey);

        if (delErr) throw delErr;
        await removeCompletionForDay(selectedDayKey);
      }

      const { data: items, error: itemsErr } = await supabase
        .from("todo_set_items")
        .select("item_key, title, sort_order")
        .eq("set_id", setId)
        .order("sort_order", { ascending: true });

      if (itemsErr) throw itemsErr;

      const maxSort = (todosRef.current ?? [])
        .map((t) => Number(t.sort_order ?? 0))
        .reduce((a, b) => Math.max(a, b), 0);

      const rows = (items ?? [])
        .map((x) => {
          const base = Number(x.sort_order ?? 0) || 0;
          const batchId = makeImportBatchId();
          const itemKey = String(x.item_key ?? "").trim();

          return {
            user_id: me.id,
            day_key: selectedDayKey,
            title: String(x.title ?? "").trim(),
            completed: false,
            sort_order: loadReplace ? base : maxSort + base,
            source_set_item_key: loadReplace
              ? `${selectedDayKey}:single:${itemKey}`
              : `${selectedDayKey}:single:${itemKey}:${batchId}`,
          };
        })
        .filter((x) => x.source_set_item_key && x.title);

      const { error: upErr } = await supabase.from("todos").upsert(rows, {
        onConflict: "user_id,source_set_item_key",
        ignoreDuplicates: true,
      });

      if (upErr) throw upErr;

      await fetchTodos(me.id, selectedDayKey);
      alert(loadReplace ? "내 일정으로 교체했습니다." : "내 일정을 불러왔습니다.");
      setShowLoadModal(false);
    } catch (err) {
      console.error("importMySingleList error:", err);
      alert(String(err?.message ?? "") || "내 일정 불러오기 중 오류가 발생했습니다.");
    } finally {
      setBusyMyList(false);
    }
  };

  // =======================
  // 정렬
  // =======================
  const ensureSortOrderForDay = async () => {
    if (!me?.id) return;

    const current = todosRef.current ?? [];
    const needs = current.some((x) => x.sort_order === null || x.sort_order === undefined);
    if (!needs) return;

    for (let i = 0; i < current.length; i++) {
      const t = current[i];
      const nextOrder = i + 1;
      if (t.sort_order === nextOrder) continue;

      const { error } = await supabase.from("todos").update({ sort_order: nextOrder }).eq("id", t.id);
      if (error) {
        console.error("ensureSortOrderForDay error:", error);
        break;
      }
    }

    await fetchTodos(me.id, selectedDayKey);
  };

  const swapTodoOrder = async (a, b) => {
    if (!me?.id) return;

    const aOrder = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 0;
    const bOrder = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 0;

    const current = todosRef.current ?? [];
    setTodos(
      current.map((x) => {
        if (x.id === a.id) return { ...x, sort_order: bOrder };
        if (x.id === b.id) return { ...x, sort_order: aOrder };
        return x;
      })
    );

    const { error: e1 } = await supabase.from("todos").update({ sort_order: bOrder }).eq("id", a.id);
    if (e1) {
      console.error("swapTodoOrder update a error:", e1);
      await fetchTodos(me.id, selectedDayKey);
      alert("순서 변경 중 오류가 발생했습니다.");
      return;
    }

    const { error: e2 } = await supabase.from("todos").update({ sort_order: aOrder }).eq("id", b.id);
    if (e2) {
      console.error("swapTodoOrder update b error:", e2);
      await fetchTodos(me.id, selectedDayKey);
      alert("순서 변경 중 오류가 발생했습니다.");
      return;
    }

    await fetchTodos(me.id, selectedDayKey);
  };

  const filteredTodos = useMemo(() => {
    if (filter === "completed") return todos.filter((t) => t.completed);
    if (filter === "uncompleted") return todos.filter((t) => !t.completed);
    return todos;
  }, [filter, todos]);

  const moveTodoUp = async (item) => {
    const list = filteredTodos;
    const idx = list.findIndex((x) => x.id === item.id);
    if (idx <= 0) return;
    await swapTodoOrder(list[idx], list[idx - 1]);
  };

  const moveTodoDown = async (item) => {
    const list = filteredTodos;
    const idx = list.findIndex((x) => x.id === item.id);
    if (idx < 0 || idx >= list.length - 1) return;
    await swapTodoOrder(list[idx], list[idx + 1]);
  };

  // =======================
  // todos CRUD
  // =======================
  const handleChange = (e) => setTodo(e.target.value);

  const addTodo = async () => {
    
    if (isPastSelected) {
      alert("지난 날짜에는 할 일을 추가할 수 없습니다.");
      return;
    }
    const raw = todo.trim();
    if (!raw) return;
    if (!me?.id) return;

    const emoji = getRandomEmoji();
    const titleWithEmoji = `${emoji} ${raw}`;

    const maxSort = (todosRef.current ?? [])
      .map((x) => Number(x.sort_order ?? 0))
      .reduce((a, b) => Math.max(a, b), 0);

    const nextSort = maxSort + 1;

    const { error } = await supabase
      .from("todos")
      .insert([
        {
          user_id: me.id,
          day_key: selectedDayKey,
          title: titleWithEmoji,
          completed: false,
          sort_order: nextSort,
        },
      ]);

    if (error) {
      console.error("addTodo error:", error);
      alert(error.message);
      return;
    }

    setTodo("");
    await fetchTodos(me.id, selectedDayKey);
  };

  const onDelete = async (id) => {
    if (isPastSelected) {
      alert("지난 날짜에는 삭제할 수 없습니다.");
      return;
    }

    const { error } = await supabase.from("todos").delete().eq("id", id);
    if (error) {
      console.error("deleteTodo error:", error);
      alert(error.message);
      return;
    }

    const next = (todosRef.current ?? []).filter((t) => t.id !== id);
    setTodos(next);

    const isAllCompleted = next.length > 0 && next.every((t) => t.completed);
    if (!isAllCompleted) await removeCompletionForDay(selectedDayKey);
  };

  const onToggle = async (item) => {
    //  지난 날짜는 완료/취소 금지
    if (isPastSelected) {
      alert("지난 날짜에는 완료 체크를 바꿀 수 없습니다.");
      return;
    }

    const current = todosRef.current ?? [];
    const wasAllCompleted = current.length > 0 && current.every((t) => t.completed);

    const nextTodos = current.map((t) =>
      t.id === item.id ? { ...t, completed: !t.completed } : t
    );

  const willAllCompleted = nextTodos.length > 0 && nextTodos.every((t) => t.completed);

  // ✅ (A) UI 즉시 반응
  if (!wasAllCompleted && willAllCompleted) {
    fireConfetti();
    playFinishSound();
  }

  setTodos(nextTodos);

  try {
    const { error } = await supabase
      .from("todos")
      .update({ completed: !item.completed })
      .eq("id", item.id);

    if (error) throw error;

    if (!wasAllCompleted && willAllCompleted) {
      // ✅ (B) 완료 기록(도장 1개) 먼저 저장
      await recordCompletionForDay(selectedDayKey);

      // ✅ (C) 저장 "전 레벨"과 "저장 후 레벨" 비교해서 레벨업이면 모달 띄우기
      //     - recordCompletionForDay로 도장이 1 늘어났으니, 최신 count를 다시 세면 정확해요.
      try {
        const beforeStamp = await fetchMyStampCountNumber(me.id); 
        // ⚠️ 여기서 beforeStamp는 "이미 저장된 후"가 될 가능성이 있으니,
        //     안전하게 '모달 띄울지'는 아래처럼 "이전 레벨"을 상태로 관리하는 게 가장 깔끔합니다.
      } catch {
        // 여기서는 무시
      }

      // ✅ 가장 안전한 방식: "저장 직후 count"를 가져오고,
      //    "저장 직전 레벨"은 '현재까지 도장'을 기준으로 계산해서 비교
      const beforeCount = await fetchMyStampCountNumber(me.id); 
      // 위 줄은 이미 저장 후 count이므로, 아래처럼 "저장 직전"을 역으로 추정합니다.
      // recordCompletionForDay는 하루 1개만 추가되니, 저장 직전은 (저장 후 - 1)로 보면 돼요.
      const afterCount = beforeCount;
      const estimatedBefore = Math.max(0, afterCount - 1);

      const beforeLv = calcLevelFromStamps(estimatedBefore).level;
      const afterLv = calcLevelFromStamps(afterCount).level;

      if (afterLv > beforeLv) {
        // ✅ 트로피 모달 오픈
        setLevelUpNewLevel(afterLv);
        setLevelUpOpen(true);
      }
    }

    if (wasAllCompleted && !willAllCompleted) {
      await removeCompletionForDay(selectedDayKey);
    }
  } catch (err) {
    console.error("toggleTodo error:", err);
    setTodos(current);
    alert(err?.message ?? "완료 처리 중 오류가 발생했습니다.");
  }
};


  const doneCount = todos.filter((t) => t.completed).length;

  const notDoneCount = todos.filter((t) => !t.completed).length;

//삭제 관련
const toggleSelectForDelete = (todoId) => {
  setSelectedDeleteIds((prev) => {
    const next = new Set(prev);
    if (next.has(todoId)) next.delete(todoId);
    else next.add(todoId);
    return next;
  });
};

// 모두 선택 / 모두 해제
const selectAllForDelete = () => {
  const ids = (filteredTodos ?? []).map((t) => t.id);
  setSelectedDeleteIds(new Set(ids));
};

const clearAllForDelete = () => {
  setSelectedDeleteIds(new Set());
};

//  "모두 선택" 버튼을 토글로 만드는 함수
const toggleSelectAllForDelete = () => {
  const list = filteredTodos ?? [];

  // 삭제 모드인데도 목록이 0개면 할 게 없으니 안내
  if (list.length === 0) {
    alert("선택할 것이 없어요 🙂");
    return;
  }

  // 지금 전부 선택된 상태인지 확인
  const isAllSelected = selectedDeleteIds.size === list.length;

  if (isAllSelected) {
    //  전부 선택되어 있으면 -> 전부 해제
    clearAllForDelete();
  } else {
    //  전부 선택 안 되어 있으면 -> 전부 선택
    selectAllForDelete();
  }
};

//  선택 삭제(다중 삭제)
const deleteSelectedTodos = async () => {
  if (!me?.id) return;

  const ids = Array.from(selectedDeleteIds);
  if (ids.length === 0) {
    alert("삭제할 항목을 선택해 주세요.");
    return;
  }

  // const ok = window.confirm(`선택한 ${ids.length}개를 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`);
  // if (!ok) return;
  setDeleteTargetId(t.id);

  try {
    // 한 번에 삭제
    const { error } = await supabase
      .from("todos")
      .delete()
      .in("id", ids);

    if (error) throw error;

    // 화면에서도 즉시 반영
    const next = (todosRef.current ?? []).filter((t) => !selectedDeleteIds.has(t.id));
    setTodos(next);

    //완료 기록(명예의 전당)도 상태에 맞게 정리
    const isAllCompleted = next.length > 0 && next.every((t) => t.completed);
    if (!isAllCompleted) await removeCompletionForDay(selectedDayKey);

    // 선택/모드 정리
    clearAllForDelete();
    setDeleteMode(false);
  } catch (err) {
    console.error("deleteSelectedTodos error:", err);
    alert(err?.message ?? "삭제 중 오류가 발생했습니다.");
  }
};

  // =======================
  // 스탑워치/타이머/하가다/
  // =======================
  const [timerSoundOn, setTimerSoundOn] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

    // =======================
  //  첫 방문 말풍선 단계 안내(온보딩 투어)
  // =======================
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  // 말풍선이 "가리킬" 대상들 (ref = 여기! 라고 찍어주는 표지판)
  const refCalendarBtn = useRef(null);
  const refInput = useRef(null);
  const refAddBtn = useRef(null);
  const refLoadBtn = useRef(null);
  const refTodoList = useRef(null);

  const startTour = () => {
    setTourStep(0);
    setTourOpen(true);
  };

  const closeTour = () => {
    setTourOpen(false);

    // "봤다" 표시 저장 (다음부터 자동 오픈 안 하게)
    try {
      const uid = me?.id ?? "anon";
      localStorage.setItem(`planner_tour_seen_v1:${uid}`, "1");
    } catch {
      // localStorage 실패해도 앱은 계속 동작해야 함
    }
  };

  // 말풍선 단계들(무슨 말을 할지)
  const tourSteps = useMemo(
    () => [
      {
        title: "📂 목록 불러오기",
        body: (
          <>
            여기서 기본 목록/내 목록을 불러올 수 있어요.<br />
            처음이라면 한 번 눌러서 목록을 채워보세요.
          </>
        ),
        targetRef: refLoadBtn,
      },
      {
        title: "✏️ 할 일 적기",
        body: (
          <>
            여기에 오늘 할 일을 적어요.<br />
            예)  "수학 1장", "영어 10분" 같은 식으로요.
          </>
        ),
        targetRef: refInput,
      },
      {
        title: "➕ 입력 버튼",
        body: (
          <>
            다 적었으면 "입력"을 눌러서 목록에 추가해요.<br />
            키보드 Enter로도 추가할 수 있어요.
          </>
        ),
        targetRef: refAddBtn,
      },
      {
        title: "✅ 오늘 할 일 목록",
        body: (
          <>
            할 일을 끝내면 완료(체크)를 눌러요.<br />
            다 끝내면 축하 효과도 나와요 🎉
          </>
        ),
        targetRef: refTodoList,
      },
      {
        title: "🗓️ 달력으로 날짜 바꾸기",
        body: (
          <>
            어제/내일 할 일을 보고 싶으면 달력을 눌러요.<br />
            완료한 날에는 도장이 찍혀요.
          </>
        ),
        targetRef: refCalendarBtn,
      },
    ],
    []
  );

  // 첫 방문이면 자동으로 투어 시작
  useEffect(() => {
    if (loading) return;

    try {
      const uid = me?.id ?? "anon";
      const key = `planner_tour_seen_v1:${uid}`;

      const seen = localStorage.getItem(key);
      if (seen === "1") return;

      startTour();
    } catch {
      startTour();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, me?.id]);


  
  useEffect(() => () => clearInterval(timerRef.current), []);

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10);
    return `${minutes}분 ${String(seconds).padStart(2, "0")}초 ${String(centiseconds).padStart(2, "0")}`;
  };

  const startStopwatch = () => {
    if (isRunning) return;
    setIsRunning(true);
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const now = Date.now();
      const diff = now - startTimeRef.current;
      startTimeRef.current = now;
      setElapsedMs((prev) => prev + diff);
    }, 50);
  };

  const stopStopwatch = () => {
    if (!isRunning) return;
    setIsRunning(false);
    clearInterval(timerRef.current);
    timerRef.current = null;
    startTimeRef.current = null;
  };

  const resetStopwatch = () => {
    setIsRunning(false);
    clearInterval(timerRef.current);
    timerRef.current = null;
    startTimeRef.current = null;
    setElapsedMs(0);
  };

  const TIMER_PRESETS = [1, 2, 3, 4, 5, 10, 20];
  const [timerMin, setTimerMin] = useState(10);
  const [timerRunning, setTimerRunning] = useState(false);
  const [remainingSec, setRemainingSec] = useState(10 * 60);
  const timerIntervalRef = useRef(null);

  useEffect(() => {
    if (timerRunning) return;
    setRemainingSec(timerMin * 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerMin]);

  useEffect(() => () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = null;
  }, []);

  const formatMMSS = (sec) => {
    const s = Math.max(0, Number(sec) || 0);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const startTimer = () => {
    if (timerRunning) return;
    if (remainingSec <= 0) return;

    setTimerRunning(true);

    timerIntervalRef.current = setInterval(() => {
      setRemainingSec((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
          setTimerRunning(false);
          playFinishSound();
          return 0;
        }
        return next;
      });
    }, 1000);
  };

  const pauseTimer = () => {
    if (!timerRunning) return;
    setTimerRunning(false);

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const resetTimer = () => {
    setTimerRunning(false);

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    setRemainingSec(timerMin * 60);
  };

  // 타이머 종료 소리
  const TIMER_END_SOUND = "/time1.mp3";
  const timerAudioRef = useRef(null);
  const timerEndedRef = useRef(false);

  useEffect(() => {
    if (remainingSec === 0 && !timerEndedRef.current) {
      timerEndedRef.current = true;
      if (!timerSoundOn) return;

      try {
        if (!timerAudioRef.current) timerAudioRef.current = new Audio(TIMER_END_SOUND);
        timerAudioRef.current.currentTime = 0;
        timerAudioRef.current.volume = 0.9;
        timerAudioRef.current.play().catch(() => {});
      } catch (err) {
        console.warn("타이머 종료 효과음 재생 실패", err);
      }
    }

    if (remainingSec > 0) timerEndedRef.current = false;
  }, [remainingSec, timerSoundOn]);

  // 하가다
  const [hagadaCount, setHagadaCount] = useState(0);
  const increaseHagada = () => setHagadaCount((prev) => prev + 1);
  const resetHagada = () => setHagadaCount(0);


 //관리자 : 오늘의 말씀 2학년만 보이게
  useEffect(() => {
    //로그인 안 됐으면 아무 것도 하지 않기
    if (!me?.id) return;

    //학년이 아니면: 말씀을 '비워서' 화면에 안 보이게 만들기
    const myGrade = Number(profile?.grade_code);
     const isAdmin = (me?.email === "kara@kara.com" || profile?.is_admin === true);
    const isSecondGrade = (myGrade === 2);

    if (!isSecondGrade) {
      setVerseLines([]); 
      setVerseRef("");  
      return;         
    }

    // ------------------------------
    //여기부터는 "2학년일 때만" 실행됩니다.
    // ------------------------------

    const run = async () => {
      try {
        const { data, error } = await supabase
          .from("daily_verses")
          .select("grade_code, ref_text, content")
          .eq("day_key", selectedDayKey);

        if (error) throw error;

        const rows = data ?? [];

        if (rows.length > 0) {
          const valid = rows
            .map((r) => ({
              grade_code: Number(r.grade_code),
              ref_text: String(r.ref_text ?? "").trim(),
              content: String(r.content ?? "").trim(),
            }))
            .filter((r) => r.content.length > 0);

          if (valid.length === 0) {
            const idx = pickIndexBySeed(`sample:${selectedDayKey}`, SAMPLE_VERSES.length);
            setVerseRef(SAMPLE_VERSES[idx].ref);
            setVerseLines(SAMPLE_VERSES[idx].lines);
            return;
          }

          // 2학년이므로 "grade_code === 2"인 말씀을 우선 선택
          const mine = valid.find((r) => r.grade_code === 2);

          const chosen = mine
            ? mine
            : valid[pickIndexBySeed(`fallback:${selectedDayKey}`, valid.length)];

          if (!mine) {
            setVerseLines([]);  // ✅ 2학년 말씀이 없으면 숨김
            setVerseRef("");
            return;
          }

          setVerseRef(mine.ref_text || "");
          const lines = mine.content.split("\n").map(s => s.trim()).filter(Boolean);
          setVerseLines(lines);
          return;
        }

        const idx = pickIndexBySeed(`sample:${selectedDayKey}`, SAMPLE_VERSES.length);
        setVerseRef(SAMPLE_VERSES[idx].ref);
        setVerseLines(SAMPLE_VERSES[idx].lines);
      } catch (err) {
        console.error("load daily_verses error:", err);
        const idx = pickIndexBySeed(`sample:${selectedDayKey}`, SAMPLE_VERSES.length);
        setVerseRef(SAMPLE_VERSES[idx].ref);
        setVerseLines(SAMPLE_VERSES[idx].lines);
      }
    };

    run();
  }, [me?.id, selectedDayKey, profile?.grade_code]);

//기존소스 : 원래대로 복원할때
//  useEffect(() => {
//   if (!me?.id) return;

//   const myGrade = Number(profile?.grade_code);

//   // 학년이 없더라도 "샘플"은 보여줄 수 있으니,
//   // 여기서는 학년이 없으면 myGrade를 NaN으로 두고 fallback 로직으로 
//   const run = async () => {
//     try {
//       //  1) 그 날짜의 모든 학년 말씀을 한 번에 가져오기
//       const { data, error } = await supabase
//         .from("daily_verses")
//         .select("grade_code, ref_text, content")
//         .eq("day_key", selectedDayKey);

//       if (error) throw error;

//       const rows = data ?? [];

//       //  2) DB에 그 날짜 말씀이 하나라도 있으면:
//       if (rows.length > 0) {
//         // content가 빈 것도 있을 수 있으니 걸러주기
//         const valid = rows
//           .map((r) => ({
//             grade_code: Number(r.grade_code),
//             ref_text: String(r.ref_text ?? "").trim(),
//             content: String(r.content ?? "").trim(),
//           }))
//           .filter((r) => r.content.length > 0);

//         if (valid.length === 0) {
//           // 데이터는 있는데 전부 비어있으면 샘플로
//           const idx = pickIndexBySeed(`sample:${selectedDayKey}`, SAMPLE_VERSES.length);
//           setVerseRef(SAMPLE_VERSES[idx].ref);
//           setVerseLines(SAMPLE_VERSES[idx].lines);
//           return;
//         }

//         // 내 학년 우선
//         const mine =
//           Number.isFinite(myGrade) ? valid.find((r) => r.grade_code === myGrade) : null;

//         const chosen = mine
//           ? mine
//           : valid[pickIndexBySeed(`fallback:${selectedDayKey}`, valid.length)];

//         setVerseRef(chosen.ref_text || "");
//         const lines = chosen.content
//           .split("\n")
//           .map((s) => s.trim())
//           .filter(Boolean);

//         setVerseLines(lines);
//         return;
//       }

//       //  3) 그 날짜에 말씀이 하나도 없으면 샘플에서 날짜 고정 랜덤
//       const idx = pickIndexBySeed(`sample:${selectedDayKey}`, SAMPLE_VERSES.length);
//       setVerseRef(SAMPLE_VERSES[idx].ref);
//       setVerseLines(SAMPLE_VERSES[idx].lines);
//     } catch (err) {
//       console.error("load daily_verses fallback error:", err);

//       // 에러가 나도 화면이 비면 썰렁하니까 샘플 하나라도
//       const idx = pickIndexBySeed(`sample:${selectedDayKey}`, SAMPLE_VERSES.length);
//       setVerseRef(SAMPLE_VERSES[idx].ref);
//       setVerseLines(SAMPLE_VERSES[idx].lines);
//     }
//   };

//   run();
// }, [me?.id, selectedDayKey, profile?.grade_code]);


  // =======================
  // 아이콘/닉네임
  // =======================
  const kidIconSrc = profile?.is_male ? "/icon_boy.png" : "/icon_girl.png";
  const kidAlt = profile?.is_male ? "남아" : "여아";
  const kidName = profile?.nickname ?? "닉네임";

  // ✅ 풀스크린 로딩 스플래시 (이중 스플래시 방지)
  // - index.html의 boot-splash가 있으면 여기서는 또 띄우지 않음
  if (loading) {
    const hasBootSplash =
      typeof document !== "undefined" && document.getElementById("boot-splash");

    if (hasBootSplash) return null;

    return (
      <div className="app-splash" role="status" aria-live="polite">
        <div className="app-splash-inner">
          <img className="app-splash-logo" src="/logo-192.png" alt="초등 스터디 플래너" />
          <div className="app-splash-text">초등 스터디 플래너</div>
          <div className="app-splash-sub">불러오는 중...</div>
        </div>
      </div>
    );
  }

  // =======================
  // 로그아웃
  // =======================
  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: "local" });

    // PROFILE_CACHE_KEY는 위에서 선언되어 있어야 합니다.
    // (만약 위에서 지웠다면: const PROFILE_CACHE_KEY = "planner_profile_cache_v1"; 를 다시 넣어주세요.)
    try {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    } catch (e) {
      console.warn("프로필 캐시 삭제 실패", e);
    }

    navigate("/login");
  };

  // =======================
  // 달력 모달 열기/닫기
  // =======================
  const openCalendar = () => {
    const d = selectedDate;
    setCalMonth({ y: d.getFullYear(), m: d.getMonth() });
    setShowCalendarModal(true);
  };

  const closeCalendar = () => setShowCalendarModal(false);


  // =======================
  // 푸터
  // =======================
  const openGrapeSeed = () => {
    const ua = navigator.userAgent.toLowerCase();

    // 1) PC/모바일 공통으로 먼저 시도할 "학생 웹"
    const studentWeb = "https://students.grapeseed.com"; // 공식 학생 웹(일반적으로 이쪽이 기본)

    // 2) 스토어 링크 (너가 적어준 것 그대로 OK)
    const playStore = "https://play.google.com/store/apps/details?id=com.studentrep_rn";
    const appStore  = "https://apps.apple.com/kr/app/grapeseed-student/id1286949700";

    // 0) 문자열 includes 사용 (contains는 JS에 없음!)
    const isAndroid = ua.includes("android");
    const isIOS = ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod");

    // 1) 일단 학생 웹을 열어본다 (유효하지 않다 팝업이 안 뜸)
    //    - 같은 탭에서 열면 사용자가 "뒤로가기"도 편함
    window.location.href = studentWeb;

    // 2) '웹으로 갔는데도 앱이 안 열리는' 사용자에게 선택권을 주기 위해
    //    잠깐 뒤 스토어로 유도(원하면 이 부분은 confirm으로 바꿔도 됨)
    setTimeout(() => {
      if (isAndroid) {
        window.location.href = playStore;
      } else if (isIOS) {
        window.location.href = appStore;
      } else {
        // PC는 이미 studentWeb로 갔을 테니, 여기선 추가 동작 없어도 됨
        // 필요하면 새 탭으로 열기:
        // window.open(studentWeb, "_blank");
      }
    }, 1500);
  };


  // =======================
  // 렌더
  // =======================
  return (
    <div className="planner notranslate">
      <header className="top-header">
        <div className="top-row">
          <h1
            className="app-title app-title-link"
            title="마이페이지로 이동"
            onClick={() => navigate("/mypage")}
          >
            초등 스터디 플래너
          </h1>



        {/* 관리자버튼 */}
          <div className="top-right">
            {/* 관리자만 보이는 버튼 */}
            {(me?.email === "kara@kara.com" || profile?.is_admin === true) && (
              <button
                type="button"
                className="admin-link-btn"
                onClick={() => navigate("/admin")}
                title="관리자 페이지"
              >
                관리자
              </button>
            )}

            <div className="weather" title="오늘의 날씨">
              <WeatherIcon code={weatherCode} size={52} />
            </div>
          </div>




          {/* <div className="weather" title="오늘의 날씨">
            <WeatherIcon code={weatherCode} size={52} />
          </div> */}

          

        </div>

        <div className="sub-row">
          {/* <div
            className={`kid-name ${profile?.is_male ? "kid-boy" : "kid-girl"} clickable`}
            onClick={() => navigate("/mypage")}
            title="마이페이지로 이동"
          >
            <img src={kidIconSrc} alt={kidAlt} />
            {kidName}
          </div> */}
          <div
            className={`kid-name ${profile?.is_male ? "kid-boy" : "kid-girl"} clickable`}
            onClick={() => navigate("/mypage")}
            title="마이페이지로 이동"
          >
            <img src={kidIconSrc} alt={kidAlt} />
            {kidName}

            {/* 닉네임 옆 레벨 표시 */}
            <span className="level-badge" title="내 레벨(도장 기반)">
              Lev.{myLevelInfo.level}
            </span>
          </div>


          <div className="date-stack">
            <div className="today-row" title="선택한 날짜">
              <span className="today">{formatSelectedKorean()}</span>

              <button type="button" className="cal-btn" ref={refCalendarBtn} onClick={openCalendar} title="달력 열기">
                <svg
                  className="cal-btn-ico"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="18" rx="3" ry="3" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span className="cal-btn-text">달력</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 버튼 */}
      <div className="todo-bar todo-bar-grid">
        <div className="todo-bar-actions">
          <button
            type="button"
            className="preset-btn preset-btn-primary"
            ref={refLoadBtn}
            onClick={openLoadModal}
            disabled={importingSample || busyMyList || isPastSelected} 
          >
            {importingSample || busyMyList ? "불러오는 중..." : "📂 목록 불러오기"}
          </button>

          <button className="preset-btn preset-btn-ghost" onClick={openMyListSaveModal}>
            💾 내 목록 저장
          </button>
        </div>

        <div className="todo-bar-inputs">
          <input
            value={todo}
            onChange={handleChange}
            placeholder="새로운 내용을 입력하세요"
            ref={refInput}
            className="todo-input"
            disabled={isPastSelected}
            onKeyDown={(e) => {
              if (e.key === "Enter" && todo.trim()) addTodo();
            }}
          />
          <button
            className={`todo-add-btn ${todo.trim() ? "active" : ""}`}
            ref={refAddBtn}
            onClick={addTodo}
            disabled={!todo.trim()}
          >
            입력
          </button>
        </div>
      </div>

      {/* 필터 + 정렬 */}
      <div className="filter-bar filter-bar-split">
        <div className="filter-group-left">
          {reorderMode ? (
            <span className="reorder-hint" aria-live="polite">
              현재 목록 순서 변경중...
            </span>
          ) : (
            <>
              <button
                type="button"
                className={`filter-btn ${filter === "all" ? "active" : ""}`}
                onClick={() => setFilter("all")}
              >
                전체 ({todos.length})
              </button>

              <button
                className={`filter-btn ${filter === "completed" ? "active" : ""}`}
                onClick={() => {
                  setFilter("completed");
                  setReorderMode(false);
                }}
              >
                했음({doneCount})
              </button>

              <button
                className={`filter-btn ${filter === "uncompleted" ? "active" : ""}`}
                onClick={() => {
                  setFilter("uncompleted");
                  setReorderMode(false);
                }}
              >
                안했음({notDoneCount})
              </button>
            </>
          )}
        </div>

        {filter === "all" && (
          <button
            type="button"
            className={`filter-btn filter-btn-nowrap ${reorderMode ? "active" : ""}`}
            disabled={isPastSelected}
            onClick={async () => {
              const next = !reorderMode;
              if (next) setFilter("all");
              setReorderMode(next);
              if (next) {
                await ensureSortOrderForDay();
              }
            }}
            title={reorderMode ? "순서 변경 종료" : "순서 변경하기"}
          >
            {reorderMode ? "순서변경완료" : "순서변경하기"}
          </button>
        )}
      </div>

      <ul ref={refTodoList} className="todo-list" >
        {/* 할 일 목록 영역 */}
        {(filteredTodos ?? []).length === 0 ? (
          <div className="empty-todo">
            오늘 일정이 없습니다.
          </div>
        ) : (
          <ul>
            {filteredTodos.map((t, idx) => (
              <TodoItem
                key={t.id}
                t={t}
                onToggle={onToggle}
                onDelete={onDelete}
                reorderMode={reorderMode}
                onMoveUp={moveTodoUp}
                onMoveDown={moveTodoDown}
                isFirst={idx === 0}
                isLast={idx === filteredTodos.length - 1}
                readOnly={isPastSelected} 

                /* 삭제 모드용 */
                deleteMode={deleteMode}
                deleteChecked={selectedDeleteIds.has(t.id)}
                onToggleDeleteCheck={() => toggleSelectForDelete(t.id)}
              />
            ))}
          </ul>
        )}

      </ul>

      {/* 삭제 툴바 */}
        <div className="delete-toolbar">
          {!deleteMode ? (
            <button
              type="button"
              className={`filter-btn reorder-btn ${deleteMode ? "active" : ""}`}
              onClick={() => {
                if ((filteredTodos ?? []).length === 0) {
                  alert("삭제할 것이 없어요 🙂");
                  return;
                }

                setDeleteMode(true);
                clearAllForDelete();
              }}
            >
              삭제
            </button>

          ) : (
            <div className="delete-mode-row">
              <div className="filter-group-left" style={{ flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="filter-btn reorder-btn"
                  onClick={toggleSelectAllForDelete} 
                >
                  <input
                    type="checkbox"
                    checked={
                      filteredTodos?.length > 0 &&
                      selectedDeleteIds.size === filteredTodos.length
                    }
                    readOnly
                    onClick={(e) => e.stopPropagation()}
                    className="select-all-checkbox"
                  />
                  {/* 전부 선택되면 "모두 해제"로 글자 바꾸기 */}
                  {filteredTodos?.length > 0 && selectedDeleteIds.size === filteredTodos.length
                    ? "모두 해제"
                    : "모두 선택"}
                </button>

                <button
                  type="button"
                  className={`filter-btn ${selectedDeleteIds.size > 0 ? "active" : ""}`}
                  onClick={deleteSelectedTodos}
                  disabled={selectedDeleteIds.size === 0}
                  title={selectedDeleteIds.size === 0 ? "삭제할 항목을 먼저 체크해 주세요" : "선택 항목 삭제"}
                >
                  선택 삭제 ({selectedDeleteIds.size})
                </button>

                <button
                  type="button"
                  className="filter-btn"
                  onClick={() => {
                    setDeleteMode(false);
                    clearAllForDelete();
                  }}
                >
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>


      <div className="finish">
        <span className="title">메모</span>

        <div className="afterstudy-box">
          {!afterStudyEditing ? (
            <div
              className={`afterstudy-text ${afterStudyText.trim() ? "" : "is-empty"}`}
              role="button"
              tabIndex={0}
              onClick={() => setAfterStudyEditing(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setAfterStudyEditing(true);
              }}
              title="눌러서 수정하기"
            >
              {afterStudyText.trim() ? afterStudyText : "수학 10문제 55초 / 리딩레이스 30km!! / 영어듣기 22분 / 숙제 다하면 놀기~"}
            </div>
          ) : (
            <input
              className="afterstudy-input"
              type="text"
              autoFocus
              value={afterStudyText}
              placeholder="수학 10문제 55초 / 리딩레이스 30km!! / 영어듣기 22분 / 숙제 다하면 놀기~"
              onChange={(e) => {
                const v = e.target.value;
                setAfterStudyText(v);

                if (!me?.id) return;
                const key = `afterStudyText:${me.id}:${selectedDayKey}`;
                try {
                  localStorage.setItem(key, v);
                } catch (err) {
                  console.warn("afterStudyText localStorage write fail:", err);
                }
              }}
              onBlur={() => {
                if (me?.id) {
                  const key = `afterStudyText:${me.id}:${selectedDayKey}`;
                  try {
                    localStorage.setItem(key, afterStudyText);
                  } catch (err) {
                    console.warn("afterStudyText localStorage write fail:", err);
                  }
                }
                setAfterStudyEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setAfterStudyEditing(false);
              }}
            />
          )}
        </div>
      </div>

      {/* 명예의 전당 */}
      <HallOfFameCard hofLoading={hofLoading} hof={hof} meId={me?.id} cutName6={cutName6} />

      {/* 학습 도구들 */}
      <StudyTools
        formatTime={formatTime}
        elapsedMs={elapsedMs}
        isRunning={isRunning}
        startStopwatch={startStopwatch}
        stopStopwatch={stopStopwatch}
        resetStopwatch={resetStopwatch}
        TIMER_PRESETS={TIMER_PRESETS}
        timerMin={timerMin}
        setTimerMin={setTimerMin}
        timerRunning={timerRunning}
        formatMMSS={formatMMSS}
        remainingSec={remainingSec}
        startTimer={startTimer}
        pauseTimer={pauseTimer}
        resetTimer={resetTimer}
        timerSoundOn={timerSoundOn}
        setTimerSoundOn={setTimerSoundOn}
        hagadaCount={hagadaCount}
        increaseHagada={increaseHagada}
        resetHagada={resetHagada}
      />

      {Number(profile?.grade_code) === 2 && verseLines.length > 0 && (
        <div className="verse-box" aria-label="오늘의 말씀">
         <div className="verse-header">
            <span className="verse-title">오늘의 말씀</span>

            {verseRef && (
              <span className="verse-ref">
                {verseRef}
              </span>
            )}
          </div>

          <div className="verse-text">
            {verseLines.map((line, idx) => (
              <span
                key={`${selectedDayKey}-${idx}`}
                className="verse-chunk"
                style={{ color: pickStableColor(`${selectedDayKey}:${idx}`) }}
              >
                {line}{idx < verseLines.length - 1 ? " " : ""}
              </span>
            ))}
          </div>
        </div>
      )}





      <LoadScheduleModal
        open={showLoadModal}
        onClose={closeLoadModal}
        selectedDayKey={selectedDayKey}
        loadChoice={loadChoice}
        setLoadChoice={setLoadChoice}
        hasMyList={hasMyList}
        sampleModeReplace={sampleModeReplace}
        setSampleModeReplace={setSampleModeReplace}
        loadReplace={loadReplace}
        setLoadReplace={setLoadReplace}
        importingSample={importingSample}
        busyMyList={busyMyList}
        importMySingleList={importMySingleList}
        importSampleTodos={importSampleTodos}
        userId={me?.id}
      />

      <MyListSaveModal
        open={showMyListModal}
        onClose={closeMyListModal}
        busyMyList={busyMyList}
        onSaveMyList={saveMySingleList}
      />

      <CalendarModal
        open={showCalendarModal}
        onClose={closeCalendar}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        calMonth={calMonth}
        setCalMonth={setCalMonth}
        doneDayKeys={doneDayKeys}
      />

      <HelpModal open={showHelpModal} onClose={closeHelp} />

      <OnboardingTour
        open={tourOpen}
        stepIndex={tourStep}
        steps={tourSteps}
        onClose={closeTour}
        onChangeStep={setTourStep}
      />

      <ConfirmModal
        open={deleteTargetId !== null}
        title="삭제 확인"
        message="정말 삭제하시겠습니까?"
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={() => {
          onDelete(deleteTargetId);
          setDeleteTargetId(null);
        }}
      />


      {/* 레벨업 트로피 모달 */}
      {levelUpOpen && (
        <div className="levelup-overlay" role="dialog" aria-modal="true" aria-label="레벨 업">
          <div className="levelup-card">
            <div className="levelup-trophy-emoji" aria-hidden="true">🏆</div>

            <div className="levelup-title">레벨이 올랐습니다!</div>
            <div className="levelup-sub">축하해요 🎉 지금은</div>
            <div className="levelup-level">Lev.{levelUpNewLevel}</div>

            <button type="button" className="levelup-btn" onClick={closeLevelUp}>
              확인
            </button>
          </div>
        </div>
      )}


      <footer className="planner-footer-simple">
        <div className="footer-links">
          <a className="footer-link-primary" onClick={() => navigate("/mypage")}>
            😊마이페이지
          </a>
          <span>|</span>
          <a
            className="footer-link-secondary"
            href="https://rd.dreamschool.or.kr/"
            target="_blank"
            role="button"
            title="리딩레이스"
          >
           🏃‍♂️리딩레이스
          </a>
          <span>|</span>
          <a
            className="footer-link-secondary"
            onClick={openGrapeSeed}
            role="button"
            title="그레이프시드 Student 앱 열기"
          >
            🍇그레이프시드
          </a>
          <span>|</span>
        
          <a onClick={openHelp}>❓도움말</a>
           <span>|</span>

          <a onClick={handleLogout}>로그아웃</a>
        </div>
        <div className="footer-copy">© {new Date().getFullYear()} Study Planner</div>
      </footer>
    </div>
  );
}

export default Planner;