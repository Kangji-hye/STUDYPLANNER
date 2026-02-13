// src/pages/TypingRanking.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import supabase from "../supabaseClient";
// 기존: import "./TypingRanking.css";
import "./Ranking.css"; // 성경 랭킹과 동일한 CSS 사용
import { bestByUserId } from "../utils/rankingBest";

const GAME_KEY = "typing";
const LEVEL = "proverbs";

export default function TypingRanking() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  const [myInfo, setMyInfo] = useState({ is_admin: false, score: null, nickname: "" });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setRows([]);
      setMsg("");
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

        const { data: direct, error } = await supabase
          .from("game_scores")
          .select("user_id, nickname, score, created_at")
          .eq("game_key", GAME_KEY)
          .eq("level", LEVEL)
          .order("created_at", { ascending: false })
          .limit(2000);

        if (error) throw error;

        const bestList = bestByUserId(direct ?? []);

        const ids = bestList.map((x) => x.user_id).filter(Boolean);
        const adminMap = {};

        if (ids.length > 0) {
          const { data: profs } = await supabase.from("profiles").select("id, is_admin").in("id", ids);

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
            created_at: r.created_at,
          }))
          .sort((a, b) => {
            const ds = Number(b.score ?? 0) - Number(a.score ?? 0);
            if (ds !== 0) return ds;
            // 같은 점수면 “나중에 저장한 사람”이 위로
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });

        setRows(filtered.slice(0, 10));

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
          for (const r of mine ?? []) best = Math.max(best, Number(r?.score ?? 0));
          if (best !== -Infinity) myBestScore = best;

          if (!myNickname) myNickname = String(mine?.[0]?.nickname ?? "").trim();
        }

        setMyInfo({ is_admin: myIsAdmin, score: myBestScore, nickname: myNickname });
      } catch (e) {
        console.error("typing ranking fetch error:", e);
        setRows([]);
        setMsg("랭킹을 불러오지 못했어요.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  return (
    <div className="gugu-page notranslate typing-rank-page ranking-page">
      <div className="gugu-head">
        <button type="button" className="gugu-back" onClick={() => navigate("/typing")}>
          타이핑연습
        </button>

        <div className="gugu-title">타이핑 랭킹 (잠언)</div>

        <div className="gugu-head-right">
          <button type="button" className="gugu-restart" onClick={() => navigate("/typing")}>
            시작하기
          </button>
          <div className="gugu-menu">
            <HamburgerMenu />
          </div>
        </div>
      </div>

      <div className="hanja-card">
        {loading ? (
          <div className="ranking-loading">랭킹을 불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div className="ranking-empty">
            {msg || "아직 저장된 점수가 없어요."}
            {myInfo?.score !== null ? (
              <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>
                내 점수: {myInfo.score}점{myInfo.is_admin ? " (관리자 계정)" : ""}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="ranking-list" style={{ marginTop: 8 }}>
            {rows.map((r, idx) => (
              <div
                key={`${r.user_id ?? "u"}-${idx}`}
                className={`ranking-item ${idx === 0 ? "top1" : idx === 1 ? "top2" : idx === 2 ? "top3" : ""}`}
              >
                <div className="ranking-rank">
                  <span className="rank-badge">
                    {idx === 0 ? "🏆" : idx === 1 ? "🥇" : idx === 2 ? "🥈" : idx === 3 ? "🥉" : "⭐"}
                    {idx + 1}등
                  </span>
                </div>

                <div className="ranking-name">{r.nickname || "익명"}</div>
                <div className="ranking-level">{Number(r.score ?? 0)}점</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ranking-tip" style={{ marginTop: 12 }}>
        내 점수는 내 계정 기준으로 최고 기록이 반영돼요.
      </div>
      <div className="ranking-tip" style={{ marginTop: 10 }}>
        같은 점수라면 더 나중에 저장한 사람이 위에 보여요.
      </div>
    </div>
  );
}
