// src/pages/BadukRanking.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Ranking.css";
import HamburgerMenu from "../components/common/HamburgerMenu";
import RankingMenu from "../components/common/RankingMenu"; 

const OPTIONS = [{ label: "바둑", value: "baduk" }];

const BADUK_LEVELS = [
  { label: "하 (쉬움) · 9×9", value: "easy" },
  { label: "중 (보통) · 9×9", value: "normal" },
  { label: "상 (어려움) · 13×13", value: "hard" },
];

const LEVELS_BY_KEY = { baduk: BADUK_LEVELS };

export default function BadukRanking() {
  const navigate = useNavigate();

  const [key, setKey] = useState("baduk");
  const levels = useMemo(() => LEVELS_BY_KEY[key] ?? [], [key]);

  const [level, setLevel] = useState("easy");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  const [myInfo, setMyInfo] = useState({ is_admin: false, score: null, nickname: "" });
  const [emptyReason, setEmptyReason] = useState("");

  useEffect(() => {
    setLevel("easy");
  }, []);

  useEffect(() => {
    const first = (LEVELS_BY_KEY[key] ?? [])[0]?.value;
    if (first) setLevel(first);
  }, [key]);

  useEffect(() => {
    const normalize = (data) =>
      (data ?? [])
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
        });

    const run = async () => {
      if (!level) return;

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
          const { data, error } = await supabase.rpc("get_game_ranking", {
            game_key: key,
            level: String(level),
            limit_n: 50,
          });
          if (error) throw error;
          list = normalize(data);
        } catch {
          list = [];
        }

        if (list.length === 0) {
          const { data: direct, error: directErr } = await supabase
            .from("game_scores")
            .select("user_id, nickname, score")
            .eq("game_key", key)
            .eq("level", String(level))
            .order("score", { ascending: false })
            .limit(50);

          if (!directErr) list = normalize(direct);
        }

        const ids = list.map((x) => x.user_id).filter(Boolean);
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

        const filtered = list
          .map((it) => ({ ...it, is_admin: adminMap[it.user_id] ?? false }))
          .filter((it) => !it.is_admin);

        filtered.sort((a, b) => b.score - a.score);
        const top10 = filtered.slice(0, 10);
        setRows(top10);

        let myBestScore = null;

        if (me?.id) {
          const { data: mine } = await supabase
            .from("game_scores")
            .select("score, nickname")
            .eq("user_id", me.id)
            .eq("game_key", key)
            .eq("level", String(level))
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
        console.error("baduk ranking load error:", e);
        setRows([]);
        setEmptyReason("랭킹을 불러오지 못했어요.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [key, level]);

  return (
    <div className="ranking-page">
      <header className="top-header">
        <div className="top-row">
          <h1 className="app-title">바둑 랭킹</h1>
          <div className="header-right">
            <HamburgerMenu />
          </div>
        </div>
      </header>

      <RankingMenu
        gameKey={key}
        onChangeGameKey={setKey}
        level={level}
        onChangeLevel={setLevel}
        levels={levels}
        levelLabel="난이도 선택"
      />

      {loading ? (
        <div className="ranking-loading">랭킹을 불러오는 중...</div>
      ) : rows.length === 0 ? (
        <div className="ranking-empty">
          {emptyReason || "아직 랭킹 데이터가 없어요 🙂"}
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

      <div className="ranking-tip">
        점수는 높을수록 위에 보여요. 난이도를 바꿔서 다른 랭킹도 볼 수 있어요 🙂
      </div>

      <div className="ranking-tip" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="hanja-btn ghost"
          onClick={() => navigate("/planner")}
          style={{ width: "100%" }}
        >
          플래너로 돌아가기
        </button>
      </div>
    </div>
  );
}
