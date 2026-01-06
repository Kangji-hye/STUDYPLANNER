// src/pages/Planner.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import TodoItem from "../components/TodoItem";
import supabase from "../supabaseClient";

// 날씨 API 관련
import { useWeatherYongin } from "../hooks/useWeatherYongin";
import WeatherIcon from "../components/WeatherIcon";

const EMOJI_POOL = [
  "🚀", "🛸", "⚡", "🔥", "💖",
  "🚗", "🏎️", "🚓", "🚒", "🚜",
  "🦖", "🦕", "🦁", "🐯", "🦈",
  "⚽", "🏀", "⚾", "🥅", "🏆",
  "🛡️", "⚔️", "👑", "🍓", "✨",
  "🦄", "🐰", "🐶", "🐱", "🌈",
];

function Planner() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);

  const [todo, setTodo] = useState("");
  const [todos, setTodos] = useState([]);
  const [filter, setFilter] = useState("all");

  const [usedEmojis, setUsedEmojis] = useState([]);

  // 템플릿 불러오기 로딩 상태
  const [importingWinter, setImportingWinter] = useState(false);

  // 최신 todos 참조용
  const todosRef = useRef([]);
  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  // 완료 사운드
  const finishAudioRef = useRef(null);

  // 프로필 캐시
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

  // 날짜
  const formatToday = () => {
    const today = new Date();
    const days = ["일", "월", "화", "수", "목", "금", "토"];

    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const date = String(today.getDate()).padStart(2, "0");
    const day = days[today.getDay()];

    return `${year}-${month}-${date} (${day})`;
  };

  // 랜덤 이모지
  const getRandomEmoji = () => {
    const available = EMOJI_POOL.filter((emoji) => !usedEmojis.includes(emoji));
    const pool = available.length > 0 ? available : EMOJI_POOL;

    const selected = pool[Math.floor(Math.random() * pool.length)];

    setUsedEmojis((prev) =>
      available.length > 0 ? [...prev, selected] : [selected]
    );

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

  // 사운드 재생
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

  // 사운드 로드
  useEffect(() => {
    finishAudioRef.current = new Audio("/finish.mp3");
    finishAudioRef.current.volume = 0.9;
    finishAudioRef.current.preload = "auto";
  }, []);

  // 스탑워치
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    const centiseconds = String(Math.floor((ms % 1000) / 10)).padStart(2, "0");
    return `${minutes}:${seconds}.${centiseconds}`;
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

    // ----------------------------
  // ✅ Supabase: 사용자/프로필/todos 로딩
  // ----------------------------
  const fetchTodos = async (userId) => {
    const { data, error } = await supabase
      .from("todos")
      .select("id, user_id, title, completed, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("fetchTodos error:", error);
      alert(error.message);
      return;
    }

    setTodos(data ?? []);
  };

  const loadMeAndProfileAndTodos = async () => {
    setLoading(true);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      setLoading(false);
      navigate("/login");
      return;
    }

    const user = userData.user;
    setMe(user);

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, nickname, birthdate, is_male")
      .eq("id", user.id)
      .maybeSingle();

    const nextProfile =
      profileError || !profileData
        ? {
            id: user.id,
            nickname: user.user_metadata?.nickname ?? "닉네임",
            birthdate: user.user_metadata?.birthdate ?? null,
            is_male: user.user_metadata?.is_male ?? true,
          }
        : profileData;

    setProfile(nextProfile);
    try {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(nextProfile));
    } catch {}

    await fetchTodos(user.id);
    setLoading(false);
  };

  useEffect(() => {
    loadMeAndProfileAndTodos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 성별 아이콘
  const kidIconSrc = profile?.is_male ? "/icon_boy.png" : "/icon_girl.png";
  const kidAlt = profile?.is_male ? "남아" : "여아";
  const kidName = profile?.nickname ?? "닉네임";

  // ----------------------------
  // ✅ Supabase: CRUD
  // ----------------------------
  const handleChange = (e) => setTodo(e.target.value);

  const addTodo = async () => {
    const raw = todo.trim();
    if (!raw) return;
    if (!me?.id) return;

    const emoji = getRandomEmoji();
    const titleWithEmoji = `${emoji} ${raw}`;

    const { data, error } = await supabase
      .from("todos")
      .insert([
        {
          user_id: me.id,
          title: titleWithEmoji,
          completed: false,
        },
      ])
      .select("id, user_id, title, completed, created_at")
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

    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  const onToggle = async (item) => {
    const current = todosRef.current;
    const wasAllCompleted = current.length > 0 && current.every((t) => t.completed);

    const { data, error } = await supabase
      .from("todos")
      .update({ completed: !item.completed })
      .eq("id", item.id)
      .select("id, user_id, title, completed, created_at")
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
    }
  };

  // ----------------------------
  // ✅ 겨울방학 템플릿 -> 내 todos로 복사
  // ----------------------------
  const extractLeadingEmoji = (title) => {
    const first = String(title ?? "").trim().split(/\s+/)[0];
    return first && first.length <= 4 ? first : null; // 이모지 보통 1~2글자
  };

  const importWinterTodos = async () => {
  if (!me?.id) return;
  if (importingWinter) return;

  try {
    setImportingWinter(true);

    // 1) 템플릿 가져오기 (item_key 필수)
    const { data: templates, error: tplErr } = await supabase
      .from("todo_templates")
      .select("item_key, title, sort_order")
      .eq("template_key", "winter")
      .order("sort_order", { ascending: true });

    if (tplErr) throw tplErr;

    const rows = (templates ?? [])
      .map((x) => ({
        user_id: me.id,
        template_item_key: String(x.item_key ?? "").trim(), // ✅ 중복 판정 키
        title: String(x.title ?? "").trim(),
        completed: false,
      }))
      .filter((x) => x.template_item_key && x.title);

    if (rows.length === 0) {
      alert("겨울방학 숙제 템플릿(item_key 포함)이 비어있습니다. todo_templates를 확인해주세요.");
      return;
    }

    // 2) 내 todos로 복사
    //    user_id + template_item_key 기준으로 중복 방지
    const { error: upErr } = await supabase
      .from("todos")
      .upsert(rows, {
        onConflict: "user_id,template_item_key",
        ignoreDuplicates: true,
      });

    if (upErr) throw upErr;

    // 3) 화면 갱신
    await fetchTodos(me.id);

    alert("겨울방학 숙제를 불러왔습니다.");
  } catch (err) {
    console.error("importWinterTodos error:", err);
    alert(err?.message ?? "겨울방학 숙제 불러오기 중 오류가 발생했습니다.");
  } finally {
    setImportingWinter(false);
  }
};

  // 필터
  const filteredTodos = useMemo(() => {
    if (filter === "completed") return todos.filter((t) => t.completed);
    if (filter === "uncompleted") return todos.filter((t) => !t.completed);
    return todos;
  }, [filter, todos]);

  if (loading) return <div style={{ padding: 20 }}>로딩중...</div>;

  return (
    <div>
      <header className="top-header">
        <div className="top-row">
          <h1
            className="app-title app-title-link"
            title="마이페이지로 이동"
            onClick={() => navigate("/mypage")}
          >
            초등 스터디 플래너
          </h1>

          <div className="weather">
            <WeatherIcon code={weatherCode} size={52} />
          </div>
        </div>

        <div className="sub-row">
          <div className={`kid-name ${profile?.is_male ? "kid-boy" : "kid-girl"}`}>
            <img src={kidIconSrc} alt={kidAlt} />
            {kidName}
          </div>

          <div className="date-stack">
            <div className="today">{formatToday()}</div>
          </div>
        </div>
      </header>

      <div className="todo-bar">
        <button
          className="preset-btn"
          onClick={importWinterTodos}
          disabled={importingWinter}
          title="겨울방학 숙제를 내 플래너로 복사합니다"
        >
          {importingWinter ? "불러오는 중..." : "📂 겨울방학 숙제 불러오기"}
        </button>

        <input
          value={todo}
          onChange={handleChange}
          placeholder="새로운 내용 입력"
          className="todo-input"
          onKeyDown={(e) => {
            if (e.key === "Enter" && todo.trim()) addTodo();
          }}
        />

        <button onClick={addTodo} disabled={!todo.trim()}>
          입력
        </button>
      </div>

      <ul>
        {filteredTodos.map((t) => (
          <TodoItem key={t.id} t={t} onToggle={onToggle} onDelete={onDelete} />
        ))}
      </ul>

      <div className="fillter">
        <button onClick={() => setFilter("all")}>전체</button>
        <button onClick={() => setFilter("completed")}>했음</button>
        <button onClick={() => setFilter("uncompleted")}>안했음</button>
      </div>

      <div className="finish">
        <span className="title">공부 다하면?</span>
        <div>
          <input type="text" placeholder="레고하기~" />
        </div>
      </div>

      <div className="stopwatch">
        <span className="title">스탑워치</span>
        <div className="time">{formatTime(elapsedMs)}</div>
        <button onClick={startStopwatch} disabled={isRunning}>
          시작
        </button>
        <button onClick={stopStopwatch} disabled={!isRunning}>
          멈춤
        </button>
        <button onClick={resetStopwatch}>다시</button>
      </div>
    </div>
  );
}

export default Planner;
