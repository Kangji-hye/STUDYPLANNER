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

    const gradeToLabel = (gradeCode) => {
    if (gradeCode === null || gradeCode === undefined) return null;

    const raw = String(gradeCode).trim();
    if (!raw) return null;

    if (raw.includes("유치")) return "유치부";
    if (raw.includes("학년")) return raw;

    const n = Number(raw);
    if (Number.isFinite(n)) {
      if (n === -1 || n === 0) return "유치부";
      if (n >= 1 && n <= 6) return `${n}학년`; // 6학년까지
      return null;
    }

    const m = raw.match(/-?\d+/);
    if (!m) return null;

    const nn = Number(m[0]);
    if (!Number.isFinite(nn)) return null;

    if (nn === -1 || nn === 0) return "유치부";
    if (nn >= 1 && nn <= 6) return `${nn}학년`;
    return null;
  };

useEffect(() => {
  const run = async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase.rpc("get_stamp_ranking", { limit_n: 30 });
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
          const compact = n.replace(/\s+/g, "");

          if (!n) return false;
          if (compact === "익명") return false;
          if (compact.startsWith("익명")) return false;
          if (compact === "닉네임") return false;

          return true;
        });

      const ids = list.map((x) => x.user_id).filter(Boolean);

      const gradeMap = {};
      const adminMap = {}; 

      if (ids.length > 0) {
        const { data: profs, error: profErr } = await supabase
          .from("profiles")
          .select("id, grade_code, is_admin")
          .in("id", ids);

        if (profErr) throw profErr;

        (profs ?? []).forEach((p) => {
          gradeMap[p.id] = p.grade_code;
          adminMap[p.id] = Boolean(p.is_admin);
        });
      }

      const merged = list
        .map((it) => ({
          ...it,
          grade_code: gradeMap[it.user_id],
          is_admin: adminMap[it.user_id] ?? false,
        }))
        .filter((it) => !it.is_admin); 

        merged.sort((a, b) => {
        if (b.level !== a.level) return b.level - a.level;
        return b.stamp_count - a.stamp_count;
      });

      setRows(merged.slice(0, 11));
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
              className={`ranking-item ${
                idx === 0 ? "top1" : idx === 1 ? "top2" : idx === 2 ? "top3" : ""
              }`}
            >
              <div className="ranking-rank">
                <span className="rank-badge">
                  {idx === 0 ? "🏆" : idx === 1 ? "🥇" : idx === 2 ? "🥈" : idx === 3 ? "🥉" : "⭐"}
                  {idx === 0 ? "MVP" : `${idx}등`}
                </span>
              </div>

              {(() => {
                const gradeLabel = gradeToLabel(r.grade_code);

                return (
                  <div className="ranking-name-wrap">
                    <span className="ranking-name">{r.nickname}</span>

                    {gradeLabel && (
                      <span className="ranking-grade" aria-label="학년">
                        {gradeLabel}
                      </span>
                    )}
                  </div>
                );
              })()}

              <div className="ranking-level">레벨 {r.level}</div>
            </div>
          ))}
        </div>
      )}

      <div className="ranking-tip">
        달력에 "참 잘했어요" 도장을 매일 모을수록 레벨이 올라가요. 뒤 레벨은 점점 더 어려워져요 🙂
      </div>
    </div>
  );
}
