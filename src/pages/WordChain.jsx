// src/pages/WordChain.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import "./WordChain.css";
import supabase from "../supabaseClient";
import { BOT_WORDS, ANCHORS, BIBLE_WORDS } from "../data/wordBank";
import { saveBestScore } from "../utils/saveBestScore";

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

/*
  시작 글자 후보를 넓혀서 "막히는 글자"를 줄입니다.
  예: 녀/뇨/뉴/니 -> 여/요/유/이 계열처럼 많이 쓰는 규칙을 반영합니다.
  완벽한 국어 규정 구현이 목표가 아니라, 끝말잇기가 덜 끊기게 만드는 실전용 안전장치입니다.
*/
function getStartCharCandidates(ch) {
  const w = cleanWord(ch);
  if (!w) return [];
  const c = w[0];

  const SBase = 0xac00;
  const LCount = 19;
  const VCount = 21;
  const TCount = 28;
  const NCount = VCount * TCount;

  const code = c.charCodeAt(0);
  const SIndex = code - SBase;

  // 한글 음절이 아니면 그대로만
  if (SIndex < 0 || SIndex >= LCount * NCount) return [c];

  const LIndex = Math.floor(SIndex / NCount);
  const VIndex = Math.floor((SIndex % NCount) / TCount);
  const TIndex = SIndex % TCount;

  const compose = (newL) => {
    const S = SBase + newL * NCount + VIndex * TCount + TIndex;
    return String.fromCharCode(S);
  };

  const candidates = new Set();
  candidates.add(c);

  // 초성 인덱스: ㄴ=2, ㄹ=5, ㅇ=11
  const isNieun = LIndex === 2;
  const isRieul = LIndex === 5;

  // 대략적으로 i/y 계열에서 ㄴ->ㅇ 두음이 자주 허용됩니다(녀/뇨/뉴/니 -> 여/요/유/이 등)
  // 너무 빡빡하게 하면 오히려 재미가 줄어서, 실전에서 자주 쓰는 방향으로만 넓힙니다.
  const dueumVowels = new Set([
    2,  // ㅑ
    6,  // ㅕ
    12, // ㅛ
    17, // ㅠ
    20, // ㅣ
    19, // ㅢ
    14, // ㅟ
    15, // ㅝ
    16, // ㅞ
  ]);

  // ㄹ -> ㄴ 후보(라/래/려/료/류/리 등에서 자주 쓰는 편의 규칙)
  if (isRieul) {
    candidates.add(compose(2));
  }

  // ㄴ -> ㅇ 후보(녀/뇨/뉴/니 -> 여/요/유/이)
  if (isNieun && dueumVowels.has(VIndex)) {
    candidates.add(compose(11));
  }

  return Array.from(candidates);
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

    // 중복/공백 정리, 2글자 이상만
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

  const preferShort = (turnCount) => turnCount < 6;

  /*
    "이어질 가능성" 점수 계산:
    어떤 단어를 봇이 내면, 그 단어의 끝 글자로 사용자가 이어야 합니다.
    끝 글자가 시작되는 단어 풀이 풍부할수록 게임이 길어질 가능성이 큽니다.
  */
  const remainingStartCount = (startChar, used) => {
    const startChars = getStartCharCandidates(startChar);
    let cnt = 0;

    for (const ch of startChars) {
      const pool = index[ch] ?? [];
      for (const w of pool) {
        const ww = cleanWord(w);
        if (ww.length < 2) continue;
        if (used.has(ww)) continue;
        cnt++;
      }
    }
    return cnt;
  };

  const pickAnyBotWord = (used) => {
    const keys = Object.keys(index);
    if (keys.length === 0) return null;

    // 시작 단어도 "이어지기 쉬운" 단어를 고릅니다.
    // 너무 무겁게 계산하면 느려질 수 있어서, 후보를 조금만 뽑아 평가합니다.
    const shuffledKeys = [...keys].sort(() => Math.random() - 0.5);

    const candidates = [];
    for (const k of shuffledKeys) {
      const pool = index[k] ?? [];
      for (const x of pool) {
        const ww = cleanWord(x);
        if (ww.length < 2) continue;
        if (used.has(ww)) continue;
        candidates.push(ww);
        if (candidates.length >= 120) break;
      }
      if (candidates.length >= 120) break;
    }

    if (candidates.length === 0) return null;

    // 이어질 가능성이 높은 단어를 더 자주 뽑도록 가중치 랜덤
    const weighted = candidates.map((w) => {
      const need = lastChar(w);
      const cont = remainingStartCount(need, used);
      // 최소 가중치 1, 너무 큰 값은 완만하게
      const weight = Math.max(1, Math.min(30, Math.floor(cont / 3) + 1));
      return { w, weight };
    });

    return pickWeightedWord(weighted);
  };

  const pickBotWord = (needChar, used, turnCount) => {
    if (!needChar) return null;

    const startChars = getStartCharCandidates(needChar);

    let candidates = [];
    for (const ch of startChars) {
      const pool = index[ch] ?? [];
      for (const x of pool) {
        const ww = cleanWord(x);
        if (ww.length < 2) continue;
        if (used.has(ww)) continue;
        candidates.push(ww);
      }
    }

    candidates = Array.from(new Set(candidates));
    if (candidates.length === 0) return null;

    // 초반에는 짧고 쉬운 단어 + "이어지기 쉬운 끝글자"를 더 강하게 선호합니다.
    // 후반에는 랜덤성을 조금 올려서 반복 느낌을 줄입니다.
    const wantShort = preferShort(turnCount);

    const scored = candidates.map((w) => {
      const len = cleanWord(w).length;
      const cont = remainingStartCount(lastChar(w), used);

      // 이어질 가능성 가중치
      // cont가 0이면 사실상 "바로 끝"이라 초반에는 거의 안 뽑히게
      let score = cont * 6;

      // 초반에는 짧은 단어 선호(아이들이 이해하기 쉽고, 실수도 적음)
      if (wantShort) score += Math.max(0, 10 - len) * 3;

      // 후보가 너무 많을 때는 다양성 위해 작은 랜덤 노이즈
      score += Math.random() * 3;

      return { w, score };
    });

    // score를 가중치로 변환해서 뽑기
    const weighted = scored.map((x) => ({
      w: x.w,
      weight: Math.max(1, Math.floor(x.score)),
    }));

    // 초반에는 더 안전하게(이어질 가능성이 큰 쪽으로)
    // 후반에는 조금 더 랜덤하게
    if (turnCount < 8) {
      return pickWeightedWord(weighted);
    }

    // 후반: 상위 일부 중에서 랜덤 선택
    const top = scored
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(80, scored.length));
    return top[Math.floor(Math.random() * top.length)].w;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const allowedStarts = getStartCharCandidates(need);
      const fc = firstChar(w);

      // 사용자는 두음 후보 글자도 허용해서 덜 막히게 합니다.
      if (!allowedStarts.includes(fc)) {
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

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("nickname, is_admin")
        .eq("id", me.id)
        .maybeSingle();

      if (profErr) throw profErr;

      if (prof?.is_admin) {
        setSaveMsg("관리자 계정은 랭킹에서 제외되어 저장하지 않아요.");
        setSaving(false);
        return;
      }

      const nickname = String(prof?.nickname ?? "").trim() || "익명";
      const score = calcScore(history, winner);

      const result = await saveBestScore({
        supabase,
        user_id: me.id,
        nickname,
        game_key: "wordchain",
        level: "default",
        score,
      });

      if (!result.saved) {
        setSaved(true);
        setSaveMsg(`저장했어요. (내 최고점 ${result.prevBest}점)`);
        return;
      }

      setSaved(true);
      setSaveMsg(`최고 기록으로 저장했어요. (이번 ${result.newBest}점)`);
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

function pickWeightedWord(items) {
  const sum = items.reduce((a, it) => a + (it.weight ?? 1), 0);
  let x = Math.random() * sum;
  for (const it of items) {
    x -= it.weight ?? 1;
    if (x <= 0) return it.w;
  }
  return items[0]?.w ?? null;
}
