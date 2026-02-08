// src/pages/BadukRanking.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Ranking.css";
import HamburgerMenu from "../components/common/HamburgerMenu";
import { bestByNickname } from "../utils/rankingBest";

const GAME_KEY = "baduk";

const BADUK_LEVELS = [
  { label: "하 (쉬움) · 9×9", value: "easy" },
  { label: "중 (보통) · 9×9", value: "normal" },
  { label: "상 (어려움) · 13×13", value: "hard" },
];

export default function BadukRanking() {
  const navigate = useNavigate();

  // ✅ 바둑 랭킹은 game_key가 고정이므로 setter가 필요 없습니다.
  // ✅ setGameKey 미사용 경고도 같이 해결됩니다.
  const [gameKey] = useState(GAME_KEY);

  // ✅ 사용자가 바꾸는 건 난이도만!
  const [level, setLevel] = useState("easy");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  const [myInfo, setMyInfo] = useState({
    is_admin: false,
    score: null,
    nickname: "",
  });
  const [emptyReason, setEmptyReason] = useState("");

  const levels = useMemo(() => BADUK_LEVELS, []);

  useEffect(() => {
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

        // 1) 점수 원본 가져오기 (기존 사람들 점수도 그대로 여기서 가져옵니다)
        let list = [];

        // RPC가 있으면 RPC를 쓰고, 없으면 direct select로 fallback
        try {
          const { data, error } = await supabase.rpc(
            "get_game_ranking_best_by_nickname",
            {
              game_key: String(gameKey),
              level: String(level),
              limit_n: 200,
            }
          );
          if (error) throw error;
          list = data ?? [];
        } catch {
          const { data: direct, error: directErr } = await supabase
            .from("game_scores")
            .select("user_id, nickname, score")
            .eq("game_key", String(gameKey))
            .eq("level", String(level))
            .order("score", { ascending: false })
            .limit(500);

          if (!directErr) list = direct ?? [];
        }

        // 2) 닉네임 최고점만 남기기(공통 규칙)
        const bestList = bestByNickname(list);

        // 3) 관리자 제외
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
          .filter((it) => !it.is_admin);

        // 4) TOP 10
        const top10 = filtered.slice(0, 10);
        setRows(top10);

        // 5) 내 최고점(내 user_id 기준)
        let myBestScore = null;

        if (me?.id) {
          const { data: mine } = await supabase
            .from("game_scores")
            .select("score, nickname")
            .eq("user_id", me.id)
            .eq("game_key", String(gameKey))
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
  }, [gameKey, level]);

  const currentLevelLabel = useMemo(() => {
    const found = levels.find((x) => x.value === level);
    return found?.label ?? "";
  }, [levels, level]);

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

      {/* ✅ 셀렉트 대신 버튼 3개 */}
      <div style={{ padding: "10px 12px" }}>
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
          난이도 선택
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {levels.map((lv) => {
            const active = lv.value === level;

            return (
              <button
                key={lv.value}
                type="button"
                onClick={() => setLevel(lv.value)}
                aria-pressed={active}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  border: active
                    ? "2px solid rgba(0,0,0,0.55)"
                    : "1px solid rgba(0,0,0,0.12)",
                  background: active ? "rgba(0,0,0,0.06)" : "#fff",
                  fontSize: 14,
                  fontWeight: active ? 700 : 600,
                  cursor: "pointer",
                }}
                title={lv.label}
              >
                {lv.value === "easy" ? "하" : lv.value === "normal" ? "중" : "상"}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
          현재 선택: {currentLevelLabel}
        </div>
      </div>

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
              key={`${r.nickname}-${idx}`}
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

      <div className="ranking-tip">
        같은 이름으로 점수가 여러 번 저장되어도, 랭킹에는 가장 높은 점수만 보여요.
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
