// src/pages/WordChain.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import "./WordChain.css";
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

  const [level, setLevel] = useState("easy");
  const [locked, setLocked] = useState(false);

  const [history, setHistory] = useState([]);
  const [current, setCurrent] = useState("");
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState("컴퓨터가 먼저 시작했어요. 이어서 단어를 입력해요.");
  const [lastBotWord, setLastBotWord] = useState("");

  const botTimerRef = useRef(null);
  const inputRef = useRef(null);

  const index = useMemo(() => {
    const baseWords = BOT_WORDS[level] ?? BOT_WORDS.easy;
    const merged = [...baseWords, ...ANCHORS, ...BIBLE_WORDS];
    const mergedWords = Array.from(new Set(merged.map(cleanWord)));
    return buildIndex(mergedWords);
  }, [level]);

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
    setTimeout(() => focusInput(), 0);
  }, [locked, current, level]);

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

  const pickBotWord = (needChar, used) => {
    if (!needChar) return null;
    const pool = index[needChar] ?? [];
    const candidates = pool.filter((x) => !used.has(cleanWord(x)) && cleanWord(x).length >= 2);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  const resetGame = () => {
    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    botTimerRef.current = null;

    setLocked(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  const submitUserWord = () => {
    if (locked) return;

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
      const botWord = pickBotWord(userNeed, tempUsed);

      if (!botWord) {
        setLastBotWord("");
        setMsg(`'${userNeed}'(으)로 시작하는 단어가 없어요. 내가 이겼어요.`);
        setLocked(false);
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

  return (
    <div className="gugu-page wc-page notranslate">
      <div className="gugu-head">
        <button type="button" className="gugu-back" onClick={() => navigate("/planner")}>
          ← 플래너
        </button>

        <div className="gugu-title">끝말잇기</div>

        <div className="gugu-head-right">
          <button type="button" className="gugu-restart" onClick={resetGame}>
            다시하기
          </button>

          <div className="gugu-menu">
            <HamburgerMenu />
          </div>
        </div>
      </div>

      <div className="wc-card">
        <div className="wc-row">
          <div className="wc-label">난이도</div>

          <div className="wc-level-buttons">
            <button
              type="button"
              className={`wc-pill ${level === "easy" ? "on" : ""}`}
              onClick={() => setLevel("easy")}
            >
              쉬움
            </button>

            <button
              type="button"
              className={`wc-pill ${level === "normal" ? "on" : ""}`}
              onClick={() => setLevel("normal")}
            >
              중간
            </button>

            <button
              type="button"
              className={`wc-pill ${level === "hard" ? "on" : ""}`}
              onClick={() => setLevel("hard")}
            >
              어려움
            </button>
          </div>
        </div>

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

          <button
            type="button"
            className="gugu-restart"
            onClick={submitUserWord}
            disabled={locked}
          >
            제출
          </button>
        </div>

        <div className="wc-history">
          <div className="wc-history-title">나온 단어</div>
          <div className="wc-history-list">
            {history.length === 0 ? "아직 없어요." : history.join(" → ")}
          </div>
        </div>
      </div>
    </div>
  );
}
