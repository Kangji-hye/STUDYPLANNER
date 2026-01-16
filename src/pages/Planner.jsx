// src/pages/Planner.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import TodoItem from "../components/TodoItem";
import supabase from "../supabaseClient";
import "./Planner.css";
import { useWeatherYongin } from "../hooks/useWeatherYongin";
import WeatherIcon from "../components/WeatherIcon";

// 이모지 풀
const EMOJI_POOL = [
  "🚀", "🛸", "⚡", "🔥", "💖",
  "🚗", "🏎️", "🚓", "🚒", "🚜",
  "🦖", "🦕", "🦁", "🐯", "🦈",
  "⚽", "🏀", "⚾", "🥅", "🏆",
  "🛡️", "⚔️", "👑", "🍓", "✨",
  "🦄", "🐰", "🐶", "🐱", "🌈",
];

// KST 기준 YYYY-MM-DD
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

// 달력 그리드
const buildMonthGrid = (year, monthIndex) => {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);

  const startDay = first.getDay(); // 0(일)~6(토)
  const totalDays = last.getDate();

  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, monthIndex, d));
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
};

function Planner() {
  // 훅은 무조건 항상 같은 순서로 실행
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);

  const [todo, setTodo] = useState("");
  const [todos, setTodos] = useState([]);
  const [filter, setFilter] = useState("all");
  const [usedEmojis, setUsedEmojis] = useState([]);

  // 데일리: 선택 날짜
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const selectedDayKey = useMemo(() => toKstDayKey(selectedDate), [selectedDate]);

  // 달력 모달
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const monthCells = useMemo(
    () => buildMonthGrid(calMonth.y, calMonth.m),
    [calMonth.y, calMonth.m]
  );

  // 프로필
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

  // 방학 숙제 불러오기 상태
  const [importingWinter, setImportingWinter] = useState(false);

  // 내 목록 모달
  const [showMyListModal, setShowMyListModal] = useState(false);
  const [myListMode, setMyListMode] = useState("load");
  const [loadReplace, setLoadReplace] = useState(false);
  const [busyMyList, setBusyMyList] = useState(false);
  const [hasMyList, setHasMyList] = useState(false);

  // ============================
  // 명예의 전당(선택 날짜 기준)
  // ============================
  const [hof, setHof] = useState([]);
  const [hofLoading, setHofLoading] = useState(false);

  const fetchHallOfFame = async (dayKey) => {
    setHofLoading(true);
    try {
      const { data, error } = await supabase
        .from("hall_of_fame")
        .select("user_id, nickname, finished_at")
        .eq("day_key", dayKey)
        .order("finished_at", { ascending: true });

      if (error) throw error;
      setHof(data ?? []);
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

  // 선택 날짜 표시
  const formatSelectedKorean = () => {
    const d = selectedDate;
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const day = days[d.getDay()];
    return `${y}-${m}-${dd} (${day})`;
  };

  // 랜덤 이모지
  const getRandomEmoji = () => {
    const available = EMOJI_POOL.filter((emoji) => !usedEmojis.includes(emoji));
    const pool = available.length > 0 ? available : EMOJI_POOL;
    const selected = pool[Math.floor(Math.random() * pool.length)];

    setUsedEmojis((prev) => (available.length > 0 ? [...prev, selected] : [selected]));
    return selected;
  };

  // 폭죽
  const fireConfetti = () => {
    confetti({
      particleCount: 140,
      spread: 90,
      origin: { y: 0.62 },
      colors: ["#ff7aa2", "#ffb86b", "#ffd166", "#a0e7e5"],
    });
  };

  // 사운드
  const playFinishSound = async () => {
    const audio = finishAudioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = 0;
      await audio.play();
    } catch (e) {
      console.log("finish.mp3 재생 실패:", e);
    }
  };

  useEffect(() => {
    const src = profile?.finish_sound || "/finish.mp3";
    finishAudioRef.current = new Audio(src);
    finishAudioRef.current.volume = 0.9;
    finishAudioRef.current.preload = "auto";
  }, [profile?.finish_sound]);

  // ============================
  // 날짜별 todos 조회/CRUD
  // ============================
  const fetchTodos = async (userId, dayKey) => {
    const { data, error } = await supabase
      .from("todos")
      .select("id, user_id, day_key, title, completed, created_at, template_item_key, source_set_item_key")
      .eq("user_id", userId)
      .eq("day_key", dayKey)
      .order("template_item_key", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetchTodos error:", error);
      alert(error.message);
      return;
    }
    setTodos(data ?? []);
  };

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

  // 초기 로딩
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

      await fetchTodos(user.id, selectedDayKey);
      await fetchMySingleListInfo(user.id);
      await fetchHallOfFame(selectedDayKey);

      if (!mounted) return;
      setLoading(false);
    };

    loadAll();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // 날짜 바뀌면 재조회
  useEffect(() => {
    if (!me?.id) return;
    fetchTodos(me.id, selectedDayKey);
    fetchHallOfFame(selectedDayKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayKey, me?.id]);

  // 방학 숙제 불러오기(선택 날짜에 넣기)
  const importWinterTodos = async () => {
    if (!me?.id) return;
    if (importingWinter) return;

    try {
      setImportingWinter(true);

      const { data: templates, error: tplErr } = await supabase
        .from("todo_templates")
        .select("item_key, title, sort_order")
        .eq("template_key", "winter")
        .order("sort_order", { ascending: true });

      if (tplErr) throw tplErr;

      const rows = (templates ?? [])
        .map((x) => ({
          user_id: me.id,
          day_key: selectedDayKey,
          template_item_key: `winter:${String(x.item_key ?? "").trim()}`,
          title: String(x.title ?? "").trim(),
          completed: false,
        }))
        .filter((x) => x.template_item_key && x.title);

      const { error: upErr } = await supabase
        .from("todos")
        .upsert(rows, { onConflict: "user_id,day_key,template_item_key", ignoreDuplicates: true });

      if (upErr) throw upErr;

      await fetchTodos(me.id, selectedDayKey);
      alert("방학 숙제를 불러왔습니다.");
    } catch (err) {
      console.error("importWinterTodos error:", err);
      alert(err?.message ?? "방학 숙제 불러오기 중 오류가 발생했습니다.");
    } finally {
      setImportingWinter(false);
    }
  };

  // 내 목록 모달
  const openMyListSaveModal = () => {
    setMyListMode("save");
    setShowMyListModal(true);
  };
  const openMyListLoadModal = () => {
    setMyListMode("load");
    setShowMyListModal(true);
  };
  const closeMyListModal = () => {
    if (busyMyList) return;
    setShowMyListModal(false);
  };

  // 내 목록 저장
  const saveMySingleList = async () => {
    if (!me?.id) return;

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

  // 내 목록 불러오기(선택 날짜에 넣기)
  const importMySingleList = async () => {
    if (!me?.id) return;

    try {
      setBusyMyList(true);

      const { id: setId } = await fetchMySingleListInfo(me.id);
      if (!setId) {
        alert("저장된 내 목록이 없습니다. 먼저 저장해 주세요.");
        return;
      }

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

      const rows = (items ?? [])
        .map((x) => ({
          user_id: me.id,
          day_key: selectedDayKey,
          source_set_item_key: `single:${String(x.item_key ?? "").trim()}`,
          title: String(x.title ?? "").trim(),
          completed: false,
        }))
        .filter((x) => x.source_set_item_key && x.title);

      const { error: upErr } = await supabase
        .from("todos")
        .upsert(rows, { onConflict: "user_id,day_key,source_set_item_key", ignoreDuplicates: true });

      if (upErr) throw upErr;

      await fetchTodos(me.id, selectedDayKey);
      alert(loadReplace ? "내 목록으로 교체했습니다." : "내 목록을 불러왔습니다.");
      setShowMyListModal(false);
    } catch (err) {
      console.error("importMySingleList error:", err);
      alert(err?.message ?? "내 목록 불러오기 중 오류가 발생했습니다.");
    } finally {
      setBusyMyList(false);
    }
  };

  // CRUD
  const handleChange = (e) => setTodo(e.target.value);

  const addTodo = async () => {
    const raw = todo.trim();
    if (!raw) return;
    if (!me?.id) return;

    const emoji = getRandomEmoji();
    const titleWithEmoji = `${emoji} ${raw}`;

    const { data, error } = await supabase
      .from("todos")
      .insert([{ user_id: me.id, day_key: selectedDayKey, title: titleWithEmoji, completed: false }])
      .select("id, user_id, day_key, title, completed, created_at, template_item_key, source_set_item_key")
      .single();

    if (error) {
      console.error("addTodo error:", error);
      alert(error.message);
      return;
    }

    setTodos((prev) => [...prev, data]);
    setTodo("");
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
    const current = todosRef.current;
    const wasAllCompleted = current.length > 0 && current.every((t) => t.completed);

    const { data, error } = await supabase
      .from("todos")
      .update({ completed: !item.completed })
      .eq("id", item.id)
      .select("id, user_id, day_key, title, completed, created_at, template_item_key, source_set_item_key")
      .single();

    if (error) {
      console.error("toggleTodo error:", error);
      alert(error.message);
      return;
    }

    const nextTodos = current.map((t) => (t.id === item.id ? data : t));
    setTodos(nextTodos);

    const isAllCompleted = nextTodos.length > 0 && nextTodos.every((t) => t.completed);

    if (!wasAllCompleted && isAllCompleted) {
      fireConfetti();
      playFinishSound();
      recordCompletionForDay(selectedDayKey);
    }

    if (wasAllCompleted && !isAllCompleted) {
      removeCompletionForDay(selectedDayKey);
    }
  };

  const filteredTodos = useMemo(() => {
    if (filter === "completed") return todos.filter((t) => t.completed);
    if (filter === "uncompleted") return todos.filter((t) => !t.completed);
    return todos;
  }, [filter, todos]);

  // 스탑워치(기존 방식 유지)
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

  // 아이콘/닉네임
  const kidIconSrc = profile?.is_male ? "/icon_boy.png" : "/icon_girl.png";
  const kidAlt = profile?.is_male ? "남아" : "여아";
  const kidName = profile?.nickname ?? "닉네임";

  // ✅ 여기서야 비로소 early return (훅 선언 다 끝난 뒤)
  if (loading) return <div className="planner-loading">로딩중...</div>;

  // 선택 날짜 전체 삭제
  const deleteAllTodos = async () => {
    if (!me?.id) return;

    const ok = window.confirm("선택한 날짜의 할 일을 모두 삭제할까요?\n이 작업은 되돌릴 수 없습니다.");
    if (!ok) return;

    const { error } = await supabase
      .from("todos")
      .delete()
      .eq("user_id", me.id)
      .eq("day_key", selectedDayKey);

    if (error) {
      console.error("deleteAllTodos error:", error);
      alert(error.message ?? "전체 삭제 중 오류가 발생했습니다.");
      return;
    }

    setTodos([]);
    await removeCompletionForDay(selectedDayKey);
  };

  // 로그아웃
  const handleLogout = async () => {
    await supabase.auth.signOut();
    try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch {}
    navigate("/login");
  };

  // 달력 모달
  const openCalendar = () => {
    const d = selectedDate;
    setCalMonth({ y: d.getFullYear(), m: d.getMonth() });
    setShowCalendarModal(true);
  };
  const closeCalendar = () => setShowCalendarModal(false);
  const chooseDate = (d) => {
    if (!d) return;
    setSelectedDate(d);
    setShowCalendarModal(false);
  };

  const isSameDay = (a, b) =>
    a && b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  return (
    <div className="planner">
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

              <button
                type="button"
                className="cal-btn"
                onClick={openCalendar}
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

      {/* 버튼 */}
      <div className="todo-bar todo-bar-grid">
        <div className="todo-bar-actions">
          <button
            className="preset-btn preset-btn-primary"
            onClick={importWinterTodos}
            disabled={importingWinter}
          >
            {importingWinter ? "불러오는 중..." : "📂 방학 숙제 불러오기"}
          </button>

          <div className="mylist-actions">
            <button className="preset-btn preset-btn-ghost" onClick={openMyListLoadModal}>
              📂 내 목록 불러오기 {hasMyList ? "" : "(없음)"}
            </button>
          </div>

          <button className="preset-btn preset-btn-ghost" onClick={openMyListSaveModal}>
            💾 내 목록 저장
          </button>

          <button
            className="preset-btn mini-danger-btn"
            title="선택한 날짜 목록 전체 삭제"
            onClick={deleteAllTodos}
          >
            🗑️ 현재 날짜 목록 전체 삭제
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

      <ul className="todo-list">
        {filteredTodos.map((t) => (
          <TodoItem key={t.id} t={t} onToggle={onToggle} onDelete={onDelete} />
        ))}
      </ul>

      {/* 필터 */}
      <div className="filter-bar">
        <div className="filter-group-left">
          <button className={`filter-btn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>전체</button>
          <button className={`filter-btn ${filter === "completed" ? "active" : ""}`} onClick={() => setFilter("completed")}>했음</button>
          <button className={`filter-btn ${filter === "uncompleted" ? "active" : ""}`} onClick={() => setFilter("uncompleted")}>안했음</button>
        </div>
      </div>

      <div className="finish">
        <span className="title">공부 다하면?</span>
        <div><input type="text" placeholder="뭐하고 놀까~" /></div>
      </div>

      {/* 명예의 전당 */}
      <div className="hof-card">
        <div className="hof-head">
          <span className="hof-title">오늘 함께 해낸 친구들</span>
          <span className="hof-sub">{selectedDayKey}</span>
        </div>

        {hofLoading ? (
          <div className="hof-empty">불러오는 중...</div>
        ) : hof.length === 0 ? (
          <div className="hof-empty">첫 번째로 이름을 올려볼까?</div>
        ) : (
          <div className="hof-list">
            {hof.map((x, idx) => (
              <div key={`${x.user_id}-${x.finished_at}`} className="hof-row">
                <span className="hof-rank">
                  {idx === 0 ? "👑" : idx === 1 ? "🥇" : idx === 2 ? "🥈" : "⭐"}
                </span>
                <span className="hof-name">{x.nickname}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 스탑워치 */}
      <div className="stopwatch">
        <span className="title">스탑워치</span>
        <div className="time">{formatTime(elapsedMs)}</div>
        <button onClick={startStopwatch} disabled={isRunning}>시작</button>
        <button onClick={stopStopwatch} disabled={!isRunning}>멈춤</button>
        <button onClick={resetStopwatch}>다시</button>
      </div>

      {/* 내 목록 모달 */}
      {showMyListModal && (
        <div className="modal-backdrop" onClick={closeMyListModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">{myListMode === "save" ? "내 목록 저장" : "내 목록 불러오기"}</div>
              <button className="modal-close" onClick={closeMyListModal} disabled={busyMyList}>✕</button>
            </div>

            {myListMode === "save" ? (
              <div className="modal-body">
                <div className="modal-help">지금 화면의 할 일 목록을 “내 목록”으로 저장합니다. 저장하면 이전 내 목록은 덮어씁니다.</div>
                <button className="modal-primary" onClick={saveMySingleList} disabled={busyMyList}>
                  {busyMyList ? "저장 중..." : "내 목록으로 저장하기"}
                </button>
              </div>
            ) : (
              <div className="modal-body">
                <div className="modal-help">저장된 내 목록을 현재 날짜 플래너로 가져옵니다.</div>

                <label className="modal-check">
                  <input
                    type="checkbox"
                    checked={loadReplace}
                    onChange={(e) => setLoadReplace(e.target.checked)}
                    disabled={busyMyList}
                  />
                  기존 목록을 비우고 불러오기(교체)
                </label>

                <button className="modal-primary" onClick={importMySingleList} disabled={busyMyList}>
                  {busyMyList ? "불러오는 중..." : "불러오기"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 달력 모달 */}
      {showCalendarModal && (
        <div className="modal-backdrop" onClick={closeCalendar}>
          <div className="modal-card calendar-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">날짜 선택</div>
              <button className="modal-close" onClick={closeCalendar}>✕</button>
            </div>

            <div className="cal-head">
              <button
                type="button"
                className="cal-nav"
                onClick={() => {
                  const nm = calMonth.m - 1;
                  if (nm < 0) setCalMonth({ y: calMonth.y - 1, m: 11 });
                  else setCalMonth({ y: calMonth.y, m: nm });
                }}
              >
                ◀
              </button>

              <div className="cal-month-label">{calMonth.y}년 {calMonth.m + 1}월</div>

              <button
                type="button"
                className="cal-nav"
                onClick={() => {
                  const nm = calMonth.m + 1;
                  if (nm > 11) setCalMonth({ y: calMonth.y + 1, m: 0 });
                  else setCalMonth({ y: calMonth.y, m: nm });
                }}
              >
                ▶
              </button>
            </div>

            <div className="cal-week">
              <span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
            </div>

            <div className="cal-grid">
              {monthCells.map((d, idx) => {
                const isSelected = d && isSameDay(d, selectedDate);
                const isToday = d && isSameDay(d, new Date());

                return (
                  <button
                    key={idx}
                    type="button"
                    className={`cal-cell ${!d ? "empty" : ""} ${isSelected ? "selected" : ""} ${isToday ? "today" : ""}`}
                    disabled={!d}
                    onClick={() => chooseDate(d)}
                  >
                    {d ? d.getDate() : ""}
                  </button>
                );
              })}
            </div>

            <div className="cal-actions">
              <button
                type="button"
                className="cal-today-btn"
                onClick={() => {
                  const d = new Date();
                  setSelectedDate(d);
                  setCalMonth({ y: d.getFullYear(), m: d.getMonth() });
                  setShowCalendarModal(false);
                }}
              >
                오늘로 가기
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="planner-footer-simple">
        <div className="footer-links">
          <a className="footer-link-primary" onClick={() => navigate("/mypage")}>마이페이지</a>
          <span>|</span>
          <a onClick={handleLogout}>로그아웃</a>
        </div>
        <div className="footer-copy">© {new Date().getFullYear()} Study Planner</div>
      </footer>
    </div>
  );
}

export default Planner;
