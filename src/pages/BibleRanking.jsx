// src/pages/BibleRanking.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import supabase from "../supabaseClient";
import "./Ranking.css";
import { bestByUserId } from "../utils/rankingBest";

const GAME_KEY = "bible_quiz";

const SECTIONS = [
  { key: "proverbs_easy", title: "잠언 · 쉬움", levels: ["proverbs_easy"] },
  { key: "proverbs_hard", title: "잠언 · 어려움", levels: ["proverbs_hard"] },
  { key: "people_easy", title: "인물 · 쉬움", levels: ["people_easy"] },
  { key: "people_hard", title: "인물 · 어려움", levels: ["people_hard"] },
];

function isValidNickname(n) {
  const s = String(n ?? "").trim();
  if (!s) return false;
  if (s === "익명") return false;
  if (s.startsWith("익명")) return false;
  if (s === "닉네임") return false;
  return true;
}

export default function BibleRanking() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rowsBySection, setRowsBySection] = useState({});
  const [emptyReason, setEmptyReason] = useState("");

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setEmptyReason("");
      setRowsBySection({});

      try {
        const { data: authData } = await supabase.auth.getUser();
        const me = authData?.user ?? null;

        let myIsAdmin = false;
        if (me?.id) {
          const { data: meProf } = await supabase
            .from("profiles")
            .select("is_admin")
            .eq("id", me.id)
            .maybeSingle();

          myIsAdmin = Boolean(meProf?.is_admin);
        }

        const fetchTop10 = async (levels) => {
          const { data, error } = await supabase
            .from("game_scores")
            .select("user_id, nickname, score, created_at, level")
            .eq("game_key", GAME_KEY)
            .in("level", levels)
            .order("created_at", { ascending: false })
            .limit(2000);

          if (error) throw error;

          const best = bestByUserId(data ?? []);

          const ids = best.map((x) => x.user_id).filter(Boolean);
          const adminMap = {};

          if (ids.length > 0) {
            const { data: profs } = await supabase
              .from("profiles")
              .select("id, is_admin")
              .in("id", ids);

            (profs ?? []).forEach((p) => {
              adminMap[p.id] = Boolean(p.is_admin);
            });
          }

          return best
            .map((r) => ({ ...r, is_admin: adminMap[r.user_id] ?? false }))
            .filter((r) => !r.is_admin)
            .filter((r) => isValidNickname(r.nickname))
            .sort((a, b) => {
              const ds = Number(b.score ?? 0) - Number(a.score ?? 0);
              if (ds !== 0) return ds;
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            })
            .slice(0, 10);
        };

        const result = {};
        for (const s of SECTIONS) {
          result[s.key] = await fetchTop10(s.levels);
        }

        setRowsBySection(result);

        const totalCount = Object.values(result).reduce((n, arr) => n + arr.length, 0);
        if (totalCount === 0) {
          if (myIsAdmin) setEmptyReason("관리자 계정은 랭킹에서 제외되어 표시되지 않아요.");
          else setEmptyReason("아직 표시할 랭킹이 없어요.");
        }
      } catch (e) {
        console.error("bible ranking load error:", e);
        setEmptyReason("랭킹을 불러오지 못했어요.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  const renderSection = (section) => {
    const rows = rowsBySection?.[section.key] ?? [];

    return (
      <div key={section.key} style={{ marginTop: 14 }}>
        <div className="english-ranking-level-title">{section.title}</div>

        {rows.length === 0 ? (
          <div className="ranking-empty" style={{ marginTop: 8 }}>
            아직 점수가 없어요.
          </div>
        ) : (
          <div className="ranking-list" style={{ marginTop: 8 }}>
            {rows.map((r, idx) => (
              <div
                key={`${section.key}-${r.user_id}-${idx}`}
                className={`ranking-item ${
                  idx === 0 ? "top1" : idx === 1 ? "top2" : idx === 2 ? "top3" : ""
                }`}
              >
                <div className="ranking-rank">
                  <span className="rank-badge">
                    {idx === 0 ? "🏆" : idx === 1 ? "🥇" : idx === 2 ? "🥈" : idx === 3 ? "🥉" : "⭐"}
                    {idx + 1}등
                  </span>
                </div>
                <div className="ranking-name">{r.nickname}</div>
                <div className="ranking-level">{r.score}점</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="ranking-page">
      <header className="top-header">
        <div className="top-row">
          <button type="button" className="ranking-nav-btn" onClick={() => navigate("/bible-quiz")}>
            성경퀴즈로
          </button>

          <h1 className="app-title">성경 랭킹</h1>

          <div className="header-right">
            <HamburgerMenu />
          </div>
        </div>
      </header>

      {loading ? (
        <div className="ranking-loading">랭킹을 불러오는 중...</div>
      ) : emptyReason ? (
        <div className="ranking-empty">{emptyReason}</div>
      ) : (
        SECTIONS.map(renderSection)
      )}

      <div className="ranking-tip" style={{ marginTop: 14 }}>
        같은 점수라면 더 나중에 저장한 사람이 위에 보여요.
      </div>

      <div className="ranking-tip" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="hanja-btn ghost"
          onClick={() => navigate("/bible-quiz")}
          style={{ width: "100%" }}
        >
          성경 퀴즈로 돌아가기
        </button>
      </div>
    </div>
  );
}
