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
import HallOfFameCard from "../components/planner/HallOfFameCard";
import StudyTools from "../components/planner/StudyTools";

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
  return s; 
};

// 첫 진입 샘플 주입 여부(로컬에서 1회만)
const FIRST_VISIT_SEED_KEY = "planner_seeded_v1";

// =======================
// KST 기준 YYYY-MM-DD
// =======================
const toKstDayKey = (dateObj = new Date()) => {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(dateObj);

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
};

async function waitForAuthSession({ timeoutMs = 4000 } = {}) {
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

// =======================
// 달력 그리드
// =======================
const buildMonthGrid = (year, monthIndex) => {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);

  const startDay = first.getDay();
  const totalDays = last.getDate();

  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, monthIndex, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

function Planner() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [todo, setTodo] = useState("");
  const [todos, setTodos] = useState([]);
  const [filter, setFilter] = useState("all");
  const [reorderMode, setReorderMode] = useState(false);
  const [usedEmojis, setUsedEmojis] = useState([]);
  const [afterStudyText, setAfterStudyText] = useState("");
  const [afterStudyEditing, setAfterStudyEditing] = useState(false);
  const { finishEnabled } = useSoundSettings();
  const [timerSoundOn, setTimerSoundOn] = useState(true); //false로 할까


// ✅ 앱이 실제로 준비되면(Planner 로딩 완료) 부트 스플래시 제거
useEffect(() => {
  if (loading) return;

  const splash = document.getElementById("boot-splash");
  if (!splash) return;

  // iOS에서 “보이기도 전에 제거”되는 느낌 방지: 한 프레임 늦춰 제거
  requestAnimationFrame(() => {
    splash.remove();
  });
}, [loading]);






  // 새로고침시 효과음 현상 // iOS Safari 오디오 언락 처리 
  useEffect(() => {
    const unlock = () => {
      if (!finishAudioRef.current) {
        finishAudioRef.current = new Audio("/finish.mp3");
      }

      try {
        finishAudioRef.current.volume = 0;
        finishAudioRef.current.play().then(() => {
          finishAudioRef.current.pause();
          finishAudioRef.current.currentTime = 0;
          finishAudioRef.current.volume = 0.9;
        }).catch(() => {});
      } catch (err) {console.error(err);}

      // 한 번만 실행
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("click", unlock);
    };

    // iOS는 touchstart가 가장 확실
    window.addEventListener("touchstart", unlock, { once: true });
    window.addEventListener("click", unlock, { once: true });

    return () => {
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("click", unlock);
    };
  }, []);

  // =======================
  // 데일리: 선택 날짜
  // =======================
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const selectedDayKey = useMemo(() => toKstDayKey(selectedDate), [selectedDate]);



  
  // =======================
// ✅ 태블릿/모바일 "탭 복원" 대비: 날짜가 바뀌면 자동으로 오늘로 이동
// - iPad/태블릿은 어제 열어둔 화면을 그대로 복원하는 경우가 많아서
//   "앱이 다시 보이는 순간"에 오늘 날짜인지 확인해주는 게 안전합니다.
// =======================
useEffect(() => {
  const LAST_ACTIVE_DAY_KEY = "planner_last_active_day_key_v1";

  const syncToTodayIfNeeded = () => {
    const todayKey = toKstDayKey(new Date());
    const currentKey = toKstDayKey(selectedDate);

    // 1) 화면에 보이는 날짜가 오늘이 아니면 오늘로 강제 이동
    if (currentKey !== todayKey) {
      setSelectedDate(new Date()); // 오늘로
      return;
    }

    // 2) 보조 안전장치: 로컬에 저장된 마지막 접속일과도 비교 (복원 케이스 대응)
    try {
      const lastKey = localStorage.getItem(LAST_ACTIVE_DAY_KEY);
      if (lastKey && lastKey !== todayKey) {
        setSelectedDate(new Date());
      }
    } catch {
      // localStorage 접근 실패해도 앱은 계속 동작해야 함
    }
  };

  // 앱이 처음 보일 때 한 번 체크
  syncToTodayIfNeeded();

  // 탭/웹앱이 다시 활성화될 때마다 체크
  const onVisibility = () => {
    if (document.visibilityState === "visible") syncToTodayIfNeeded();
  };

  const onFocus = () => syncToTodayIfNeeded();

  // iOS/Safari의 BFCache(뒤로가기 캐시) 복원까지 대응
  const onPageShow = () => syncToTodayIfNeeded();

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pageshow", onPageShow);

  // 마지막 활성 날짜 기록(오늘 기준)
  try {
    localStorage.setItem(LAST_ACTIVE_DAY_KEY, toKstDayKey(new Date()));
  } catch {}

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pageshow", onPageShow);
  };
  // selectedDate가 바뀔 때도 현재 상태 재검증
}, [selectedDate]);

