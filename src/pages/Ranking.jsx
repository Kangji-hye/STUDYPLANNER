// src/pages/Ranking.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Ranking.css";
import HamburgerMenu from "../components/common/HamburgerMenu";
import { calcLevelFromStamps } from "../utils/leveling";

export default function Ranking() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("get_stamp_ranking", { limit_n: 11 });
        if (error) throw error;

        const list = (data ?? [])
          .map((r) => {
            const stampCount = Number(r.stamp_count ?? 0);
            const lv = calcLevelFromStamps(stampCount).level;

            const nickname = String(r.nickname ?? "").trim();

            return {
              user_id: r.user_id,
              nickname,
              stamp_count: stampCount,
              level: lv,
            };
          })
          .filter((row) => {
            const n = String(row.nickname ?? "").trim();
            return n !== "" && n !== "익명";
          });

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

  return (
    <div className="ranking-page">
      <header className="top-header">
        <div className="top-row">
          <h1
            className="app-title app-title-link"
            onClick={() => navigate("/planner")}
            title="플래너로 이동"
          >
            레벨 랭킹 TOP 10
          </h1>

          <div className="header-right">
            <HamburgerMenu />
          </div>
        </div>
      </header>

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
                    {idx === 0 ? "🏆" : idx === 1 ? "🥇" : idx === 2 ? "🥈" : idx === 3 ? "🥉" : "⭐"}

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
