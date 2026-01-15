// src/pages/Planner.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import TodoItem from "../components/TodoItem";
import supabase from "../supabaseClient";
import "./Planner.css";
import { useWeatherYongin } from "../hooks/useWeatherYongin";
import WeatherIcon from "../components/WeatherIcon";
// import { useSoundSettings } from "../context/SoundSettingsContext";

// 이모지 풀
const EMOJI_POOL = [
  "🚀", "🛸", "⚡", "🔥", "💖",
  "🚗", "🏎️", "🚓", "🚒", "🚜",
  "🦖", "🦕", "🦁", "🐯", "🦈",
  "⚽", "🏀", "⚾", "🥅", "🏆",
  "🛡️", "⚔️", "👑", "🍓", "✨",
  "🦄", "🐰", "🐶", "🐱", "🌈",
];

// ✅ (1) EMOJI_POOL 아래, Planner() 위에 추가
async function waitForAuthSession({ timeoutMs = 4000 } = {}) {
  // 이미 세션이 있으면 즉시 반환
  const { data: s1 } = await supabase.auth.getSession();
  if (s1?.session) return s1.session;

  // 소셜 로그인 직후: auth state change를 잠깐 기다림
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
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [todo, setTodo] = useState("");
  const [todos, setTodos] = useState([]);
  const [filter, setFilter] = useState("all");
  const [usedEmojis, setUsedEmojis] = useState([]);
  // const { sfxEnabled } = useSoundSettings();

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
  const [myListMode, setMyListMode] = useState("load"); // 'save' | 'load'
  const [loadReplace, setLoadReplace] = useState(false);
  const [busyMyList, setBusyMyList] = useState(false);
  const [hasMyList, setHasMyList] = useState(false);

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

  // todos 가져오기
  const fetchTodos = async (userId) => {
    const { data, error } = await supabase
      .from("todos")
      .select("id, user_id, title, completed, created_at, template_item_key, source_set_item_key")
      // .eq("user_id", userId)
      // .order("created_at", { ascending: false });
      .eq("user_id", userId)
      // template_item_key 나중
      .order("template_item_key", { ascending: true, nullsFirst: true })
      // 내 입력은 최신이 위로 보이게
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetchTodos error:", error);
      alert(error.message);
      return;
    }
    setTodos(data ?? []);
  };

  // 내 목록 확인
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

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        if (!mounted) return;
        setLoading(false);
        navigate("/login");
        return;
      }

      const user = userData.user;
      if (mounted) setMe(user);

      // 프로필 불러오기
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

      // 프로필 상태 및 캐시 업데이트
      if (mounted) setProfile(nextProfile);
      try {
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(nextProfile));
      } catch (err) {
        console.warn("프로필 캐시 저장 실패", err);
      }

      // 카카오/소셜 로그인으로 profiles row가 없을 때 대비
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

      await fetchTodos(user.id);
      await fetchMySingleListInfo(user.id);

      if (!mounted) return;
      setLoading(false);
    };

    loadAll();

    return () => {
      mounted = false;
    };
  }, [navigate]);


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
          template_item_key: `winter:${String(x.item_key ?? "").trim()}`,
          title: String(x.title ?? "").trim(),
          completed: false,
        }))
        .filter((x) => x.template_item_key && x.title);

      if (rows.length === 0) {
        alert("템플릿이 비어있습니다. todo_templates를 확인해주세요.");
        return;
      }

      const { error: upErr } = await supabase
        .from("todos")
        .upsert(rows, {
          onConflict: "user_id,template_item_key",
          ignoreDuplicates: true,
        });

      if (upErr) throw upErr;

      await fetchTodos(me.id);
      alert("방학 숙제를 불러왔습니다.");
    } catch (err) {
      console.error("importWinterTodos error:", err);
      alert(err?.message ?? "방학 숙제 불러오기 중 오류가 발생했습니다.");
    } finally {
      setImportingWinter(false);
    }
  };

  // 모달
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

      // todo_sets: user_id + kind='single' 1개만 유지
      const { data: setRow, error: setErr } = await supabase
        .from("todo_sets")
        .upsert([{ user_id: me.id, kind: "single", name: "내 목록" }], {
          onConflict: "user_id,kind",
        })
        .select("id")
        .single();

      if (setErr) throw setErr;

      // 기존 항목 삭제 후 덮어쓰기
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

      const { error: insertItemsErr } = await supabase
        .from("todo_set_items")
        .insert(items);

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

  // 내 목록 불러오기
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
          .eq("user_id", me.id);
        if (delErr) throw delErr;
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
          source_set_item_key: `single:${String(x.item_key ?? "").trim()}`,
          title: String(x.title ?? "").trim(),
          completed: false,
        }))
        .filter((x) => x.source_set_item_key && x.title);

      if (rows.length === 0) {
        alert("내 목록에 항목이 없습니다.");
        return;
      }

      const { error: upErr } = await supabase
        .from("todos")
        .upsert(rows, {
          onConflict: "user_id,source_set_item_key",
          ignoreDuplicates: true,
        });

      if (upErr) throw upErr;

      await fetchTodos(me.id);
      alert(loadReplace ? "내 목록으로 교체했습니다." : "내 목록을 불러왔습니다.");
      setShowMyListModal(false);
    } catch (err) {
      console.error("importMySingleList error:", err);
      alert(err?.message ?? "내 목록 불러오기 중 오류가 발생했습니다.");
    } finally {
      setBusyMyList(false);
    }
  };

  // todos CRUD
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
          template_item_key: null,
          source_set_item_key: null,
        },
      ])
      .select("id, user_id, title, completed, created_at, template_item_key, source_set_item_key")
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
      .select("id, user_id, title, completed, created_at, template_item_key, source_set_item_key")
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

  // 필터
  const filteredTodos = useMemo(() => {
    if (filter === "completed") return todos.filter((t) => t.completed);
    if (filter === "uncompleted") return todos.filter((t) => !t.completed);
    return todos;
  }, [filter, todos]);

  // 아이콘/닉네임
  const kidIconSrc = profile?.is_male ? "/icon_boy.png" : "/icon_girl.png";
  const kidAlt = profile?.is_male ? "남아" : "여아";
  const kidName = profile?.nickname ?? "닉네임";

  if (loading) return <div className="planner-loading">로딩중...</div>;

  //  전체 삭제
  const deleteAllTodos = async () => {
    if (!me?.id) return;

    const ok = window.confirm(
      "정말 모든 할 일을 삭제할까요?\n이 작업은 되돌릴 수 없습니다."
    );
    if (!ok) return;

    const { error } = await supabase.from("todos").delete().eq("user_id", me.id);
    if (error) {
      console.error("deleteAllTodos error:", error);
      alert(error.message ?? "전체 삭제 중 오류가 발생했습니다.");
      return;
    }
    setTodos([]);
  };

  // 하단 로그아웃
  const handleLogout = async () => {
    await supabase.auth.signOut();
    try {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    } catch (err) {
      console.warn("프로필 캐시 삭제 실패", err);
    }
    navigate("/login");
  };

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
            <div className="today" title="오늘 날짜와 요일">{formatToday()}</div>
          </div>
        </div>
      </header>

      {/* 버튼 */}
      <div className="todo-bar todo-bar-grid">
        <div className="todo-bar-actions">
          
          <button
            className="preset-btn  preset-btn-primary"
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
            title="현재 목록 전체 삭제"
            onClick={deleteAllTodos}
          >
            🗑️ 현재 목록 전체 삭제
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
          {/* <button className="todo-add-btn" onClick={addTodo} disabled={!todo.trim()}>
            입력
          </button> */}
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

      {/* 좌측 전체삭제 / 우측 필터 */}
      <div className="filter-bar">
        <div className="filter-group-left">
          <button
            className={`filter-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            전체
          </button>

          <button
            className={`filter-btn ${filter === "completed" ? "active" : ""}`}
            onClick={() => setFilter("completed")}
          >
            했음
          </button>

          <button
            className={`filter-btn ${filter === "uncompleted" ? "active" : ""}`}
            onClick={() => setFilter("uncompleted")}
          >
            안했음
          </button>
        </div>
      </div>

      <div className="finish">
        <span className="title">공부 다하면?</span>
        <div>
          <input type="text" placeholder="뭐하고 놀까~" />
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

      {/* 내 목록 모달 */}
      {showMyListModal && (
        <div className="modal-backdrop" onClick={closeMyListModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">
                {myListMode === "save" ? "내 목록 저장" : "내 목록 불러오기"}
              </div>

              <button className="modal-close" onClick={closeMyListModal} disabled={busyMyList}>
                ✕
              </button>
            </div>

            {myListMode === "save" ? (
              <div className="modal-body">
                <div className="modal-help">
                  지금 화면의 할 일 목록을 “내 목록”으로 저장합니다. 저장하면 이전 내 목록은 덮어씁니다.
                </div>

                <button className="modal-primary" onClick={saveMySingleList} disabled={busyMyList}>
                  {busyMyList ? "저장 중..." : "내 목록으로 저장하기"}
                </button>
              </div>
            ) : (
              <div className="modal-body">
                <div className="modal-help">
                  저장된 내 목록을 현재 플래너로 가져옵니다.
                </div>

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

      <footer className="planner-footer-simple">
        <div className="footer-links">
          <a className="footer-link-primary" onClick={() => navigate("/mypage")}>마이페이지</a> 
          <span>|</span> 
          <a onClick={handleLogout}>로그아웃</a>
        </div>

        <div className="footer-copy">
          © {new Date().getFullYear()} Study Planner
        </div>
      </footer>

    </div>
  );
}

export default Planner;