// 내일 테스트 해보고 정리할 것









  const isTodaySelected = () => {
    return selectedDayKey === toKstDayKey(new Date());
  };




  // =======================
  // 달력 모달
  // =======================
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });


// ✅ 달력에 도장 찍기용: "이번 달에 내가 미션 완료한 day_key들"
// - Set(집합)은 "있다/없다" 확인이 엄청 빨라서 달력에 딱 좋아요.
const [doneDayKeys, setDoneDayKeys] = useState(() => new Set());

// ✅ 특정 월(yyyy, mm)에 대해 '내가 완료한 날짜들' 불러오기
// - hall_of_fame 테이블에는 day_key가 들어 있으니, 그걸 한 달 범위로 가져옵니다.
const fetchDoneDaysForMonth = async (userId, y, m) => {
  // m은 0부터 시작(0=1월)
  const monthStart = new Date(y, m, 1);
  const monthEnd = new Date(y, m + 1, 0);

  // 너는 day_key를 "YYYY-MM-DD" 형태로 쓰고 있으니, 같은 형식으로 범위를 만들면 됩니다.
  const startKey = toKstDayKey(monthStart);
  const endKey = toKstDayKey(monthEnd);

  try {
    const { data, error } = await supabase
      .from("hall_of_fame")
      .select("day_key")
      .eq("user_id", userId)
      .gte("day_key", startKey)
      .lte("day_key", endKey);

    if (error) throw error;

    // ["2026-01-01", "2026-01-03"...] 같은 걸 Set으로 바꿔서 저장
    const set = new Set((data ?? []).map((x) => x.day_key));
    setDoneDayKeys(set);
  } catch (err) {
    console.error("fetchDoneDaysForMonth error:", err);
    setDoneDayKeys(new Set());
  }
};

