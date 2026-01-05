// pages/planner.jsx

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import TodoItem from "../components/TodoItem";
import supabase from "../supabaseClient";

// 날씨 API 관련
import { useWeatherYongin } from "../hooks/useWeatherYongin";
import WeatherIcon from "../components/WeatherIcon";

// todos 서버
const BASE_URL = "http://localhost:4000/todos";

const EMOJI_POOL = [
  "🚀", "🛸", "⚡", "🔥", "💖",
  "🚗", "🏎️", "🚓", "🚒", "🚜",
  "🦖", "🦕", "🦁", "🐯", "🦈",
  "⚽", "🏀", "⚾", "🥅", "🏆",
  "🛡️", "⚔️", "👑", "🍓", "✨",
  "🦄", "🐰", "🐶", "🐱", "🌈",
];

function App() {
  const navigate = useNavigate();
  const [todo, setTodo] = useState("");
  const [todos, setTodos] = useState([]);
  const [filter, setFilter] = useState("all");
  const [usedEmojis, setUsedEmojis] = useState([]);

  //프로필 닉네임 관련
  // const PROFILE_CACHE_KEY = "planner_profile_cache_v1";
  const [profile, setProfile] = useState(() => {
    try {
      const cached = localStorage.getItem(PROFILE_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  
  // 날씨 API 관련
  const weatherCode = useWeatherYongin();

  // ✅ 플래너에서 내 프로필 로딩
  useEffect(() => {
    const loadProfile = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        // 로그인 안 했으면 플래너를 막고 로그인으로 보내는 편이 UX가 안정적입니다.
        navigate("/login");
        return;
      }

      const user = userData.user;

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, nickname, birthdate, is_male")
        .eq("id", user.id)
        .single();

      // profiles가 없거나 에러면, user_metadata를 임시로 쓰되 기본값을 줍니다.
      const nextProfile = profileError
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
    };

    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 성별에 따른 아이콘 선택
  const kidIconSrc = profile?.is_male ? "/icon_boy.png" : "/icon_girl.png";
  const kidAlt = profile?.is_male ? "남아" : "여아";
  const kidName = profile?.nickname ?? "닉네임";
  

  // 완료 사운드
  const finishAudioRef = useRef(null);

  // 최신 todos 참조용 
  const todosRef = useRef([]);

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

  

  // todosRef 
  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);


  // 초기 todo 불러오기
  useEffect(() => {
    const fetchTodos = async () => {
      const res = await fetch(BASE_URL);
      const data = await res.json();
      setTodos(data);
    };
    fetchTodos();
  }, []);

  // const getRandomEmoji = () => {
  //   return EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)];
  // };

  const getRandomEmoji = () => {
    // 아직 안 쓴 이모지만 남김
    const available = EMOJI_POOL.filter(
      (emoji) => !usedEmojis.includes(emoji)
    );

    // 전부 다 썼으면 초기화
    const pool = available.length > 0 ? available : EMOJI_POOL;
    const selected = pool[Math.floor(Math.random() * pool.length)];

    // 사용한 이모지 기록
    setUsedEmojis((prev) =>
      available.length > 0 ? [...prev, selected] : [selected]
    );

    return selected;
  };

  // 사운드 public/finish.mp3
  useEffect(() => {
    finishAudioRef.current = new Audio("/finish.mp3");
    finishAudioRef.current.volume = 0.9;
    finishAudioRef.current.preload = "auto";
  }, []);

  // 스탑워치 상태/레퍼런스
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0); // 누적 시간(ms)
  const startTimeRef = useRef(null); // 마지막 tick 기준 시각
  const timerRef = useRef(null); // interval id

  // 컴포넌트 언마운트 시 스탑워치 interval 정리
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
    };
  }, []);

  const handleChange = (e) => setTodo(e.target.value);

  const addTodo = async () => {
    if (!todo.trim()) return;

    // 랜덤이모지 추가
    const emoji = getRandomEmoji();
    const titleWithEmoji = `${emoji} ${todo.trim()}`;

    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        title: titleWithEmoji, 
        completed: false }),
    });

    const newTodo = await res.json();
    setTodos((prev) => [...prev, newTodo]);
    setTodo("");
  };

  const onDelete = async (id) => {
    await fetch(`${BASE_URL}/${id}`, { method: "DELETE" });
    setTodos((prev) => prev.filter((t) => t.id !== id));
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

  // 스탑워치 표시 포맷
  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);

    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");

    // 1/100초 (두 자리)
    const centiseconds = String(Math.floor((ms % 1000) / 10)).padStart(2, "0");

    return `${minutes}:${seconds}.${centiseconds}`;
  };

  // 스탑워치 시작
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

  // 스탑워치 정지
  const stopStopwatch = () => {
    if (!isRunning) return;

    setIsRunning(false);
    clearInterval(timerRef.current);
    timerRef.current = null;
    startTimeRef.current = null;
  };

  // 스탑워치 리셋
  const resetStopwatch = () => {
    setIsRunning(false);
    clearInterval(timerRef.current);
    timerRef.current = null;
    startTimeRef.current = null;
    setElapsedMs(0);
  };

  const onToggle = async (todo) => {
    const res = await fetch(`${BASE_URL}/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !todo.completed }),
    });

    const updated = await res.json();

    const current = todosRef.current;
    const wasAllCompleted =
      current.length > 0 && current.every((t) => t.completed);

    const nextTodos = current.map((t) => (t.id === todo.id ? updated : t));
    setTodos(nextTodos);

    const isAllCompleted =
      nextTodos.length > 0 && nextTodos.every((t) => t.completed);

        if (!wasAllCompleted && isAllCompleted) {
      fireConfetti();
      playFinishSound();
    }
  };

  const filteredTodos = todos.filter((t) => {
    if (filter === "completed") return t.completed;
    if (filter === "uncompleted") return !t.completed;
    return true;
  });

  return (
    <div>
      <header className="top-header">
        <div className="top-row">
          {/* <h1 className="app-title">초등 스터디 플래너</h1> */}
          <h1
            className="app-title app-title-link"
            title="마이페이지로 이동"
            onClick={() => navigate("/mypage")}
          >
            초등 스터디 플래너
          </h1>

          {/* 날씨 API 관련 */}
          <div className="weather">
            {/* <img src="/weather_sample.png" alt="날씨" /> */}
              <WeatherIcon code={weatherCode} size={52} />
          </div>
        </div>

        <div className="sub-row">

          {/* 사용자 이름에서 불러오기, 앞에 남/여 캐릭터 이미지 붙이기 */}
          <div
            className={`kid-name ${profile?.is_male ? "kid-boy" : "kid-girl"}`}
          >
            {/* <img src="/icon_boy.png" alt="남아" />
            제영이 */}
            <img src={kidIconSrc} alt={kidAlt} />
            {kidName}
          </div>

           <div className="date-stack">
            
            <div className="today">{formatToday()}</div>
          </div>

          {/* <div className="today">{formatToday()}</div> */}
        </div>
      </header>

      <div className="todo-bar">
        <button className="preset-btn">📂 겨울방학 숙제 불러오기</button>

        <input
          value={todo}
          onChange={handleChange}
          placeholder="새로운 내용 입력"
          className="todo-input"
          onKeyDown={(e) => {
            if (e.key === "Enter" && todo.trim()) {
              addTodo();
            }
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

      {/* 스탑워치 */}
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

export default App;
