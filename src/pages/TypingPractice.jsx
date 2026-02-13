// src/pages/TypingPractice.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import supabase from "../supabaseClient";
import { saveBestScore } from "../utils/saveBestScore";
import "./TypingPractice.css";

const GAME_KEY = "typing";
const DEFAULT_BOOK = "proverbs";

function nowMs() {
  return Date.now();
}

/*
  타이핑 연습 규칙(초등 기준으로 단순하게)
  - "타수"는 한글 특성 때문에 "완성 글자 수"로 세면 낮게 나옵니다.
    그래서 여기서는 "타건 수(키 누른 횟수에 가까운 값)"로 환산해서 CPM을 계산합니다.
  - 정확도 = 목표 문장과 같은 위치 글자가 일치하는 비율
  - 최종 점수 = CPM * 정확도(0~1) 를 반올림
  - 저장은 "내 최고점 갱신" 또는 "동점이면 최신 기록으로 갱신" 방식으로 동작합니다.
*/

function countStrokesNoSpace(s) {
  const str = String(s ?? "").replace(/\s+/g, "");
  let total = 0;

  const DOUBLE_VOWELS = new Set(["ㅘ", "ㅙ", "ㅚ", "ㅝ", "ㅞ", "ㅟ", "ㅢ"]);
  const DOUBLE_FINALS = new Set(["ㄳ", "ㄵ", "ㄶ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅄ"]);

  const JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
  const JONG = ["", "ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

  for (const ch of str) {
    const code = ch.charCodeAt(0);

    // 1) 한글 완성형(가~힣)
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = code - 0xac00;
      const jungIdx = Math.floor((idx % (21 * 28)) / 28);
      const jongIdx = idx % 28;

      const jung = JUNG[jungIdx];
      const jong = JONG[jongIdx];

      // 초성은 항상 1타로 봅니다.
      total += 1;

      // 중성(이중모음이면 2타)
      total += DOUBLE_VOWELS.has(jung) ? 2 : 1;

      // 종성(받침 있으면 1타, 겹받침이면 2타)
      if (jong) total += DOUBLE_FINALS.has(jong) ? 2 : 1;

      continue;
    }

    // 2) 한글 자모(ㄱ, ㅏ 등)
    if ((code >= 0x3131 && code <= 0x318e) || (code >= 0x1100 && code <= 0x11ff)) {
      total += 1;
      continue;
    }

    // 3) 그 외(영문/숫자/기호)
    total += 1;
  }

  return total;
}

function calcAccuracy(target, typed) {
  const a = String(target ?? "");
  const b = String(typed ?? "");
  const len = Math.max(a.length, 1);

  let same = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) same++;
  }
  return same / len;
}

// setState 한 박자 늦는 문제를 피하기 위해 "지금 값"으로 바로 계산하는 함수
function calcStatsNow({ targetText, typedText, elapsedMs }) {
  const ms = Math.max(1, elapsedMs);
  const minutes = ms / 60000;

  const typedCount = countStrokesNoSpace(typedText);
  const cpm = Math.round(typedCount / minutes);

  const acc = calcAccuracy(targetText, typedText);
  const score = Math.max(0, Math.round(cpm * acc));

  return { typedCount, cpm, acc, score };
}

