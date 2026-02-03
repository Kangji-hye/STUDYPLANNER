// src/components/GameGuard.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import { toKstDayKey } from "../utils/dateKst";

export default function GameGuard({ children }) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
  let alive = true;

  const run = async () => {
    setLoading(true);

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const userId = userData?.user?.id;

      if (!userId) {
        if (alive) setAllowed(false);
        return;
      }

      const todayKey = toKstDayKey(new Date());
      const { data, error } = await supabase
        .from("hall_of_fame")
        .select("day_key")
        .eq("day_key", todayKey)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      if (alive) setAllowed(!!data);
    } catch (err) {
      console.error("GameGuard error:", err);
      if (alive) setAllowed(false);
    } finally {
      if (alive) setLoading(false);
    }
  };

  run();

  return () => {
    alive = false;
  };
}, []);


  let content = children;

  if (loading) {
    content = (
      <div style={{ padding: 16 }}>
        게임 입장 확인 중...
      </div>
    );
  } else if (!allowed) {
    content = (
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
          오늘의 할 일을 먼저 끝내야 게임을 할 수 있어요 🙂
        </div>

        <div style={{ color: "#555", lineHeight: 1.4, marginBottom: 14 }}>
          플래너에서 오늘 할 일을 모두 “했음”으로 체크하면
          게임이 자동으로 열립니다.
        </div>

        <button
          type="button"
          onClick={() => navigate("/planner")}
          style={{
            height: 44,
            borderRadius: 14,
            padding: "0 14px",
            border: "1px solid rgba(0,0,0,0.15)",
            background: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          플래너로 가기
        </button>
      </div>
    );
  }

  return content;
}