// ✅ 달력 모달이 열리거나, 달을 넘기면(이전/다음) 그 달 완료 기록을 다시 불러오기
useEffect(() => {
  if (!showCalendarModal) return;
  if (!me?.id) return;

  fetchDoneDaysForMonth(me.id, calMonth.y, calMonth.m);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [showCalendarModal, calMonth.y, calMonth.m, me?.id]);





  const monthCells = useMemo(
    () => buildMonthGrid(calMonth.y, calMonth.m),
    [calMonth.y, calMonth.m]
  );

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

  // 완료 사운드
  const finishAudioRef = useRef(null);

  // 최신 todos 참조
  const todosRef = useRef([]);
  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  // =======================
  // 통합: 목록 불러오기 모달
  // =======================
  const [showLoadModal, setShowLoadModal] = useState(false);

// 모달에서 선택하는 항목을 하나로 통합
// "my" | "vacation" | "weekday" | "weekend"
const [loadChoice, setLoadChoice] = useState("vacation");

const openLoadModal = () => {
  // 내 목록이 있으면 기본을 "내가 만든 목록"으로, 없으면 방학 샘플로
  setLoadChoice(hasMyList ? "my" : "vacation");

  // 체크박스(교체) 기본은 OFF
  setSampleModeReplace(false);
  setLoadReplace(false);

  setShowLoadModal(true);
};

const closeLoadModal = () => {
  // 불러오는 중엔 닫기 막기(중복 클릭 방지)
  if (importingSample || busyMyList) return;
  setShowLoadModal(false);
};

  // =======================
  // 샘플(테이블 3개)
  // =======================
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

  // =======================
  // 내 목록 모달(저장만 유지)
  // =======================
  const [showMyListModal, setShowMyListModal] = useState(false);
  const [_myListMode, setMyListMode] = useState("save"); // save만 사용할 예정
  const [loadReplace, setLoadReplace] = useState(false);
  const [busyMyList, setBusyMyList] = useState(false);
  const [hasMyList, setHasMyList] = useState(false);

  // =======================
  // 명예의 전당(선택 날짜 기준)
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

      const shuffled = shuffleArray(data ?? []);
      setHof(shuffled);
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
  // 날짜 표시
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

  // ✅ 모두 완료 효과음
const playFinishSound = (overrideSrc) => {
  try {
    if (typeof finishEnabled === "boolean" && finishEnabled === false) return;

    let src = (overrideSrc ?? profile?.finish_sound ?? "/finish.mp3");
    src = String(src).trim();
    if (!src) src = "/finish.mp3";

    // mp3 아니면 fallback
    if (!src.toLowerCase().includes(".mp3")) src = "/finish.mp3";

    // 오디오 객체 재사용 (매번 new Audio 하지 않기)
    if (!finishAudioRef.current) {
      finishAudioRef.current = new Audio(src);
      finishAudioRef.current.preload = "auto";
    }

    const a = finishAudioRef.current;

    // src가 바뀌면 교체
    if (a.src !== new URL(src, window.location.origin).href) {
      a.src = src;
      a.load();
    }
    a.volume = 0.9;

    // 되감고 재생
    try { a.pause(); } catch (err) {console.error(err);}
    a.currentTime = 0;

    a.play().catch((e) => {
      // 모바일에서 막힐 수 있음. 아래 “오디오 언락”까지 추가하면 훨씬 줄어듭니다.
      console.warn("finish sound blocked:", e);
    });
  } catch (e) {
    console.warn("finish sound error:", e);
  }
};
  // =======================
  // 날짜별 todos 조회
  // =======================
  const fetchTodos = async (userId, dayKey) => {
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
    setTodos(rows);
    return rows;
  };

  // 처음 들어온 사용자에게 샘플 자동 주입
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
      } catch (err) {console.error(err);}
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

  //  자동 초기화(새 날짜가 비었을 때만)
  // - 내 목록 있으면: 내 목록을 자동 불러오기(교체)
  // - 내 목록 없으면: 기본 4개 자동 생성
  const getAutoSeedKey = (userId, dayKey) => `auto_seeded_v1:${userId}:${dayKey}`;

  // 기본 3개 자동 생성
  const seedDefault3Todos = async (userId, dayKey) => {
    const defaults = [
      "📌 오늘 할 일 1개 정하기",
      "📖 책 10분 읽기",
      "📐 수학 1장 풀기",
    ];

    const rows = defaults.map((title, idx) => ({
      user_id: userId,
      day_key: dayKey,
      title,
      completed: false,
      template_item_key: `default:${String(idx + 1).padStart(3, "0")}`,
    }));

    const { error } = await supabase
      .from("todos")
      .upsert(rows, {
        onConflict: "user_id,day_key,template_item_key",
        ignoreDuplicates: true,
      });

    if (error) throw error;
  };

  const importMySingleListSilently = async (userId, dayKey) => {
    // 1) 내 목록 set_id 찾기
    const { data: setRow, error: setErr } = await supabase
      .from("todo_sets")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "single")
      .maybeSingle();

    if (setErr) throw setErr;
    if (!setRow?.id) return false;

    // 2) 내 목록 아이템 읽기
    const { data: items, error: itemsErr } = await supabase
      .from("todo_set_items")
      .select("item_key, title, sort_order")
      .eq("set_id", setRow.id)
      .order("sort_order", { ascending: true });

    if (itemsErr) throw itemsErr;

    const rows = (items ?? [])
      .map((x) => ({
        user_id: userId,
        day_key: dayKey,
        title: String(x.title ?? "").trim(),
        completed: false,

        // 날짜 포함: 같은 유저라도 날짜가 다르면 충돌 X
        source_set_item_key: `${dayKey}:single:${String(x.item_key ?? "").trim()}`,
      }))

      .filter((x) => x.title.length > 0 && x.source_set_item_key);

    if (rows.length === 0) return false;

    const { error: upErr } = await supabase
      .from("todos")
      .upsert(rows, {
        // DB 유니크(todos_user_source_set_item_unique)에 맞출 확률이 매우 높음
        onConflict: "user_id,source_set_item_key",
        ignoreDuplicates: true,
      });

    if (upErr) throw upErr;

  };

  const autoPopulateIfEmpty = async (userId, dayKey, currentRows) => {
    // 이미 할 일이 있으면 아무 것도 안 함
    if ((currentRows ?? []).length > 0) return;

    // 이미 이 날짜에 자동 초기화를 한 적 있으면 반복 방지
    const seedKey = getAutoSeedKey(userId, dayKey);
    try {
      if (localStorage.getItem(seedKey) === "1") return;
    } catch (err) {console.error(err);}

    // 내 목록 있으면 내 목록 우선, 없으면 기본 4개
    try {
      if (hasMyList) {
        const ok = await importMySingleListSilently(userId, dayKey);
        if (!ok) {
          // hasMyList는 true인데 실제 데이터가 비었을 수도 있으니 fallback
          await seedDefault3Todos(userId, dayKey);
        }
      } else {
        await seedDefault3Todos(userId, dayKey);
      }

      // 자동 초기화 완료 표시
      try { localStorage.setItem(seedKey, "1"); } catch (err) {console.error(err);}

      // 화면 갱신
      await fetchTodos(userId, dayKey);
    } catch (err) {
      console.error("autoPopulateIfEmpty error:", err);
    }
  };

  // =======================
  // 초기 로딩
  // =======================
  useEffect(() => {
    let mounted = true;

    const loadAll = async () => {
      if (!mounted) return;
      setLoading(true);

      const session = await waitForAuthSession({ timeoutMs: 5000 });
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
        .select("id, nickname, birthdate, is_male, finish_sound")
        .eq("id", user.id)
        .maybeSingle();

      const nextProfile =
        profileError || !profileData
          ? {
              id: user.id,
              nickname: user.user_metadata?.nickname ?? "닉네임",
              birthdate: user.user_metadata?.birthdate ?? null,
              is_male: user.user_metadata?.is_male ?? true,
              finish_sound: user.user_metadata?.finish_sound ?? "/finish.mp3",
            }
          : profileData;

      if (mounted) setProfile(nextProfile);
      try {
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(nextProfile));
      } catch (err) {
        console.warn("프로필 캐시 저장 실패", err);
      }

      if (!profileData) {
        const { error: upsertErr } = await supabase
          .from("profiles")
          .upsert(
            {
              id: user.id,
              nickname: nextProfile.nickname,
              birthdate: nextProfile.birthdate,
              is_male: nextProfile.is_male,
              finish_sound: nextProfile.finish_sound,
            },
            { onConflict: "id" }
          );
        if (upsertErr) console.error("profiles upsert error:", upsertErr);
      }

      const loaded = await fetchTodos(user.id, selectedDayKey);
      // ===== Simplified initialization logic =====
      // 중복 호출을 줄이기 위해 아래 로직을 단순화합니다.
      {
        const { id: myListId } = await fetchMySingleListInfo(user.id);
        // 할 일 목록이 비어 있고, 내 목록이 없는 경우에만 샘플을 주입합니다.
        if (!myListId && loaded.length === 0) {
          await seedSampleTodosIfEmpty({
            userId: user.id,
            dayKey: selectedDayKey,
            existingCount: loaded.length,
          });
          // 샘플을 주입한 뒤에는 목록을 한 번만 다시 불러옵니다.
          await fetchTodos(user.id, selectedDayKey);
        }
        // 최신 myList 상태와 명예의 전당을 갱신합니다.
        await fetchMySingleListInfo(user.id);
        await fetchHallOfFame(selectedDayKey);
        // 초기화 완료: 로딩 상태를 false로 설정하고 loadAll을 종료합니다.
        if (mounted) setLoading(false);
        return;
      }




      // (이전 중복 로직 제거됨)
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

      // 비어 있으면 자동으로 채우기
      await autoPopulateIfEmpty(me.id, selectedDayKey, rows ?? []);
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayKey, me?.id, hasMyList]);

  //  모바일 자동재생 차단을 줄이기 위한 '오디오 언락'
  // - 첫 사용자 제스처에서 무음 재생 후 바로 멈춰두면 이후 play 성공률이 올라갑니다.
  useEffect(() => {
    const unlock = async () => {
      try {
        if (!finishAudioRef.current) {
          finishAudioRef.current = new Audio(profile?.finish_sound ?? "/finish.mp3");
          finishAudioRef.current.preload = "auto";
        }
        const a = finishAudioRef.current;

        // 이미 언락 되었으면 스킵
        if (a.__unlocked) return;

        a.muted = true;
        await a.play();     // 사용자 제스처 타이밍에서만 성공 가능
        a.pause();
        a.currentTime = 0;
        a.muted = false;

        a.__unlocked = true; // 커스텀 플래그
      } catch {
        // 실패해도 괜찮습니다. 다음 제스처에서 다시 시도됩니다.
      }
    };

    // 클릭/터치/키보드 입력 등 “사용자 제스처”에 반응
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [profile?.finish_sound]);

  // =======================
  // 명예의 전당 자동 새로고침
  // =======================
  useEffect(() => {
    if (!me?.id) return;

    const INTERVAL_MS = 5 * 60 * 1000; //5분

    const intervalId = setInterval(() => {
      // 오늘 선택된 날짜 기준으로만 갱신
      fetchHallOfFame(selectedDayKey);
    }, INTERVAL_MS);

    // 컴포넌트 언마운트 / 날짜 변경 시 정리
    return () => {
      clearInterval(intervalId);
    };
  }, [me?.id, selectedDayKey]);

  // "공부 다하면" 메모 불러오기
  useEffect(() => {
    if (!me?.id) return;

    const key = `afterStudyText:${me.id}:${selectedDayKey}`;
    try {
      const saved = localStorage.getItem(key);
      setAfterStudyText(saved ?? "");
    } catch (e) {
      console.warn("afterStudyText localStorage read fail:", e);
      setAfterStudyText("");
    }
  }, [me?.id, selectedDayKey]);

  // =======================
  // 샘플 일정 불러오기 
  // =======================
  const makeImportBatchId = () => {
  try {
    return crypto.randomUUID(); // 최신 브라우저
  } catch {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
};

  const importSampleTodos = async (sampleKeyOverride) => {
    if (!me?.id) return;
    if (importingSample) return;

    if (!isTodaySelected()) {
      alert("지난 날짜에는 샘플 숙제 불러오기 기능을 사용할 수 없습니다.");
      return;
    }

    const useKey = sampleKeyOverride || selectedSampleKey;
    const tableName = SAMPLE_TABLE_BY_KEY[useKey];
    if (!tableName) {
      alert("샘플 테이블 설정이 올바르지 않습니다.");
      return;
    }

    // 화면/상태도 함께 맞춰두기(선택)
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

          // template_item_key에 날짜까지 포함(날짜가 다르면 절대 충돌 X)
          // 같은 날에 같은 샘플을 또 눌러도, 아래 upsert+ignoreDuplicates로 무시됨
          const itemKey = String(x.item_key ?? "").trim();
          
          // 추가 모드면 매번 다른 키로 만들어서 "중복 추가" 허용
          const batchId = makeImportBatchId();

          const tplKey = sampleModeReplace
            ? `${selectedDayKey}:${useKey}:${itemKey}`                 // 교체: 고정 키
            : `${selectedDayKey}:${useKey}:${itemKey}:${batchId}`;     // 추가: 매번 새 키


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
      
      const { error: upErr } = await supabase
        .from("todos")
        .upsert(rows, {
          // 샘플은 template_item_key로 중복 판단
          onConflict: "user_id,template_item_key",
          ignoreDuplicates: true,
        });

      if (upErr) throw upErr;


      await fetchTodos(me.id, selectedDayKey);

      alert(sampleModeReplace ? "샘플 일정으로 교체했습니다." : "샘플 일정을 추가했습니다.");
      setShowLoadModal(false);
    } catch (err) {
      console.error("importSampleTodos error:", err);

      const msg = String(err?.message ?? "");
      alert(msg || "샘플 일정 불러오기 중 오류가 발생했습니다.");
    } finally {
      setImportingSample(false);
    }
  };

  // =======================
  // 내 목록 저장 모달
  // =======================
  const openMyListSaveModal = () => {
    setMyListMode("save");
    setShowMyListModal(true);
  };

  const closeMyListModal = () => {
    if (busyMyList) return;
    setShowMyListModal(false);
  };

  // 내 목록 저장
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

  // 통합 모달에서 "내가 만든 목록" 불러오기 (templates 사용 금지: items로만)
  const importMySingleList = async () => {
    if (!me?.id) return;

    // 지난 날짜에서는 불러오기 금지
    if (!isTodaySelected()) {
      alert("지난 날짜에는 불러오기 기능을 사용할 수 없습니다.");
      return;
    }

    // 세션 없으면 로그인으로
    const { data } = await supabase.auth.getSession();
    if (!data?.session) {
      navigate("/login", { replace: true });
      return;
    }

    try {
      // 내 목록(set) id 찾기
      const { id: setId } = await fetchMySingleListInfo(me.id);
      if (!setId) {
        alert("저장된 내가 만든 목록이 없습니다. 먼저 '내 목록 저장'을 해주세요.");
        return;
      }

      setBusyMyList(true);

      // 교체 모드면 현재 날짜 todos 삭제
      if (loadReplace) {
        const { error: delErr } = await supabase
          .from("todos")
          .delete()
          .eq("user_id", me.id)
          .eq("day_key", selectedDayKey);

        if (delErr) throw delErr;

        await removeCompletionForDay(selectedDayKey);
      }

      // 내가 만든 목록 아이템 읽기 (여기가 items!)
      const { data: items, error: itemsErr } = await supabase
        .from("todo_set_items")
        .select("item_key, title, sort_order")
        .eq("set_id", setId)
        .order("sort_order", { ascending: true });

      if (itemsErr) throw itemsErr;

      // 현재 todos의 max sort
      const maxSort = (todosRef.current ?? [])
        .map((t) => Number(t.sort_order ?? 0))
        .reduce((a, b) => Math.max(a, b), 0);

      // rows 생성 (templates 절대 사용 X)
      // importMySingleList 내부 rows 생성 부분만 교체
        const rows = (items ?? [])
          .map((x) => {
            const base = Number(x.sort_order ?? 0) || 0;
            const batchId = makeImportBatchId();

            return {
              user_id: me.id,
              day_key: selectedDayKey,
              // 날짜 포함
              // source_set_item_key: `${selectedDayKey}:single:${String(x.item_key ?? "").trim()}`,
              // source_set_item_key: `single:${String(x.item_key ?? "").trim()}`,
              title: String(x.title ?? "").trim(),
              completed: false,
              sort_order: loadReplace ? base : (maxSort + base),
              source_set_item_key: loadReplace
                ? `${selectedDayKey}:single:${String(x.item_key ?? "").trim()}`                 // 교체: 날짜 고정
                : `${selectedDayKey}:single:${String(x.item_key ?? "").trim()}:${batchId}`,    // 추가: 매번 새 키
            };
          })
          
          .filter((x) => x.source_set_item_key && x.title);


      const { error: upErr } = await supabase
        .from("todos")
        .upsert(rows, {
          onConflict: "user_id,source_set_item_key",
          ignoreDuplicates: true,
        });

      if (upErr) throw upErr;

      await fetchTodos(me.id, selectedDayKey);
      alert(loadReplace ? "내 일정으로 교체했습니다." : "내 일정을 불러왔습니다.");
      setShowLoadModal(false);
    } catch (err) {
      console.error("importMySingleList error:", err);

      const msg = String(err?.message ?? "");
      if (loadReplace) {
        if (msg.includes("duplicate key value") || msg.includes("unique")) {
          alert("교체 중 중복 문제가 발생했어요. 다시 시도해주세요.");
        } else {
          alert(msg || "내 일정 불러오기 중 오류가 발생했습니다.");
        }
      } else {
        alert(msg || "내 일정 추가 중 오류가 발생했습니다.");
      }

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
      .insert([{
        user_id: me.id,
        day_key: selectedDayKey,
        title: titleWithEmoji,
        completed: false,
        sort_order: nextSort,
      }])
      .select("id, user_id, day_key, title, completed, created_at, sort_order, template_item_key, source_set_item_key")
      .single();

    if (error) {
      console.error("addTodo error:", error);
      alert(error.message);
      return;
    }

    setTodo("");
    await fetchTodos(me.id, selectedDayKey);
  };

  const onDelete = async (id) => {
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
    const current = todosRef.current ?? [];
    const wasAllCompleted = current.length > 0 && current.every((t) => t.completed);

    const nextTodos = current.map((t) =>
      t.id === item.id ? { ...t, completed: !t.completed } : t
    );

    const willAllCompleted = nextTodos.length > 0 && nextTodos.every((t) => t.completed);
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
        await recordCompletionForDay(selectedDayKey);
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

  // =======================
  // 스탑워치/타이머/하가다 (원본 유지)
  // =======================
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

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

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
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

  // 타이머 사운드 
  const TIMER_END_SOUND = "/time1.mp3";
  const timerAudioRef = useRef(null);
  const timerEndedRef = useRef(false);

  useEffect(() => {
    if (remainingSec === 0 && !timerEndedRef.current) {
      timerEndedRef.current = true;

      // 소리 꺼져 있으면 재생 안 함
      if (!timerSoundOn) return;

      try {
        if (!timerAudioRef.current) {
          timerAudioRef.current = new Audio(TIMER_END_SOUND);
        }

        timerAudioRef.current.currentTime = 0;
        timerAudioRef.current.volume = 0.9;
        timerAudioRef.current.play().catch(() => {});
      } catch (err) {
        console.warn("타이머 종료 효과음 재생 실패", err);
      }
    }

  // 타이머가 다시 0보다 커지면(리셋/시간 변경) 다시 재생 가능
    if (remainingSec > 0) {
      timerEndedRef.current = false;
    }
  }, [remainingSec, timerSoundOn]);

  //하가다
  const [hagadaCount, setHagadaCount] = useState(0);
  const increaseHagada = () => setHagadaCount((prev) => prev + 1);
  const resetHagada = () => setHagadaCount(0);

  // =======================
  // 아이콘/닉네임
  // =======================
  const kidIconSrc = profile?.is_male ? "/icon_boy.png" : "/icon_girl.png";
  const kidAlt = profile?.is_male ? "남아" : "여아";
  const kidName = profile?.nickname ?? "닉네임";

  //풀스크린 로딩 스플래시
  if (loading) {
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
  // 선택 날짜 전체 삭제
  // =======================
  const deleteAllTodos = async () => {
    if (!me?.id) return;

    const ok = window.confirm("선택한 날짜의 할 일을 모두 삭제할까요?\n이 작업은 되돌릴 수 없습니다.");
    if (!ok) return;

    try {
      const { data: deletedRows, error } = await supabase
        .from("todos")
        .delete()
        .eq("user_id", me.id)
        .eq("day_key", selectedDayKey)
        .select("id");

      if (error) throw error;

      // 완료 기록도 정리
      await removeCompletionForDay(selectedDayKey);

      // 서버에 진짜 남아있는지 재확인
      const left = await fetchTodos(me.id, selectedDayKey);

      if ((left ?? []).length > 0) {
        alert("삭제가 완전히 적용되지 않았어요. 네트워크/권한/날짜 선택을 확인해주세요.");
        console.warn("deleteAllTodos: rows still left", { deletedCount: deletedRows?.length ?? 0, left });
        return;
      }

      // fetchTodos가 setTodos까지 해주지만, 확실히 비우기
      setTodos([]);
    } catch (err) {
      console.error("deleteAllTodos error:", err);
      alert(err?.message ?? "전체 삭제 중 오류가 발생했습니다.");
    }
  };

  // 로그아웃
  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: "local" });
    try {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    } catch (e) {
      console.warn("프로필 캐시 삭제 실패", e);
    }
    navigate("/login");
  };

  // 달력 모달
  const openCalendar = () => {
    const d = selectedDate;
    setCalMonth({ y: d.getFullYear(), m: d.getMonth() });
    setShowCalendarModal(true);
  };

  const closeCalendar = () => setShowCalendarModal(false);

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

          <div className="weather" title="오늘의 날씨">
            <WeatherIcon code={weatherCode} size={52} />
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
          </div>

          <div className="date-stack">
            <div className="today-row" title="선택한 날짜">
              <span className="today">{formatSelectedKorean()}</span>

              <button type="button" className="cal-btn" onClick={openCalendar} title="달력 열기">
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
          {/* 통합: 모록 불러오기 */}
          <button
            type="button"
            className="preset-btn preset-btn-primary"
            onClick={openLoadModal}
            disabled={importingSample || busyMyList}
          >
            {importingSample || busyMyList ? "불러오는 중..." : "📂 목록 불러오기"}
          </button>

          {/* 내 목록 저장은 그대로 */}
          <button className="preset-btn preset-btn-ghost" onClick={openMyListSaveModal}>
            💾 내 목록 저장
          </button>

          <button
            className="preset-btn mini-danger-btn"
            title="선택한 날짜 목록 전체 삭제"
            onClick={deleteAllTodos}
          >
            ❌ 오늘 목록 모두 삭제
          </button>
        </div>

        <div className="todo-bar-inputs">
          <input
            value={todo}
            onChange={handleChange}
            placeholder="새로운 내용을 입력하세요"
            className="todo-input"
            onKeyDown={(e) => {
              if (e.key === "Enter" && todo.trim()) addTodo();
            }}
          />
          <button
            className={`todo-add-btn ${todo.trim() ? "active" : ""}`}
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
                className={`filter-btn ${filter === "all" ? "active" : ""}`}
                onClick={() => {
                  setFilter("all");
                  setReorderMode(false);
                }}
              >
                전체
              </button>

              <button
                className={`filter-btn ${filter === "completed" ? "active" : ""}`}
                onClick={() => {
                  setFilter("completed");
                  setReorderMode(false);
                }}
              >
                했음
              </button>

              <button
                className={`filter-btn ${filter === "uncompleted" ? "active" : ""}`}
                onClick={() => {
                  setFilter("uncompleted");
                  setReorderMode(false);
                }}
              >
                안했음
              </button>
            </>
          )}
        </div>

        {filter === "all" && (
          <button
            type="button"
            className={`filter-btn filter-btn-nowrap ${reorderMode ? "active" : ""}`}
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
          />
        ))}
      </ul>

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
              {afterStudyText.trim() ? afterStudyText : "수학 1장 풀기 45초 만에 성공!!"}
            </div>
          ) : (
            <input
              className="afterstudy-input"
              type="text"
              autoFocus
              value={afterStudyText}
              placeholder="수학 1장 풀기 45초 만에 성공!!"
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
      <HallOfFameCard
        hofLoading={hofLoading}
        hof={hof}
        meId={me?.id}
        cutName6={cutName6}
      />

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

      <footer className="planner-footer-simple">
        <div className="footer-links">
          <a className="footer-link-primary" onClick={() => navigate("/mypage")}>😊마이페이지</a>
          <span>|</span>
          <a onClick={handleLogout}>로그아웃</a>
        </div>
        <div className="footer-copy">© {new Date().getFullYear()} Study Planner</div>
      </footer>
    </div>
  );
}

export default Planner;