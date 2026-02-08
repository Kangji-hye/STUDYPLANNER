// src/pages/BibleRanking.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Ranking.css";
import HamburgerMenu from "../components/common/HamburgerMenu";
import RankingMenu from "../components/common/RankingMenu";
import { bestByNickname } from "../utils/rankingBest";

// 이 페이지가 보여주는 게임 키
const GAME_KEY = "bible_quiz";

// "종류 + 난이도" 조합은 BibleQuiz 저장 로직과 똑같이 맞춰야 합니다.
// BibleQuiz에서 levelKey = `${book}_${difficulty}` 로 저장하고 있으니까
// 여기 value도 정확히 같은 문자열이어야 랭킹이 뜹니다.
const BIBLE_LEVELS = [
  { label: "잠언 · 쉬움", value: "proverbs_easy" },
  { label: "잠언 · 어려움", value: "proverbs_hard" },
  { label: "성경인물 · 쉬움", value: "people_easy" },
  { label: "성경인물 · 어려움", value: "people_hard" },
];

// 랭킹 “게임 선택” 셀렉트에 넣을 옵션들
// 필요하면 여기 계속 추가하면 됩니다.
const OPTIONS = [
  { label: "한자 놀이", value: "hanja" },
  { label: "성경퀴즈", value: "bible_quiz" },
];

const LEVELS_BY_KEY = {
  hanja: [
    { label: "8급", value: "8" },
    { label: "7급", value: "7" },
    { label: "6급", value: "6" },
  ],
  bible_quiz: BIBLE_LEVELS,
};

export default function BibleRanking() {
  const navigate = useNavigate();

  // 현재 보고 있는 랭킹의 게임 선택(셀렉트)
  const [key, setKey] = useState("bible_quiz");

  // 게임이 바뀌면 레벨 셀렉트 목록도 바뀌어야 해서 useMemo로 계산
  const levels = useMemo(() => LEVELS_BY_KEY[key] ?? [], [key]);

  // 현재 선택된 레벨(난이도/급수 등)
  const [level, setLevel] = useState("proverbs_easy");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  const [myInfo, setMyInfo] = useState({ is_admin: false, score: null, nickname: "" });
  const [emptyReason, setEmptyReason] = useState("");

  // 게임이 바뀌면, 그 게임의 첫 번째 레벨로 자동 이동
  useEffect(() => {
    const first = (LEVELS_BY_KEY[key] ?? [])[0]?.value;
    if (first) setLevel(first);
  }, [key]);

  useEffect(() => {
    const run = async () => {
      if (!level) return;

      setLoading(true);
      setRows([]);
      setEmptyReason("");
      setMyInfo({ is_admin: false, score: null, nickname: "" });

      try {
        // 1) 내 정보(관리자 제외 처리 때문에 필요)
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

        // 2) 랭킹 데이터 가져오기
        // 가능하면 DB RPC(get_game_ranking_best_by_nickname)로 "닉네임 최고점"을 바로 가져옵니다.
        let list = [];

        try {
          const { data, error } = await supabase.rpc("get_game_ranking_best_by_nickname", {
            game_key: String(key),
            level: String(level),
            limit_n: 200, // 넉넉히 가져와도 프론트에서 top10만 씁니다.
          });
          if (error) throw error;
          list = data ?? [];
        } catch (e) {
          // RPC가 아직 없거나 실패하면, 기존 테이블을 직접 읽고 프론트에서 최고점 처리합니다.
          const { data: direct, error: directErr } = await supabase
            .from("game_scores")
            .select("user_id, nickname, score")
            .eq("game_key", String(key))
            .eq("level", String(level))
            .order("score", { ascending: false })
            .limit(500);

          if (!directErr) list = direct ?? [];
        }

        // 3) 같은 닉네임 여러 개면 최고점만 남기기(모든 게임 공통 규칙)
        const bestList = bestByNickname(list);

        // 4) 관리자 계정은 랭킹에서 제외(기존 한자 랭킹과 동일)
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

        // 5) TOP 10만 표시
        const top10 = filtered.slice(0, 10);
        setRows(top10);

        // 6) 내 최고점(내 user_id 기준)도 표시
        let myBestScore = null;

        if (me?.id) {
          const { data: mine } = await supabase
            .from("game_scores")
            .select("score, nickname")
            .eq("user_id", me.id)
            .eq("game_key", String(key))
            .eq("level", String(level))
            .order("score", { ascending: false })
            .limit(1);

          const s = mine?.[0]?.score;
          if (s !== null && s !== undefined) myBestScore = Number(s);
          if (!myNickname) myNickname = String(mine?.[0]?.nickname ?? "").trim();
        }

        setMyInfo({
          is_admin: myIsAdmin,
          score: myBestScore,
          nickname: myNickname,
        });

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
        console.error("bible ranking load error:", e);
        setRows([]);
        setEmptyReason("랭킹을 불러오지 못했어요.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [key, level]);

  // 좌측 상단 버튼: “현재 선택된 게임”의 퀴즈 화면으로 보내기
  const goGame = () => {
    if (key === "bible_quiz") navigate("/bible-quiz");
    else if (key === "hanja") navigate("/hanja-game"); // 프로젝트 라우트 이름에 맞게 조정
    else navigate("/planner");
  };

  // 레벨 셀렉트 라벨도 게임별로 다르게 표시(한자는 급수, 성경은 종류/난이도)
  const levelLabel = key === "bible_quiz" ? "종류/난이도" : "급수 선택";

  return (
    <div className="ranking-page">
      <header className="top-header">
        <div className="top-row">
          {/* ✅ 좌측 버튼: 게임으로 이동(원하신 구조) */}
          <button type="button" className="ranking-nav-btn" onClick={goGame}>
            퀴즈로
          </button>

          <h1 className="app-title">게임 랭킹</h1>

          <div className="header-right">
            <HamburgerMenu />
          </div>
        </div>
      </header>

      {/* ✅ 한자 랭킹과 같은 방식: 게임 선택 + 레벨 선택 */}
      <RankingMenu
        options={OPTIONS}          // RankingMenu가 options를 지원하지 않으면 아래 안내를 보세요.
        gameKey={key}
        onChangeGameKey={setKey}
        level={level}
        onChangeLevel={setLevel}
        levels={levels}
        levelLabel={levelLabel}
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
              key={`${r.nickname}-${idx}`}
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
