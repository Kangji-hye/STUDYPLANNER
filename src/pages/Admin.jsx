// src/pages/Admin.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Admin.css";

/**
 * 학년 규칙(숫자 저장):
 * -1 = 6세, 0 = 7세, 1~6 = 1~6학년
 */
const GRADE_OPTIONS = [
  { label: "6세", value: -1 },
  { label: "7세", value: 0 },
  { label: "1학년", value: 1 },
  { label: "2학년", value: 2 },
  { label: "3학년", value: 3 },
  { label: "4학년", value: 4 },
  { label: "5학년", value: 5 },
  { label: "6학년", value: 6 },
];

// 날짜를 YYYY-MM-DD로 만들기 (관리자도 한국에서 쓰는 전제)
const toDayKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

// ✅ 관리자 미리보기에서도 "플래너와 비슷한 느낌"으로 줄마다 색을 고정해 주기
const VERSE_COLORS = ["#e11d48", "#2563eb", "#16a34a", "#f97316", "#7c3aed", "#0f766e"];
function pickStableColor(seedText) {
  const s = String(seedText ?? "");
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
  return VERSE_COLORS[sum % VERSE_COLORS.length];
}

// 날짜 비교용 숫자(YYYYMMDD)
function keyToNum(k) {
  const s = String(k || "").replaceAll("-", "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// ✅ 인라인 달력 유틸
function buildMonthGrid(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);

  const startDay = first.getDay(); // 0(일)~6(토)
  const totalDays = last.getDate();

  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, monthIndex, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function getKoreanWeekday(dateObj) {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return days[dateObj.getDay()];
}

function parseDayKeyToDate(dayKey) {
  // dayKey: "YYYY-MM-DD"
  const [y, m, d] = String(dayKey).split("-").map((x) => Number(x));
  return new Date(y, (m || 1) - 1, d || 1);
}

function dateToDayKey(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameDay(a, b) {
  return (
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function Admin() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);

  // 관리자 확인용
  const [isAdmin, setIsAdmin] = useState(false);
  const [myEmail, setMyEmail] = useState("");

  // 말씀 관리(편집 영역)
  const [dayKey, setDayKey] = useState(() => toDayKey(new Date()));
  const [gradeCode, setGradeCode] = useState(2); // ✅ 기본 2학년
  const [verseRef, setVerseRef] = useState(""); // 말씀 범위
  const [verseText, setVerseText] = useState(""); // 말씀 내용

  // 인라인 달력: 현재 보여줄 달
  const [calMonth, setCalMonth] = useState(() => {
    const d = parseDayKeyToDate(toDayKey(new Date()));
    return { y: d.getFullYear(), m: d.getMonth() }; // m: 0~11
  });

  // 저장된 말씀 목록
  const [verseList, setVerseList] = useState([]);

  const gradeLabel = useMemo(() => {
    return GRADE_OPTIONS.find((x) => x.value === Number(gradeCode))?.label ?? "-";
  }, [gradeCode]);

  // ✅ 저장된 말씀 전체 목록 불러오기 (오늘 → 미래 → 과거 순)
  const loadVerseList = async () => {
    const { data, error } = await supabase
      .from("daily_verses")
      .select("day_key, grade_code, ref_text, content, updated_at")
      // DB에서는 대충만 정렬(가져온 뒤 프론트에서 다시 정렬)
      .order("day_key", { ascending: false })
      .order("grade_code", { ascending: true });

    if (error) {
      console.error("loadVerseList error:", error);
      alert("저장된 말씀 목록을 불러오지 못했습니다.");
      return;
    }

    const rows = data ?? [];

    const todayKey = toDayKey(new Date());
    const todayNum = keyToNum(todayKey);

    const todayList = [];
    const futureList = [];
    const pastList = [];

    for (const r of rows) {
      const dNum = keyToNum(r.day_key);
      if (dNum === todayNum) todayList.push(r);
      else if (dNum > todayNum) futureList.push(r);
      else pastList.push(r);
    }

    const byGradeAsc = (a, b) => Number(a.grade_code) - Number(b.grade_code);

    todayList.sort(byGradeAsc);

    futureList.sort((a, b) => {
      const da = keyToNum(a.day_key);
      const db = keyToNum(b.day_key);
      if (da !== db) return da - db;
      return byGradeAsc(a, b);
    });

    pastList.sort((a, b) => {
      const da = keyToNum(a.day_key);
      const db = keyToNum(b.day_key);
      if (da !== db) return db - da;
      return byGradeAsc(a, b);
    });

    setVerseList([...todayList, ...futureList, ...pastList]);
  };

  // ✅ 선택된 날짜/학년에 맞는 말씀 불러오기(편집칸 채우기)
  const loadVerse = async () => {
    const { data, error } = await supabase
      .from("daily_verses")
      .select("ref_text, content")
      .eq("day_key", dayKey)
      .eq("grade_code", Number(gradeCode))
      .maybeSingle();

    if (error) {
      console.error("loadVerse error:", error);
      alert("말씀을 불러오지 못했습니다.");
      return;
    }

    setVerseRef(String(data?.ref_text ?? ""));
    setVerseText(String(data?.content ?? ""));
  };

  // ✅ 로그인 유저 확인 + 관리자 판별 (1회)
  useEffect(() => {
    let mounted = true;

    const run = async () => {
      setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) {
        alert("로그인이 필요합니다.");
        navigate("/login");
        return;
      }

      const email = user.email ?? "";
      if (mounted) setMyEmail(email);

      const { data: p, error: pErr } = await supabase
        .from("profiles")
        .select("id, is_admin")
        .eq("id", user.id)
        .maybeSingle();

      if (pErr) {
        console.error(pErr);
        alert("프로필을 읽는 중 오류가 발생했습니다.");
        navigate("/planner");
        return;
      }

      const ok = Boolean(p?.is_admin) || email === "kara@kara.com";
      if (mounted) setIsAdmin(ok);

      if (!ok) {
        alert("관리자만 접근할 수 있습니다.");
        navigate("/planner");
        return;
      }

      await loadVerseList();
      await loadVerse();

      if (mounted) setLoading(false);
    };

    run();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // ✅ 날짜/학년 바꾸면 편집칸 자동 갱신
  useEffect(() => {
    if (!isAdmin) return;
    loadVerse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, dayKey, gradeCode]);

  // ✅ dayKey가 바뀌면 달력도 해당 달로 자동 이동
  useEffect(() => {
    const d = parseDayKeyToDate(dayKey);
    setCalMonth({ y: d.getFullYear(), m: d.getMonth() });
  }, [dayKey]);

  // ✅ 말씀 저장 (수정도 이 버튼으로 동일하게 처리됨: upsert)
  const saveVerse = async () => {
    const text = String(verseText ?? "").trim();
    const refText = String(verseRef ?? "").trim();

    if (!text) {
      alert("말씀 내용을 입력해 주세요.");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    const { error } = await supabase
      .from("daily_verses")
      .upsert(
        {
          day_key: dayKey,
          grade_code: Number(gradeCode),
          ref_text: refText || null,
          content: text,
          created_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "day_key,grade_code" }
      );

    if (error) {
      console.error("saveVerse error:", error);
      alert("저장 중 오류가 발생했습니다. (권한/RLS를 확인해 주세요)");
      return;
    }

    alert(`저장되었습니다! (${dayKey} / ${gradeLabel})`);
    await loadVerseList();
  };

  // ✅ 목록에서 수정: 위 입력칸으로 올려서 편집
  const editFromList = (row) => {
    setDayKey(String(row.day_key));
    setGradeCode(Number(row.grade_code));
    setVerseRef(String(row.ref_text ?? ""));
    setVerseText(String(row.content ?? ""));

    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }
  };

  // ✅ 목록에서 삭제: 확인 후 DB 삭제
  const deleteFromList = async (row) => {
    const gradeName =
      GRADE_OPTIONS.find((g) => g.value === Number(row.grade_code))?.label ?? "-";

    const ok = window.confirm(
      `정말 삭제할까요?\n\n날짜: ${row.day_key}\n학년: ${gradeName}\n범위: ${String(row.ref_text ?? "").trim() || "-"}\n\n※ 삭제하면 되돌릴 수 없어요.`
    );
    if (!ok) return;

    const { error } = await supabase
      .from("daily_verses")
      .delete()
      .eq("day_key", String(row.day_key))
      .eq("grade_code", Number(row.grade_code));

    if (error) {
      console.error("deleteFromList error:", error);
      alert("삭제 중 오류가 발생했습니다. (권한/RLS를 확인해 주세요)");
      return;
    }

    await loadVerseList();

    if (String(dayKey) === String(row.day_key) && Number(gradeCode) === Number(row.grade_code)) {
      setVerseRef("");
      setVerseText("");
    }

    alert("삭제했습니다.");
  };

  if (loading) {
    return (
      <div className="admin">
        <div className="admin-title">관리자</div>
        <div className="admin-card">불러오는 중...</div>
      </div>
    );
  }

  const selectedDateObj = parseDayKeyToDate(dayKey);

  return (
    <div className="admin">
      <div className="admin-top">
        <div>
          <div className="admin-title">관리자</div>
          <div className="admin-sub">로그인: {myEmail}</div>
        </div>

        <button className="admin-back" onClick={() => navigate("/planner")}>
          플래너로
        </button>
      </div>

      {/* ✅ 날짜/요일 + 항상 떠있는 달력 카드 */}
      <div className="admin-card">
        <div className="admin-row admin-row-between">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="admin-label">날짜</span>

            <input
              type="date"
              value={dayKey}
              onChange={(e) => setDayKey(e.target.value)}
              aria-label="날짜 선택"
            />

            <span className="admin-weekday">
              {`${selectedDateObj.getMonth() + 1}월 ${selectedDateObj.getDate()}일 (${getKoreanWeekday(
                selectedDateObj
              )})`}
            </span>
          </div>

          <div className="admin-month-nav">
            <button
              type="button"
              className="admin-mini-nav"
              onClick={() => {
                const prev = new Date(calMonth.y, calMonth.m - 1, 1);
                setCalMonth({ y: prev.getFullYear(), m: prev.getMonth() });
              }}
              aria-label="이전 달"
            >
              ◀
            </button>

            <span className="admin-month-title">
              {calMonth.y}년 {calMonth.m + 1}월
            </span>

            <button
              type="button"
              className="admin-mini-nav"
              onClick={() => {
                const next = new Date(calMonth.y, calMonth.m + 1, 1);
                setCalMonth({ y: next.getFullYear(), m: next.getMonth() });
              }}
              aria-label="다음 달"
            >
              ▶
            </button>
          </div>
        </div>

        <div className="admin-inline-cal">
          <div className="admin-inline-cal-head">
            {["일", "월", "화", "수", "목", "금", "토"].map((w) => (
              <div key={w} className="admin-inline-cal-w">
                {w}
              </div>
            ))}
          </div>

          <div className="admin-inline-cal-grid">
            {buildMonthGrid(calMonth.y, calMonth.m).map((cell, idx) => {
              const selected = isSameDay(cell, selectedDateObj);
              const today = isSameDay(cell, new Date());

              return (
                <button
                  key={idx}
                  type="button"
                  className={[
                    "admin-inline-cal-cell",
                    selected ? "is-selected" : "",
                    today ? "is-today" : "",
                    !cell ? "is-empty" : "",
                  ].join(" ")}
                  onClick={() => {
                    if (!cell) return;
                    setDayKey(dateToDayKey(cell));
                  }}
                  disabled={!cell}
                  aria-label={cell ? dateToDayKey(cell) : "빈칸"}
                >
                  {cell ? cell.getDate() : ""}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 편집 카드 */}
      <div className="admin-card">
        <div className="admin-row">
          <span className="admin-label">학년</span>
          <select value={gradeCode} onChange={(e) => setGradeCode(Number(e.target.value))}>
            {GRADE_OPTIONS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </div>

        <div className="admin-help">
          말씀은 줄바꿈(엔터)로 구분해 입력하세요. 화면에는 문장처럼 이어져 보이지만, 줄마다 색이 달라집니다.
        </div>

        <div className="admin-row">
          <span className="admin-label">말씀 범위</span>
          <input
            type="text"
            value={verseRef}
            onChange={(e) => setVerseRef(e.target.value)}
            placeholder="예) 시편 23편 1절"
          />
        </div>

        <textarea
          className="admin-textarea"
          value={verseText}
          onChange={(e) => setVerseText(e.target.value)}
          placeholder={"예)\n여호와는 나의 목자시니\n내게 부족함이 없으리로다"}
        />

        <div className="admin-actions">
          <button className="admin-btn" onClick={saveVerse}>
            말씀 저장
          </button>
          <button className="admin-btn ghost" onClick={loadVerseList} title="목록을 다시 불러옵니다">
            목록 새로고침
          </button>
        </div>
      </div>

      {/* 저장된 말씀 목록 */}
      <div className="admin-card">
        <div className="admin-title" style={{ marginBottom: 8 }}>
          저장된 말씀 목록
        </div>

        {verseList.length === 0 ? (
          <div className="admin-help">아직 저장된 말씀이 없어요. 위에서 저장해보세요.</div>
        ) : (
          verseList.map((v, idx) => {
            const lines = String(v.content ?? "")
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);

            const gradeName =
              GRADE_OPTIONS.find((g) => g.value === Number(v.grade_code))?.label ?? "-";

            return (
              <div key={`${v.day_key}-${v.grade_code}-${idx}`} className="admin-verse-preview">
                <div className="admin-verse-meta">
                  📅 {v.day_key} · {gradeName}
                </div>

                {String(v.ref_text ?? "").trim() ? (
                  <div className="admin-verse-ref">{v.ref_text}</div>
                ) : null}

                <div className="admin-verse-text">
                  {lines.map((line, i) => (
                    <span
                      key={i}
                      className="admin-verse-line"
                      style={{ color: pickStableColor(`${v.day_key}:${i}`) }}
                    >
                      {line}
                      {i < lines.length - 1 ? " " : ""}
                    </span>
                  ))}
                </div>

                <div className="admin-verse-actions">
                  <button
                    type="button"
                    className="admin-mini-btn"
                    onClick={() => editFromList(v)}
                    title="위 입력칸으로 불러와서 수정합니다"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="admin-mini-btn danger"
                    onClick={() => deleteFromList(v)}
                    title="이 말씀을 삭제합니다"
                  >
                    삭제
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
