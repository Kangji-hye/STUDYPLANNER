// src/pages/BadukBattle.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import supabase from "../supabaseClient";
import { makeEmptyBoard, tryPlaceAndCapture } from "../utils/badukLogic";
import { saveBestScore } from "../utils/saveBestScore";
import "./BadukGame.css";
import "./BadukBattle.css";

const BOARD_SIZE = 9;
const STALE_MS = 2 * 60 * 1000; // 2분


export default function BadukBattle() {
  const navigate = useNavigate();

  // 사용자 정보
  const [myId, setMyId] = useState(null);
  const [myNickname, setMyNickname] = useState("");

  // 화면 상태: 'lobby' | 'waiting' | 'playing' | 'spectating' | 'result'
  const [screen, setScreen] = useState("lobby");

  // 방 상태
  const [roomId, setRoomId] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [myRole, setMyRole] = useState(null); // 'host' | 'guest' | 'spectator'

  // 로비
  const [lobbyError, setLobbyError] = useState("");
  const [loading, setLoading] = useState(false);

  // 연결 끊김 메시지
  const [staleMsg, setStaleMsg] = useState("");

  // 방 목록 (대기 중 + 진행 중)
  const [waitingRooms, setWaitingRooms] = useState([]);
  const [activeGames, setActiveGames] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);

  // 재접속용: 내가 참여 중인 방
  const [myActiveRoom, setMyActiveRoom] = useState(null);

  // refs
  const channelRef = useRef(null);
  const staleTimerRef = useRef(null);
  const pollRef = useRef(null);
  const myRoleRef = useRef(null);
  const roomIdRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const winSavedRef = useRef(false);

  // refs 동기화
  useEffect(() => { myRoleRef.current = myRole; }, [myRole]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  // 로그인 사용자 정보 로드
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const me = data?.user;
      if (!me?.id || !alive) return;
      setMyId(me.id);
      const { data: prof } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("id", me.id)
        .maybeSingle();
      if (alive) setMyNickname(String(prof?.nickname ?? "").trim() || "익명");
    })();
    return () => { alive = false; };
  }, []);

  // 폴링 정지
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // 언마운트 시 채널·타이머·폴링 정리
  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (staleTimerRef.current) clearInterval(staleTimerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Realtime 폴백 폴링 ──
  // Realtime이 불안정한 환경(로컬 개발 등)을 위해 주기적으로 DB를 직접 확인
  useEffect(() => {
    stopPolling();
    if (screen !== "waiting" && screen !== "playing" && screen !== "spectating") return;

    const interval = screen === "waiting" ? 1500 : 2000;
    pollRef.current = setInterval(async () => {
      const rId = roomIdRef.current;
      if (!rId) return;
      const { data } = await supabase
        .from("baduk_rooms")
        .select("*")
        .eq("id", rId)
        .maybeSingle();
      if (!data) return;
      setRoomData(data);
      isSubmittingRef.current = false; // 착수 락 해제
      if (data.status === "playing") setScreen("playing");
      if (data.status === "finished") setScreen("result");
    }, interval);

    return stopPolling;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, stopPolling]);

  // ── 로비 진입 시 내가 참여 중인 방 감지 (재접속 대비) ──
  useEffect(() => {
    if (screen !== "lobby" || !myId) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("baduk_rooms")
        .select("*")
        .in("status", ["waiting", "playing"])
        .or(`host_id.eq.${myId},guest_id.eq.${myId}`)
        .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (alive) setMyActiveRoom(data ?? null);
    })();
    return () => { alive = false; };
  }, [screen, myId]);

  // Realtime 구독
  const subscribeToRoom = useCallback((rId) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    const ch = supabase
      .channel(`baduk_room:${rId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "baduk_rooms",
        filter: `id=eq.${rId}`,
      }, (payload) => {
        const d = payload.new;
        setRoomData(d);
        isSubmittingRef.current = false;
        if (d.status === "playing") setScreen("playing");
        if (d.status === "finished") setScreen("result");
      })
      .subscribe();
    channelRef.current = ch;
  }, []);

  // 대국 중 상대방 연결 끊김 감지 (30초마다 체크, 관전자 제외)
  useEffect(() => {
    if (!roomId || roomData?.status !== "playing" || myRole === "spectator") return;

    if (staleTimerRef.current) clearInterval(staleTimerRef.current);

    staleTimerRef.current = setInterval(async () => {
      const rId = roomIdRef.current;
      if (!rId) return;
      const { data: fresh } = await supabase
        .from("baduk_rooms")
        .select("updated_at, status")
        .eq("id", rId)
        .maybeSingle();
      if (!fresh || fresh.status !== "playing") {
        clearInterval(staleTimerRef.current);
        return;
      }
      const elapsed = Date.now() - new Date(fresh.updated_at).getTime();
      if (elapsed > STALE_MS) {
        clearInterval(staleTimerRef.current);
        setStaleMsg("상대방 연결이 끊겼습니다. 게임을 종료합니다.");
        const winner = myRoleRef.current === "host" ? "host" : "guest";
        await supabase.from("baduk_rooms").update({
          status: "finished",
          winner,
          updated_at: new Date().toISOString(),
        }).eq("id", rId);
      }
    }, 30_000);

    return () => {
      if (staleTimerRef.current) clearInterval(staleTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, roomData?.status, myRole]);

  // result 화면 진입 시 승자 승수 저장
  useEffect(() => {
    if (screen !== "result") return;
    if (winSavedRef.current) return;
    if (!myId || !myNickname || !roomData) return;
    if (myRole === "spectator") return;
    if (roomData.winner !== myRole) return;

    winSavedRef.current = true;
    let alive = true;
    (async () => {
      const { data: prev } = await supabase
        .from("game_scores")
        .select("score")
        .eq("user_id", myId)
        .eq("game_key", "baduk_battle")
        .eq("level", "9x9")
        .order("score", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      const currentWins = Number(prev?.score ?? 0);
      await saveBestScore({
        supabase,
        user_id: myId,
        nickname: myNickname,
        game_key: "baduk_battle",
        level: "9x9",
        score: currentWins + 1,
      });
    })();
    return () => { alive = false; };
  }, [screen, myId, myNickname, myRole, roomData]);

  // 방 목록 로드 (대기 중 + 진행 중)
  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("baduk_rooms")
        .select("*")
        .in("status", ["waiting", "playing"])
        .gte("created_at", oneHourAgo)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      const rooms = data ?? [];
      setWaitingRooms(rooms.filter((r) => r.status === "waiting"));
      setActiveGames(rooms.filter((r) => r.status === "playing"));
    } catch (e) {
      console.error("방 목록 로드 실패:", e);
      setWaitingRooms([]);
      setActiveGames([]);
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  // 로비 화면에서 방 목록 자동 로드
  useEffect(() => {
    if (screen === "lobby") {
      loadRooms();
    }
  }, [screen, loadRooms]);

  // 방 만들기
  const handleCreateRoom = async () => {
    if (!myId) return;
    setLoading(true);
    setLobbyError("");
    try {
      // 내가 이미 만든 대기 중인 방이 있으면 먼저 정리
      await supabase
        .from("baduk_rooms")
        .update({ status: "finished", updated_at: new Date().toISOString() })
        .eq("host_id", myId)
        .eq("status", "waiting");

      const internalCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      const { data, error } = await supabase
        .from("baduk_rooms")
        .insert({
          room_code: internalCode,
          host_id: myId,
          host_nickname: myNickname,
          board_size: BOARD_SIZE,
          board: makeEmptyBoard(BOARD_SIZE),
          turn: "host",
          status: "waiting",
        })
        .select()
        .single();
      if (error) throw error;
      setRoomId(data.id);
      roomIdRef.current = data.id;
      setRoomData(data);
      setMyRole("host");
      myRoleRef.current = "host";
      setScreen("waiting");
      subscribeToRoom(data.id);
    } catch (e) {
      console.error("방 만들기 실패:", e);
      setLobbyError("방을 만드는 데 실패했어요. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  // 방 참가 (목록에서 클릭)
  const handleJoinRoom = async (room) => {
    if (!myId) return;
    setLoading(true);
    setLobbyError("");
    try {
      const { data: fresh, error: fetchErr } = await supabase
        .from("baduk_rooms")
        .select("*")
        .eq("id", room.id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!fresh) { setLobbyError("방을 찾을 수 없어요."); return; }
      if (fresh.status !== "waiting") { setLobbyError("이미 시작되었거나 종료된 방이에요."); return; }
      if (fresh.host_id === myId) { setLobbyError("내가 만든 방이에요."); return; }

      const { data: updated, error: upErr } = await supabase
        .from("baduk_rooms")
        .update({
          guest_id: myId,
          guest_nickname: myNickname,
          status: "playing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", room.id)
        .select()
        .single();
      if (upErr) throw upErr;

      setRoomId(updated.id);
      roomIdRef.current = updated.id;
      setRoomData(updated);
      setMyRole("guest");
      myRoleRef.current = "guest";
      setScreen("playing");
      subscribeToRoom(updated.id);
    } catch (e) {
      console.error("방 참가 실패:", e);
      setLobbyError("방 참가에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  // 관전 진입
  const handleSpectate = async (game) => {
    let roomSnapshot = game;
    try {
      const { data: fresh } = await supabase
        .from("baduk_rooms")
        .select("*")
        .eq("id", game.id)
        .maybeSingle();
      if (fresh) roomSnapshot = fresh;
    } catch {
      // 조회 실패 시 기존 데이터 사용
    }

    setMyRole("spectator");
    myRoleRef.current = "spectator";
    setRoomId(roomSnapshot.id);
    roomIdRef.current = roomSnapshot.id;
    setRoomData(roomSnapshot);

    if (roomSnapshot.status === "finished") {
      setScreen("result");
    } else {
      setScreen("spectating");
      subscribeToRoom(roomSnapshot.id);
    }
  };

  // 착수
  const handleCellClick = async (r, c) => {
    if (isSubmittingRef.current) return;
    if (!roomData || !myRole || roomData.status !== "playing") return;
    if (roomData.turn !== myRole) return;
    const board = roomData.board;
    if (!Array.isArray(board) || !Array.isArray(board[r])) return;
    if (board[r][c] !== null) return;

    const stone = myRole === "host" ? "B" : "W";
    const placed = tryPlaceAndCapture(board, r, c, stone);
    if (!placed.ok) return;

    const nextTurn = myRole === "host" ? "guest" : "host";
    const capField = myRole === "host" ? "cap_host" : "cap_guest";
    const prevCaptures = roomData[capField] || 0;

    isSubmittingRef.current = true;

    // 낙관적 업데이트: 내 화면 즉시 반영
    setRoomData((prev) => ({
      ...prev,
      board: placed.board,
      turn: nextTurn,
      [capField]: prevCaptures + placed.captured,
      last_move: { r, c },
      pass_streak: 0,
    }));

    try {
      await supabase.from("baduk_rooms").update({
        board: placed.board,
        turn: nextTurn,
        [capField]: prevCaptures + placed.captured,
        last_move: { r, c },
        pass_streak: 0,
        updated_at: new Date().toISOString(),
      }).eq("id", roomId);
    } catch (e) {
      console.error("착수 실패:", e);
      isSubmittingRef.current = false;
    }
  };

  // 패스
  const handlePass = async () => {
    if (!roomData || !myRole || roomData.status !== "playing") return;
    if (roomData.turn !== myRole) return;

    const nextStreak = (roomData.pass_streak || 0) + 1;
    const nextTurn = myRole === "host" ? "guest" : "host";

    if (nextStreak >= 2) {
      const capH = roomData.cap_host || 0;
      const capG = roomData.cap_guest || 0;
      let winner = "draw";
      if (capH > capG) winner = "host";
      else if (capG > capH) winner = "guest";

      // 낙관적 업데이트
      setRoomData((prev) => ({ ...prev, pass_streak: nextStreak, status: "finished", winner, last_move: null }));
      setScreen("result");

      await supabase.from("baduk_rooms").update({
        pass_streak: nextStreak,
        status: "finished",
        winner,
        last_move: null,
        updated_at: new Date().toISOString(),
      }).eq("id", roomId);
      return;
    }

    // 낙관적 업데이트
    setRoomData((prev) => ({ ...prev, pass_streak: nextStreak, turn: nextTurn, last_move: null }));

    await supabase.from("baduk_rooms").update({
      pass_streak: nextStreak,
      turn: nextTurn,
      last_move: null,
      updated_at: new Date().toISOString(),
    }).eq("id", roomId);
  };

  // 기권
  const handleResign = async () => {
    if (!roomData || !myRole || roomData.status !== "playing") return;
    const ok = window.confirm("기권하시겠습니까? 상대방이 승리하게 됩니다.");
    if (!ok) return;
    const winner = myRole === "host" ? "guest" : "host";

    // 낙관적 업데이트
    setRoomData((prev) => ({ ...prev, status: "finished", winner }));
    setScreen("result");

    await supabase.from("baduk_rooms").update({
      status: "finished",
      winner,
      updated_at: new Date().toISOString(),
    }).eq("id", roomId);
  };

  // 대기 중인 방 취소 (DB 정리 후 로비로)
  const handleCancelWaiting = async () => {
    const rId = roomIdRef.current;
    if (rId) {
      try {
        await supabase
          .from("baduk_rooms")
          .update({ status: "finished", updated_at: new Date().toISOString() })
          .eq("id", rId)
          .eq("status", "waiting"); // 이미 시작된 방은 건드리지 않음
      } catch (e) {
        console.error("방 취소 실패:", e);
      }
    }
    resetToLobby();
  };

  // 진행 중인 내 방으로 재접속
  const handleRejoin = () => {
    if (!myActiveRoom || !myId) return;
    const role = myActiveRoom.host_id === myId ? "host" : "guest";
    setMyRole(role);
    myRoleRef.current = role;
    setRoomId(myActiveRoom.id);
    roomIdRef.current = myActiveRoom.id;
    setRoomData(myActiveRoom);
    setMyActiveRoom(null);
    setScreen(myActiveRoom.status === "waiting" ? "waiting" : "playing");
    subscribeToRoom(myActiveRoom.id);
  };

  // 로비로 돌아가기
  const resetToLobby = () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (staleTimerRef.current) {
      clearInterval(staleTimerRef.current);
      staleTimerRef.current = null;
    }
    stopPolling();
    winSavedRef.current = false;
    setScreen("lobby");
    setRoomData(null);
    setRoomId(null);
    setMyRole(null);
    setMyActiveRoom(null);
    setLobbyError("");
    setStaleMsg("");
    isSubmittingRef.current = false;
  };

  // 파생 값
  const myTurn = roomData?.turn === myRole;
  const board = roomData?.board ?? makeEmptyBoard(BOARD_SIZE);
  const lastMove = roomData?.last_move ?? null;
  const myCaptures = myRole === "host" ? (roomData?.cap_host || 0) : (roomData?.cap_guest || 0);
  const opCaptures = myRole === "host" ? (roomData?.cap_guest || 0) : (roomData?.cap_host || 0);
  const opNickname = myRole === "host"
    ? (roomData?.guest_nickname || "상대방")
    : (roomData?.host_nickname || "상대방");
  const myStone = myRole === "host" ? "black" : "white";
  const opStone = myRole === "host" ? "white" : "black";
  // 방 이름 표시용
  const displayRoomName = `${roomData?.host_nickname || ""}의 방`;

  const getWinnerText = () => {
    const w = roomData?.winner;
    if (myRole === "spectator") {
      if (!w || w === "draw") return "무승부예요";
      const winnerNick = w === "host"
        ? (roomData?.host_nickname || "흑")
        : (roomData?.guest_nickname || "백");
      return `${winnerNick} 승리! 🎉`;
    }
    if (!w || w === "draw") return "비겼어요";
    return w === myRole ? "내가 이겼어요! 🎉" : "상대방이 이겼어요";
  };

  // 공통 헤더
  const renderHeader = (showBackToBaduk = false) => (
    <div className="baduk-head">
      {showBackToBaduk
        ? <button type="button" className="baduk-back" onClick={() => navigate("/baduk")}>바둑</button>
        : <div style={{ width: 60 }} />
      }
      <div className="baduk-title">⚔️ 바둑대전</div>
      <div className="baduk-menu"><HamburgerMenu /></div>
    </div>
  );

  // 방 이름 표시 helper (목록 아이템용)
  const getRoomDisplayName = (r) => `${r.host_nickname}의 방`;

  // ─── LOBBY ───
  if (screen === "lobby") return (
    <div className="baduk-battle-page">
      {renderHeader(true)}

      {/* 재접속 배너 */}
      {myActiveRoom && (
        <div className="rejoin-banner">
          <div className="rejoin-text">
            ⚔️ 진행 중인 대국이 있어요!
          </div>
          <button
            type="button"
            className="battle-btn primary rejoin-btn"
            onClick={handleRejoin}
          >
            게임으로 돌아가기
          </button>
        </div>
      )}

      <button
        type="button"
        className="battle-btn primary battle-create-btn"
        onClick={handleCreateRoom}
        disabled={loading || !myId}
      >
        + 방 만들기
      </button>

      {lobbyError && <p className="battle-error" style={{ textAlign: "center", marginTop: 8 }}>{lobbyError}</p>}

      {/* 방 목록 */}
      <div className="spectate-section">
        <div className="spectate-section-header">
          <span className="spectate-section-title">방 목록</span>
          <button
            type="button"
            className="spectate-refresh-btn"
            onClick={loadRooms}
            disabled={roomsLoading}
            aria-label="새로고침"
          >
            🔄
          </button>
        </div>

        {roomsLoading ? (
          <p className="spectate-empty">불러오는 중...</p>
        ) : waitingRooms.length === 0 && activeGames.length === 0 ? (
          <p className="spectate-empty">방이 없어요. 첫 번째로 만들어 보세요!</p>
        ) : (
          <div className="spectate-list">
            {waitingRooms.map((g) => (
              <div key={g.id} className="spectate-item">
                <div className="spectate-item-info">
                  <span className="spectate-names">{getRoomDisplayName(g)}</span>
                  <span className="room-status-badge waiting">대기 중</span>
                </div>
                {g.host_id === myId ? (
                  <span className="spectate-my-room">내 방</span>
                ) : (
                  <button
                    type="button"
                    className="battle-btn primary spectate-watch-btn"
                    onClick={() => handleJoinRoom(g)}
                    disabled={loading}
                  >
                    참가
                  </button>
                )}
              </div>
            ))}

            {activeGames.map((g) => (
              <div key={g.id} className="spectate-item">
                <div className="spectate-item-info">
                  <span className="spectate-names">
                    {g.host_nickname} <span className="spectate-vs">vs</span> {g.guest_nickname || "?"}
                  </span>
                  <span className="room-status-badge playing">진행 중</span>
                </div>
                <button
                  type="button"
                  className="battle-btn spectate-watch-btn"
                  onClick={() => handleSpectate(g)}
                >
                  관전
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 랭킹 바로가기 */}
      <div style={{ textAlign: "center", marginTop: 12 }}>
        <button
          type="button"
          className="battle-btn"
          style={{ fontSize: "0.9rem" }}
          onClick={() => navigate("/baduk-battle-ranking")}
        >
          🏆 바둑대전 랭킹
        </button>
      </div>
    </div>
  );

  // ─── WAITING ───
  if (screen === "waiting") return (
    <div className="baduk-battle-page">
      {renderHeader(false)}
      <div className="battle-waiting">
        <p className="battle-waiting-title">친구를 기다리는 중...</p>
        <div className="room-name-display">{displayRoomName}</div>
        <p className="battle-waiting-hint">친구가 방 목록에서 참가하면 자동으로 시작됩니다</p>
        <button type="button" className="battle-btn" onClick={handleCancelWaiting} style={{ marginTop: 24 }}>
          취소
        </button>
      </div>
    </div>
  );

  // ─── PLAYING ───
  if (screen === "playing") return (
    <div className="baduk-battle-page">
      {renderHeader(false)}

      <div className="battle-players-banner">
        <div className={`battle-player ${myTurn ? "active-turn" : ""}`}>
          <span className={`battle-stone-icon ${myStone}`} />
          <div>
            <div className="battle-player-name">{myNickname} (나)</div>
            <div className="battle-cap">잡은 돌 {myCaptures}개</div>
          </div>
        </div>
        <div className="battle-vs">VS</div>
        <div className={`battle-player ${!myTurn ? "active-turn" : ""}`}>
          <span className={`battle-stone-icon ${opStone}`} />
          <div>
            <div className="battle-player-name">{opNickname}</div>
            <div className="battle-cap">잡은 돌 {opCaptures}개</div>
          </div>
        </div>
      </div>

      {staleMsg && <p className="battle-error" style={{ textAlign: "center", margin: "8px 0" }}>{staleMsg}</p>}

      <div className="baduk-msg" aria-live="polite">
        {myTurn ? "내 차례예요!" : "상대방 차례예요..."}
      </div>

      <div
        className="baduk-board"
        role="grid"
        aria-label="바둑판"
        style={{ "--cell": "30px", "--stone": "20px" }}
      >
        {board.map((row, r) => (
          <div className="baduk-rowline" role="row" key={`r-${r}`}>
            {row.map((cell, c) => {
              const isLast = !!lastMove && lastMove.r === r && lastMove.c === c;
              return (
                <button
                  key={`c-${r}-${c}`}
                  type="button"
                  className={`baduk-cell ${isLast ? "last" : ""}`}
                  role="gridcell"
                  onClick={() => handleCellClick(r, c)}
                  aria-label={`${r + 1}행 ${c + 1}열`}
                  disabled={!myTurn}
                >
                  {cell === "B"
                    ? <span className={`stone black ${isLast ? "last-stone" : ""}`} />
                    : cell === "W"
                    ? <span className={`stone white ${isLast ? "last-stone" : ""}`} />
                    : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="baduk-actions">
        <button type="button" className="baduk-pass" onClick={handlePass} disabled={!myTurn}>
          패스
        </button>
        <button type="button" className="baduk-restart" onClick={handleResign}>
          기권
        </button>
      </div>
    </div>
  );

  // ─── SPECTATING ───
  if (screen === "spectating") {
    const hostNickname = roomData?.host_nickname || "흑";
    const guestNickname = roomData?.guest_nickname || "백";
    const hostCaptures = roomData?.cap_host || 0;
    const guestCaptures = roomData?.cap_guest || 0;
    const currentTurn = roomData?.turn;

    return (
      <div className="baduk-battle-page">
        {renderHeader(false)}

        <div className="battle-players-banner">
          <div className={`battle-player ${currentTurn === "host" ? "active-turn" : ""}`}>
            <span className="battle-stone-icon black" />
            <div>
              <div className="battle-player-name">{hostNickname}</div>
              <div className="battle-cap">잡은 돌 {hostCaptures}개</div>
            </div>
          </div>
          <div className="battle-vs">VS</div>
          <div className={`battle-player ${currentTurn === "guest" ? "active-turn" : ""}`}>
            <span className="battle-stone-icon white" />
            <div>
              <div className="battle-player-name">{guestNickname}</div>
              <div className="battle-cap">잡은 돌 {guestCaptures}개</div>
            </div>
          </div>
        </div>

        <div className="baduk-msg">
          👀 관전 중 — {currentTurn === "host" ? `${hostNickname}의 차례` : `${guestNickname}의 차례`}
        </div>

        <div
          className="baduk-board"
          role="grid"
          aria-label="바둑판"
          style={{ "--cell": "30px", "--stone": "20px" }}
        >
          {board.map((row, r) => (
            <div className="baduk-rowline" role="row" key={`r-${r}`}>
              {row.map((cell, c) => {
                const isLast = !!lastMove && lastMove.r === r && lastMove.c === c;
                return (
                  <button
                    key={`c-${r}-${c}`}
                    type="button"
                    className={`baduk-cell ${isLast ? "last" : ""}`}
                    role="gridcell"
                    aria-label={`${r + 1}행 ${c + 1}열`}
                    disabled={true}
                  >
                    {cell === "B"
                      ? <span className={`stone black ${isLast ? "last-stone" : ""}`} />
                      : cell === "W"
                      ? <span className={`stone white ${isLast ? "last-stone" : ""}`} />
                      : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="baduk-actions">
          <button type="button" className="baduk-back" onClick={resetToLobby}>
            나가기
          </button>
        </div>
      </div>
    );
  }

  // ─── RESULT ───
  if (screen === "result") return (
    <div className="baduk-battle-page">
      {renderHeader(false)}
      <div className="baduk-finish">
        <div className="baduk-finish-title">{getWinnerText()}</div>
        {myRole === "spectator" ? (
          <>
            <div className="baduk-finish-sub">
              {roomData?.host_nickname || "흑"} {roomData?.cap_host || 0}개 : {roomData?.guest_nickname || "백"} {roomData?.cap_guest || 0}개 (잡은 돌 기준)
            </div>
            <div className="baduk-finish-actions">
              <button type="button" className="baduk-back" onClick={resetToLobby}>
                관전 종료 (로비로)
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="baduk-finish-sub">
              {myNickname}(나) {myCaptures}개 : {opNickname} {opCaptures}개 (잡은 돌 기준)
            </div>
            <div className="baduk-finish-actions">
              <button type="button" className="baduk-restart" onClick={resetToLobby}>
                다시 대국하기
              </button>
              <button type="button" className="baduk-back" onClick={() => navigate("/planner")}>
                플래너로
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return null;
}
