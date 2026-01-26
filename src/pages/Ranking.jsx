// src/pages/Ranking.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Ranking.css";

import { calcLevelFromStamps } from "../utils/leveling";

export default function Ranking() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        // ✅ Supabase RPC 호출: 도장 많은 순 TOP 10
        const { data, error } = await supabase.rpc("get_stamp_ranking", { limit_n: 11 });
        if (error) throw error;

        const list = (data ?? []).map((r) => {
          const stampCount = Number(r.stamp_count ?? 0);
          const lv = calcLevelFromStamps(stampCount).level;
          return {
            user_id: r.user_id,
            nickname: String(r.nickname ?? "익명"),
            stamp_count: stampCount,
            level: lv,
          };
        });

        // ✅ 표시는 "레벨 높은 순"이 자연스럽고,
        //    레벨이 같으면 도장 많은 순으로 정렬
        list.sort((a, b) => {
          if (b.level !== a.level) return b.level - a.level;
          return b.stamp_count - a.stamp_count;
        });

        setRows(list);
      } catch (e) {
        console.error("ranking load error:", e);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  const titleText = useMemo(() => (loading ? "불러오는 중..." : "레벨 랭킹 TOP 10"), [loading]);

  return (
    <div className="ranking-page">
      <div className="ranking-head">
         <button className="ranking-back ranking-back-primary" onClick={() => navigate("/mypage")}>
        ⬅️ 마이페이지로
        </button>
        <div className="ranking-title">{titleText}</div>
        <button className="ranking-back ranking-back-primary" onClick={() => navigate("/planner")}>
        플래너로 ✅
        </button>
      </div>

      {loading ? (
        <div className="ranking-loading">랭킹을 불러오는 중...</div>
      ) : rows.length === 0 ? (
        <div className="ranking-empty">아직 랭킹 데이터가 없어요 🙂</div>
      ) : (
        <div className="ranking-list">
          {rows.map((r, idx) => (
            <div
            key={r.user_id ?? idx}
            className={`ranking-item ${idx === 0 ? "top1" : idx === 1 ? "top2" : idx === 2 ? "top3" : ""}`}
            >
              <div className="ranking-rank">
                <span className="rank-badge">
                    {/* 아이콘은 그대로, 글자는 MVP/1등/2등… */}
                    {idx === 0 ? "🏆" : idx === 1 ? "🥇" : idx === 2 ? "🥈" : idx === 3 ? "🥉" : "⭐"}

                    {/* #1 대신: MVP, 1등, 2등 ... 10등 (총 11명) */}
                    {idx === 0 ? "MVP" : `${idx}등`}
                </span>

                </div>
              <div className="ranking-name">{r.nickname}</div>
              <div className="ranking-level">레벨 {r.level}</div>
            </div>
          ))}
        </div>
      )}

      <div className="ranking-tip">
        도장을 많이 모을수록 레벨이 올라가요. 뒤 레벨은 점점 더 어려워져요 🙂
      </div>
    </div>
  );
}
