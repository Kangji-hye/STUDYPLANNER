// src/pages/BadukRanking.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Ranking.css";
import HamburgerMenu from "../components/common/HamburgerMenu";
import { bestByUserId } from "../utils/rankingBest";

const GAME_KEY = "baduk";

const SECTIONS = [
  { key: "hard", title: "상 · 13×13" },
  { key: "normal", title: "중 · 9×9" },
  { key: "easy", title: "하 · 9×9" },
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

export default function BadukRanking() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rowsByLevel, setRowsByLevel] = useState({ easy: [], normal: [], hard: [] });
  const [emptyReason, setEmptyReason] = useState("");

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setEmptyReason("");
      setRowsByLevel({ easy: [], normal: [], hard: [] });

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

        const fetchLevelTop10 = async (lv) => {
          const { data: list, error } = await supabase
            .from("game_scores")
            .select("id, user_id, nickname, score, created_at")
            .eq("game_key", GAME_KEY)
            .eq("level", String(lv))
            .order("score", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(2000);

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

        const [easyTop, normalTop, hardTop] = await Promise.all([
          fetchLevelTop10("easy"),
          fetchLevelTop10("normal"),
          fetchLevelTop10("hard"),
        ]);

        setRowsByLevel({ easy: easyTop, normal: normalTop, hard: hardTop });

        const allCount = easyTop.length + normalTop.length + hardTop.length;
        if (allCount === 0) {
          if (myIsAdmin) setEmptyReason("관리자 계정은 랭킹에서 제외되어 표시되지 않아요.");
          else setEmptyReason("아직 표시할 랭킹이 없어요.");
        }
      } catch (e) {
        console.error("baduk ranking load error:", e);
        setRowsByLevel({ easy: [], normal: [], hard: [] });
        setEmptyReason("랭킹을 불러오지 못했어요.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  const renderSection = (lv, title) => {
    const rows = rowsByLevel?.[lv] ?? [];

    return (
      <div key={lv} className="ranking-section">
        <div className="ranking-section-title">{title}</div>

        {rows.length === 0 ? (
          <div className="ranking-empty ranking-section-empty">아직 점수가 없어요.</div>
        ) : (
          <div className="ranking-list ranking-section-list">
            {rows.map((r, idx) => (
              <div
                key={`${lv}-${r.user_id ?? "u"}-${idx}`}
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
      </div>
    );
  };

  const sections = useMemo(() => SECTIONS, []);

  return (
    <div className="ranking-page">
      <header className="top-header">
        <div className="top-row">
          <button type="button" className="ranking-nav-btn" onClick={() => navigate("/baduk")}>
            바둑으로
          </button>

          <h1 className="app-title">바둑 랭킹</h1>

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
        sections.map((s) => renderSection(s.key, s.title))
      )}

      <div className="ranking-tip ranking-tip-spaced">
        같은 점수라면 더 나중에 저장한 사람이 위에 보여요.
      </div>

      <div className="ranking-tip ranking-tip-spaced">
        <button type="button" className="hanja-btn ghost ranking-back-btn" onClick={() => navigate("/baduk")}>
          바둑으로 돌아가기
        </button>
      </div>
    </div>
  );
}
