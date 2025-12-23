// app.jsx
import { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import TodoItem from "../components/TodoItem";

// todos 서버
const BASE_URL = "http://localhost:4000/todos";

function App() {
  const [todo, setTodo] = useState("");
  const [todos, setTodos] = useState([]);
  const [filter, setFilter] = useState("all");

  // 폭죽 중복 방지 (모두 완료 시 1회만)
  const [celebrated, setCelebrated] = useState(false);

  // 완료 사운드
  const finishAudioRef = useRef(null);

  // 최신 todos 참조용 (클릭 순간 판정 안정화)
  const todosRef = useRef([]);

  //날짜
 const formatToday = () => {
  const today = new Date();
  const days = ["일", "월", "화", "수", "목", "금", "토"];

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const date = String(today.getDate()).padStart(2, "0");
  const day = days[today.getDay()];

  return `${year}-${month}-${date} (${day})`;
  };

  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  // 스탑워치 상태/레퍼런스 추가
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0); // 누적 시간(ms)
  const startTimeRef = useRef(null);             // 마지막 tick 기준 시각
  const timerRef = useRef(null);                 // interval id

  // 초기 todo 불러오기
  useEffect(() => {
    const fetchTodos = async () => {
      const res = await fetch(BASE_URL);
      const data = await res.json();
      setTodos(data);
    };
    fetchTodos();
  }, []);

  // 사운드 public/finish.mp3
  useEffect(() => {
    finishAudioRef.current = new Audio("/finish.mp3");
    finishAudioRef.current.volume = 0.9;
    finishAudioRef.current.preload = "auto";
  }, []);

  // 컴포넌트 언마운트 시 스탑워치 interval 정리
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
    };
  }, []);

  const handleChange = (e) => setTodo(e.target.value);

  const addTodo = async () => {
    if (!todo.trim()) return;

    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: todo, completed: false }),
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

  // 완료 토글 (여기서 마지막 완료 판정)
  const onToggle = async (todo) => {
    const res = await fetch(`${BASE_URL}/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !todo.completed }),
    });

    const updated = await res.json();

    // 토글 후 상태를 먼저 계산
    const current = todosRef.current;
    const nextTodos = current.map((t) => (t.id === todo.id ? updated : t));

    setTodos(nextTodos);

    const allCompleted = nextTodos.length > 0 && nextTodos.every((t) => t.completed);

    // 마지막 완료 클릭 순간
    if (allCompleted && !celebrated) {
      fireConfetti();
      playFinishSound();
      setCelebrated(true);
    }

    // 다시 미완료가 생기면 리셋
    if (!allCompleted && celebrated) {
      setCelebrated(false);
    }
  };

  // 삭제/추가 등으로 상태가 바뀌었을 때 안전 리셋
  useEffect(() => {
    if (todos.length === 0 && celebrated) {
      setCelebrated(false);
      return;
    }
    const allCompleted = todos.every((t) => t.completed);
    if (!allCompleted && celebrated) {
      setCelebrated(false);
    }
  }, [todos, celebrated]);

  const filteredTodos = todos.filter((t) => {
    if (filter === "completed") return t.completed;
    if (filter === "uncompleted") return !t.completed;
    return true;
  });

  return (
    <div>
      <header className="top-header">
        <div className="top-row">
          <h1 className="app-title">초등 스터디 플래너</h1>
          {/* API 연결 할 것 */}
          <div className="weather"><img src="/weather_sample.png" alt="날씨" /></div>
        </div>

        <div className="sub-row">
          {/* 사용자 이름에서 불러오기, 앞에 남/여 캐릭터 이미지 붙이기 */}
          <div className="kid-name"><img src="/icon_boy.png" alt="남아" />제영이</div>
          <div className="today">{formatToday()}</div>
        </div>
      </header>

      {/* 전체 흐름에 방해가 되는 것 같아 일단 컨텐츠 제외
      <div className="goal">
        ★오늘의 다짐★
        <input type="text" placeholder="빨리 숙제 끝내고 놀자!" />
      </div> */}

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
        <button onClick={addTodo} disabled={!todo.trim()}>입력</button>
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
        <div><input type="text" placeholder="레고하기~" /></div>
      </div>

      {/* 스탑워치 */}
      <div className="stopwatch">
        <span className="title">스탑워치</span>
        <div className="time">{formatTime(elapsedMs)}</div>
        <button onClick={startStopwatch} disabled={isRunning}>시작</button>
        <button onClick={stopStopwatch} disabled={!isRunning}>멈춤</button>
        <button onClick={resetStopwatch}>다시</button>
      </div>
    </div>
  );
}

export default App;
