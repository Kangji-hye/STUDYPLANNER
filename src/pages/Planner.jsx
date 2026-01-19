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

// =======================
// 이모지 풀
// =======================
const EMOJI_POOL = [
  "🚀", "🛸", "⚡", "🔥", "💖",
  "🚗", "🏎️", "🚓", "🚒", "🚜",
  "🦖", "🦕", "🦁", "🐯", "🦈",
  "⚽", "🏀", "⚾", "🥅", "🏆",
  "🛡️", "⚔️", "👑", "🍓", "✨",
  "🦄", "🐰", "🐶", "🐱", "🌈",
];

// 명예의 전당
const cutName6 = (name) => {
    const s = String(name ?? "").trim();
    if (!s) return "익명";
    return s.length > 6 ? s.slice(0, 6) : s;
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
  // 훅은 무조건 항상 같은 순서로 실행
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

  // =======================
  // 데일리: 선택 날짜
  // =======================
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const selectedDayKey = useMemo(() => toKstDayKey(selectedDate), [selectedDate]);

  
  // 선택된 날짜가 "오늘(KST)"인지 확인
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
  // 샘플 숙제 불러오기 모달 (테이블 3개 버전)
  // =======================
  const [showSampleModal, setShowSampleModal] = useState(false);
  const [sampleModeReplace, setSampleModeReplace] = useState(false); // true면 교체
  const [importingSample, setImportingSample] = useState(false);

  // ✅ 여기서 key는 "테이블 종류"로 고정
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

  const openSampleModal = () => {
    setSampleModeReplace(false);
    setSelectedSampleKey(SAMPLE_SETS[0].key);
    setShowSampleModal(true);
  };

  const closeSampleModal = () => {
    if (importingSample) return;
    setShowSampleModal(false);
  };

  // =======================
  // 내 목록 모달
  // =======================
  const [showMyListModal, setShowMyListModal] = useState(false);
  const [myListMode, setMyListMode] = useState("load");
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

  // ✅ 모두 완료 효과음(안정 + URL도 허용)
const playFinishSound = (overrideSrc) => {
  try {
    // 1) 토글이 꺼져 있으면 재생 안 함
    if (typeof finishEnabled === "boolean" && finishEnabled === false) return;

    // 2) src 후보
    let src = (overrideSrc ?? profile?.finish_sound ?? "/finish.mp3");
    src = String(src).trim();

    // 3) src가 비었으면 기본값
    if (!src) src = "/finish.mp3";

    // 4) mp3 확장자만 강제하고 싶으면(권장) 이 정도만 체크
    //    (URL/상대경로 모두 허용)
    if (!src.toLowerCase().includes(".mp3")) {
      src = "/finish.mp3";
    }

    // 🔎 디버깅: 실제로 어떤 src로 재생 시도하는지 확인
    console.log("finish sound src:", src);

    // 5) 이전에 재생 중인게 있으면 멈추기(겹침 방지)
    if (finishAudioRef.current) {
      try {
        finishAudioRef.current.pause();
        finishAudioRef.current.currentTime = 0;
      } catch {}
    }

    const audio = new Audio(src);
    audio.preload = "auto";
    audio.volume = 0.9;

    finishAudioRef.current = audio;

    audio.play().catch((e) => {
      console.warn("finish sound blocked:", e);
    });
  } catch (e) {
    console.warn("finish sound error:", e);
  }
};


  // useEffect(() => {
  //   const src = profile?.finish_sound || "/finish.mp3";
  //   finishAudioRef.current = new Audio(src);
  //   finishAudioRef.current.volume = 0.9;
  //   finishAudioRef.current.preload = "auto";
  // }, [profile?.finish_sound]);

  // =======================
  // 날짜별 todos 조회
  // =======================
  const fetchTodos = async (userId, dayKey) => {
    const { data, error } = await supabase
      .from("todos")
      .select("id, user_id, day_key, title, completed, created_at, sort_order, template_item_key, source_set_item_key")
      .eq("user_id", userId)
      .eq("day_key", dayKey)
      // .order("template_item_key", { ascending: true, nullsFirst: true })
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

  //처음 들어온 사용자에게 샘플 3개 자동 주입
  // 처음 들어온 사용자에게 샘플 3개 자동 주입 (StrictMode 2회 실행에도 안전)
  const seedSampleTodosIfEmpty = async ({ userId, dayKey, existingCount }) => {
    const seededKey = `${FIRST_VISIT_SEED_KEY}:${userId}`;

    try {
      // 이미 할 일이 있으면 아무 것도 안 함
      if (existingCount > 0) return;

      // 이미 샘플 넣은 적이 있으면 또 넣지 않음
      const alreadySeeded = localStorage.getItem(seededKey) === "true";
      if (alreadySeeded) return;

      // 핵심: insert 전에 먼저 "seeded"를 찍어서
      // StrictMode로 loadAll이 2번 돌더라도 두 번째 실행을 즉시 차단
      localStorage.setItem(seededKey, "true");

      const samples = [
        "오늘의 할 일을 추가해 보세요",
        "완료 버튼을 눌러 보세요",
        "전체 삭제로 정리할 수 있어요",
        "마이 페이지에서 효과음을 설정해보세요"
      ];

      const rows = samples.map((text) => ({
        user_id: userId,
        day_key: dayKey,
        title: `${getRandomEmoji()} ${text}`,
        completed: false,
        // 옵션: sort_order까지 주면 정렬도 깔끔 (지금 프로젝트가 sort_order를 쓰고 있어서 추천)
        // 1,2,3으로 딱 고정
        // sort_order는 DB 컬럼이 있을 때만 의미 있음(너는 이미 select에 sort_order 넣고 있음)
        // 아래 줄은 그대로 써도 OK
        // (혹시 테이블에 sort_order가 없으면 에러 날 수 있으니, 컬럼이 확실하면 켜줘)
      }));

      // sort_order 확실히 넣고 싶으면 이렇게(추천)
      const rowsWithOrder = rows.map((r, idx) => ({ ...r, sort_order: idx + 1 }));

      const { error } = await supabase.from("todos").insert(rowsWithOrder);
      if (error) throw error;
    } catch (err) {
      console.error("seedSampleTodosIfEmpty error:", err);

      // insert 실패했으면 seeded 표시를 되돌려 다음에 다시 시도 가능하게
      try {
        localStorage.removeItem(seededKey);
      } catch {}
    }
  };


  // =======================
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

      // await fetchTodos(user.id, selectedDayKey);
      const loaded = await fetchTodos(user.id, selectedDayKey);

      await seedSampleTodosIfEmpty({
        userId: user.id,
        dayKey: selectedDayKey,
        existingCount: loaded.length,
      });

      // 샘플을 넣었을 수도 있으니 한 번 더 불러와서 화면을 최신화
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
     
  }, [selectedDayKey, me?.id]);

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
  // 샘플 숙제 불러오기 실행
  // =======================
  const importSampleTodos = async () => {
    if (!me?.id) return;
    if (importingSample) return;

    if (!isTodaySelected()) {
      alert("지난 날짜에는 샘플 숙제 불러오기 기능을 사용할 수 없습니다.");
      return;
    }

    const tableName = SAMPLE_TABLE_BY_KEY[selectedSampleKey];
    if (!tableName) {
      alert("샘플 테이블 설정이 올바르지 않습니다.");
      return;
    }

    try {
      setImportingSample(true);

      // 상태 변경시 이름 제거
      if (sampleModeReplace) {
        const { error: delErr } = await supabase
          .from("todos")
          .delete()
          .eq("user_id", me.id)
          .eq("day_key", selectedDayKey);

        if (delErr) throw delErr;

        await removeCompletionForDay(selectedDayKey);
      }

     //템플릿 조회: todo_templates_xxx 테이블에서 직접 읽음
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

          return {
            user_id: me.id,
            day_key: selectedDayKey,
            template_item_key: `${selectedSampleKey}:${String(x.item_key ?? "").trim()}`,
            title: String(x.title ?? "").trim(),
            completed: false,

            // 교체면 템플릿 순서 그대로(1,2,3..), 추가면 기존 맨 뒤로 붙이기
            sort_order: sampleModeReplace ? base : (maxSort + base),
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
          onConflict: "user_id,day_key,template_item_key",
          ignoreDuplicates: true,
        });

      if (upErr) throw upErr;

      await fetchTodos(me.id, selectedDayKey);
      alert(sampleModeReplace ? "샘플 숙제로 교체했습니다." : "샘플 숙제를 추가했습니다.");
      setShowSampleModal(false);
    } catch (err) {
      console.error("importSampleTodos error:", err);

      const msg = String(err?.message ?? "");
      if (
        msg.includes("todos_user_template_item_unique") ||
        msg.includes("duplicate key value violates unique constraint")
      ) {
        alert("이미 불러온 샘플 숙제입니다.");
      } else {
        alert(msg || "샘플 숙제 불러오기 중 오류가 발생했습니다.");
      }
    } finally {
      setImportingSample(false);
    }
  };
  

  // =======================
  // 내 목록 모달
  // =======================
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

  // 내 목록 불러오기(선택 날짜에 넣기)
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
    const { id: setId } = await fetchMySingleListInfo(me.id);
    if (!setId) {
      alert("저장된 내 목록이 없습니다. 먼저 저장해 주세요.");
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

        return {
          user_id: me.id,
          day_key: selectedDayKey,
          source_set_item_key: `single:${String(x.item_key ?? "").trim()}`,
          title: String(x.title ?? "").trim(),
          completed: false,

          // 교체면 내 목록 순서 그대로, 추가면 기존 맨 뒤로 붙이기
          sort_order: loadReplace ? base : (maxSort + base),
        };
      })
      .filter((x) => x.source_set_item_key && x.title);



    const { error: upErr } = await supabase
      .from("todos")
      .upsert(rows, {
        onConflict: "user_id,day_key,source_set_item_key",
        ignoreDuplicates: true,
      });

    if (upErr) throw upErr;

    await fetchTodos(me.id, selectedDayKey);
    alert(loadReplace ? "내 목록으로 교체했습니다." : "내 목록을 불러왔습니다.");
    setShowMyListModal(false);
  } catch (err) {
    console.error("importMySingleList error:", err);

    const msg = String(err?.message ?? "");

    // 중복키 에러 처리
    if (
      msg.includes("todos_user_source_set_item_unique") ||
      msg.includes("duplicate key value violates unique constraint")
    ) {
      alert("이미 불러온 목록입니다.");
      // 또는 더 친절하게:
      // alert("이미 불러온 목록이라 중복으로 추가할 수 없습니다.");
    } else {
      alert(msg || "내 목록 불러오기 중 오류가 발생했습니다.");
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

    // 지금 fetchTodos 정렬 결과(현재 화면 순서)를 그대로 1,2,3...로 부여
    // 너무 많은 요청을 피하려면 최소한의 업데이트만 수행
    for (let i = 0; i < current.length; i++) {
      const t = current[i];
      const nextOrder = i + 1;
      if (t.sort_order === nextOrder) continue;

      // eslint-disable-next-line no-await-in-loop
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

    // 화면 즉시 반영(체감 좋게)
    const current = todosRef.current ?? [];
    setTodos(
      current.map((x) => {
        if (x.id === a.id) return { ...x, sort_order: bOrder };
        if (x.id === b.id) return { ...x, sort_order: aOrder };
        return x;
      })
    );

    // DB 업데이트
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

  // 정렬(순서) 기준과 동일하게 다시 불러와서 화면 확정
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
      console.log("호출은 되고 모두 완료 효과음은 안들림");
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

  // =======================
  // 스탑워치
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

  // =======================
  // 타이머(카운트다운)
  // =======================
  const TIMER_PRESETS = [5, 10, 15, 20]; // 분 단위 프리셋

  const [timerMin, setTimerMin] = useState(10); // 기본 10분
  const [timerRunning, setTimerRunning] = useState(false);
  const [remainingSec, setRemainingSec] = useState(10 * 60);

  const timerIntervalRef = useRef(null);

  // 타이머 분을 바꾸면 남은 시간을 같이 리셋(실행 중이면 변경 막기)
  useEffect(() => {
    // 실행 중에는 분 변경을 막고 있다면(disabled), 사실상 이 줄은 안전장치
    if (timerRunning) return;

    setRemainingSec(timerMin * 60);
    // ❗의존성에서 timerRunning 제거가 핵심
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerMin]);

  // 언마운트 시 interval 정리(안전)
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



 // =======================
  // 하가다 (횟수 카운터)
  // =======================
  const [hagadaCount, setHagadaCount] = useState(0);

  const increaseHagada = () => {
    setHagadaCount((prev) => prev + 1);
  };

  const resetHagada = () => {
    setHagadaCount(0);
  };


  // =======================
  // 아이콘/닉네임
  // =======================
  const kidIconSrc = profile?.is_male ? "/icon_boy.png" : "/icon_girl.png";
  const kidAlt = profile?.is_male ? "남아" : "여아";
  const kidName = profile?.nickname ?? "닉네임";

  // early return
  if (loading) return <div className="planner-loading">로딩중...</div>;

  // =======================
  // 선택 날짜 전체 삭제
  // =======================
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
   await supabase.auth.signOut({ scope: "local" });
    try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch (e) {
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
          {/* 샘플 불러오기 버튼 */}
          <button
            type="button"
            className="preset-btn preset-btn-primary"
            onClick={openSampleModal}
            disabled={importingSample}
          >
            {importingSample ? "불러오는 중..." : "📂 샘플 숙제 불러오기"}
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

      {/* 필터 + 정렬 */}
      <div className="filter-bar" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="filter-group-left">
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
        </div>

        {/* 전체일 때만 순서 버튼 노출 */}
        {filter === "all" && (
          <button
            type="button"
            className={`filter-btn ${reorderMode ? "active" : ""}`}
            onClick={async () => {
              const next = !reorderMode;
              setReorderMode(next);

              // 순서 모드 처음 켤 때 sort_order 정리
              if (next) {
                await ensureSortOrderForDay();
              }
            }}
            title={reorderMode ? "순서 변경 종료" : "순서 변경하기"}
            style={{ whiteSpace: "nowrap" }}
          >
            {reorderMode ? "순서변경완료" : "순서변경하기"}
          </button>
        )}
      </div>



      <div className="finish">
        <span className="title">공부 다하면?</span>

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
              {afterStudyText.trim() ? afterStudyText : "뭐하고 놀까~ 레고?"}
            </div>
          ) : (
            <input
              className="afterstudy-input"
              type="text"
              autoFocus
              value={afterStudyText}
              placeholder="뭐하고 놀까~"
              onChange={(e) => {
                const v = e.target.value;
                setAfterStudyText(v);

                // 입력 중에도 저장(원하면 blur에서만 저장하도록 바꿀 수 있음)
                if (!me?.id) return;
                const key = `afterStudyText:${me.id}:${selectedDayKey}`;
                try {
                  localStorage.setItem(key, v);
                } catch (err) {
                  console.warn("afterStudyText localStorage write fail:", err);
                }
              }}
              onBlur={() => {
                // 다른 데 누르면 저장하고 텍스트 모드로
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
                if (e.key === "Enter") {
                  e.currentTarget.blur(); // blur로 보내면 저장 + 종료가 한 번에 처리됨
                }
                if (e.key === "Escape") {
                  setAfterStudyEditing(false); // ESC로 닫기(선택)
                }
              }}
            />
          )}
        </div>
      </div>



      {/* 명예의 전당 */}
      <div className="hof-card">
        <div className="hof-head">
          <span className="hof-title">오늘 함께 해낸 친구들</span>
        </div>

        {hofLoading ? (
          <div className="hof-empty">불러오는 중...</div>
        ) : hof.length === 0 ? (
          <div className="hof-empty">오늘의 첫 친구가 되어볼까?</div>
        ) : (
          <div className="hof-chips" aria-label="오늘 함께 공부한 친구들">
            {/* 내 이름은 색상 변하는 작업 */}
            {hof.map((x) => {
              const isMe = me?.id && x.user_id === me.id;

              return (
                <div
                  key={`${x.user_id}-${x.finished_at}`}
                  className={`hof-chip ${isMe ? "is-me" : ""}`}
                  title={x.nickname ?? ""}
                >
                  <span className="hof-chip-name">{cutName6(x.nickname)}</span>
                </div>
              );
            })}

          </div>
        )}
      </div>

      {/* =======================
          학습 도구(스탑워치/타이머/하가다) - 한 박스, 3행, 선으로 구분
      ======================= */}
      <div className="study-tools">
        {/* 1) 스탑워치 */}
        <div className="tool-row">
          <div className="tool-title">스탑워치</div>

          <div className="tool-display">
            {formatTime(elapsedMs)}
          </div>

          <div className="tool-actions">
            <button onClick={startStopwatch} disabled={isRunning}>시작</button>
            <button onClick={stopStopwatch} disabled={!isRunning}>멈춤</button>
            <button onClick={resetStopwatch}>처음부터</button>
          </div>
        </div>

        {/* 2) 타이머 */}
        <div className="tool-row">
          <div className="tool-title">타이머</div>

          <div className="tool-display tool-display-timer">
            <select
              value={timerMin}
              onChange={(e) => setTimerMin(Number(e.target.value))}
              disabled={timerRunning}
              aria-label="타이머 시간 선택"
            >
              {TIMER_PRESETS.map((m) => (
                <option key={m} value={m}>{m}분</option>
              ))}
            </select>

            <span className="timer-value">
              {/* 밀리초 버전이면 remainingMs / formatMMSSms(remainingMs)
                  초 버전이면 remainingSec / formatMMSS(remainingSec)로 바꿔주세요 */}
              {formatMMSS(remainingSec)}
            </span>
          </div>

          <div className="tool-actions">
            <button onClick={startTimer} disabled={timerRunning || remainingSec <= 0}>시작</button>
            <button onClick={pauseTimer} disabled={!timerRunning}>멈춤</button>
            <button onClick={resetTimer}>처음부터</button>
          </div>
        </div>

        {/* 3) 하가다 */}
        <div className="tool-row">
          <div className="tool-title">하가다</div>

          <div className="tool-display">
            {hagadaCount}
          </div>

          <div className="tool-actions">
            <button onClick={increaseHagada}>하나 추가</button>
            <button onClick={resetHagada}>처음부터</button>
          </div>
        </div>
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

      {/* 샘플 숙제 불러오기 모달 */}
      {showSampleModal && (
        <div className="modal-backdrop" onClick={closeSampleModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">샘플 숙제 불러오기</div>
              <button className="modal-close" onClick={closeSampleModal} disabled={importingSample}>✕</button>
            </div>

            <div className="modal-body">
              <div className="modal-help">
                선택한 날짜({selectedDayKey})에 샘플 숙제를 불러옵니다.
              </div>

              <div style={{ display: "grid", gap: "8px" }}>
                {SAMPLE_SETS.map((s) => (
                  <label
                    key={s.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 12px",
                      border: "1px solid var(--line)",
                      borderRadius: "14px",
                      background: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="sample_set"
                      checked={selectedSampleKey === s.key}
                      onChange={() => setSelectedSampleKey(s.key)}
                    />
                    <span style={{ fontWeight: 700 }}>{s.label}</span>
                  </label>
                ))}
              </div>

              <label className="modal-check">
                <input
                  type="checkbox"
                  checked={sampleModeReplace}
                  onChange={(e) => setSampleModeReplace(e.target.checked)}
                  disabled={importingSample}
                />
                기존 목록을 비우고 불러오기(교체)
              </label>

              <button className="modal-primary" onClick={importSampleTodos} disabled={importingSample}>
                {importingSample ? "불러오는 중..." : sampleModeReplace ? "교체해서 불러오기" : "추가로 불러오기"}
              </button>
            </div>
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
