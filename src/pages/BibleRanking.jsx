// src/pages/BibleRanking.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import supabase from "../supabaseClient";
import "./BibleQuiz.css";

const GAME_KEY = "bible_quiz";

const BOOKS = [
  { key: "proverbs", label: "잠언", enabled: true },
  { key: "people", label: "인물", enabled: true },
  { key: "genesis", label: "창세기", enabled: false },
  { key: "john", label: "요한복음", enabled: false },
];

const DIFFICULTIES = [
  { key: "easy", label: "쉬움" },
  { key: "hard", label: "어려움" },
];

export default function BibleRanking() {
  const navigate = useNavigate();

  const [book, setBook] = useState("proverbs");
  const [difficulty, setDifficulty] = useState("easy");

  const levelKey = useMemo(() => `${book}_${difficulty}`, [book, difficulty]);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState("");

  const titleText = useMemo(() => {
    const b = BOOKS.find((x) => x.key === book)?.label ?? "성경";
    const d = DIFFICULTIES.find((x) => x.key === difficulty)?.label ?? "";
    return `${b} · ${d}`;
  }, [book, difficulty]);

  const load = async (lv) => {
    setLoading(true);
    setMsg("");
    setRows([]);

    try {
      const { data, error } = await supabase
        .from("game_scores")
        .select("user_id, nickname, score")
        .eq("game_key", GAME_KEY)
        .eq("level", String(lv))
        .order("score", { ascending: false })
        .limit(50);

      if (error) throw error;

      const list = (data ?? [])
        .map((r) => ({
          user_id: r.user_id,
          nickname: String(r.nickname ?? "").trim(),
          score: Number(r.score ?? 0),
        }))
        .filter((r) => {
          const n = String(r.nickname ?? "").trim();
          const compact = n.replace(/\s+/g, "");
          if (!n) return false;
          if (compact === "익명") return false;
          if (compact.startsWith("익명")) return false;
          if (compact === "닉네임") return false;
          return true;
        });

      setRows(list);
    } catch (e) {
      console.error("bible ranking load error:", e);
      setRows([]);
      setMsg("랭킹을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(levelKey);
  }, [levelKey]);

  const onPickBook = (nextBook) => {
    const info = BOOKS.find((x) => x.key === nextBook);
    if (!info?.enabled) {
      setMsg("아직 준비 중이에요.");
      return;
    }
    setMsg("");
    setBook(nextBook);
  };

  const onPickDifficulty = (nextDiff) => {
    setMsg("");
    setDifficulty(nextDiff);
  };

  return (
    <div className="gugu-page notranslate bible-page">
      <div className="gugu-head">
        <button type="button" className="gugu-back" onClick={() => navigate("/bible-quiz")}>
          퀴즈로
        </button>

        <div className="gugu-title">성경랭킹</div>

        <div className="gugu-head-right">
          <div className="gugu-menu">
            <HamburgerMenu />
          </div>
        </div>
      </div>

      <div className="hanja-card">
        <div className="hanja-row" style={{ alignItems: "flex-start" }}>
          <div className="hanja-label">종류</div>

          <div className="wc-level-buttons" style={{ marginTop: 2 }}>
            {BOOKS.map((b) => (
              <button
                key={b.key}
                type="button"
                className={`wc-pill ${book === b.key ? "on" : ""}`}
                onClick={() => onPickBook(b.key)}
                disabled={!b.enabled || loading}
                title={b.enabled ? b.label : "준비 중"}
                style={!b.enabled ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div className="hanja-row" style={{ alignItems: "flex-start", marginTop: 10 }}>
          <div className="hanja-label">난이도</div>

          <div className="wc-level-buttons" style={{ marginTop: 2 }}>
            {DIFFICULTIES.map((d) => (
              <button
                key={d.key}
                type="button"
                className={`wc-pill ${difficulty === d.key ? "on" : ""}`}
                onClick={() => onPickDifficulty(d.key)}
                disabled={loading}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="hanja-loading">랭킹을 불러오는 중이에요...</div>
        ) : msg ? (
          <div className="hanja-loading">{msg}</div>
        ) : rows.length === 0 ? (
          <div className="hanja-loading">아직 저장된 점수가 없어요.</div>
        ) : (
          <>
            <div className="hanja-score">
              {titleText} TOP {Math.min(rows.length, 50)}
            </div>

            <div className="hanja-choices" aria-label="랭킹 목록">
              {rows.map((r, idx) => (
                <div key={`${r.user_id ?? "u"}-${idx}`} className="hanja-choice" style={{ cursor: "default" }}>
                  {idx + 1}등 · {r.nickname} · {r.score}점
                </div>
              ))}
            </div>

            <div className="hanja-actions">
              <button type="button" className="hanja-btn" onClick={() => navigate("/bible-quiz")}>
                퀴즈 하러가기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
