import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import supabase from "../supabaseClient";
import "./TypingRanking.css";

const GAME_KEY = "typing";

export default function TypingRanking() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  const title = useMemo(() => "타이핑 랭킹 (잠언)", []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("game_scores")
          .select("nickname, score, updated_at, created_at")
          .eq("game_key", GAME_KEY)
          .eq("level", "proverbs")
          .order("score", { ascending: false })
          .limit(50);

        if (error) throw error;
        setRows(data ?? []);
      } catch (e) {
        console.error("typing ranking fetch error:", e);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  return (
    <div className="gugu-page notranslate typing-rank-page">
      <div className="gugu-head">
        <button type="button" className="gugu-back" onClick={() => navigate("/typing")}>
          타이핑연습
        </button>

        <div className="gugu-title">{title}</div>

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
          <div className="hanja-loading">랭킹을 불러오는 중이에요...</div>
        ) : rows.length === 0 ? (
          <div className="hanja-loading">아직 저장된 점수가 없어요.</div>
        ) : (
          <div className="typing-rank-list">
            {rows.map((r, i) => (
              <div key={`${r.nickname}-${i}`} className="typing-rank-row">
                <div className="typing-rank-no">{i + 1}</div>
                <div className="typing-rank-name">{r.nickname || "익명"}</div>
                <div className="typing-rank-score">{Number(r.score ?? 0)}점</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
