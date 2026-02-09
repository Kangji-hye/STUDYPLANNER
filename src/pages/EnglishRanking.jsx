// src/pages/EnglishRanking.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Ranking.css";
import HamburgerMenu from "../components/common/HamburgerMenu";
import { bestByUserId } from "../utils/rankingBest";

const GAME_KEY = "english";

const LEVELS = [
  { label: "쉬움", value: "easy" },
  { label: "어려움", value: "hard" },
];

function compactNickname(n) {
  const s = String(n ?? "").trim();
  return s.replace(/\s+/g, "");
}

function isValidNickname(n) {
  const s = String(n ?? "").trim();
  if (!s) return false;
  const c = compactNickname(s);
  if (!c) return false;
  if (c === "익명") return false;
  if (c.startsWith("익명")) return false;
  if (c === "닉네임") return false;
  return true;
}

export default function EnglishRanking() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rowsByLevel, setRowsByLevel] = useState({ easy: [], hard: [] });
  // const [myInfo, setMyInfo] = useState({
  //   is_admin: false,
  //   nickname: "",
  //   scores: { easy: null, hard: null },
  // });

  const [emptyReason, setEmptyReason] = useState("");

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setEmptyReason("");
      setRowsByLevel({ easy: [], hard: [] });
      // setMyInfo({ is_admin: false, nickname: "", scores: { easy: null, hard: null } });

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

        const DB_LEVELS = {
          easy: ["easy", "low"],
          hard: ["hard", "mid", "high"],
        };

        const fetchLevelTop10 = async (lv) => {
          const inLevels = DB_LEVELS[String(lv)] ?? [String(lv)];

          const { data: list, error } = await supabase
            .from("game_scores")
            .select("id, user_id, nickname, score, created_at, level")
            .eq("game_key", String(GAME_KEY))
            .in("level", inLevels)
            .order("created_at", { ascending: false })
            .limit(2500);

          if (error) throw error;

          const bestList = bestByUserId(list ?? []);

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
              created_at: r.created_at ?? null,
            }))
            .filter((row) => isValidNickname(row.nickname))
            .sort((a, b) => {
              const ds = (b.score ?? 0) - (a.score ?? 0);
              if (ds !== 0) return ds;

              const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
              const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
              return tb - ta;
            });

          return filtered.slice(0, 10);
        };

        const [easyTop, hardTop] = await Promise.all([fetchLevelTop10("easy"), fetchLevelTop10("hard")]);

        setRowsByLevel({ easy: easyTop, hard: hardTop });
        const myScores = { easy: null, hard: null };

        if (me?.id) {
          const { data: mine } = await supabase
            .from("game_scores")
            .select("level, score, created_at")
            .eq("user_id", me.id)
            .eq("game_key", String(GAME_KEY))
            .order("created_at", { ascending: false })
            .limit(800);

          (mine ?? []).forEach((r) => {
            const dbLv = String(r?.level ?? "");
            const s = Number(r?.score ?? 0);
            if (!Number.isFinite(s)) return;

            const isEasy = ["easy", "low"].includes(dbLv);
            const isHard = ["hard", "mid", "high"].includes(dbLv);

            const bucket = isEasy ? "easy" : isHard ? "hard" : null;
            if (!bucket) return;

            if (myScores[bucket] === null) {
              myScores[bucket] = s;
              return;
            }
            myScores[bucket] = Math.max(myScores[bucket], s);
          });

          if (!myNickname) {
            const { data: prof2 } = await supabase
              .from("profiles")
              .select("nickname")
              .eq("id", me.id)
              .maybeSingle();
            myNickname = String(prof2?.nickname ?? "").trim();
          }
        }

        // setMyInfo({ is_admin: myIsAdmin, nickname: myNickname, scores: myScores });

        const allCount = easyTop.length + hardTop.length;
        if (allCount === 0) {
          if (myIsAdmin) setEmptyReason("관리자 계정은 랭킹에서 제외되어 표시되지 않아요.");
          else setEmptyReason("아직 표시할 랭킹이 없어요.");
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("english ranking load error:", e);
        setRowsByLevel({ easy: [], hard: [] });
        setEmptyReason("랭킹을 불러오지 못했어요.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  const renderLevel = (lv, title) => {
    const rows = rowsByLevel?.[lv] ?? [];
    // const myScore = myInfo?.scores?.[lv] ?? null;

    return (
      <div style={{ marginTop: 12 }}>
       <div className="english-ranking-level-title">{title}</div>

        {rows.length === 0 ? (
          <div className="ranking-empty" style={{ marginTop: 8 }}>
            아직 점수가 없어요.
          </div>
        ) : (
          <div className="ranking-list" style={{ marginTop: 8 }}>
            {rows.map((r, idx) => (
              <div
                key={`${lv}-${r.user_id ?? "u"}-${idx}`}
                className={`ranking-item ${
                  idx === 0 ? "top1" : idx === 1 ? "top2" : idx === 2 ? "top3" : ""
                }`}
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

      </div>
    );
  };

  return (
    <div className="ranking-page">
      <header className="top-header">
        <div className="top-row">
          <button type="button" className="ranking-nav-btn" onClick={() => navigate("/english-word-game")}>
            영어로
          </button>

          <h1 className="app-title">영어 랭킹</h1>

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
        <>
          {renderLevel("easy", "쉬움")}
          {renderLevel("hard", "어려움")}
        </>
      )}

      {/* <div className="ranking-tip" style={{ marginTop: 14 }}>
        같은 점수라면 더 나중에 저장한 사람이 위에 보여요.
      </div> */}

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
