// src/pages/GugudanRanking.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Ranking.css";
import HamburgerMenu from "../components/common/HamburgerMenu";
import { bestByUserId } from "../utils/rankingBest";

const GAME_KEY = "gugudan";

const SECTIONS = [
  { key: "easy", title: "하 (쉬움)", level: "easy" },
  { key: "normal", title: "중 (보통)", level: "normal" },
  { key: "hard", title: "상 (어려움)", level: "hard" },
];

export default function GugudanRanking() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);

  // 난이도별 Top10을 한 번에 들고 있기
  const [rowsByLevel, setRowsByLevel] = useState({}); // { easy: [...], normal: [...], hard: [...] }

  // 난이도별 내 최고점
  const [myBestByLevel, setMyBestByLevel] = useState({}); // { easy: number|null, ... }

  // 내 관리자 여부, 빈 화면 안내 문구
  const [myIsAdmin, setMyIsAdmin] = useState(false);
  const [emptyReason, setEmptyReason] = useState("");

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setRowsByLevel({});
      setMyBestByLevel({});
      setMyIsAdmin(false);
      setEmptyReason("");

      try {
        const { data: authData } = await supabase.auth.getUser();
        const me = authData?.user ?? null;

        // 내 관리자 여부 확인
        let isAdmin = false;
        if (me?.id) {
          const { data: meProf } = await supabase
            .from("profiles")
            .select("is_admin")
            .eq("id", me.id)
            .maybeSingle();

          isAdmin = Boolean(meProf?.is_admin);
        }
        setMyIsAdmin(isAdmin);

        // 특정 난이도 Top10 가져오기
        const fetchTop10 = async (level) => {
          const { data, error } = await supabase
            .from("game_scores")
            .select("user_id, nickname, score, created_at, level")
            .eq("game_key", GAME_KEY)
            .eq("level", String(level))
            .order("created_at", { ascending: false })
            .limit(2000);

          if (error) throw error;

          const best = bestByUserId(data ?? []);

          // 관리자 계정 제외를 위해 is_admin을 한번에 조회
          const ids = best.map((x) => x.user_id).filter(Boolean);
          const adminMap = {};

          if (ids.length > 0) {
            const { data: profs, error: profErr } = await supabase
              .from("profiles")
              .select("id, is_admin")
              .in("id", ids);

            if (profErr) throw profErr;

            (profs ?? []).forEach((p) => {
              adminMap[p.id] = Boolean(p.is_admin);
            });
          }

          // 점수 내림차순, 동점이면 나중에 저장한 사람이 위
          return best
            .map((r) => ({
              user_id: r.user_id,
              nickname: String(r.nickname ?? "").trim(),
              score: Number(r.score ?? 0),
              created_at: r.created_at,
              is_admin: adminMap[r.user_id] ?? false,
            }))
            .filter((r) => !r.is_admin)
            .sort((a, b) => {
              const ds = Number(b.score ?? 0) - Number(a.score ?? 0);
              if (ds !== 0) return ds;
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            })
            .slice(0, 10);
        };

        // 내 점수(난이도별 최고점) 가져오기
        const fetchMyBest = async (level) => {
          if (!me?.id) return null;

          const { data, error } = await supabase
            .from("game_scores")
            .select("score")
            .eq("user_id", me.id)
            .eq("game_key", GAME_KEY)
            .eq("level", String(level))
            .limit(300);

          if (error) throw error;

          let best = -Infinity;
          for (const r of data ?? []) best = Math.max(best, Number(r?.score ?? 0));
          if (best === -Infinity) return null;
          return best;
        };

        const nextRowsByLevel = {};
        const nextMyBestByLevel = {};

        for (const s of SECTIONS) {
          nextRowsByLevel[s.level] = await fetchTop10(s.level);
          nextMyBestByLevel[s.level] = await fetchMyBest(s.level);
        }

        setRowsByLevel(nextRowsByLevel);
        setMyBestByLevel(nextMyBestByLevel);

        const totalCount = Object.values(nextRowsByLevel).reduce((n, arr) => n + (arr?.length ?? 0), 0);
        if (totalCount === 0) {
          if (isAdmin) setEmptyReason("관리자 계정은 랭킹에서 제외되어 표시되지 않아요.");
          else setEmptyReason("아직 표시할 랭킹이 없어요.");
        }
      } catch (e) {
        console.error("gugudan ranking load error:", e);
        setRowsByLevel({});
        setMyBestByLevel({});
        setEmptyReason("랭킹을 불러오지 못했어요.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  const renderSection = (section) => {
    const rows = rowsByLevel?.[section.level] ?? [];
    const myBest = myBestByLevel?.[section.level];

    return (
      <div key={section.key} style={{ marginTop: 14 }}>
        <div className="english-ranking-level-title">{section.title}</div>

        {rows.length === 0 ? (
          <div className="ranking-empty" style={{ marginTop: 8 }}>
            아직 점수가 없어요.
            {myBest !== null && myBest !== undefined ? (
              <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>
                내 점수: {myBest}점{myIsAdmin ? " (관리자 계정)" : ""}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="ranking-list" style={{ marginTop: 8 }}>
            {rows.map((r, idx) => (
              <div
                key={`${section.key}-${r.user_id ?? "u"}-${idx}`}
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
                <div className="ranking-name">{r.nickname || "익명"}</div>
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
          <button type="button" className="ranking-nav-btn" onClick={() => navigate("/gugudan")}>
            구구단으로
          </button>

          <h1 className="app-title">구구단 랭킹</h1>

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
        내 점수는 내 계정 기준으로 최고 기록이 반영돼요.
      </div>

      <div className="ranking-tip" style={{ marginTop: 10 }}>
        같은 점수라면 더 나중에 저장한 사람이 위에 보여요.
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
