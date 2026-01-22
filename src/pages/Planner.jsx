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

// ✅ 정리된 공용 유틸/훅
import { toKstDayKey } from "../utils/dateKst";
import { useBootSplash } from "../hooks/useBootSplash";
import { useRestoreToToday } from "../hooks/useRestoreToToday";
import { useAudioUnlock } from "../hooks/useAudioUnlock";
import { useDoneDaysForMonth } from "../hooks/useDoneDaysForMonth";

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

// 명예의 전당 닉네임 표시(6글자 제한을 예전에 하려고 했던 흔적 같지만 지금은 그대로 반환)
const cutName6 = (name) => {
  const s = String(name ?? "").trim();
  if (!s) return "익명";
  return s;
};

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

  // ✅ 부트 스플래시 제거(한 번만)
  useBootSplash(loading);

  // =======================
  // 데일리: 선택 날짜
  // =======================
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  // ✅ 탭 복원 대비: "날이 바뀐 복원 상황"에서만 오늘로 복귀
  useRestoreToToday(setSelectedDate);

  const selectedDayKey = useMemo(() => toKstDayKey(selectedDate), [selectedDate]);

  // ✅ fetch 레이스 방지(마지막 요청만 반영)
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

  // ✅ 달력 도장(완료한 날짜 Set)
  const doneDayKeys = useDoneDaysForMonth({
    open: showCalendarModal,
    userId: me?.id,
    calMonth,
  });

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

  // ✅ 오디오 언락(중복 useEffect 제거)
  useAudioUnlock(finishAudioRef, profile?.finish_sound ?? "/finish.mp3");

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

  const playFinishSound = (overrideSrc) => {
    try {
      if (typeof finishEnabled === "boolean" && finishEnabled === false) return;

      let src = (overrideSrc ?? profile?.finish_sound ?? "/finish.mp3");
      src = String(src).trim();
      if (!src) src = "/finish.mp3";
      if (!src.toLowerCase().includes(".mp3")) src = "/finish.mp3";

      if (!finishAudioRef.current) {
        finishAudioRef.current = new Audio(src);
        finishAudioRef.current.preload = "auto";
      }

      const a = finishAudioRef.current;

      if (a.src !== new URL(src, window.location.origin).href) {
        a.src = src;
        a.load();
      }

      a.volume = 0.9;
      try {
        a.pause();
      } catch {}
      a.currentTime = 0;

      a.play().catch((e) => console.warn("finish sound blocked:", e));
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

  // 자동 초기화(새 날짜 비었을 때)
  const getAutoSeedKey = (userId, dayKey) => `auto_seeded_v1:${userId}:${dayKey}`;

  const seedDefault3Todos = async (userId, dayKey) => {
    const defaults = ["📌 오늘 할 일 1개 정하기", "📖 책 10분 읽기", "📐 수학 1장 풀기"];

    const rows = defaults.map((title, idx) => ({
      user_id: userId,
      day_key: dayKey,
      title,
      completed: false,
      template_item_key: `default:${String(idx + 1).padStart(3, "0")}`,
    }));

    const { error } = await supabase.from("todos").upsert(rows, {
      onConflict: "user_id,day_key,template_item_key",
      ignoreDuplicates: true,
    });

    if (error) throw error;
  };

  const importMySingleListSilently = async (userId, dayKey) => {
    const { data: setRow, error: setErr } = await supabase
      .from("todo_sets")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "single")
      .maybeSingle();

    if (setErr) throw setErr;
    if (!setRow?.id) return false;

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
        source_set_item_key: `${dayKey}:single:${String(x.item_key ?? "").trim()}`,
      }))
      .filter((x) => x.title.length > 0 && x.source_set_item_key);

    if (rows.length === 0) return false;

    const { error: upErr } = await supabase.from("todos").upsert(rows, {
      onConflict: "user_id,source_set_item_key",
      ignoreDuplicates: true,
    });

    if (upErr) throw upErr;
    return true;
  };

  const autoPopulateIfEmpty = async (userId, dayKey, currentRows) => {
    if ((currentRows ?? []).length > 0) return;

    const seedKey = getAutoSeedKey(userId, dayKey);
    try {
      if (localStorage.getItem(seedKey) === "1") return;
    } catch {}

    try {
      if (hasMyList) {
        const ok = await importMySingleListSilently(userId, dayKey);
        if (!ok) await seedDefault3Todos(userId, dayKey);
      } else {
        await seedDefault3Todos(userId, dayKey);
      }

      try {
        localStorage.setItem(seedKey, "1");
      } catch {}

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
              finish_sound: nextProfile.finish_sound,
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
      await autoPopulateIfEmpty(me.id, selectedDayKey, rows ?? []);
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

    if (!isTodaySelected()) {
      alert("지난 날짜에는 불러오기 기능을 사용할 수 없습니다.");
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

      if (!wasAllCompleted && willAllCompleted) await recordCompletionForDay(selectedDayKey);
      if (wasAllCompleted && !willAllCompleted) await removeCompletionForDay(selectedDayKey);
    } catch (err) {
      console.error("toggleTodo error:", err);
      setTodos(current);
      alert(err?.message ?? "완료 처리 중 오류가 발생했습니다.");
    }
  };

  // =======================
  // 스탑워치/타이머/하가다 (원본 유지)
  // =======================
  const [timerSoundOn, setTimerSoundOn] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

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
  // 선택 날짜 전체 삭제
  // =======================
  const deleteAllTodos = async () => {
    if (!me?.id) return;

    const ok = window.confirm(
      "선택한 날짜의 할 일을 모두 삭제할까요?\n이 작업은 되돌릴 수 없습니다."
    );
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
        console.warn("deleteAllTodos: rows still left", {
          deletedCount: deletedRows?.length ?? 0,
          left,
        });
        return;
      }

      // fetchTodos가 setTodos까지 해주지만, 확실히 비우기
      setTodos([]);
    } catch (err) {
      console.error("deleteAllTodos error:", err);
      alert(err?.message ?? "전체 삭제 중 오류가 발생했습니다.");
    }
  };

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
          <button
            type="button"
            className="preset-btn preset-btn-primary"
            onClick={openLoadModal}
            disabled={importingSample || busyMyList}
          >
            {importingSample || busyMyList ? "불러오는 중..." : "📂 목록 불러오기"}
          </button>

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
          <a className="footer-link-primary" onClick={() => navigate("/mypage")}>
            😊마이페이지
          </a>
          <span>|</span>
          <a onClick={handleLogout}>로그아웃</a>
        </div>
        <div className="footer-copy">© {new Date().getFullYear()} Study Planner</div>
      </footer>
    </div>
  );
}

export default Planner;
