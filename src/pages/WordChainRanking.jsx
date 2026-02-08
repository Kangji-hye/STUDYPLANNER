// src/pages/WordChainRanking.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Ranking.css";
import HamburgerMenu from "../components/common/HamburgerMenu";
import { bestByNickname } from "../utils/rankingBest";

const GAME_KEY = "wordchain";
const LEVEL = "default";

export default function WordChainRanking() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  const [myInfo, setMyInfo] = useState({ is_admin: false, score: null, nickname: "" });
  const [emptyReason, setEmptyReason] = useState("");

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setRows([]);
      setEmptyReason("");
      setMyInfo({ is_admin: false, score: null, nickname: "" });

      try {
        const { data: authData } = await supabase.auth.getUser();
        const me = authData?.user ?? null;

        let myIsAdmin = false;
        let myNickname = "";

        if (me?.id) {
          const { data: meProf } = await supabase
            .from("profiles")
            .select("nickname, is_admin")
            .eq("id", me.id)
            .maybeSingle();

          myIsAdmin = Boolean(meProf?.is_admin);
          myNickname = String(meProf?.nickname ?? "").trim();
        }

        let list = [];

        try {
          const { data, error } = await supabase.rpc("get_game_ranking_best_by_nickname", {
            game_key: String(GAME_KEY),
            level: String(LEVEL),
            limit_n: 300,
          });
          if (error) throw error;
          list = data ?? [];
        } catch {
          const { data: direct } = await supabase
            .from("game_scores")
            .select("user_id, nickname, score")
            .eq("game_key", String(GAME_KEY))
            .eq("level", String(LEVEL))
            .order("score", { ascending: false })
            .limit(800);

          list = direct ?? [];
        }

        const bestList = bestByNickname(list);

        const ids = bestList.map((x) => x.user_id).filter(Boolean);
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

        const filtered = bestList
          .map((it) => ({ ...it, is_admin: adminMap[it.user_id] ?? false }))
          .filter((it) => !it.is_admin)
          .map((r) => ({
            user_id: r.user_id,
            nickname: String(r.nickname ?? "").trim(),
            score: Number(r.score ?? 0),
          }))
          .filter((row) => {
            const n = row.nickname;
            const compact = n.replace(/\s+/g, "");
            if (!n) return false;
            if (compact === "익명") return false;
            if (compact.startsWith("익명")) return false;
            if (compact === "닉네임") return false;
            return true;
          })
          .sort((a, b) => b.score - a.score);

        const top10 = filtered.slice(0, 10);
        setRows(top10);

        let myBestScore = null;

        if (me?.id) {
          const { data: mine } = await supabase
            .from("game_scores")
            .select("score, nickname")
            .eq("user_id", me.id)
            .eq("game_key", String(GAME_KEY))
            .eq("level", String(LEVEL))
            .order("score", { ascending: false })
            .limit(1);

          const s = mine?.[0]?.score;
          if (s !== null && s !== undefined) myBestScore = Number(s);
          if (!myNickname) myNickname = String(mine?.[0]?.nickname ?? "").trim();
        }

        setMyInfo({ is_admin: myIsAdmin, score: myBestScore, nickname: myNickname });

        if (top10.length === 0) {
          if (myBestScore !== null && myIsAdmin) {
            setEmptyReason("관리자 계정은 랭킹에서 제외되어 표시되지 않아요.");
          } else if (myBestScore !== null && !myIsAdmin) {
            setEmptyReason("내 점수는 저장되어 있는데, 다른 사람 점수 조회가 제한되어 있을 수 있어요.");
          } else if (myIsAdmin) {
            setEmptyReason("관리자 계정은 랭킹에서 제외되어 표시되지 않아요.");
          } else {
            setEmptyReason("아직 표시할 랭킹이 없어요.");
          }
        }
      } catch (e) {
        console.error("wordchain ranking load error:", e);
        setRows([]);
        setEmptyReason("랭킹을 불러오지 못했어요.");
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
          <button type="button" className="ranking-nav-btn" onClick={() => navigate("/wordchain")}>
            끝말잇기로
          </button>

          <h1 className="app-title">끝말잇기 랭킹</h1>

          <div className="header-right">
            <HamburgerMenu />
          </div>
        </div>
      </header>

      {loading ? (
        <div className="ranking-loading">랭킹을 불러오는 중...</div>
      ) : rows.length === 0 ? (
        <div className="ranking-empty">
          {emptyReason || "아직 표시할 랭킹이 없어요."}
          {myInfo?.score !== null ? (
            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>
              내 점수: {myInfo.score}점{myInfo.is_admin ? " (관리자 계정)" : ""}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="ranking-list">
          {rows.map((r, idx) => (
            <div
              key={`${r.user_id ?? "u"}-${idx}`}
              className={`ranking-item ${idx === 0 ? "top1" : idx === 1 ? "top2" : idx === 2 ? "top3" : ""}`}
            >
              <div className="ranking-rank">
                <span className="rank-badge">
                  {idx === 0 ? "🏆" : idx === 1 ? "🥇" : idx === 2 ? "🥈" : idx === 3 ? "🥉" : "⭐"}
                  {`${idx + 1}등`}
                </span>
              </div>
              <div className="ranking-name">{r.nickname}</div>
              <div className="ranking-level">{r.score}점</div>
            </div>
          ))}
        </div>
      )}

      <div className="ranking-tip">같은 이름으로 점수가 여러 번 저장되어도, 랭킹에는 가장 높은 점수만 보여요.</div>

      <div className="ranking-tip" style={{ marginTop: 10 }}>
        <button type="button" className="hanja-btn ghost" onClick={() => navigate("/planner")} style={{ width: "100%" }}>
          플래너로 돌아가기
        </button>
      </div>
    </div>
  );
}
