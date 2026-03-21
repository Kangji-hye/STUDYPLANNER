// src/pages/Planner.jsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  lazy,
  Suspense,
} from "react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import TodoItem from "../components/TodoItem";
import supabase from "../supabaseClient";
import "./Planner.css";
import { useWeatherYongin } from "../hooks/useWeatherYongin";
import WeatherIcon from "../components/WeatherIcon";
import { useSoundSettings } from "../context/SoundSettingsContext";

import { toKstDayKey } from "../utils/dateKst";
import { useBootSplash } from "../hooks/useBootSplash";
import { useRestoreToToday } from "../hooks/useRestoreToToday";
import { useDoneDaysForMonth } from "../hooks/useDoneDaysForMonth";
import { calcLevelFromStamps } from "../utils/leveling";
import HamburgerMenu from "../components/common/HamburgerMenu";
import { useAppSounds } from "../hooks/useAppSounds";

const LoadScheduleModal = lazy(() => import("../components/planner/LoadScheduleModal"));
const MyListSaveModal = lazy(() => import("../components/planner/MyListSaveModal"));
const CalendarModal = lazy(() => import("../components/planner/CalendarModal"));
const HelpModal = lazy(() => import("../components/planner/HelpModal"));
const OnboardingTour = lazy(() => import("../components/planner/OnboardingTour"));
const HallOfFameCard = lazy(() => import("../components/planner/HallOfFameCard"));
const StudyTools = lazy(() => import("../components/planner/StudyTools"));

const EMOJI_POOL = [
  "👍", "😀", "😄", "😁", "😆", "🙂", "😊", "🥰", "😍", "🤩", "🤗", "😎", "🥳",
  "😺", "🐶", "🐰", "🐻", "🐼", "🐯", "🦁", "🐣", "🦅", "🦄",
  "🐝", "🐞", "🐜", "🪲", "🦕", "🐠", "🦈", "🐬", "🐋", "🐘",
  "🌼", "🌻", "🌷", "🌹", "🌱", "🌿", "🍀", "🌈", "🌟", "✨", "⚡", "🔥", "☃️",
  "🎈", "🎉", "🎊", "🎁", "🎀", "🍰", "🍭", "🍬", "🍉", "🍇", "🍓", "🍒", "🥕", "🎲", "🧩",
  "🚗", "🚌", "🚓", "🚒", "🚜", "🚀", "✈️", "🚁", "🚲", "⚽", "🏀", "🏈", "🎯",
];

// 명예의 전당 닉네임 표시용(최대 6글자)
const cutName6 = (name) => {
  const s = String(name ?? "").trim();
  if (!s) return "익명";
  const chars = Array.from(s);
  if (chars.length <= 6) return s;
  return chars.slice(0, 6).join("");
};

// 생년월일에서 학년 코드 계산
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

// 세션 대기(Auth 세션이 늦게 잡히는 기기 대비)
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

