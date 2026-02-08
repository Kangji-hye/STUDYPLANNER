// src/pages/WordChain.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import "./WordChain.css";
import supabase from "../supabaseClient";
import { BOT_WORDS, ANCHORS, BIBLE_WORDS } from "../data/wordBank";

function cleanWord(s) {
  return String(s ?? "").trim().replace(/\s+/g, "");
}

function firstChar(word) {
  const w = cleanWord(word);
  return w ? w[0] : "";
}

function lastChar(word) {
  const w = cleanWord(word);
  return w ? w[w.length - 1] : "";
}

function buildIndex(words) {
  const map = {};
  for (const w of words) {
    const ww = cleanWord(w);
    const fc = firstChar(ww);
    if (!fc) continue;
    if (!map[fc]) map[fc] = [];
    map[fc].push(ww);
  }
  return map;
}

export default function WordChain() {
  const navigate = useNavigate();

  const [locked, setLocked] = useState(false);

  const [history, setHistory] = useState([]);
  const [current, setCurrent] = useState("");
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState("컴퓨터가 먼저 시작했어요. 이어서 단어를 입력해요.");
  const [lastBotWord, setLastBotWord] = useState("");

  const [finished, setFinished] = useState(false);
  const [winner, setWinner] = useState(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const botTimerRef = useRef(null);
  const inputRef = useRef(null);

  const index = useMemo(() => {
    const allBot =
      Array.isArray(BOT_WORDS)
        ? BOT_WORDS
        : [
            ...(BOT_WORDS?.easy ?? []),
            ...(BOT_WORDS?.normal ?? []),
            ...(BOT_WORDS?.hard ?? []),
          ];

    const merged = [...allBot, ...ANCHORS, ...BIBLE_WORDS];
    const mergedWords = Array.from(new Set(merged.map(cleanWord))).filter((w) => w.length >= 2);
    return buildIndex(mergedWords);
  }, []);

  const usedSet = useMemo(() => new Set(history.map(cleanWord)), [history]);
  const nextNeeded = useMemo(() => (current ? lastChar(current) : ""), [current]);

  const focusInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
  };

  useEffect(() => {
    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (locked) return;
    if (finished) return;
    setTimeout(() => focusInput(), 0);
  }, [locked, current, finished]);

  const pickAnyBotWord = (used) => {
    const keys = Object.keys(index);
    if (keys.length === 0) return null;

    const shuffledKeys = [...keys].sort(() => Math.random() - 0.5);

    for (const k of shuffledKeys) {
      const pool = index[k] ?? [];
      const candidates = pool.filter((x) => !used.has(cleanWord(x)) && cleanWord(x).length >= 2);
      if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
      }
    }
    return null;
  };

  const preferShort = (turnCount) => turnCount < 6;

  const pickBotWord = (needChar, used, turnCount) => {
    if (!needChar) return null;

    const pool = index[needChar] ?? [];
    const candidates = pool.filter((x) => !used.has(cleanWord(x)) && cleanWord(x).length >= 2);
    if (candidates.length === 0) return null;

    const shortFirst = candidates
      .slice()
      .sort((a, b) => cleanWord(a).length - cleanWord(b).length);

    if (preferShort(turnCount)) {
      const top = shortFirst.slice(0, Math.min(30, shortFirst.length));
      return top[Math.floor(Math.random() * top.length)];
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  const userTurnsCount = (h) => {
    const n = Math.max(0, (h?.length ?? 0) - 1);
    return Math.ceil(n / 2);
  };

  const calcScore = (h, w) => {
    const turns = userTurnsCount(h);
    const base = turns * 10;
    const winBonus = w === "P" ? 80 : w === "DRAW" ? 30 : 0;
    return Math.max(0, base + winBonus);
  };

  const resetGame = () => {
    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    botTimerRef.current = null;

    setLocked(true);
    setFinished(false);
    setWinner(null);
    setSaveMsg("");
    setSaved(false);
    setSaving(false);

    setHistory([]);
    setCurrent("");
    setInput("");
    setLastBotWord("");
    setMsg("컴퓨터가 먼저 시작할게요...");

    const tempUsed = new Set();
    const first = pickAnyBotWord(tempUsed);

    if (!first) {
      setMsg("단어 데이터가 부족해요. wordBank를 확인해 주세요.");
      setLocked(false);
      return;
    }

    const newHistory = [first];
    setHistory(newHistory);
    setCurrent(first);
    setLastBotWord(first);
    setMsg(`이제 '${lastChar(first)}'(으)로 시작해요.`);
    setLocked(false);
  };

  useEffect(() => {
    resetGame();
  }, []);

  const finish = (w, finalHistory, extraMsg) => {
    setFinished(true);
    setWinner(w);
    setLocked(false);
    setInput("");
    setMsg(extraMsg);
  };

  const giveUp = () => {
    if (finished) return;
    finish("AI", history, "이번 판은 여기까지예요. 다음엔 더 길게 이어가 봐요.");
  };

  const submitUserWord = () => {
    if (locked) return;
    if (finished) return;

    const w = cleanWord(input);

    if (!w) {
      setMsg("단어를 먼저 입력해요.");
      setTimeout(() => focusInput(), 0);
      return;
    }
    if (w.length < 2) {
      setMsg("두 글자 이상 단어로 해볼까요?");
      setTimeout(() => focusInput(), 0);
      return;
    }

    if (current) {
      const need = lastChar(current);
      if (firstChar(w) !== need) {
        setMsg(`'${need}'(으)로 시작해야 해요.`);
        setTimeout(() => focusInput(), 0);
        return;
      }
    }

    if (usedSet.has(w)) {
      setMsg("그 단어는 이미 나왔어요. 다른 단어로 해봐요.");
      setTimeout(() => focusInput(), 0);
      return;
    }

    const newHistory = [...history, w];
    const userNeed = lastChar(w);

    setHistory(newHistory);
    setCurrent(w);
    setInput("");
    setLocked(true);
    setMsg("컴퓨터가 생각 중이에요...");

    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    botTimerRef.current = setTimeout(() => {
      const tempUsed = new Set(newHistory.map(cleanWord));
      const turns = userTurnsCount(newHistory);
      const botWord = pickBotWord(userNeed, tempUsed, turns);

      if (!botWord) {
        setLastBotWord("");
        finish("P", newHistory, `'${userNeed}'(으)로 시작하는 단어가 없어요. 내가 이겼어요.`);
        return;
      }

      const nextHistory = [...newHistory, botWord];
      setHistory(nextHistory);
      setCurrent(botWord);
      setLastBotWord(botWord);
      setMsg(`이제 '${lastChar(botWord)}'(으)로 시작해요.`);
      setLocked(false);
    }, 350);
  };

  const saveRanking = async () => {
    if (!finished) return;
    if (saving) return;
    if (saved) return;

    setSaving(true);
    setSaveMsg("");

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;

      const me = authData?.user;
      if (!me?.id) {
        setSaveMsg("로그인이 필요해요.");
        setSaving(false);
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("nickname, is_admin")
        .eq("id", me.id)
        .maybeSingle();

      if (prof?.is_admin) {
        setSaveMsg("관리자 계정은 랭킹에서 제외되어 저장하지 않아요.");
        setSaving(false);
        return;
      }

      const nickname = String(prof?.nickname ?? "").trim() || "익명";
      const score = calcScore(history, winner);

      const { error } = await supabase.from("game_scores").insert([
        {
          user_id: me.id,
          nickname,
          game_key: "wordchain",
          level: "default",
          score,
        },
      ]);

      if (error) throw error;

      setSaved(true);
      setSaveMsg("랭킹에 저장했어요.");
    } catch (e) {
      console.error("wordchain save error:", e);
      setSaveMsg("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const scorePreview = useMemo(() => {
    if (!finished) return null;
    return calcScore(history, winner);
  }, [finished, history, winner]);

  return (
    <div className="gugu-page wc-page notranslate">
      <div className="gugu-head">
        <button type="button" className="gugu-back" onClick={() => navigate("/wordchain-ranking")}>
          끝말잇기 랭킹
        </button>

        <div className="gugu-title">끝말잇기</div>

        <div className="gugu-head-right">
          <button type="button" className="gugu-restart" onClick={giveUp} disabled={locked || finished}>
            포기
          </button>

          <button type="button" className="gugu-restart" onClick={resetGame}>
            다시하기
          </button>

          <div className="gugu-menu">
            <HamburgerMenu />
          </div>
        </div>
      </div>

      <div className="wc-card">
        {lastBotWord ? (
          <div
            style={{
              marginTop: 10,
              padding: "12px 12px",
              borderRadius: 14,
              background: "rgba(255, 122, 162, 0.06)",
              border: "1px solid rgba(255, 122, 162, 0.20)",
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: 900, opacity: 0.75, marginBottom: 6 }}>컴퓨터</div>
            <div style={{ fontSize: "2rem", fontWeight: 900, letterSpacing: 1 }}>{lastBotWord}</div>
          </div>
        ) : null}

        <div className="wc-msg" aria-live="polite">
          {msg}
        </div>

        <div className="wc-hint">
          {current ? (
            <>
              지금 단어: <b>{current}</b> / 다음 글자: <b>{nextNeeded}</b>
            </>
          ) : (
            <>단어를 준비 중이에요.</>
          )}
        </div>

        {!finished ? (
          <div className="wc-input-row">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={current ? `'${nextNeeded}'로 시작하는 단어` : "단어 입력"}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={locked}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitUserWord();
              }}
            />

            <button type="button" className="gugu-restart" onClick={submitUserWord} disabled={locked}>
              제출
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div style={{ textAlign: "center", fontWeight: 900, fontSize: "1.05rem" }}>
              {winner === "P" ? "내가 이겼어요" : "이번 판은 끝났어요"}
            </div>
            <div style={{ textAlign: "center", marginTop: 6, opacity: 0.9 }}>
              내 점수 {scorePreview}점 · 내가 낸 단어 {userTurnsCount(history)}개
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button type="button" className="gugu-restart" onClick={resetGame} style={{ flex: 1 }}>
                한 판 더
              </button>
              <button
                type="button"
                className="gugu-restart"
                onClick={saveRanking}
                disabled={saving || saved}
                style={{ flex: 1 }}
              >
                {saved ? "저장 완료" : saving ? "저장 중..." : "랭킹 저장"}
              </button>
              <button
                type="button"
                className="gugu-restart"
                onClick={() => navigate("/wordchain-ranking")}
                style={{ flex: 1 }}
              >
                랭킹 보기
              </button>
            </div>

            {saveMsg ? (
              <div className="wc-msg" style={{ marginTop: 10 }}>
                {saveMsg}
              </div>
            ) : null}
          </div>
        )}

        <div className="wc-history">
          <div className="wc-history-title">나온 단어</div>
          <div className="wc-history-list">{history.length === 0 ? "아직 없어요." : history.join(" → ")}</div>
        </div>
      </div>
    </div>
  );
}
