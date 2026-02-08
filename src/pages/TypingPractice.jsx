import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import supabase from "../supabaseClient";
import "./TypingPractice.css";

/*
  타이핑 연습 규칙(초등 기준으로 단순하게)
  - "타수"는 한글 특성 때문에 "완성 글자 수"로 세면 낮게 나옵니다.
    그래서 여기서는 "타건 수(키 누른 횟수에 가까운 값)"로 환산해서 CPM을 계산합니다.
  - 정확도 = 목표 문장과 같은 위치 글자가 일치하는 비율
  - 최종 점수 = CPM * 정확도(0~1) 를 반올림
  - 점수는 랭킹에 "최고 점수"로 저장(더 높을 때만 갱신)
*/

const GAME_KEY = "typing";
const DEFAULT_BOOK = "proverbs";

function nowMs() {
  return Date.now();
}

/* ✅ 한글을 "타건 수"로 세기(2벌식 체감에 가깝게)
   - 공백 제외
   - 한글 완성형(가~힣): 초성(1) + 중성(1 또는 2) + 종성(있으면 1 또는 2)
   - 한글 자모(ㄱ/ㅏ 같은 것): 1타
   - 영문/숫자/기호: 1타(Shift까지 완벽 반영은 아니지만 체감 개선에 충분)
*/
function countStrokesNoSpace(s) {
  const str = String(s ?? "").replace(/\s+/g, "");
  let total = 0;

  const DOUBLE_VOWELS = new Set(["ㅘ", "ㅙ", "ㅚ", "ㅝ", "ㅞ", "ㅟ", "ㅢ"]);
  const DOUBLE_FINALS = new Set(["ㄳ", "ㄵ", "ㄶ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅄ"]);

  const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  const JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
  const JONG = ["", "ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

  for (const ch of str) {
    const code = ch.charCodeAt(0);

    // 1) 한글 완성형(가~힣)
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = code - 0xac00;
      const choIdx = Math.floor(idx / (21 * 28));
      const jungIdx = Math.floor((idx % (21 * 28)) / 28);
      const jongIdx = idx % 28;

      const jung = JUNG[jungIdx];
      const jong = JONG[jongIdx];

      // 초성
      total += 1;

      // 중성(이중모음이면 2타로)
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

/* ✅ setState 한 박자 늦는 문제를 피하기 위해 "지금 값"으로 바로 계산하는 함수 */
function calcStatsNow({ targetText, typedText, elapsedMs }) {
  const ms = Math.max(1, elapsedMs);
  const minutes = ms / 60000;

  const typedCount = countStrokesNoSpace(typedText); // ✅ 여기서 타건 수 사용
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
    const next = String(v ?? "");
    setTyped(next);

    // ✅ 첫 글자 입력 순간부터 시작
    let start = startedAt;
    if (!start && next.length > 0) {
      start = nowMs();
      setStartedAt(start);
    }

    // ✅ 목표 문장과 완전히 같으면 종료(즉시 계산)
    if (!finished && targetText && next === targetText) {
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
    if (saving) return;
    if (saved) return;
    if (!finished) {
      setSaveMsg("먼저 타이핑을 끝내 주세요.");
      return;
    }

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
        .select("nickname")
        .eq("id", me.id)
        .maybeSingle();

      if (profErr) throw profErr;

      const nickname = String(prof?.nickname ?? "").trim() || "익명";

      const levelKey = "proverbs";

      // ✅ 저장용 점수도 타건 수 기준으로 계산
      const acc = calcAccuracy(targetText, typed);
      const minutes = Math.max(1, elapsedMs) / 60000;
      const cpm = Math.round(countStrokesNoSpace(typed) / minutes);
      const score = Math.max(0, Math.round(cpm * acc));

      const { data: existing, error: exErr } = await supabase
        .from("game_scores")
        .select("id, score")
        .eq("user_id", me.id)
        .eq("game_key", GAME_KEY)
        .eq("level", levelKey)
        .order("score", { ascending: false })
        .limit(1);

      if (exErr) throw exErr;

      const row = existing?.[0] ?? null;
      const prev = Number(row?.score ?? -999999);

      if (score <= prev) {
        setSaved(true);
        setSaveMsg(`이미 더 높은 점수가 있어요. (최고 ${prev}점)`);
        setSaving(false);
        return;
      }

      if (row?.id) {
        const { error: upErr } = await supabase
          .from("game_scores")
          .update({ score, nickname, level: levelKey })
          .eq("id", row.id);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await supabase.from("game_scores").insert([
          { user_id: me.id, nickname, game_key: GAME_KEY, level: levelKey, score },
        ]);
        if (insErr) throw insErr;
      }

      setSaved(true);
      setSaveMsg("랭킹에 저장했어요.");
    } catch (e) {
      console.error("typing save error:", e);
      const msg =
        String(e?.message ?? "").trim() ||
        String(e?.error_description ?? "").trim() ||
        "저장에 실패했어요. 잠시 후 다시 시도해 주세요.";
      setSaveMsg(msg);
    } finally {
      setSaving(false);
    }
  }, [saving, saved, finished, targetText, typed, elapsedMs]);

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