/*
  알림 설정 로드
  - kind에 해당하는 활성 알림 중, 오늘 날짜가 start~end 범위 안에 걸리는 것 1개만 선택
*/
async function fetchTodayAlarm(kind) {
  const today = new Date();

  const { data, error } = await supabase
    .from("alarm_settings")
    .select("*")
    .eq("kind", kind)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (error) {
    console.warn("fetchTodayAlarm error:", error);
    return null;
  }
  if (!data || data.length === 0) return null;

  const toDateOrNull = (v, endOfDay) => {
    const s = String(v ?? "").trim();
    if (!s) return null;
    return new Date(`${s}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  };

  const isInRange = (row) => {
    const s = toDateOrNull(row.start_day, false);
    const e = toDateOrNull(row.end_day, true);

    if (s && today < s) return false;
    if (e && today > e) return false;
    return true;
  };

  const row = data.find((r) => isInRange(r));
  return row ?? null;
}

// 브라우저 알림 띄우기
async function showLocalNotification({ title, body }) {
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, {
          body,
          icon: "/pwa-192x192.png",
          badge: "/pwa-192x192.png",
        });
        return;
      }
    }

    new Notification(title, { body });
  } catch (e) {
    console.warn("showLocalNotification failed:", e);
  }
}

// 메인 플래너 페이지
function Planner() {
  const navigate = useNavigate();
  const { finishEnabled } = useSoundSettings();
  const DEFAULT_FINISH_SOUND = "/finish5.mp3";

  // 기본 상태
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

  const [homeworkItems, setHomeworkItems] = useState([]);
  const [homeworkImages, setHomeworkImages] = useState([]); // 오늘 숙제 이미지 [{path, url}]
  const [hasDictation, setHasDictation] = useState(null); // null=로딩중, true=있음, false=없음
  const [weekHwImgUrl, setWeekHwImgUrl] = useState("");   // 슬롯 1: 일주일 전체숙제
  const [weekHwImgUrl2, setWeekHwImgUrl2] = useState(""); // 슬롯 2: 주간학습안내
  // 이미지 뷰어 모달 (주간 숙제 + 오늘 숙제 이미지 공용)
  const [imgViewerUrl, setImgViewerUrl] = useState("");
  const [imgViewerOpen, setImgViewerOpen] = useState(false);

  useBootSplash(loading);

  // 데일리: 선택 날짜
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  useRestoreToToday(setSelectedDate);

  const selectedDayKey = useMemo(() => toKstDayKey(selectedDate), [selectedDate]);
  const todayDayKey = toKstDayKey(new Date());
  const isPastSelected = selectedDayKey < todayDayKey;

  // fetch 레이스 방지(마지막 요청만 반영)
  const selectedDayKeyRef = useRef(selectedDayKey);
  useEffect(() => {
    selectedDayKeyRef.current = selectedDayKey;
  }, [selectedDayKey]);
  const fetchTodosSeqRef = useRef(0);

  // 달력 모달
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // 달력 도장
  const doneDayKeys = useDoneDaysForMonth({
    open: showCalendarModal,
    userId: me?.id,
    calMonth,
  });

  // 도움말
  const [showHelpModal, setShowHelpModal] = useState(false);
  const openHelp = () => setShowHelpModal(true);
  const closeHelp = () => setShowHelpModal(false);

  // 프로필(캐시)
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

  // 완료 사운드
  const { playTodoDone, playTimerEnd, playAllDone } = useAppSounds({
    todoDoneSrc: "/done.mp3",
    timerEndSrc: "/time1.mp3",
    allDoneDefaultSrc: DEFAULT_FINISH_SOUND,
    finishEnabled,
  });

  // 오디오 “사용자 상호작용 후” 재생 허용 장치
  const soundArmedRef = useRef(false);
  useEffect(() => {
    const arm = () => {
      soundArmedRef.current = true;
    };
    window.addEventListener("pointerdown", arm, { once: true });
    window.addEventListener("keydown", arm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);

  // todos ref(최신값 유지)
  const todosRef = useRef([]);
  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  // 모달 관련
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [loadChoice, setLoadChoice] = useState("vacation");
  const [sampleModeReplace, setSampleModeReplace] = useState(false);
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
  const [showMyListModal, setShowMyListModal] = useState(false);
  const [loadReplace, setLoadReplace] = useState(false);
  const [busyMyList, setBusyMyList] = useState(false);
  const [hasMyList, setHasMyList] = useState(false);

  const openLoadModal = () => {
    setLoadChoice(hasMyList ? "my" : "vacation");
    setSampleModeReplace(false);
    setLoadReplace(false);
    setShowLoadModal(true);
  };
  const closeLoadModal = () => {
    if (importingSample || busyMyList) return;
    setShowLoadModal(false);
  };

  const openMyListSaveModal = () => setShowMyListModal(true);
  const closeMyListModal = () => {
    if (busyMyList) return;
    setShowMyListModal(false);
  };

  // 레벨업 모달
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [levelUpNewLevel, setLevelUpNewLevel] = useState(1);
  const closeLevelUp = () => setLevelUpOpen(false);

  // 내 도장 개수(명예의 전당 기록 수)
  const [stampCount, setStampCount] = useState(0);
  const myLevelInfo = useMemo(() => calcLevelFromStamps(stampCount), [stampCount]);

  // 명예의 전당
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

  const fetchHallOfFame = useCallback(
    async (dayKey) => {
      setHofLoading(true);
      try {
        const { data, error } = await supabase
          .from("hall_of_fame")
          .select("user_id, nickname, finished_at")
          .eq("day_key", dayKey);

        if (error) throw error;

        const rows = data ?? [];
        const myId = me?.id;

        const mine = myId ? rows.find((r) => r.user_id === myId) : null;
        const others = myId ? rows.filter((r) => r.user_id !== myId) : rows;
        const mixedOthers = shuffleArray(others);

        setHof(mine ? [mine, ...mixedOthers] : mixedOthers);
      } catch (err) {
        console.error("fetchHallOfFame error:", err);
        setHof([]);
      } finally {
        setHofLoading(false);
      }
    },
    [me?.id]
  );

  const recordCompletionForDay = useCallback(
    async (dayKey) => {
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
    },
    [me?.id, profile?.nickname, fetchHallOfFame]
  );

  const removeCompletionForDay = useCallback(
    async (dayKey) => {
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
    },
    [me?.id, fetchHallOfFame]
  );

  const fetchMyStampCountNumber = useCallback(async (userId) => {
    const { count, error } = await supabase
      .from("hall_of_fame")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    if (error) throw error;
    return count ?? 0;
  }, []);

  const formatSelectedKorean = () => {
    const d = selectedDate;
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const day = days[d.getDay()];
    return `${y}-${m}-${dd} (${day})`;
  };

  const VERSE_COLORS = ["#e11d48", "#2563eb", "#16a34a", "#f97316", "#7c3aed", "#0f766e"];
  function pickStableColor(seedText) {
    const s = String(seedText ?? "");
    let sum = 0;
    for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
    return VERSE_COLORS[sum % VERSE_COLORS.length];
  }

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

  function pickIndexBySeed(seedText, mod) {
    const s = String(seedText ?? "");
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return mod <= 0 ? 0 : h % mod;
  }

  // 불필요한 렌더 부담을 줄이기 위해 confetti는 그대로 두되, 호출은 필요한 순간만
  const fireConfetti = () => {
    confetti({
      particleCount: 140,
      spread: 90,
      origin: { y: 0.62 },
      colors: ["#ff7aa2", "#ffb86b", "#ffd166", "#a0e7e5"],
    });
  };

  const getRandomEmoji = () => {
    const available = EMOJI_POOL.filter((emoji) => !usedEmojis.includes(emoji));
    const pool = available.length > 0 ? available : EMOJI_POOL;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    setUsedEmojis((prev) => (available.length > 0 ? [...prev, selected] : [selected]));
    return selected;
  };

  // todo 로딩
  const fetchTodos = useCallback(async (userId, dayKey) => {
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
    if (mySeq === fetchTodosSeqRef.current && dayKey === selectedDayKeyRef.current) {
      setTodos(rows);
    }
    return rows;
  }, []);

  const seedSampleTodosIfEmpty = useCallback(
    async ({ userId, dayKey, existingCount }) => {
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
        } catch {
          //
        }
      }
    },
    [usedEmojis]
  );

  const fetchMySingleListInfo = useCallback(async (userId) => {
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
  }, []);

  // "YYYY-MM-DD" -> Date
  function dayKeyToDate(dayKey) {
    const [y, m, d] = String(dayKey).split("-").map((x) => Number(x));
    return new Date(y, (m || 1) - 1, d || 1);
  }

  // Date -> "YYYY-MM-DD"
  function dateToDayKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  // 선택된 날짜가 속한 "그 주 월요일" 키
  function getWeekStartDayKeyFromSelected(dayKey) {
    const d = dayKeyToDate(dayKey);
    const day = d.getDay(); // 0(일)~6(토)
    const diffToMon = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diffToMon);
    return dateToDayKey(d);
  }

  // 샘플/내목록 불러오기 공통
  const makeImportBatchId = () => {
    try {
      return crypto.randomUUID();
    } catch {
      return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
  };

  const autoImportMyListIfEmptyToday = useCallback(
    async ({ userId, dayKey }) => {
      if (!userId || !dayKey) return;
      if (dayKey !== toKstDayKey(new Date())) return;

      const onceKey = `auto_mylist_loaded_v1:${userId}:${dayKey}`;
      try {
        if (localStorage.getItem(onceKey) === "1") return;
      } catch {
        //
      }

      const current = todosRef.current ?? [];
      if (current.length > 0) return;

      try {
        const { data: setRow, error: setErr } = await supabase
          .from("todo_sets")
          .select("id")
          .eq("user_id", userId)
          .eq("kind", "single")
          .maybeSingle();

        if (setErr) throw setErr;
        if (!setRow?.id) return;

        const { data: items, error: itemsErr } = await supabase
          .from("todo_set_items")
          .select("item_key, title, sort_order")
          .eq("set_id", setRow.id)
          .order("sort_order", { ascending: true });

        if (itemsErr) throw itemsErr;

        const rows = (items ?? [])
          .map((x) => {
            const base = Number(x.sort_order ?? 0) || 0;
            const itemKey = String(x.item_key ?? "").trim();

            return {
              user_id: userId,
              day_key: dayKey,
              title: String(x.title ?? "").trim(),
              completed: false,
              sort_order: base,
              source_set_item_key: `${dayKey}:auto_single:${itemKey}`,
            };
          })
          .filter((x) => x.title && x.source_set_item_key);

        if (rows.length === 0) return;

        const { error: upErr } = await supabase.from("todos").upsert(rows, {
          onConflict: "user_id,source_set_item_key",
          ignoreDuplicates: true,
        });
        if (upErr) throw upErr;

        await fetchTodos(userId, dayKey);

        try {
          localStorage.setItem(onceKey, "1");
        } catch {
          //
        }
      } catch (e) {
        console.error("autoImportMyListIfEmptyToday error:", e);
      }
    },
    [fetchTodos]
  );

  const importSampleTodos = async (sampleKeyOverride) => {
    if (!me?.id) return;
    if (importingSample) return;

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

  // 정렬 보정
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

  // todos CRUD
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

    if (!item.completed) {
      if (soundArmedRef.current) playTodoDone();
    }

    if (!wasAllCompleted && willAllCompleted) {
      fireConfetti();
      if (soundArmedRef.current) playAllDone(profile?.finish_sound);
    }

    setTodos(nextTodos);

    try {
      const { error } = await supabase
        .from("todos")
        .update({ completed: !item.completed })
        .eq("id", item.id);

      if (error) throw error;

      if (!wasAllCompleted && willAllCompleted) {
        await recordCompletionForDay(selectedDayKey);

        const afterCount = await fetchMyStampCountNumber(me.id);
        const estimatedBefore = Math.max(0, afterCount - 1);

        const beforeLv = calcLevelFromStamps(estimatedBefore).level;
        const afterLv = calcLevelFromStamps(afterCount).level;

        if (afterLv > beforeLv) {
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

  // 삭제 모드
  const toggleSelectForDelete = (todoId) => {
    setSelectedDeleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(todoId)) next.delete(todoId);
      else next.add(todoId);
      return next;
    });
  };

  const clearAllForDelete = () => setSelectedDeleteIds(new Set());

  const toggleSelectAllForDelete = () => {
    const list = filteredTodos ?? [];
    if (list.length === 0) {
      alert("선택할 것이 없어요 🙂");
      return;
    }
    const isAllSelected = selectedDeleteIds.size === list.length;
    if (isAllSelected) {
      clearAllForDelete();
    } else {
      setSelectedDeleteIds(new Set(list.map((t) => t.id)));
    }
  };

  const deleteSelectedTodos = async () => {
    if (!me?.id) return;

    const ids = Array.from(selectedDeleteIds);
    if (ids.length === 0) {
      alert("삭제할 항목을 선택해 주세요.");
      return;
    }
    try {
      const { error } = await supabase
        .from("todos")
        .delete()
        .eq("user_id", me.id)
        .in("id", ids);

      if (error) throw error;

      const next = (todosRef.current ?? []).filter((x) => !selectedDeleteIds.has(x.id));
      setTodos(next);

      const isAllCompleted = next.length > 0 && next.every((x) => x.completed);
      if (!isAllCompleted) await removeCompletionForDay(selectedDayKey);

      clearAllForDelete();
      setDeleteMode(false);
    } catch (err) {
      console.error("deleteSelectedTodos error:", err);
      alert(err?.message ?? "삭제 중 오류가 발생했습니다.");
    }
  };

  // 스탑워치/타이머/하가다
  const [timerSoundOn, setTimerSoundOn] = useState(true);

  const [isRunning, setIsRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  const refCalendarBtn = useRef(null);
  const refInput = useRef(null);
  const refAddBtn = useRef(null);
  const refLoadBtn = useRef(null);
  const refTodoList = useRef(null);
  const refHamburgerMenu = useRef(null);

  const startTour = () => {
    setTourStep(0);
    setTourOpen(true);
  };

  const closeTour = () => {
    setTourOpen(false);
    try {
      const uid = me?.id ?? "anon";
      localStorage.setItem(`planner_tour_seen_v1:${uid}`, "1");
    } catch {
      //
    }
  };

  const tourSteps = useMemo(
    () => [
      {
        title: "목록 불러오기",
        body: (
          <>
            여기서 기본 목록/내 목록을 불러올 수 있어요.<br />
            처음이라면 한 번 눌러서 목록을 채워보세요.
          </>
        ),
        targetRef: refLoadBtn,
      },
      {
        title: "할 일 적기",
        body: (
          <>
            여기에 오늘 할 일을 적어요.<br />
            예) "수학 1장", "영어 10분" 같은 식으로요.
          </>
        ),
        targetRef: refInput,
      },
      {
        title: "입력 버튼",
        body: (
          <>
            다 적었으면 "입력"을 눌러서 목록에 추가해요.<br />
            키보드 Enter로도 추가할 수 있어요.
          </>
        ),
        targetRef: refAddBtn,
      },
      {
        title: "오늘 할 일 목록",
        body: (
          <>
            할 일을 끝내면 완료(체크)를 눌러요.<br />
            다 끝내면 축하 효과도 나와요.
          </>
        ),
        targetRef: refTodoList,
      },
      {
        title: "달력으로 날짜 바꾸기",
        body: (
          <>
            어제/내일 할 일을 보고 싶으면 달력을 눌러요.<br />
            완료한 날에는 도장이 찍혀요.
          </>
        ),
        targetRef: refCalendarBtn,
      },
      {
        title: "메뉴 열기",
        body: (
          <>
            여기에서 마이페이지, 랭킹, 로그아웃 같은<br />
            여러 메뉴를 사용할 수 있어요.
          </>
        ),
        targetRef: refHamburgerMenu,
      },
    ],
    []
  );

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
  // timerMin이 변경된 경우에만 remainingSec를 초기화 (멈춤 시 초기화 방지)
  const prevTimerMinRef = useRef(10);
  useEffect(() => {
    if (prevTimerMinRef.current === timerMin) return; // timerMin 변화 없으면 무시
    prevTimerMinRef.current = timerMin;
    if (timerRunning) return; // 실행 중엔 초기화 안 함
    setRemainingSec(timerMin * 60);
  }, [timerMin, timerRunning]);

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

  const timerEndedRef = useRef(false);
  useEffect(() => {
    if (remainingSec === 0 && !timerEndedRef.current) {
      timerEndedRef.current = true;
      if (!timerSoundOn) return;
      if (soundArmedRef.current) playTimerEnd();
    }
    if (remainingSec > 0) timerEndedRef.current = false;
  }, [remainingSec, timerSoundOn, playTimerEnd]);

  const [hagadaCount, setHagadaCount] = useState(0);
  const increaseHagada = () => setHagadaCount((prev) => prev + 1);
  const resetHagada = () => setHagadaCount(0);

  // 로그인/프로필/오늘 할일: "필수" 로딩만 먼저 처리
  useEffect(() => {
    let mounted = true;

    const loadCore = async () => {
      if (!mounted) return;
      setLoading(true);

      const session = await waitForAuthSession({ timeoutMs: 1500 });
      if (!session?.user) {
        if (!mounted) return;
        setLoading(false);
        navigate("/login", { replace: true });
        return;
      }

      const user = session.user;
      if (mounted) setMe(user);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, nickname, birthdate, is_male, finish_sound, grade_code, grade_manual, is_admin, alarm_enabled")
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
              grade_code: null,
              grade_manual: false,
              is_admin: false,
              alarm_enabled: true,
            }
          : profileData;

      // 학년 자동 계산(수동 설정이 없고 grade_code가 비어있을 때만)
      try {
        const hasBirth = String(nextProfile?.birthdate ?? "").trim().length > 0;
        const gradeManual = Boolean(nextProfile?.grade_manual);
        const hasGrade = Number.isFinite(Number(nextProfile?.grade_code));

        if (hasBirth && !gradeManual && !hasGrade) {
          const autoCode = calcGradeCodeFromBirthdate(nextProfile.birthdate);
          if (Number.isFinite(autoCode)) {
            nextProfile.grade_code = autoCode;
            nextProfile.grade_manual = false;

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
      } catch {
        //
      }

      // 프로필이 없던 첫 유저면 upsert
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
              grade_code: nextProfile.grade_code ?? null,
              grade_manual: Boolean(nextProfile.grade_manual ?? false),
              alarm_enabled: nextProfile.alarm_enabled ?? true,
            },
            { onConflict: "id" }
          );
        if (upsertErr) console.error("profiles upsert error:", upsertErr);
      }

      // 필수: 오늘 할일
      const loaded = await fetchTodos(user.id, selectedDayKey);

      // 내 목록 존재 여부 확인(필수는 아니지만, "빈 화면"일 때 자동 채우기 판단에 필요)
      const { id: myListId } = await fetchMySingleListInfo(user.id);

      // 내 목록이 있고 오늘이 비어 있으면 자동 주입
      if (myListId && loaded.length === 0) {
        await autoImportMyListIfEmptyToday({ userId: user.id, dayKey: selectedDayKey });
      }

      // 내 목록도 없고 비어 있으면 샘플 주입
      if (!myListId && loaded.length === 0) {
        await seedSampleTodosIfEmpty({
          userId: user.id,
          dayKey: selectedDayKey,
          existingCount: loaded.length,
        });
        await fetchTodos(user.id, selectedDayKey);
      }

      if (mounted) setLoading(false);

      // 부가 로딩은 화면이 뜬 뒤에 천천히
      const defer = (fn) => {
        if (typeof window.requestIdleCallback === "function") {
          window.requestIdleCallback(() => fn(), { timeout: 1200 });
        } else {
          setTimeout(() => fn(), 0);
        }
      };

      defer(() => fetchHallOfFame(selectedDayKey));
      defer(async () => {
        try {
          const count = await fetchMyStampCountNumber(user.id);
          if (mounted) setStampCount(count ?? 0);
        } catch (e) {
          console.warn("fetch stamp count error:", e);
        }
      });
    };

    loadCore();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // 날짜 변경 시: 할일은 즉시, 부가 정보는 약간 늦게
  useEffect(() => {
    if (!me?.id) return;

    const run = async () => {
      const rows = await fetchTodos(me.id, selectedDayKey);

      // 오늘이 비었고 내목록이 있으면 자동 주입(오늘만)
      if ((rows ?? []).length === 0 && hasMyList) {
        await autoImportMyListIfEmptyToday({ userId: me.id, dayKey: selectedDayKey });
      }

      const defer = (fn) => {
        if (typeof window.requestIdleCallback === "function") {
          window.requestIdleCallback(() => fn(), { timeout: 1200 });
        } else {
          setTimeout(() => fn(), 0);
        }
      };

      defer(() => fetchHallOfFame(selectedDayKey));
    };

    run();
  }, [selectedDayKey, me?.id, hasMyList, fetchTodos, fetchHallOfFame, autoImportMyListIfEmptyToday]);

  // 알림 예약: "한 번 읽어서 setTimeout 잡기" 방식만 유지
  useEffect(() => {
    if (!me?.id) return;
    if (loading) return;

    let timerId = null;

    const clearTimer = () => {
      if (timerId) {
        window.clearTimeout(timerId);
        timerId = null;
      }
    };

    const scheduleOnce = async () => {
      clearTimer();

      // 마이페이지에서 알림을 꺼둔 경우
      if (profile?.alarm_enabled === false) return;

      // 오늘의 알림 1개 선택
      const alarm = await fetchTodayAlarm("todo_remind");
      if (!alarm) return;

      const hhmm = String(alarm.time_hhmm || "19:30").trim();
      const parts = hhmm.split(":").map((x) => Number(x));
      const hh = Number.isFinite(parts[0]) ? parts[0] : 0;
      const mm = Number.isFinite(parts[1]) ? parts[1] : 0;

      const now = new Date();
      const target = new Date(now);
      target.setHours(hh, mm, 0, 0);

      const diffMs = target.getTime() - now.getTime();
      if (diffMs <= 0) return;

      timerId = window.setTimeout(() => {
        showLocalNotification({
          title: "초등 스터디 플래너",
          body: String(alarm.message || "").trim() || "오늘 할 일을 확인해 보세요.",
        });
      }, diffMs);
    };

    scheduleOnce();

    // 앱을 다시 열었을 때(백그라운드였다가 돌아올 때) 다시 예약
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleOnce();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [me?.id, loading, profile?.alarm_enabled]);

  // 명예의 전당 자동 새로고침(5분)
  useEffect(() => {
    if (!me?.id) return;
    const INTERVAL_MS = 5 * 60 * 1000;

    const intervalId = setInterval(() => {
      fetchHallOfFame(selectedDayKey);
    }, INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [me?.id, selectedDayKey, fetchHallOfFame]);

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

  // 첫 방문 투어 시작
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

  // 2학년만: 오늘의 말씀/숙제 로딩(부가 데이터이므로 core 로딩과 분리)
  useEffect(() => {
    if (!me?.id) return;

    const myGrade = Number(profile?.grade_code);
    const isSecondGrade = myGrade === 2;

    if (!isSecondGrade) {
      setVerseLines([]);
      setVerseRef("");
      return;
    }

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

          const mine = valid.find((r) => r.grade_code === 2);
          if (!mine) {
            setVerseLines([]);
            setVerseRef("");
            return;
          }

          setVerseRef(mine.ref_text || "");
          const lines = mine.content.split("\n").map((s) => s.trim()).filter(Boolean);
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

    const defer = () => run();
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(defer, { timeout: 1200 });
    } else {
      setTimeout(defer, 0);
    }
  }, [me?.id, selectedDayKey, profile?.grade_code]);

  useEffect(() => {
    if (!me?.id) return;

    const myGrade = Number(profile?.grade_code);
    const isSecondGrade = myGrade === 2;

    if (!isSecondGrade) {
      setHomeworkItems([]);
      setHomeworkImages([]);
      setWeekHwImgUrl("");
      setImgViewerOpen(false);
      return;
    }

    const run = async () => {
      try {
        const { data, error } = await supabase
          .from("daily_homeworks")
          .select("items, image_paths")
          .eq("day_key", selectedDayKey)
          .eq("grade_code", 2)
          .maybeSingle();

        if (error) throw error;

        const items = Array.isArray(data?.items) ? data.items : [];
        const normalized = items
          .map((x) => ({
            subject: String(x?.subject ?? "").trim(),
            content: String(x?.content ?? "").trim(),
          }))
          .filter((x) => x.subject.length > 0 && x.content.length > 0);

        setHomeworkItems(normalized);

        // 오늘 숙제 이미지
        const imgs = Array.isArray(data?.image_paths) ? data.image_paths : [];
        setHomeworkImages(imgs.filter((x) => x?.path && x?.url));

        const weekStart = getWeekStartDayKeyFromSelected(selectedDayKey);

        const { data: imgRow, error: imgErr } = await supabase
          .from("weekly_homework_images")
          .select("image_url, image_url_2")
          .eq("week_start_day", weekStart)
          .eq("grade_code", 2)
          .maybeSingle();

        if (imgErr) {
          console.error("load weekly_homework_images error:", imgErr);
          setWeekHwImgUrl("");
          setWeekHwImgUrl2("");
        } else {
          setWeekHwImgUrl(String(imgRow?.image_url ?? ""));
          setWeekHwImgUrl2(String(imgRow?.image_url_2 ?? ""));
        }
      } catch (err) {
        console.error("load daily_homeworks error:", err);
        setHomeworkItems([]);
        setHomeworkImages([]);
        setWeekHwImgUrl("");
      }
    };

    const defer = () => run();
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(defer, { timeout: 1200 });
    } else {
      setTimeout(defer, 0);
    }
  }, [me?.id, selectedDayKey, profile?.grade_code]);

  // 받아쓰기 유무 확인
  useEffect(() => {
    const gradeCode = profile?.grade_code;
    if (!gradeCode || !selectedDayKey) {
      setHasDictation(false);
      return;
    }
    let alive = true;
    supabase
      .from("dictation_items")
      .select("id", { count: "exact", head: true })
      .eq("grade_code", gradeCode)
      .eq("ymd", selectedDayKey)
      .then(({ count }) => {
        if (alive) setHasDictation((count ?? 0) > 0);
      });
    return () => { alive = false; };
  }, [selectedDayKey, profile?.grade_code]);

  const kidIconSrc = profile?.is_male ? "/icon_boy.png" : "/icon_girl.png";
  const kidAlt = profile?.is_male ? "남아" : "여아";
  const kidName = profile?.nickname ?? "닉네임";

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: "local" });
    try {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    } catch (e) {
      console.warn("프로필 캐시 삭제 실패", e);
    }
    navigate("/login");
  };

  const openCalendar = () => {
    const d = selectedDate;
    setCalMonth({ y: d.getFullYear(), m: d.getMonth() });
    setShowCalendarModal(true);
  };

  const closeCalendar = () => setShowCalendarModal(false);

  // 푸터: 그레이프시드 열기
  const openGrapeSeed = () => {
    const ua = navigator.userAgent.toLowerCase();
    const studentWeb = "https://students.grapeseed.com";
    const playStore = "https://play.google.com/store/apps/details?id=com.studentrep_rn";
    const appStore = "https://apps.apple.com/kr/app/grapeseed-student/id1286949700";
    const isAndroid = ua.includes("android");
    const isIOS = ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod");

    window.location.href = studentWeb;

    setTimeout(() => {
      if (isAndroid) window.location.href = playStore;
      else if (isIOS) window.location.href = appStore;
    }, 1500);
  };

  // 렌더
  return (
    <div className="planner notranslate">
      <header className="top-header">
        <div className="top-row">
          <h1
            className="app-title "
          >
            초등 스터디 플래너
          </h1>

          <div className="top-right">
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

            <div ref={refHamburgerMenu}>
              <HamburgerMenu />
            </div>
          </div>
        </div>

        <div className="sub-row">
          <div
            className={`kid-name ${profile?.is_male ? "kid-boy" : "kid-girl"} clickable`}
            onClick={() => navigate("/mypage")}
            title="마이페이지로 이동"
          >
            <img src={kidIconSrc} alt={kidAlt} />
            {kidName}

            <span className="level-badge" title="내 레벨(도장 기반)">
              Lev.{myLevelInfo.level}
            </span>
          </div>

          <div className="date-stack">
            <div className="today-row" title="선택한 날짜">
              <span className="today">{formatSelectedKorean()}</span>

              <div className="weather" title="오늘의 날씨">
                <WeatherIcon code={weatherCode} size={40} />
              </div>

              <button
                type="button"
                className="cal-btn"
                ref={refCalendarBtn}
                onClick={openCalendar}
                title="달력 열기"
              >
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
      </div>

      <div ref={refTodoList}>
        {(filteredTodos ?? []).length === 0 ? (
          <div className="empty-todo">오늘 일정이 없습니다.</div>
        ) : (
          <ul className="todo-list">
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
                deleteMode={deleteMode}
                deleteChecked={selectedDeleteIds.has(t.id)}
                onToggleDeleteCheck={() => toggleSelectForDelete(t.id)}
              />
            ))}
          </ul>
        )}

        <div className="todo-bottom-row">
          <div className="todo-bottom-left">
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
                    {filteredTodos?.length > 0 && selectedDeleteIds.size === filteredTodos.length
                      ? "모두 해제"
                      : "모두 선택"}
                  </button>

                  <button
                    type="button"
                    className={`filter-btn ${selectedDeleteIds.size > 0 ? "active" : ""}`}
                    onClick={async () => {
                      if (selectedDeleteIds.size === 0) {
                        alert("삭제할 항목을 먼저 선택해 주세요.");
                        return;
                      }

                      const ok = window.confirm(
                        `선택한 ${selectedDeleteIds.size}개를 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`
                      );

                      if (!ok) return;

                      await deleteSelectedTodos();
                    }}
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

          <div className="todo-bottom-right">
            {filter === "all" && !deleteMode && (
              <button
                type="button"
                className={`filter-btn filter-btn-nowrap ${reorderMode ? "active" : ""}`}
                disabled={isPastSelected}
                onClick={async () => {
                  const next = !reorderMode;
                  if (next) setFilter("all");
                  setReorderMode(next);
                  if (next) await ensureSortOrderForDay();
                }}
                title={reorderMode ? "순서 변경 종료" : "순서 변경하기"}
              >
                {reorderMode ? "순서변경완료" : "순서변경하기"}
              </button>
            )}
          </div>
        </div>
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
              {afterStudyText.trim()
                ? afterStudyText
                : "수학 10문제 55초 / 리딩레이스 30km!! / 영어듣기 22분 / 숙제 다하면 놀기~"}
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

      <Suspense fallback={null}>
        <HallOfFameCard hofLoading={hofLoading} hof={hof} meId={me?.id} cutName6={cutName6} />
      </Suspense>

      <Suspense fallback={null}>
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
      </Suspense>

      {Number(profile?.grade_code) === 2 && (
        <div className="homework-box" aria-label="오늘 숙제">
          <div className="homework-title">오늘 숙제</div>

          <div className="homework-text">
            {homeworkItems.length === 0 ? (
              <div className="homework-line" style={{ opacity: 0.7 }}></div>
            ) : (
              homeworkItems.map((it, idx) => (
                <div key={`${selectedDayKey}-hw-${idx}`} className="homework-line">
                  🔹{it.subject}: {it.content}
                </div>
              ))
            )}
          </div>

          <button type="button" onClick={() => navigate(`/dictation?ymd=${selectedDayKey}`)} style={{ backgroundColor: "#ff69b4", color: "#fff", borderColor: "#ff69b4" }}>
            ✍️ 오늘의 받아쓰기{hasDictation === false ? " (없음)" : ""}
          </button>

          {/* 오늘 숙제 이미지 썸네일 */}
          {homeworkImages.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              {homeworkImages.map((img, i) => (
                <button
                  key={`hw-img-${i}`}
                  type="button"
                  style={{
                    padding: 0,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    borderRadius: 10,
                    overflow: "hidden",
                    display: "block",
                  }}
                  onClick={() => { setImgViewerUrl(img.url); setImgViewerOpen(true); }}
                  aria-label={`숙제 이미지 ${i + 1} 크게 보기`}
                >
                  <img
                    src={img.url}
                    alt={`숙제 이미지 ${i + 1}`}
                    style={{
                      width: 72,
                      height: 72,
                      objectFit: "cover",
                      borderRadius: 10,
                      border: "1.5px solid rgba(0,0,0,0.1)",
                      display: "block",
                    }}
                  />
                </button>
              ))}
            </div>
          )}

          {weekHwImgUrl && (
            <button
              type="button"
              className="weekly-hw-btn"
              onClick={() => { setImgViewerUrl(weekHwImgUrl); setImgViewerOpen(true); }}
            >
              🖼️ 일주일 전체숙제
            </button>
          )}
          {weekHwImgUrl2 && (
            <button
              type="button"
              className="weekly-hw-btn"
              onClick={() => { setImgViewerUrl(weekHwImgUrl2); setImgViewerOpen(true); }}
            >
              📋 주간학습안내
            </button>
          )}

          {/* 이미지 뷰어 모달 (주간 숙제 + 오늘 숙제 이미지 공용) */}
          {imgViewerOpen && (
            <div
              className="weekly-hw-overlay"
              role="dialog"
              aria-modal="true"
              onClick={() => setImgViewerOpen(false)}
            >
              <div className="weekly-hw-card" onClick={(e) => e.stopPropagation()}>
                <div className="weekly-hw-image-wrap">
                  <img src={imgViewerUrl} alt="숙제 이미지" className="weekly-hw-image" />
                </div>

                <button
                  type="button"
                  onClick={() => setImgViewerOpen(false)}
                  className="weekly-hw-close"
                >
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {Number(profile?.grade_code) === 2 && verseLines.length > 0 && (
        <div className="verse-box" aria-label="오늘의 말씀">
          <div className="verse-header">
            <span className="verse-title">오늘의 말씀</span>
            {verseRef && <span className="verse-ref">{verseRef}</span>}
          </div>

          <div className="verse-text">
            {verseLines.map((line, idx) => (
              <span
                key={`${selectedDayKey}-${idx}`}
                className="verse-chunk"
                style={{ color: pickStableColor(`${selectedDayKey}:${idx}`) }}
              >
                {line}
                {idx < verseLines.length - 1 ? " " : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      <Suspense fallback={null}>
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
      </Suspense>

      {levelUpOpen && (
        <div className="levelup-overlay" role="dialog" aria-modal="true" aria-label="레벨 업">
          <div className="levelup-card">
            <div className="levelup-trophy-emoji" aria-hidden="true">
              🏆
            </div>

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
            onClick={() => navigate("/ranking")}
            role="button"
            title="레벨 랭킹 보기"
          >
            🏆 랭킹
          </a>
          <span>|</span>
          <a
            className="footer-link-secondary"
            href="https://rd.dreamschool.or.kr/"
            target="_blank"
            rel="noreferrer"
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
