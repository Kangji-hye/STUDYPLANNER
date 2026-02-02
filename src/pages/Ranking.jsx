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

  // ✅ grade_code -> 화면에 보여줄 학년 텍스트로 바꾸기
  //    학년이 없으면(null/undefined/빈값) => null 반환(=라벨 안 뜸)
  //    유치부(-1,0) + 1~5학년만 라벨 표시, 그 외는 라벨 표시 안 함
  const gradeToLabel = (gradeCode) => {
    // ✅ 학년이 없으면 라벨 자체를 숨김
    if (gradeCode === null || gradeCode === undefined || gradeCode === "") {
      return null;
    }

    const n = Number(gradeCode);
    if (!Number.isFinite(n)) return null;

    if (n === -1 || n === 0) return "유치부";
    if (n >= 1 && n <= 5) return `${n}학년`;

    // 6학년 이상/기타 값은 라벨 표시 안 함
    return null;
  };

  useEffect(() => {
    const run = async () => {
      setLoading(true);

      try {
        const { data, error } = await supabase.rpc("get_stamp_ranking", { limit_n: 11 });
        if (error) throw error;

        // 1) RPC 결과 정리 + 닉네임 필터(익명/닉네임 등 제외)
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

        // 2) 랭킹에 나온 user_id들로 profiles에서 grade_code 가져오기
        const ids = list.map((x) => x.user_id).filter(Boolean);

        const gradeMap = {}; // { [user_id]: grade_code }
        if (ids.length > 0) {
          const { data: profs, error: profErr } = await supabase
            .from("profiles")
            .select("id, grade_code")
            .in("id", ids);

          if (!profErr && Array.isArray(profs)) {
            profs.forEach((p) => {
              gradeMap[p.id] = p.grade_code; // ✅ null일 수도 있음(괜찮음)
            });
          }
        }

        // 3) list + grade_code 합치기
        const merged = list.map((it) => ({
          ...it,
          grade_code: gradeMap[it.user_id], // ✅ 없으면 undefined, 있으면 값(또는 null)
        }));

        // ✅ 핵심 변경점:
        // 이전에는 여기서 학년이 없거나 조건 밖이면 "사람 자체를 제외"했는데,
        // 지금은 "사람은 그대로 랭킹에 남기고", 라벨만 gradeToLabel로 숨김 처리한다.
        // => mergedFiltered 같은 필터가 없어야 함!

        // 4) 정렬(레벨 → 도장)
        merged.sort((a, b) => {
          if (b.level !== a.level) return b.level - a.level;
          return b.stamp_count - a.stamp_count;
        });

        setRows(merged);
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

              {/* ✅ 이름 옆에 학년 배지 (학년이 없으면 라벨 자체가 안 뜸) */}
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
        도장을 많이 모을수록 레벨이 올라가요. 뒤 레벨은 점점 더 어려워져요 🙂
      </div>
    </div>
  );
}
