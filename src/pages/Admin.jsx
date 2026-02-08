// src/pages/Admin.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Admin.css";
import HamburgerMenu from "../components/common/HamburgerMenu";

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

// 관리자 미리보기에서도 "플래너와 비슷한 느낌"으로 줄마다 색을 고정해 주기
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

// 인라인 달력 유틸
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

// 선택된 dayKey 기준 "그 주의 월요일"
function getWeekStartDayKey(dayKey) {
  const d = parseDayKeyToDate(dayKey);
  const day = d.getDay(); // 0(일)~6(토)
  const diffToMon = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diffToMon);
  return dateToDayKey(d);
}

// 알람 day_type 라벨
function dayTypeLabel(v) {
  if (v === "weekday") return "평일만";
  if (v === "weekend") return "주말만";
  return "전체(매일)";
}

export default function Admin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // 관리자 확인용
  const [isAdmin, setIsAdmin] = useState(false);
  const [myEmail, setMyEmail] = useState("");

  // 숙제/말씀 날짜/학년
  const [dayKey, setDayKey] = useState(() => toDayKey(new Date()));
  const [gradeCode, setGradeCode] = useState(2);
  const [verseRef, setVerseRef] = useState("");
  const [verseText, setVerseText] = useState("");

  // 오늘 숙제 관리(편집 영역)
  const [hwSubject, setHwSubject] = useState("");
  const [hwContent, setHwContent] = useState("");
  const [hwItems, setHwItems] = useState([]);

  // 인라인 달력: 현재 보여줄 달
  const [calMonth, setCalMonth] = useState(() => {
    const d = parseDayKeyToDate(toDayKey(new Date()));
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // 목록
  const [verseList, setVerseList] = useState([]);
  const [hwList, setHwList] = useState([]);

  const gradeLabel = useMemo(() => {
    return GRADE_OPTIONS.find((x) => x.value === Number(gradeCode))?.label ?? "-";
  }, [gradeCode]);

  // 목록이 너무 길어지는 문제 해결용: "최근 N개만" 먼저 보여주기
  const [verseVisibleCount, setVerseVisibleCount] = useState(7);
  const [hwVisibleCount, setHwVisibleCount] = useState(7);

  // =========================
  // 알람 설정(훅/함수 전부 Admin() 안!)
  // =========================
  const [alarmKind, setAlarmKind] = useState("todo_remind"); // 기본: 오늘 할 일
  const [alarmTitle, setAlarmTitle] = useState(""); // 예: 방학-저녁 알림
  const [alarmMessage, setAlarmMessage] = useState("오늘의 할 일을 끝내보세요.");
  const [alarmTime, setAlarmTime] = useState("19:30"); // "HH:MM"
  const [alarmStartDay, setAlarmStartDay] = useState(""); // "YYYY-MM-DD"(현재는 기능 미사용)
  const [alarmEndDay, setAlarmEndDay] = useState(""); // "YYYY-MM-DD"(현재는 기능 미사용)
  const [editingAlarmId, setEditingAlarmId] = useState(null);

  // 추가: 평일/주말 옵션(전체/평일/주말)
  const [alarmDayType, setAlarmDayType] = useState("all"); // all | weekday | weekend
  const [alarmList, setAlarmList] = useState([]); // 목록 표시용

  // 추가: 오늘만(공지) / 항상(기본) 선택
  // 기간 기능이 현재 불안정하니, "오늘만"은 확실히 동작하게 start_day/end_day를 오늘로 고정 저장합니다.
  const [alarmPeriodMode, setAlarmPeriodMode] = useState("always"); // always | today

  // =========================
  // 주간 숙제 사진 업로드
  // =========================
  const [weekImgFile, setWeekImgFile] = useState(null);
  const [weekImgUrl, setWeekImgUrl] = useState(""); // 관리자 미리보기용(또는 DB 저장 URL)
  const [weekImgUploading, setWeekImgUploading] = useState(false);

  // 선택된 dayKey 기준 "그 주의 월요일"
  const weekStartDayKey = useMemo(() => getWeekStartDayKey(dayKey), [dayKey]);

  // 이번 주 이미지 불러오기(관리자에서 미리 보기)
  const loadWeekImage = async () => {
    const { data, error } = await supabase
      .from("weekly_homework_images")
      .select("image_url")
      .eq("week_start_day", weekStartDayKey)
      .eq("grade_code", Number(gradeCode))
      .maybeSingle();

    if (error) {
      console.error("loadWeekImage error:", error);
      setWeekImgUrl("");
      return;
    }

    setWeekImgUrl(String(data?.image_url ?? ""));
  };

  // 이미지 업로드 + DB 저장(week_start_day + grade_code로 upsert)
  const uploadWeekImage = async () => {
    if (!weekImgFile) {
      alert("올릴 사진을 먼저 선택해 주세요.");
      return;
    }

    setWeekImgUploading(true);

    try {
      const file = weekImgFile;
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ext.length <= 5 ? ext : "jpg";

      // storage 경로: {grade}/{weekStart}/{timestamp}.jpg
      const path = `${Number(gradeCode)}/${weekStartDayKey}/${Date.now()}.${safeExt}`;

      const bucket = supabase.storage.from("weekly-homework");

      // 1) Storage 업로드
      const { error: upErr } = await bucket.upload(path, file, {
        upsert: true,
        contentType: file.type || "image/jpeg",
      });

      if (upErr) throw upErr;

      // 2) Public URL 얻기(버킷을 Public로 해둔 경우)
      const { data: pub } = bucket.getPublicUrl(path);
      const publicUrl = String(pub?.publicUrl ?? "").trim();
      if (!publicUrl) throw new Error("publicUrl 생성 실패 (버킷 공개 설정 확인)");

      // 3) DB에 upsert (이번 주 + 학년으로 한 장만 유지)
      const { error: dbErr } = await supabase
        .from("weekly_homework_images")
        .upsert(
          {
            week_start_day: weekStartDayKey,
            grade_code: Number(gradeCode),
            image_path: path,
            image_url: publicUrl,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "week_start_day,grade_code" }
        );

      if (dbErr) throw dbErr;

      alert(`주간 숙제 사진을 저장했어요! (주 시작: ${weekStartDayKey} / ${gradeLabel})`);

      setWeekImgFile(null);
      await loadWeekImage();
    } catch (err) {
      console.error("uploadWeekImage error:", err);
      alert(err?.message ?? "사진 업로드 중 오류가 났어요. (버킷/권한/RLS 확인)");
    } finally {
      setWeekImgUploading(false);
    }
  };

  // =======================
  // 알람 목록 불러오기
  // =======================
  const loadAlarmList = async () => {
    const { data, error } = await supabase
      .from("alarm_settings")
      .select("id, kind, title, message, time_hhmm, start_day, end_day, day_type, is_active, updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("loadAlarmList error:", error);
      alert("알람 목록을 불러오지 못했습니다.");
      return;
    }

    // day_type이 null인 옛 데이터는 all로 보이게 처리
    const rows = (data ?? []).map((r) => ({
      ...r,
      day_type: r?.day_type || "all",
    }));

    setAlarmList(rows);
  };

  // 알람 저장 (추가/수정 공용)
  const saveAlarm = async () => {
    const msg = String(alarmMessage ?? "").trim();
    const hhmm = String(alarmTime ?? "").trim();

    if (!msg) {
      alert("알람 멘트를 입력해 주세요.");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(hhmm)) {
      alert("시간 형식이 올바르지 않습니다. 예: 19:30");
      return;
    }

    // 오늘만 모드면 start/end를 오늘로 확정 저장
    // 항상 모드면 기간을 null로 저장(항상 적용)
    const todayKey = toDayKey(new Date());
    const resolvedStartDay = alarmPeriodMode === "today" ? todayKey : null;
    const resolvedEndDay = alarmPeriodMode === "today" ? todayKey : null;

    const payload = {
      kind: alarmKind,
      title: String(alarmTitle ?? "").trim() || `${alarmKind} 알람`,
      message: msg,
      time_hhmm: hhmm,
      start_day: resolvedStartDay,
      end_day: resolvedEndDay,
      day_type: alarmDayType, // all | weekday | weekend
      updated_at: new Date().toISOString(),
    };

    try {
      if (editingAlarmId) {
        const { error } = await supabase.from("alarm_settings").update(payload).eq("id", editingAlarmId);
        if (error) throw error;

        alert("알람을 수정했습니다!");
        setEditingAlarmId(null);
        await loadAlarmList();
        return;
      }

      const { error } = await supabase.from("alarm_settings").insert({ ...payload, is_active: true });
      if (error) throw error;

      alert("알람을 저장했습니다!");
      await loadAlarmList();
      setAlarmTitle("");
    } catch (err) {
      console.error("saveAlarm error:", err);
      alert("알람 저장 중 오류가 발생했습니다. (권한/RLS 또는 컬럼 확인)");
    }
  };

  const deleteAlarmFromList = async (row) => {
    const ok = window.confirm(
      `이 알람을 삭제할까요?\n\n[${row.kind}] ${row.title}\n시간: ${row.time_hhmm}\n옵션: ${dayTypeLabel(
        row.day_type
      )}\n\n※ 삭제하면 되돌릴 수 없어요.`
    );
    if (!ok) return;

    const { error } = await supabase.from("alarm_settings").delete().eq("id", row.id);

    if (error) {
      console.error("deleteAlarmFromList error:", error);
      alert("알람 삭제 중 오류가 발생했습니다.");
      return;
    }

    await loadAlarmList();
    alert("알람을 삭제했습니다.");
  };

  const cancelAlarmEdit = () => {
    setEditingAlarmId(null);
    setAlarmKind("todo_remind");
    setAlarmTitle("");
    setAlarmMessage("오늘의 할 일을 끝내보세요.");
    setAlarmTime("19:30");
    setAlarmDayType("all");
    setAlarmStartDay("");
    setAlarmEndDay("");
    setAlarmPeriodMode("always");
  };

  const editAlarmFromList = (row) => {
    setEditingAlarmId(row.id);

    setAlarmKind(String(row.kind ?? "todo_remind"));
    setAlarmTitle(String(row.title ?? ""));
    setAlarmMessage(String(row.message ?? ""));
    setAlarmTime(String(row.time_hhmm ?? "19:30"));

    setAlarmStartDay(row.start_day ? String(row.start_day) : "");
    setAlarmEndDay(row.end_day ? String(row.end_day) : "");
    setAlarmDayType(String(row.day_type ?? "all"));

    // 오늘만 모드 자동 감지: start_day와 end_day가 둘 다 오늘이면 "오늘만"으로 올려줍니다.
    const todayKey = toDayKey(new Date());
    if (row.start_day && row.end_day && String(row.start_day) === todayKey && String(row.end_day) === todayKey) {
      setAlarmPeriodMode("today");
    } else {
      setAlarmPeriodMode("always");
    }

    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }
  };

  const toggleAlarmActive = async (row) => {
    const next = !row.is_active;

    const { error } = await supabase
      .from("alarm_settings")
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    if (error) {
      console.error("toggleAlarmActive error:", error);
      alert("알람 상태 변경 중 오류가 발생했습니다.");
      return;
    }

    await loadAlarmList();
  };

  // =======================
  // 말씀 목록 불러오기
  // =======================
  const loadVerseList = async () => {
    const { data, error } = await supabase
      .from("daily_verses")
      .select("day_key, grade_code, ref_text, content, updated_at")
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

  // =======================
  // 숙제 목록 불러오기
  // =======================
  const loadHomeworkList = async () => {
    const { data, error } = await supabase
      .from("daily_homeworks")
      .select("day_key, grade_code, items, updated_at")
      .order("day_key", { ascending: false })
      .order("grade_code", { ascending: true });

    if (error) {
      console.error("loadHomeworkList error:", error);
      alert("저장된 숙제 목록을 불러오지 못했습니다.");
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

    setHwList([...todayList, ...futureList, ...pastList]);
  };

  // 선택된 날짜/학년에 맞는 말씀 불러오기
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

  // 선택된 날짜/학년에 맞는 숙제 불러오기
  const loadHomework = async () => {
    const { data, error } = await supabase
      .from("daily_homeworks")
      .select("items")
      .eq("day_key", dayKey)
      .eq("grade_code", Number(gradeCode))
      .maybeSingle();

    if (error) {
      console.error("loadHomework error:", error);
      alert("숙제를 불러오지 못했습니다.");
      return;
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    const normalized = items
      .map((x) => ({
        subject: String(x?.subject ?? "").trim(),
        content: String(x?.content ?? "").trim(),
      }))
      .filter((x) => x.subject && x.content);

    setHwItems(normalized);
  };

  // 오늘 숙제 저장
  const saveHomework = async () => {
    const cleaned = (hwItems ?? [])
      .map((x) => ({
        subject: String(x?.subject ?? "").trim(),
        content: String(x?.content ?? "").trim(),
      }))
      .filter((x) => x.subject && x.content);

    const { error } = await supabase
      .from("daily_homeworks")
      .upsert(
        { day_key: dayKey, grade_code: Number(gradeCode), items: cleaned },
        { onConflict: "day_key,grade_code" }
      );

    if (error) {
      console.error("saveHomework error:", error);
      alert("저장 중 오류가 발생했습니다. (권한/RLS를 확인해 주세요)");
      return;
    }

    alert(`숙제를 저장했습니다! (${dayKey} / ${gradeLabel})`);
    await loadHomework();
    await loadHomeworkList();
  };

  // 말씀 저장
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

  // 로그인 유저 확인 + 관리자 판별 (1회)
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

      const { data: p, error: pErr } = await supabase.from("profiles").select("id, is_admin").eq("id", user.id).maybeSingle();

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
      await loadHomework();
      await loadHomeworkList();
      await loadAlarmList();
      await loadWeekImage();

      if (mounted) setLoading(false);
    };

    run();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // 날짜/학년 바꾸면 편집칸 자동 갱신
  useEffect(() => {
    if (!isAdmin) return;
    loadVerse();
    loadHomework();
    loadWeekImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, dayKey, gradeCode]);

  // dayKey가 바뀌면 달력도 해당 달로 자동 이동
  useEffect(() => {
    const d = parseDayKeyToDate(dayKey);
    setCalMonth({ y: d.getFullYear(), m: d.getMonth() });
  }, [dayKey]);

  // 목록에서 수정: 위 입력칸으로 올려서 편집
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

  // 목록에서 삭제: 확인 후 DB 삭제
  const deleteFromList = async (row) => {
    const gradeName = GRADE_OPTIONS.find((g) => g.value === Number(row.grade_code))?.label ?? "-";

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

  // 숙제 목록에서 수정: 위 입력칸으로 올려서 편집
  const editHomeworkFromList = (row) => {
    setDayKey(String(row.day_key));
    setGradeCode(Number(row.grade_code));

    const items = Array.isArray(row.items) ? row.items : [];
    const normalized = items
      .map((x) => ({
        subject: String(x?.subject ?? "").trim(),
        content: String(x?.content ?? "").trim(),
      }))
      .filter((x) => x.subject && x.content);

    setHwItems(normalized);

    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }
  };

  // 숙제 목록에서 삭제: 확인 후 DB 삭제
  const deleteHomeworkFromList = async (row) => {
    const gradeName = GRADE_OPTIONS.find((g) => g.value === Number(row.grade_code))?.label ?? "-";

    const ok = window.confirm(`정말 삭제할까요?\n\n날짜: ${row.day_key}\n학년: ${gradeName}\n\n※ 삭제하면 되돌릴 수 없어요.`);
    if (!ok) return;

    const { error } = await supabase
      .from("daily_homeworks")
      .delete()
      .eq("day_key", String(row.day_key))
      .eq("grade_code", Number(row.grade_code));

    if (error) {
      console.error("deleteHomeworkFromList error:", error);
      alert("삭제 중 오류가 발생했습니다. (권한/RLS를 확인해 주세요)");
      return;
    }

    await loadHomeworkList();

    if (String(dayKey) === String(row.day_key) && Number(gradeCode) === Number(row.grade_code)) {
      setHwItems([]);
      setHwSubject("");
      setHwContent("");
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
        <HamburgerMenu />
      </div>

      {/* 날짜/요일 + 항상 떠있는 달력 카드 */}
      <div className="admin-card">
        <div className="admin-row admin-row-between">
          <div className="admin-date-line">
            <input
              className="admin-date-input"
              type="date"
              value={dayKey}
              onChange={(e) => setDayKey(e.target.value)}
              aria-label="날짜 선택"
            />

            <span className="admin-weekday">
              {`${selectedDateObj.getMonth() + 1}월 ${selectedDateObj.getDate()}일 (${getKoreanWeekday(selectedDateObj)})`}
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
          매일 모든 학년을 다 채울 필요는 없어요. 한 학년만 저장해도, 사용자는 그 날짜에 “저장된 학년 중 하나”를 볼 수
          있게 만들 수 있습니다.
        </div>

        <div className="admin-row">
          <span className="admin-label">말씀 범위</span>
          <input type="text" value={verseRef} onChange={(e) => setVerseRef(e.target.value)} placeholder="예) 시편 23편 1절" />
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

      {/* 오늘 숙제 입력 */}
      <div className="admin-card">
        <div className="admin-title" style={{ marginBottom: 8 }}>
          오늘 숙제 입력
        </div>

        <div className="admin-help">
          예) 수학: 30페이지 / 영어: 20쪽 쓰기 / 국어: 받아쓰기 3페이지 처럼 입력해요. “추가”를 누르면 아래에 쌓이고,
          “숙제 저장”을 누르면 DB에 저장됩니다.
        </div>

        <div className="admin-row" style={{ gap: 10, flexWrap: "wrap" }}>
          <input
            type="text"
            value={hwSubject}
            onChange={(e) => setHwSubject(e.target.value)}
            placeholder="숙제 항목 (예: 수학, 영어, 국어)"
            style={{ flex: 1, minWidth: 180 }}
          />
          <input
            type="text"
            value={hwContent}
            onChange={(e) => setHwContent(e.target.value)}
            placeholder="숙제 내용 (예: 30페이지, 20쪽 쓰기, 받아쓰기 3페이지)"
            style={{ flex: 2, minWidth: 220 }}
          />
          <button
            className="admin-btn"
            type="button"
            onClick={() => {
              const s = hwSubject.trim();
              const c = hwContent.trim();
              if (!s || !c) {
                alert("숙제 항목과 내용을 둘 다 입력해 주세요.");
                return;
              }
              setHwItems((prev) => [...prev, { subject: s, content: c }]);
              setHwSubject("");
              setHwContent("");
            }}
          >
            추가
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          {hwItems.length === 0 ? (
            <div className="admin-help">아직 입력된 숙제가 없어요.</div>
          ) : (
            <div className="admin-help">
              {hwItems.map((it, i) => (
                <div key={`hw-${i}`}>
                  • {it.subject}: {it.content}
                  <button
                    type="button"
                    className="admin-mini-btn danger"
                    style={{ marginLeft: 8 }}
                    onClick={() => setHwItems((prev) => prev.filter((_, idx) => idx !== i))}
                    title="이 줄 삭제"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="admin-actions">
          <button className="admin-btn" onClick={saveHomework}>
            숙제 저장
          </button>
          <button className="admin-btn ghost" onClick={loadHomework} title="현재 날짜/학년 숙제를 다시 불러옵니다">
            숙제 새로고침
          </button>
        </div>
      </div>

      {/* 주간 숙제 사진 업로드 */}
      <div className="admin-card">
        <div className="admin-title" style={{ marginBottom: 8 }}>
          일주일 숙제 사진 업로드
        </div>

        <div className="admin-help">
          “이번 주 월요일 기준(주 시작일)”로 1장만 저장됩니다. 같은 주에 다시 올리면 사진이 교체돼요. (주 시작일:{" "}
          {weekStartDayKey})
        </div>

        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;

            setWeekImgFile(f);

            try {
              const url = URL.createObjectURL(f);
              setWeekImgUrl(url);
            } catch {
              //
            }
          }}
        />

        {weekImgUrl ? (
          <div style={{ marginTop: 10 }}>
            <img
              src={weekImgUrl}
              alt="주간 숙제 사진 미리보기"
              style={{
                width: "100%",
                maxHeight: 420,
                objectFit: "contain",
                borderRadius: 14,
                border: "1px solid rgba(0,0,0,0.08)",
                background: "#fff",
              }}
            />
          </div>
        ) : (
          <div className="admin-help">아직 주간 숙제 사진이 없어요.</div>
        )}

        <div className="admin-actions">
          <button className="admin-btn" type="button" onClick={uploadWeekImage} disabled={weekImgUploading}>
            {weekImgUploading ? "업로드 중..." : "사진 저장"}
          </button>

          <button className="admin-btn ghost" type="button" onClick={loadWeekImage}>
            사진 새로고침
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
          verseList.slice(0, verseVisibleCount).map((v, idx) => {
            const lines = String(v.content ?? "")
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);

            const gradeName = GRADE_OPTIONS.find((g) => g.value === Number(v.grade_code))?.label ?? "-";

            return (
              <div key={`${v.day_key}-${v.grade_code}-${idx}`} className="admin-verse-preview">
                <div className="admin-verse-meta">
                  📅 {v.day_key} · {gradeName}
                </div>

                {String(v.ref_text ?? "").trim() ? <div className="admin-verse-ref">{v.ref_text}</div> : null}

                <div className="admin-verse-text">
                  {lines.map((line, i) => (
                    <span key={i} className="admin-verse-line" style={{ color: pickStableColor(`${v.day_key}:${i}`) }}>
                      {line}
                      {i < lines.length - 1 ? " " : ""}
                    </span>
                  ))}
                </div>

                <div className="admin-verse-actions">
                  <button type="button" className="admin-mini-btn" onClick={() => editFromList(v)}>
                    수정
                  </button>
                  <button type="button" className="admin-mini-btn danger" onClick={() => deleteFromList(v)}>
                    삭제
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {verseList.length > verseVisibleCount && (
        <div className="admin-actions" style={{ marginTop: 7 }}>
          <button className="admin-btn ghost" type="button" onClick={() => setVerseVisibleCount((prev) => prev + 7)}>
            더 보기 (+7)
          </button>
        </div>
      )}

      {/* 저장된 숙제 목록 */}
      <div className="admin-card">
        <div className="admin-title" style={{ marginBottom: 8 }}>
          저장된 숙제 목록
        </div>

        {hwList.length === 0 ? (
          <div className="admin-help">아직 저장된 숙제가 없어요. 위에서 저장해보세요.</div>
        ) : (
          hwList.slice(0, hwVisibleCount).map((h, idx) => {
            const gradeName = GRADE_OPTIONS.find((g) => g.value === Number(h.grade_code))?.label ?? "-";

            const items = Array.isArray(h.items) ? h.items : [];
            const normalized = items
              .map((x) => ({
                subject: String(x?.subject ?? "").trim(),
                content: String(x?.content ?? "").trim(),
              }))
              .filter((x) => x.subject && x.content);

            return (
              <div key={`${h.day_key}-${h.grade_code}-${idx}`} className="admin-verse-preview">
                <div className="admin-verse-meta">
                  📅 {h.day_key} · {gradeName}
                </div>

                {normalized.length === 0 ? (
                  <div className="admin-help">숙제 항목이 비어있어요.</div>
                ) : (
                  <div className="admin-verse-text">
                    {normalized.map((it, i) => (
                      <span key={i} className="admin-verse-line" style={{ color: pickStableColor(`${h.day_key}:hw:${i}`) }}>
                        {it.subject}: {it.content}
                        {i < normalized.length - 1 ? " " : ""}
                      </span>
                    ))}
                  </div>
                )}

                <div className="admin-verse-actions">
                  <button type="button" className="admin-mini-btn" onClick={() => editHomeworkFromList(h)}>
                    수정
                  </button>
                  <button type="button" className="admin-mini-btn danger" onClick={() => deleteHomeworkFromList(h)}>
                    삭제
                  </button>
                </div>
              </div>
            );
          })
        )}

        <div className="admin-actions" style={{ marginTop: 10 }}>
          <button className="admin-btn ghost" onClick={loadHomeworkList}>
            숙제 목록 새로고침
          </button>
        </div>
      </div>

      {hwList.length > hwVisibleCount && (
        <div className="admin-actions" style={{ marginTop: 7 }}>
          <button className="admin-btn ghost" type="button" onClick={() => setHwVisibleCount((prev) => prev + 7)}>
            더 보기 (+7)
          </button>
        </div>
      )}

      {/* 알람 설정 카드 */}
      <div className="admin-card">
        <div className="admin-title" style={{ marginBottom: 8 }}>
          알람 설정
        </div>

        <div className="admin-help">
          지금은 기간 기능이 불안정해서, “항상”과 “오늘만”만 확실히 동작하도록 만들었어요. “오늘만”은 저장할 때 자동으로 오늘 날짜로
          고정됩니다.
        </div>

        <div className="admin-row">
          <span className="admin-label">종류</span>
          <select value={alarmKind} onChange={(e) => setAlarmKind(e.target.value)}>
            <option value="todo_remind">오늘 할 일</option>
            <option value="rank_drop">순위 하락</option>
          </select>
        </div>

        <div className="admin-row">
          <span className="admin-label">제목</span>
          <input type="text" value={alarmTitle} onChange={(e) => setAlarmTitle(e.target.value)} placeholder="예) 방학-저녁 알림" />
        </div>

        <div className="admin-row">
          <span className="admin-label">멘트</span>
          <input
            type="text"
            value={alarmMessage}
            onChange={(e) => setAlarmMessage(e.target.value)}
            placeholder='예) "오늘의 할 일을 끝내보세요."'
          />
        </div>

        <div className="admin-row">
          <span className="admin-label">시간</span>
          <input type="time" value={alarmTime} onChange={(e) => setAlarmTime(e.target.value)} aria-label="알람 시간" />
        </div>

        <div className="admin-row">
          <span className="admin-label">요일</span>
          <select value={alarmDayType} onChange={(e) => setAlarmDayType(e.target.value)}>
            <option value="all">전체(매일)</option>
            <option value="weekday">평일만(월~금)</option>
            <option value="weekend">주말만(토/일)</option>
          </select>
        </div>

        <div className="admin-row">
          <span className="admin-label">기간</span>
          <select
            value={alarmPeriodMode}
            onChange={(e) => {
              const next = e.target.value;
              setAlarmPeriodMode(next);

              // 기간 입력값은 현재 기능 미사용이라 혼란 방지를 위해 비워둡니다.
              setAlarmStartDay("");
              setAlarmEndDay("");
            }}
          >
            <option value="always">항상</option>
            <option value="today">오늘만</option>
          </select>
        </div>

        {alarmPeriodMode === "always" ? (
          <div className="admin-row" style={{ gap: 10, flexWrap: "wrap" }}>
            <span className="admin-label" style={{ opacity: 0.6 }}>
              기간(미사용)
            </span>
            <input
              type="date"
              value={alarmStartDay}
              onChange={(e) => setAlarmStartDay(e.target.value)}
              aria-label="시작일"
              disabled
              title="현재는 기간 기능이 꺼져 있어요"
            />
            <span style={{ opacity: 0.6 }}>~</span>
            <input
              type="date"
              value={alarmEndDay}
              onChange={(e) => setAlarmEndDay(e.target.value)}
              aria-label="종료일"
              disabled
              title="현재는 기간 기능이 꺼져 있어요"
            />
          </div>
        ) : (
          <div className="admin-help">“오늘만”을 선택하면 이 알람은 오늘({toDayKey(new Date())}) 하루만 적용되도록 저장됩니다.</div>
        )}

        <div className="admin-actions">
          <button className="admin-btn" onClick={saveAlarm}>
            {editingAlarmId ? "알람 수정 저장" : "알람 저장"}
          </button>

          {editingAlarmId ? (
            <button className="admin-btn ghost" type="button" onClick={cancelAlarmEdit}>
              수정 취소
            </button>
          ) : (
            <button className="admin-btn ghost" onClick={loadAlarmList}>
              알람 목록 새로고침
            </button>
          )}
        </div>

        <div style={{ marginTop: 10 }}>
          {alarmList.length === 0 ? (
            <div className="admin-help">저장된 알람이 없어요.</div>
          ) : (
            <div className="admin-help">
              {alarmList.slice(0, 20).map((a) => {
                const sameDay = a.start_day && a.end_day && String(a.start_day) === String(a.end_day);

                return (
                  <div key={a.id} style={{ marginBottom: 8 }}>
                    • [{a.kind}] {a.title} / {a.time_hhmm} / {dayTypeLabel(a.day_type)} / {a.is_active ? "ON" : "OFF"}
                    <br />
                    {a.message}
                    {sameDay ? (
                      <> (기간: {a.start_day} 하루만)</>
                    ) : a.start_day || a.end_day ? (
                      <> (기간: {a.start_day ?? "-"} ~ {a.end_day ?? "-"})</>
                    ) : (
                      <> (기간: 항상)</>
                    )}
                    <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="admin-mini-btn"
                        onClick={() => editAlarmFromList(a)}
                        title="이 알람을 위 입력칸으로 올려서 수정합니다"
                      >
                        수정
                      </button>

                      <button type="button" className="admin-mini-btn" onClick={() => toggleAlarmActive(a)} title="알람을 켜거나 끕니다">
                        {a.is_active ? "끄기" : "켜기"}
                      </button>

                      <button
                        type="button"
                        className="admin-mini-btn danger"
                        onClick={() => deleteAlarmFromList(a)}
                        title="이 알람을 삭제합니다"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
              {alarmList.length > 20 ? <div style={{ opacity: 0.7 }}>… (너무 길면 20개까지만 보여요)</div> : null}
            </div>
          )}
        </div>

        <div className="admin-hamburger-menu">
          <HamburgerMenu />
        </div>
      </div>
    </div>
  );
}