export default function TypingPractice() {
  const navigate = useNavigate();

  const [book] = useState(DEFAULT_BOOK);
  const [loading, setLoading] = useState(true);

  const [passage, setPassage] = useState(null); // {id, book, chapter, verse, text}
  const [typed, setTyped] = useState("");

  const [startedAt, setStartedAt] = useState(null);
  const [endedAt, setEndedAt] = useState(null);
  const [finished, setFinished] = useState(false);

  const [resultMsg, setResultMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const inputRef = useRef(null);

  const fetchOne = useCallback(async () => {
    setLoading(true);
    setResultMsg("");
    setSaveMsg("");
    setSaved(false);
    setSaving(false);

    setTyped("");
    setStartedAt(null);
    setEndedAt(null);
    setFinished(false);

    try {
      const { data, error } = await supabase
        .from("bible_typing_passages")
        .select("id, book, chapter, verse, text")
        .eq("book", book)
        .eq("active", true);

      if (error) throw error;

      const rows = data ?? [];
      if (rows.length === 0) {
        setPassage(null);
        return;
      }

      const picked = rows[Math.floor(Math.random() * rows.length)];
      setPassage(picked);

      requestAnimationFrame(() => {
        try {
          inputRef.current?.focus?.();
        } catch {
          //
        }
      });
    } catch (e) {
      console.error("typing fetch error:", e);
      setPassage(null);
    } finally {
      setLoading(false);
    }
  }, [book]);

  useEffect(() => {
    fetchOne();
  }, [fetchOne]);

  const refText = useMemo(() => {
    if (!passage) return "";
    return `잠언 ${passage.chapter}:${passage.verse}`;
  }, [passage]);

  const targetText = useMemo(() => String(passage?.text ?? ""), [passage]);

  const elapsedMs = useMemo(() => {
    if (!startedAt) return 0;
    const end = endedAt ?? nowMs();
    return Math.max(0, end - startedAt);
  }, [startedAt, endedAt]);

  const elapsedSec = useMemo(() => Math.floor(elapsedMs / 1000), [elapsedMs]);

  const stats = useMemo(() => {
    return calcStatsNow({
      targetText,
      typedText: typed,
      elapsedMs,
    });
  }, [typed, targetText, elapsedMs]);

  const onChangeTyped = (v) => {
    // 1) 목표 길이까지만 입력되게 잘라서,
    //    오타가 있어도 "글자 수가 맞으면" 끝낼 수 있게 합니다.
    const raw = String(v ?? "");
    const next = targetText ? raw.slice(0, targetText.length) : raw;

    setTyped(next);

    // 2) 첫 글자 입력 순간부터 시작
    let start = startedAt;
    if (!start && next.length > 0) {
      start = nowMs();
      setStartedAt(start);
    }

    // 3) 오타가 있어도 글자 수(길이)가 목표와 같으면 종료
    if (!finished && targetText && next.length === targetText.length) {
      const end = nowMs();
      setEndedAt(end);
      setFinished(true);

      const ms = Math.max(1, end - (start ?? end));
      const s = calcStatsNow({
        targetText,
        typedText: next,
        elapsedMs: ms,
      });

      setResultMsg(
        `완료! 경과 ${Math.floor(ms / 1000)}초 · 타수 ${s.cpm} · 정확도 ${Math.round(s.acc * 100)}% · 점수 ${s.score}`
      );
    }
  };

  const onReset = () => {
    fetchOne();
  };

  const saveScore = useCallback(async () => {
    if (!finished) return;
    if (saving || saved) return;

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

      // 닉네임이 비어 있으면 랭킹에서 빠지지 않게 기본 닉네임을 만들어 줍니다.
      let nickname = String(prof?.nickname ?? "").trim();
      if (!nickname) {
        const tail = String(me.id).slice(-4);
        nickname = `플래너친구${tail}`;
      }

      // 화면에 보이는 점수와 저장 점수가 같게, stats.score 그대로 저장합니다.
      const score = Number(stats.score ?? 0);

      const result = await saveBestScore({
        supabase,
        user_id: me.id,
        nickname,
        game_key: GAME_KEY,
        level: String(book), // 랭킹 페이지의 LEVEL("proverbs")와 반드시 일치
        score,
      });

      // saveBestScore가 saved가 아니라 ok/updated/reason을 반환하는 구조일 때도 정확히 안내합니다.
      // (당신이 올린 반환값: { ok, updated, reason, prevBest, score })
      if (!result?.ok) {
        setSaveMsg("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
        setSaving(false);
        return;
      }

      const prev = Number(result.prevBest ?? 0);
      const now = Number(result.score ?? score);

      if (result.updated) {
        setSaved(true);

        if (result.reason === "updated_higher") {
          setSaveMsg(`최고 기록으로 저장했어요. (이전 ${prev}점 → 이번 ${now}점)`);
        } else if (result.reason === "refreshed_same_score") {
          setSaveMsg(`같은 점수로 기록을 새로 반영했어요. (이번 ${now}점)`);
        } else {
          // 첫 저장 포함(이전 기록이 없어서 prevBest가 0인 경우)
          setSaveMsg(`저장했어요. (이번 ${now}점)`);
        }

        setSaving(false);
        return;
      }

      // 갱신이 안 된 경우(내 최고점이 더 높아서 저장할 필요가 없음)
      setSaveMsg(`저장하지 않았어요. (내 최고점 ${prev}점)`);
      setSaving(false);
    } catch (e) {
      console.error("typing save error:", e);
      setSaveMsg("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }, [finished, saving, saved, stats.score, book]);

  if (loading) {
    return (
      <div className="gugu-page notranslate typing-page">
        <div className="gugu-head">
          <button type="button" className="gugu-back" onClick={() => navigate("/typing-ranking")}>
            타이핑랭킹
          </button>

          <div className="gugu-title">타이핑 연습</div>

          <div className="gugu-head-right">
            <button type="button" className="gugu-restart" onClick={onReset}>
              다시하기
            </button>
            <div className="gugu-menu">
              <HamburgerMenu />
            </div>
          </div>
        </div>

        <div className="hanja-card">
          <div className="hanja-loading">문장을 불러오는 중이에요...</div>
        </div>
      </div>
    );
  }

  if (!passage) {
    return (
      <div className="gugu-page notranslate typing-page">
        <div className="gugu-head">
          <button type="button" className="gugu-back" onClick={() => navigate("/typing-ranking")}>
            타이핑랭킹
          </button>

          <div className="gugu-title">타이핑 연습</div>

          <div className="gugu-head-right">
            <button type="button" className="gugu-restart" onClick={onReset}>
              다시하기
            </button>
            <div className="gugu-menu">
              <HamburgerMenu />
            </div>
          </div>
        </div>

        <div className="hanja-card">
          <div className="hanja-loading">연습 문장이 없어요. Supabase에 잠언 문장을 먼저 넣어 주세요.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="gugu-page notranslate typing-page">
      <div className="gugu-head">
        <button type="button" className="gugu-back" onClick={() => navigate("/typing-ranking")}>
          타이핑랭킹
        </button>

        <div className="gugu-title">타이핑 연습</div>

        <div className="gugu-head-right">
          <button type="button" className="gugu-restart" onClick={onReset}>
            다시하기
          </button>

          <div className="gugu-menu">
            <HamburgerMenu />
          </div>
        </div>
      </div>

      <div className="hanja-card">
        <div className="typing-ref">{refText}</div>

        <div className="typing-target" aria-label="타이핑할 문장">
          {targetText}
        </div>

        <textarea
          ref={inputRef}
          className="typing-input"
          value={typed}
          onChange={(e) => onChangeTyped(e.target.value)}
          placeholder="여기에 그대로 따라 쳐 보세요"
          disabled={finished}
          rows={4}
        />

        <div className="typing-mini">
          경과시간(초): <b>{elapsedSec}</b> · 타수(분당 타건): <b>{stats.cpm || 0}</b> · 정확도:{" "}
          <b>{Math.round(stats.acc * 100)}%</b> · 점수: <b>{stats.score || 0}</b>
        </div>

        {resultMsg && <div className="hanja-result">{resultMsg}</div>}
        {saveMsg && <div className="hanja-result">{saveMsg}</div>}

        <div className="hanja-actions">
          <button type="button" className="hanja-btn" onClick={saveScore} disabled={saving || saved || !finished}>
            {saved ? "저장 완료" : saving ? "저장 중..." : "랭킹에 저장"}
          </button>

          <button type="button" className="hanja-btn ghost" onClick={() => navigate("/typing-ranking")}>
            랭킹 보기
          </button>

          <button type="button" className="hanja-btn ghost" onClick={onReset}>
            다음 문장
          </button>
        </div>
      </div>
    </div>
  );
}
