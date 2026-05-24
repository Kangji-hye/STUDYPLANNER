// src/pages/ChessRanking.jsx — 난이도별 탭 랭킹
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Ranking.css";
import HamburgerMenu from "../components/common/HamburgerMenu";
import { bestByUserId } from "../utils/rankingBest";

const GAME_KEY = "chess";
const TABS = [
  { level: "easy",   label: "하 (쉬움)" },
  { level: "normal", label: "중 (보통)" },
  { level: "hard",   label: "상 (어려움)" },
];

function isValidNickname(n) {
  const s = String(n ?? "").trim().replace(/\s+/g, "");
  if (!s || s === "익명" || s.startsWith("익명") || s === "닉네임") return false;
  return true;
}

export default function ChessRanking() {
  const navigate = useNavigate();
  const [selectedLevel, setSelectedLevel] = useState("easy");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [emptyReason, setEmptyReason] = useState("");

  useEffect(() => {
    const run = async () => {
      setLoading(true); setEmptyReason(""); setRows([]);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const me = authData?.user ?? null;
        let myIsAdmin = false;
        if (me?.id) {
          const { data: meProf } = await supabase.from("profiles").select("is_admin").eq("id", me.id).maybeSingle();
          myIsAdmin = Boolean(meProf?.is_admin);
        }

        const { data: list, error } = await supabase.from("game_scores")
          .select("id, user_id, nickname, score, created_at")
          .eq("game_key", GAME_KEY).eq("level", selectedLevel)
          .order("score", { ascending: false }).order("created_at", { ascending: false }).limit(2000);
        if (error) throw error;

        const bestList = bestByUserId(list ?? []);
        const ids = bestList.map((x) => x.user_id).filter(Boolean);
        const adminMap = {};
        if (ids.length > 0) {
          const { data: profs } = await supabase.from("profiles").select("id, is_admin").in("id", ids);
          (profs ?? []).forEach((p) => { adminMap[p.id] = Boolean(p.is_admin); });
        }

        const top10 = bestList
          .map((it) => ({ ...it, is_admin: adminMap[it.user_id] ?? false }))
          .filter((it) => !it.is_admin)
          .map((r) => ({ user_id: r.user_id, nickname: String(r.nickname ?? "").trim(), score: Number(r.score ?? 0), created_at: r.created_at ?? null }))
          .filter((row) => isValidNickname(row.nickname))
          .sort((a, b) => {
            const ds = (b.score ?? 0) - (a.score ?? 0);
            if (ds !== 0) return ds;
            return (b.created_at ? new Date(b.created_at).getTime() : 0) - (a.created_at ? new Date(a.created_at).getTime() : 0);
          })
          .slice(0, 10);

        setRows(top10);
        if (top10.length === 0) {
          setEmptyReason(myIsAdmin ? "관리자 계정은 랭킹에서 제외되어 표시되지 않아요." : "아직 기록이 없어요. 첫 번째 도전자가 되어보세요!");
        }
      } catch (e) {
        console.error("chess ranking load error:", e);
        setRows([]); setEmptyReason("랭킹을 불러오지 못했어요.");
      } finally { setLoading(false); }
    };
    run();
  }, [selectedLevel]);

  return (
    <div className="ranking-page">
      <header className="top-header">
        <div className="top-row">
          <button type="button" className="ranking-nav-btn" onClick={() => navigate("/chess")}>체스로</button>
          <h1 className="app-title">체스 랭킹</h1>
          <div className="header-right"><HamburgerMenu /></div>
        </div>
      </header>

      {/* 난이도 탭 */}
      <div className="ranking-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.level}
            type="button"
            className={`ranking-tab-btn${selectedLevel === tab.level ? " active" : ""}`}
            onClick={() => setSelectedLevel(tab.level)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="ranking-loading">랭킹을 불러오는 중...</div>
      ) : emptyReason ? (
        <div className="ranking-empty">{emptyReason}</div>
      ) : (
        <div className="ranking-section">
          <div className="ranking-section-title">
            {TABS.find((t) => t.level === selectedLevel)?.label} 최고점
          </div>
          <div className="ranking-list ranking-section-list">
            {rows.map((r, idx) => (
              <div key={`${r.user_id ?? "u"}-${idx}`}
                className={`ranking-item ${idx === 0 ? "top1" : idx === 1 ? "top2" : idx === 2 ? "top3" : ""}`}>
                <div className="ranking-rank">
                  <span className="rank-badge">
                    {idx === 0 ? "🏆" : idx === 1 ? "🥇" : idx === 2 ? "🥈" : idx === 3 ? "🥉" : "⭐"}{`${idx + 1}등`}
                  </span>
                </div>
                <div className="ranking-name">{r.nickname}</div>
                <div className="ranking-level">{r.score}점</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ranking-tip ranking-tip-spaced">체크메이트 승리 점수 기준이에요. 빠를수록 보너스!</div>
      <div className="ranking-tip ranking-tip-spaced">
        <button type="button" className="hanja-btn ghost ranking-back-btn" onClick={() => navigate("/chess")}>체스로 돌아가기</button>
      </div>
    </div>
  );
}
