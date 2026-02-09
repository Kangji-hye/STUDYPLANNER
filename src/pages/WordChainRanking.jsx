// src/pages/WordChainRanking.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Ranking.css";
import HamburgerMenu from "../components/common/HamburgerMenu";
import { bestByUserId } from "../utils/rankingBest";

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

        const { data: direct } = await supabase
          .from("game_scores")
          .select("user_id, nickname, score")
          .eq("game_key", GAME_KEY)
          .eq("level", LEVEL)
          .limit(2000);

        const bestList = bestByUserId(direct ?? []);

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
          .sort((a, b) => b.score - a.score);

        const top10 = filtered.slice(0, 10);
        setRows(top10);

        let myBestScore = null;

        if (me?.id) {
          const { data: mine } = await supabase
            .from("game_scores")
            .select("score, nickname")
            .eq("user_id", me.id)
            .eq("game_key", GAME_KEY)
            .eq("level", LEVEL)
            .limit(200);

          let best = -Infinity;
          for (const r of mine ?? []) {
            best = Math.max(best, Number(r?.score ?? 0));
          }
          if (best !== -Infinity) myBestScore = best;

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

      <div className="ranking-tip">내 점수는 내 계정 기준으로 최고 기록이 반영돼요.</div>

      <div className="ranking-tip" style={{ marginTop: 10 }}>
        <button type="button" className="hanja-btn ghost" onClick={() => navigate("/planner")} style={{ width: "100%" }}>
          플래너로 돌아가기
        </button>
      </div>
    </div>
  );
}
