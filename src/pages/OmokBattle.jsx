// src/pages/OmokBattle.jsx — 오목 2인 온라인 대전
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import supabase from "../supabaseClient";
import { makeEmptyBoard, place, checkWinner, isFull } from "../utils/omokLogic";
import { saveBestScore } from "../utils/saveBestScore";
import "./OmokBattle.css";

const BOARD_SIZE = 15;  // 오목 표준 15×15
const WIN = 5;
const STALE_MS = 60 * 1000; // 1분

export default function OmokBattle() {
  const navigate = useNavigate();

  const [myId, setMyId] = useState(null);
  const [myNickname, setMyNickname] = useState("");

  // 화면 상태: 'lobby' | 'waiting' | 'playing' | 'spectating' | 'result'
  const [screen, setScreen] = useState("lobby");

  const [roomId, setRoomId] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [myRole, setMyRole] = useState(null); // 'host' | 'guest' | 'spectator'

  const [lobbyError, setLobbyError] = useState("");
  const [loading, setLoading] = useState(false);
  const [staleMsg, setStaleMsg] = useState("");

  const [waitingRooms, setWaitingRooms] = useState([]);
  const [activeGames, setActiveGames] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [myActiveRoom, setMyActiveRoom] = useState(null);

  const channelRef = useRef(null);
  const staleTimerRef = useRef(null);
  const pollRef = useRef(null);
  const myRoleRef = useRef(null);
  const myIdRef = useRef(null);
  const roomIdRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const winSavedRef = useRef(false);

  useEffect(() => { myRoleRef.current = myRole; }, [myRole]);
  useEffect(() => { myIdRef.current = myId; }, [myId]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  // 로그인 사용자 정보 로드
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const me = data?.user;
      if (!me?.id || !alive) return;
      setMyId(me.id);
      const { data: prof } = await supabase.from("profiles").select("nickname").eq("id", me.id).maybeSingle();
      if (alive) setMyNickname(String(prof?.nickname ?? "").trim() || "익명");
    })();
    return () => { alive = false; };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (staleTimerRef.current) clearInterval(staleTimerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // 폴링 (Realtime 폴백)
  useEffect(() => {
    stopPolling();
    if (screen !== "waiting" && screen !== "playing" && screen !== "spectating") return;
    const interval = screen === "waiting" ? 1500 : 2000;
    pollRef.current = setInterval(async () => {
      const rId = roomIdRef.current;
      if (!rId) return;
      const { data } = await supabase.from("omok_rooms").select("*").eq("id", rId).maybeSingle();
      if (!data) return;
      setRoomData(data);
      isSubmittingRef.current = false;
      if (data.status === "playing") setScreen("playing");
      if (data.status === "finished") setScreen("result");
    }, interval);
    return stopPolling;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, stopPolling]);

  // 로비: 진행 중인 내 방 감지
  useEffect(() => {
    if (screen !== "lobby" || !myId) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("omok_rooms").select("*")
        .in("status", ["waiting", "playing"])
        .or(`host_id.eq.${myId},guest_id.eq.${myId}`)
        .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (alive) setMyActiveRoom(data ?? null);
    })();
    return () => { alive = false; };
  }, [screen, myId]);

  // Realtime 구독
  const subscribeToRoom = useCallback((rId) => {
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    const ch = supabase.channel(`omok_room:${rId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "omok_rooms", filter: `id=eq.${rId}` },
        (payload) => {
          const d = payload.new;
          setRoomData(d);
          isSubmittingRef.current = false;
          if (d.status === "playing") setScreen("playing");
          if (d.status === "finished") setScreen("result");
        })
      .on("presence", { event: "leave" }, async ({ leftPresences }) => {
        const myR = myRoleRef.current;
        if (myR !== "host" && myR !== "guest") return;
        const opRole = myR === "host" ? "guest" : "host";
        if (!leftPresences.some((p) => p.role === opRole)) return;
        const { data: fresh } = await supabase.from("omok_rooms").select("status").eq("id", rId).maybeSingle();
        if (!fresh || fresh.status !== "playing") return;
        await supabase.from("omok_rooms").update({ status: "finished", winner: myR, updated_at: new Date().toISOString() }).eq("id", rId);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const uid = myIdRef.current, role = myRoleRef.current;
          if (uid && role && role !== "spectator") await ch.track({ user_id: uid, role });
        }
      });
    channelRef.current = ch;
  }, []);

  // 연결 끊김 감지
  useEffect(() => {
    if (!roomId || roomData?.status !== "playing" || myRole === "spectator") return;
    if (staleTimerRef.current) clearInterval(staleTimerRef.current);
    staleTimerRef.current = setInterval(async () => {
      const rId = roomIdRef.current;
      if (!rId) return;
      const { data: fresh } = await supabase.from("omok_rooms").select("updated_at, status").eq("id", rId).maybeSingle();
      if (!fresh || fresh.status !== "playing") { clearInterval(staleTimerRef.current); return; }
      if (Date.now() - new Date(fresh.updated_at).getTime() > STALE_MS) {
        clearInterval(staleTimerRef.current);
        setStaleMsg("상대방 연결이 끊겼습니다. 게임을 종료합니다.");
        const winner = myRoleRef.current === "host" ? "host" : "guest";
        await supabase.from("omok_rooms").update({ status: "finished", winner, updated_at: new Date().toISOString() }).eq("id", rId);
      }
    }, 30_000);
    return () => { if (staleTimerRef.current) clearInterval(staleTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, roomData?.status, myRole]);

  // 승리 시 승수 저장
  useEffect(() => {
    if (screen !== "result" || winSavedRef.current) return;
    if (!myId || !myNickname || !roomData || myRole === "spectator") return;
    if (roomData.winner !== myRole) return;
    winSavedRef.current = true;
    let alive = true;
    (async () => {
      const { data: prev } = await supabase.from("game_scores").select("score")
        .eq("user_id", myId).eq("game_key", "omok_battle").eq("level", "15x15")
        .order("score", { ascending: false }).limit(1).maybeSingle();
      if (!alive) return;
      await saveBestScore({ supabase, user_id: myId, nickname: myNickname, game_key: "omok_battle", level: "15x15", score: Number(prev?.score ?? 0) + 1 });
    })();
    return () => { alive = false; };
  }, [screen, myId, myNickname, myRole, roomData]);

  // 방 목록 로드
  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase.from("omok_rooms").select("*")
        .in("status", ["waiting", "playing"]).gte("created_at", oneHourAgo)
        .order("created_at", { ascending: false }).limit(40);
      if (error) throw error;
      const rooms = data ?? [];
      setWaitingRooms(rooms.filter((r) => r.status === "waiting"));
      setActiveGames(rooms.filter((r) => r.status === "playing"));
    } catch (e) {
      console.error("방 목록 로드 실패:", e);
      setWaitingRooms([]); setActiveGames([]);
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  useEffect(() => { if (screen === "lobby") loadRooms(); }, [screen, loadRooms]);

  // 방 만들기
  const handleCreateRoom = async () => {
    if (!myId) return;
    setLoading(true); setLobbyError("");
    try {
      await supabase.from("omok_rooms").update({ status: "finished", updated_at: new Date().toISOString() })
        .eq("host_id", myId).eq("status", "waiting");
      const internalCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      const { data, error } = await supabase.from("omok_rooms").insert({
        room_code: internalCode, host_id: myId, host_nickname: myNickname,
        board: makeEmptyBoard(BOARD_SIZE), turn: "host", status: "waiting",
      }).select().single();
      if (error) throw error;
      setRoomId(data.id); roomIdRef.current = data.id;
      setRoomData(data); setMyRole("host"); myRoleRef.current = "host";
      setScreen("waiting"); subscribeToRoom(data.id);
    } catch (e) {
      console.error("방 만들기 실패:", e);
      setLobbyError("방을 만드는 데 실패했어요. 다시 시도해 주세요.");
    } finally { setLoading(false); }
  };

  // 방 참가
  const handleJoinRoom = async (room) => {
    if (!myId) return;
    setLoading(true); setLobbyError("");
    try {
      const { data: fresh, error: fetchErr } = await supabase.from("omok_rooms").select("*").eq("id", room.id).maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!fresh) { setLobbyError("방을 찾을 수 없어요."); return; }
      if (fresh.status !== "waiting") { setLobbyError("이미 시작되었거나 종료된 방이에요."); return; }
      if (fresh.host_id === myId) { setLobbyError("내가 만든 방이에요."); return; }
      const { data: updated, error: upErr } = await supabase.from("omok_rooms").update({
        guest_id: myId, guest_nickname: myNickname, status: "playing", updated_at: new Date().toISOString(),
      }).eq("id", room.id).select().single();
      if (upErr) throw upErr;
      setRoomId(updated.id); roomIdRef.current = updated.id;
      setRoomData(updated); setMyRole("guest"); myRoleRef.current = "guest";
      setScreen("playing"); subscribeToRoom(updated.id);
    } catch (e) {
      console.error("방 참가 실패:", e);
      setLobbyError("방 참가에 실패했어요. 다시 시도해 주세요.");
    } finally { setLoading(false); }
  };

  // 관전
  const handleSpectate = async (game) => {
    let snap = game;
    try {
      const { data: fresh } = await supabase.from("omok_rooms").select("*").eq("id", game.id).maybeSingle();
      if (fresh) snap = fresh;
    } catch { /* 조회 실패 시 기존 데이터 사용 */ }
    setMyRole("spectator"); myRoleRef.current = "spectator";
    setRoomId(snap.id); roomIdRef.current = snap.id; setRoomData(snap);
    if (snap.status === "finished") setScreen("result");
    else { setScreen("spectating"); subscribeToRoom(snap.id); }
  };

  // 돌 놓기
  const handleCellClick = async (r, c) => {
    if (isSubmittingRef.current) return;
    if (!roomData || !myRole || roomData.status !== "playing") return;
    if (roomData.turn !== myRole) return;
    const board = roomData.board;
    if (!Array.isArray(board) || !Array.isArray(board[r])) return;
    if (board[r][c] !== null) return;

    const stone = myRole === "host" ? "B" : "W";
    const newBoard = place(board, r, c, stone);
    const nextTurn = myRole === "host" ? "guest" : "host";
    const won = checkWinner(newBoard, WIN) === stone;
    const draw = !won && isFull(newBoard);

    isSubmittingRef.current = true;

    // 낙관적 업데이트
    setRoomData((prev) => ({
      ...prev, board: newBoard, turn: nextTurn, last_move: { r, c },
      ...(won ? { status: "finished", winner: myRole } : {}),
      ...(draw ? { status: "finished", winner: "draw" } : {}),
    }));
    if (won || draw) setScreen("result");

    try {
      await supabase.from("omok_rooms").update({
        board: newBoard, turn: nextTurn, last_move: { r, c },
        ...(won ? { status: "finished", winner: myRole } : {}),
        ...(draw ? { status: "finished", winner: "draw" } : {}),
        updated_at: new Date().toISOString(),
      }).eq("id", roomId);
    } catch (e) {
      console.error("착수 실패:", e);
      isSubmittingRef.current = false;
    }
  };

  // 기권
  const handleResign = async () => {
    if (!roomData || !myRole || roomData.status !== "playing") return;
    const ok = window.confirm("기권하시겠습니까? 상대방이 승리하게 됩니다.");
    if (!ok) return;
    const winner = myRole === "host" ? "guest" : "host";
    setRoomData((prev) => ({ ...prev, status: "finished", winner }));
    setScreen("result");
    await supabase.from("omok_rooms").update({ status: "finished", winner, updated_at: new Date().toISOString() }).eq("id", roomId);
  };

  // 대기 취소
  const handleCancelWaiting = async () => {
    const rId = roomIdRef.current;
    if (rId) {
      try {
        await supabase.from("omok_rooms").update({ status: "finished", updated_at: new Date().toISOString() })
          .eq("id", rId).eq("status", "waiting");
      } catch (e) { console.error("방 취소 실패:", e); }
    }
    resetToLobby();
  };

  // 재접속
  const handleRejoin = () => {
    if (!myActiveRoom || !myId) return;
    const role = myActiveRoom.host_id === myId ? "host" : "guest";
    setMyRole(role); myRoleRef.current = role;
    setRoomId(myActiveRoom.id); roomIdRef.current = myActiveRoom.id;
    setRoomData(myActiveRoom); setMyActiveRoom(null);
    setScreen(myActiveRoom.status === "waiting" ? "waiting" : "playing");
    subscribeToRoom(myActiveRoom.id);
  };

  const resetToLobby = () => {
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    if (staleTimerRef.current) { clearInterval(staleTimerRef.current); staleTimerRef.current = null; }
    stopPolling();
    winSavedRef.current = false;
    setScreen("lobby"); setRoomData(null); setRoomId(null);
    setMyRole(null); setMyActiveRoom(null);
    setLobbyError(""); setStaleMsg("");
    isSubmittingRef.current = false;
  };

  // 파생 값
  const myTurn = roomData?.turn === myRole;
  const board = roomData?.board ?? makeEmptyBoard(BOARD_SIZE);
  const lastMove = roomData?.last_move ?? null;
  const opNickname = myRole === "host" ? (roomData?.guest_nickname || "상대방") : (roomData?.host_nickname || "상대방");
  const myStone = myRole === "host" ? "black" : "white";
  const opStone = myRole === "host" ? "white" : "black";

  const getWinnerText = () => {
    const w = roomData?.winner;
    if (myRole === "spectator") {
      if (!w || w === "draw") return "무승부예요";
      const nick = w === "host" ? (roomData?.host_nickname || "검은돌") : (roomData?.guest_nickname || "흰돌");
      return `${nick} 승리! 🎉`;
    }
    if (!w || w === "draw") return "비겼어요";
    return w === myRole ? "내가 이겼어요! 🎉" : "상대방이 이겼어요";
  };

  const renderHeader = () => (
    <div className="omok-battle-head">
      <button type="button" className="omok-battle-back" onClick={() => navigate("/omok")}>오목</button>
      <div className="omok-battle-title">⚫ 오목대전</div>
      <div className="omok-battle-menu"><HamburgerMenu /></div>
    </div>
  );

  const renderBoard = (disabled) => (
    <div className="omok-battle-board" role="grid" aria-label="오목판">
      {board.map((row, r) => (
        <div className="omok-battle-rowline" role="row" key={`r-${r}`}>
          {row.map((cell, c) => {
            const isLast = !!lastMove && lastMove.r === r && lastMove.c === c;
            return (
              <button
                key={`c-${r}-${c}`}
                type="button"
                className={`omok-battle-cell${isLast ? " last" : ""}`}
                role="gridcell"
                onClick={() => handleCellClick(r, c)}
                aria-label={`${r + 1}행 ${c + 1}열`}
                disabled={disabled}
              >
                {cell === "B" ? <span className={`omok-battle-stone black${isLast ? " last-stone" : ""}`} />
                  : cell === "W" ? <span className={`omok-battle-stone white${isLast ? " last-stone" : ""}`} />
                  : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  // ─── LOBBY ───
  if (screen === "lobby") return (
    <div className="omok-battle-page">
      {renderHeader()}
      {myActiveRoom && (
        <div className="omok-rejoin-banner">
          <div className="omok-rejoin-text">⚫ 진행 중인 대국이 있어요!</div>
          <button type="button" className="omok-battle-btn primary" onClick={handleRejoin}>게임으로 돌아가기</button>
        </div>
      )}
      <button type="button" className="omok-battle-btn primary omok-create-btn" onClick={handleCreateRoom} disabled={loading || !myId}>
        + 방 만들기
      </button>
      {lobbyError && <p className="omok-battle-error">{lobbyError}</p>}
      <div className="omok-rooms-section">
        <div className="omok-rooms-header">
          <span className="omok-rooms-title">방 목록</span>
          <button type="button" className="omok-rooms-refresh" onClick={loadRooms} disabled={roomsLoading} aria-label="새로고침">🔄</button>
        </div>
        {roomsLoading ? <p className="omok-rooms-empty">불러오는 중...</p>
          : waitingRooms.length === 0 && activeGames.length === 0 ? (
            <p className="omok-rooms-empty">방이 없어요. 첫 번째로 만들어 보세요!</p>
          ) : (
            <div className="omok-rooms-list">
              {waitingRooms.map((g) => (
                <div key={g.id} className="omok-room-item">
                  <div className="omok-room-info">
                    <span className="omok-room-name">{g.host_nickname}의 방</span>
                    <span className="omok-room-badge waiting">대기 중</span>
                  </div>
                  {g.host_id === myId ? <span className="omok-my-room">내 방</span> : (
                    <button type="button" className="omok-battle-btn primary omok-join-btn" onClick={() => handleJoinRoom(g)} disabled={loading}>참가</button>
                  )}
                </div>
              ))}
              {activeGames.map((g) => (
                <div key={g.id} className="omok-room-item">
                  <div className="omok-room-info">
                    <span className="omok-room-name">{g.host_nickname} <span className="omok-vs">vs</span> {g.guest_nickname || "?"}</span>
                    <span className="omok-room-badge playing">진행 중</span>
                  </div>
                  <button type="button" className="omok-battle-btn omok-watch-btn" onClick={() => handleSpectate(g)}>관전</button>
                </div>
              ))}
            </div>
          )}
      </div>
      <div style={{ textAlign: "center", marginTop: 12 }}>
        <button type="button" className="omok-battle-btn" onClick={() => navigate("/omok-battle-ranking")}>🏆 오목대전 랭킹</button>
      </div>
    </div>
  );

  // ─── WAITING ───
  if (screen === "waiting") return (
    <div className="omok-battle-page">
      {renderHeader()}
      <div className="omok-battle-waiting">
        <p className="omok-battle-waiting-title">친구를 기다리는 중...</p>
        <div className="omok-battle-room-name">{roomData?.host_nickname}의 방</div>
        <p className="omok-battle-waiting-hint">친구가 방 목록에서 참가하면 자동으로 시작됩니다</p>
        <button type="button" className="omok-battle-btn" onClick={handleCancelWaiting} style={{ marginTop: 24 }}>취소</button>
      </div>
    </div>
  );

  // ─── PLAYING ───
  if (screen === "playing") return (
    <div className="omok-battle-page">
      {renderHeader()}
      <div className="omok-battle-players-banner">
        <div className={`omok-battle-player${myTurn ? " active-turn" : ""}`}>
          <span className={`omok-battle-stone-icon ${myStone}`} />
          <div>
            <div className="omok-battle-player-name">{myNickname} (나)</div>
          </div>
        </div>
        <div className="omok-battle-vs">VS</div>
        <div className={`omok-battle-player${!myTurn ? " active-turn" : ""}`}>
          <span className={`omok-battle-stone-icon ${opStone}`} />
          <div>
            <div className="omok-battle-player-name">{opNickname}</div>
          </div>
        </div>
      </div>
      {staleMsg && <p className="omok-battle-error" style={{ textAlign: "center", margin: "8px 0" }}>{staleMsg}</p>}
      <div className="omok-battle-msg" aria-live="polite">
        {myTurn ? "내 차례예요! ⚫" : "상대방 차례예요..."}
      </div>
      {renderBoard(!myTurn)}
      <div className="omok-battle-actions">
        <button type="button" className="omok-battle-resign" onClick={handleResign}>기권</button>
      </div>
    </div>
  );

  // ─── SPECTATING ───
  if (screen === "spectating") {
    const hostNick = roomData?.host_nickname || "검은돌";
    const guestNick = roomData?.guest_nickname || "흰돌";
    const currentTurn = roomData?.turn;
    return (
      <div className="omok-battle-page">
        {renderHeader()}
        <div className="omok-battle-players-banner">
          <div className={`omok-battle-player${currentTurn === "host" ? " active-turn" : ""}`}>
            <span className="omok-battle-stone-icon black" /><div><div className="omok-battle-player-name">{hostNick}</div></div>
          </div>
          <div className="omok-battle-vs">VS</div>
          <div className={`omok-battle-player${currentTurn === "guest" ? " active-turn" : ""}`}>
            <span className="omok-battle-stone-icon white" /><div><div className="omok-battle-player-name">{guestNick}</div></div>
          </div>
        </div>
        <div className="omok-battle-msg">
          👀 관전 중 — {currentTurn === "host" ? `${hostNick}의 차례` : `${guestNick}의 차례`}
        </div>
        {renderBoard(true)}
        <div className="omok-battle-actions">
          <button type="button" className="omok-battle-btn" onClick={resetToLobby}>나가기</button>
        </div>
      </div>
    );
  }

  // ─── RESULT ───
  if (screen === "result") return (
    <div className="omok-battle-page">
      {renderHeader()}
      <div className="omok-battle-finish">
        <div className="omok-battle-finish-title">{getWinnerText()}</div>
        {myRole === "spectator" ? (
          <div className="omok-battle-finish-actions">
            <button type="button" className="omok-battle-btn" onClick={resetToLobby}>관전 종료 (로비로)</button>
          </div>
        ) : (
          <div className="omok-battle-finish-actions">
            <button type="button" className="omok-battle-resign" onClick={resetToLobby}>다시 대국하기</button>
            <button type="button" className="omok-battle-btn" onClick={() => navigate("/planner")}>플래너로</button>
          </div>
        )}
      </div>
    </div>
  );

  return null;
}
