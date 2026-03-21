// src/pages/Admin.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Admin.css";
import HamburgerMenu from "../components/common/HamburgerMenu";

// 자동 저장 상태 배지 컴포넌트
// status: "idle" | "pending" | "saving" | "saved" | "error"
function SaveStatusBadge({ status }) {
  if (status === "idle") return null;

  const MAP = {
    pending: { text: "저장 대기", color: "#999" },
    saving: { text: "저장 중...", color: "#f59e0b" },
    saved: { text: "저장됨 ✓", color: "#22c55e" },
    error: { text: "저장 실패 ✗", color: "#ef4444" },
  };

  const info = MAP[status] ?? MAP.idle;

  return (
    <span
      style={{
        fontSize: 11,
        color: info.color,
        fontWeight: 600,
        whiteSpace: "nowrap",
        transition: "color 0.3s",
      }}
    >
      {info.text}
    </span>
  );
}

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

// 날짜를 YYYY-MM-DD로 만들기
const toDayKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

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
  const diffToMon = day === 0 ? -6 : 1 - day;
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

  // 날짜/학년
  const [dayKey, setDayKey] = useState(() => toDayKey(new Date()));
  const [gradeCode, setGradeCode] = useState(2);

  const gradeLabel = useMemo(() => {
    return GRADE_OPTIONS.find((x) => x.value === Number(gradeCode))?.label ?? "-";
  }, [gradeCode]);

  // 인라인 달력: 현재 보여줄 달
  const [calMonth, setCalMonth] = useState(() => {
    const d = parseDayKeyToDate(toDayKey(new Date()));
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // =========================
  // 토글(요구사항)
  // - 관리자 접속 시 전부 접힘
  // - 날짜를 누르면 "데이터가 있는 섹션"만 자동으로 펼침
  // =========================
  const [openVerseInput, setOpenVerseInput] = useState(false);
  const [openWeekImage, setOpenWeekImage] = useState(false);
  const [openDictationInput, setOpenDictationInput] = useState(false);
  const [openHomeworkInput, setOpenHomeworkInput] = useState(false);
  const [openAlarm, setOpenAlarm] = useState(false);

  // =========================
  // 말씀(편집/저장만 유지)
  // =========================
  const [verseRef, setVerseRef] = useState("");
  const [verseText, setVerseText] = useState("");

  const loadVerse = async () => {
    verseInitialized.current = false; // 로드 중에는 자동 저장 비활성화
    const { data, error } = await supabase
      .from("daily_verses")
      .select("ref_text, content")
      .eq("day_key", dayKey)
      .eq("grade_code", Number(gradeCode))
      .maybeSingle();

    if (error) {
      console.error("loadVerse error:", error);
      alert("말씀을 불러오지 못했습니다.");
      return false;
    }

    const ref = String(data?.ref_text ?? "");
    const txt = String(data?.content ?? "");

    setVerseRef(ref);
    setVerseText(txt);

    // 300ms 후 자동 저장 활성화 (setState 반영 후)
    setTimeout(() => { verseInitialized.current = true; }, 300);

    return Boolean(ref.trim() || txt.trim());
  };

  // 말씀 저장 (silent=true이면 alert 없이 저장, 자동 저장에서 사용)
  const saveVerse = async ({ silent = false } = {}) => {
    const text = String(verseText ?? "").trim();
    const refText = String(verseRef ?? "").trim();

    if (!text) {
      if (!silent) alert("말씀 내용을 입력해 주세요.");
      return;
    }

    if (!silent) setVerseSaveStatus("saving");

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
      if (!silent) {
        setVerseSaveStatus("error");
        alert("저장 중 오류가 발생했습니다. (권한/RLS를 확인해 주세요)");
      }
      return;
    }

    if (!silent) {
      setVerseSaveStatus("saved");
      const has = await loadVerse();
      setOpenVerseInput(true);
      if (!has) setOpenVerseInput(false);
    }
  };

  // =========================
  // 오늘 숙제(입력/저장만 유지)
  // =========================
  const [hwSubject, setHwSubject] = useState("");
  const [hwContent, setHwContent] = useState("");
  const [hwItems, setHwItems] = useState([]);

  const loadHomework = async () => {
    hwInitialized.current = false; // 로드 중에는 자동 저장 비활성화
    const { data, error } = await supabase
      .from("daily_homeworks")
      .select("items, image_paths")
      .eq("day_key", dayKey)
      .eq("grade_code", Number(gradeCode))
      .maybeSingle();

    if (error) {
      console.error("loadHomework error:", error);
      alert("숙제를 불러오지 못했습니다.");
      return false;
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    const normalized = items
      .map((x) => ({
        subject: String(x?.subject ?? "").trim(),
        content: String(x?.content ?? "").trim(),
      }))
      .filter((x) => x.subject && x.content);

    const imgs = Array.isArray(data?.image_paths) ? data.image_paths : [];
    setHwItems(normalized);
    setHwImages(imgs.filter((x) => x?.path && x?.url));

    // 300ms 후 자동 저장 활성화
    setTimeout(() => { hwInitialized.current = true; }, 300);

    return normalized.length > 0 || imgs.length > 0;
  };

  const saveHomework = async ({ silent = false, overrideItems, overrideImages } = {}) => {
    const cleaned = (overrideItems ?? hwItems ?? [])
      .map((x) => ({
        subject: String(x?.subject ?? "").trim(),
        content: String(x?.content ?? "").trim(),
      }))
      .filter((x) => x.subject && x.content);

    const images = (overrideImages ?? hwImages ?? []).filter((x) => x?.path && x?.url);

    if (!silent) setHwSaveStatus("saving");

    const { error } = await supabase
      .from("daily_homeworks")
      .upsert(
        { day_key: dayKey, grade_code: Number(gradeCode), items: cleaned, image_paths: images },
        { onConflict: "day_key,grade_code" }
      );

    if (error) {
      console.error("saveHomework error:", error);
      if (!silent) {
        setHwSaveStatus("error");
        alert("저장 중 오류가 발생했습니다. (권한/RLS를 확인해 주세요)");
      }
      return;
    }

    if (!silent) {
      setHwSaveStatus("saved");
      const has = await loadHomework();
      setOpenHomeworkInput(Boolean(has));
    }
  };

  // =========================
  // 받아쓰기(입력/저장 + 줄 단위 수정 버튼)
  // =========================
  const [dictInput, setDictInput] = useState("");
  const [dictItems, setDictItems] = useState([]);

  // 수정 모드로 들어간 줄(키)
  const [dictEditingKey, setDictEditingKey] = useState(null);
  const [dictEditNo, setDictEditNo] = useState(0);
  const [dictEditText, setDictEditText] = useState("");

  const makeDictKey = (item_no, index) => `${Number(item_no)}__${Number(index)}`;

  const addDictLine = () => {
    const t = String(dictInput ?? "").trim();
    if (!t) {
      alert("문장을 입력해 주세요.");
      return;
    }

    setDictItems((prev) => {
      const maxNo = (prev ?? []).reduce((acc, it) => Math.max(acc, Number(it.item_no ?? 0)), 0);
      return [...prev, { item_no: maxNo + 1, text: t }];
    });

    setDictInput("");
  };

  const loadDictation = async () => {
    dictInitialized.current = false; // 로드 중에는 자동 저장 비활성화
    const { data, error } = await supabase
      .from("dictation_items")
      .select("item_no, text")
      .eq("grade_code", Number(gradeCode))
      .eq("ymd", dayKey)
      .order("item_no", { ascending: true });

    if (error) {
      console.error("loadDictation error:", error);
      alert("받아쓰기를 불러오지 못했습니다.");
      return false;
    }

    const normalized = (data ?? [])
      .map((r) => ({
        item_no: Number(r?.item_no ?? 0),
        text: String(r?.text ?? "").trim(),
      }))
      .filter((r) => r.item_no >= 1 && r.text);

    setDictItems(normalized);
    setDictEditingKey(null);
    setDictEditNo(0);
    setDictEditText("");

    // 300ms 후 자동 저장 활성화
    setTimeout(() => { dictInitialized.current = true; }, 300);

    return normalized.length > 0;
  };

  const saveDictation = async ({ silent = false, overrideItems } = {}) => {
    const cleaned = (overrideItems ?? dictItems ?? [])
      .map((x) => ({
        item_no: Number(x?.item_no ?? 0),
        text: String(x?.text ?? "").trim(),
      }))
      .filter((x) => x.item_no >= 1 && x.text);

    if (!silent && cleaned.length === 0) {
      alert("저장할 받아쓰기 문장이 없어요.");
      return;
    }

    // 번호 중복 방지 (수동 저장 시만 검증)
    if (!silent) {
      const nums = cleaned.map((x) => x.item_no);
      const dup = nums.find((n, i) => nums.indexOf(n) !== i);
      if (dup) {
        alert(`번호가 중복됐어요: ${dup}번`);
        return;
      }
    }

    if (!silent) setDictSaveStatus("saving");

    try {
      // 기존 항목 모두 삭제 후 재삽입 (삭제된 항목 반영)
      const { error: delErr } = await supabase
        .from("dictation_items")
        .delete()
        .eq("grade_code", Number(gradeCode))
        .eq("ymd", dayKey);
      if (delErr) throw delErr;

      if (cleaned.length > 0) {
        const payload = cleaned.map((x) => ({
          grade_code: Number(gradeCode),
          ymd: dayKey,
          item_no: x.item_no,
          text: x.text,
        }));
        const { error: insErr } = await supabase.from("dictation_items").insert(payload);
        if (insErr) throw insErr;
      }

      if (!silent) {
        setDictSaveStatus("saved");
        const has = await loadDictation();
        setOpenDictationInput(Boolean(has));
      }
    } catch (err) {
      console.error("saveDictation error:", err);
      if (!silent) {
        setDictSaveStatus("error");
        alert("받아쓰기 저장 중 오류가 발생했습니다. (권한/RLS 또는 중복 여부 확인)");
      }
    }
  };

  const startEditDictLine = (it, idx) => {
    const key = makeDictKey(it.item_no, idx);
    setDictEditingKey(key);
    setDictEditNo(Number(it.item_no));
    setDictEditText(String(it.text ?? ""));
  };

  const cancelEditDictLine = () => {
    setDictEditingKey(null);
    setDictEditNo(0);
    setDictEditText("");
  };

  const applyEditDictLine = (it, idx) => {
    const nextNo = Number(dictEditNo ?? 0);
    const nextText = String(dictEditText ?? "").trim();

    if (nextNo < 1) {
      alert("번호는 1 이상이어야 해요.");
      return;
    }
    if (!nextText) {
      alert("문장을 입력해 주세요.");
      return;
    }

    setDictItems((prev) =>
      (prev ?? []).map((x, i) => {
        if (i !== idx) return x;
        if (x !== it) return x;
        return { ...x, item_no: nextNo, text: nextText };
      })
    );

    cancelEditDictLine();
  };

  // =========================
  // 주간 숙제 사진 업로드
  // =========================
  const [weekImgFile, setWeekImgFile] = useState(null);
  const [weekImgUrl, setWeekImgUrl] = useState("");
  const [weekImgPath, setWeekImgPath] = useState(""); // 스토리지 경로 (삭제용)
  const [weekImgUploading, setWeekImgUploading] = useState(false);
  const [weekImgDeleting, setWeekImgDeleting] = useState(false);

  // =========================
  // 오늘 숙제 이미지 (최대 2장)
  // =========================
  const [hwImages, setHwImages] = useState([]); // [{path, url}, ...]
  const [hwImgUploading, setHwImgUploading] = useState(false);

  // =========================
  // 자동 저장 상태
  // =========================
  const [verseSaveStatus, setVerseSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [dictSaveStatus, setDictSaveStatus] = useState("idle");
  const [hwSaveStatus, setHwSaveStatus] = useState("idle");

  // 자동 저장 초기화 플래그 (날짜/학년 변경 시 자동 저장 방지)
  const verseInitialized = useRef(false);
  const dictInitialized = useRef(false);
  const hwInitialized = useRef(false);

  // debounce 타이머 (말씀 암송용)
  const verseTimer = useRef(null);

  const weekStartDayKey = useMemo(() => getWeekStartDayKey(dayKey), [dayKey]);

  const loadWeekImage = async () => {
    const { data, error } = await supabase
      .from("weekly_homework_images")
      .select("image_url, image_path")
      .eq("week_start_day", weekStartDayKey)
      .eq("grade_code", Number(gradeCode))
      .maybeSingle();

    if (error) {
      console.error("loadWeekImage error:", error);
      setWeekImgUrl("");
      setWeekImgPath("");
      return false;
    }

    const url = String(data?.image_url ?? "");
    const path = String(data?.image_path ?? "");
    setWeekImgUrl(url);
    setWeekImgPath(path);
    return Boolean(url.trim());
  };

  const deleteWeekImage = async () => {
    const ok = window.confirm("주간 숙제 사진을 삭제할까요?\n삭제하면 되돌릴 수 없어요.");
    if (!ok) return;

    setWeekImgDeleting(true);
    try {
      // 스토리지에서 파일 삭제
      if (weekImgPath) {
        const { error: storErr } = await supabase.storage.from("weekly-homework").remove([weekImgPath]);
        if (storErr) console.warn("스토리지 삭제 오류 (무시):", storErr);
      }

      // DB 레코드 삭제
      const { error: dbErr } = await supabase
        .from("weekly_homework_images")
        .delete()
        .eq("week_start_day", weekStartDayKey)
        .eq("grade_code", Number(gradeCode));
      if (dbErr) throw dbErr;

      setWeekImgUrl("");
      setWeekImgPath("");
      setWeekImgFile(null);
      setOpenWeekImage(false);
    } catch (err) {
      console.error("deleteWeekImage error:", err);
      alert("사진 삭제 중 오류가 났어요.");
    } finally {
      setWeekImgDeleting(false);
    }
  };

  const uploadWeekImage = async (fileArg) => {
    const file = fileArg ?? weekImgFile;
    if (!file) {
      alert("올릴 사진을 먼저 선택해 주세요.");
      return;
    }

    setWeekImgUploading(true);

    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ext.length <= 5 ? ext : "jpg";

      const path = `${Number(gradeCode)}/${weekStartDayKey}/${Date.now()}.${safeExt}`;

      const bucket = supabase.storage.from("weekly-homework");

      const { error: upErr } = await bucket.upload(path, file, {
        upsert: true,
        contentType: file.type || "image/jpeg",
      });
      if (upErr) throw upErr;

      const { data: pub } = bucket.getPublicUrl(path);
      const publicUrl = String(pub?.publicUrl ?? "").trim();
      if (!publicUrl) throw new Error("publicUrl 생성 실패 (버킷 공개 설정 확인)");

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

      const has = await loadWeekImage();
      setOpenWeekImage(Boolean(has));
    } catch (err) {
      console.error("uploadWeekImage error:", err);
      alert(err?.message ?? "사진 업로드 중 오류가 났어요. (버킷/권한/RLS 확인)");
    } finally {
      setWeekImgUploading(false);
    }
  };

  // =========================
  // 오늘 숙제 이미지 업로드 (최대 2장, weekly-homework 버킷의 hw-imgs/ 경로 사용)
  // =========================
  const uploadHwImage = async (file) => {
    if (!file) return;
    if (hwImages.length >= 2) {
      alert("숙제 이미지는 최대 2장까지 올릴 수 있어요.");
      return;
    }

    setHwImgUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ext.length <= 5 ? ext : "jpg";
      const path = `hw-imgs/${Number(gradeCode)}/${dayKey}/${Date.now()}.${safeExt}`;

      const bucket = supabase.storage.from("weekly-homework");
      const { error: upErr } = await bucket.upload(path, file, {
        upsert: false,
        contentType: file.type || "image/jpeg",
      });
      if (upErr) throw upErr;

      const { data: pub } = bucket.getPublicUrl(path);
      const publicUrl = String(pub?.publicUrl ?? "").trim();
      if (!publicUrl) throw new Error("publicUrl 생성 실패");

      const newImg = { path, url: publicUrl };
      const nextImages = [...hwImages, newImg];
      setHwImages(nextImages);

      // 즉시 DB 저장
      await saveHomework({ silent: true, overrideImages: nextImages });
      setHwSaveStatus("saved");
    } catch (err) {
      console.error("uploadHwImage error:", err);
      alert(err?.message ?? "이미지 업로드 중 오류가 났어요.");
      setHwSaveStatus("error");
    } finally {
      setHwImgUploading(false);
    }
  };

  const deleteHwImage = async (img) => {
    const ok = window.confirm("이 이미지를 삭제할까요?");
    if (!ok) return;

    try {
      // 스토리지에서 파일 삭제
      if (img?.path) {
        const { error: storErr } = await supabase.storage.from("weekly-homework").remove([img.path]);
        if (storErr) console.warn("스토리지 삭제 오류 (무시):", storErr);
      }

      const nextImages = hwImages.filter((x) => x.path !== img.path);
      setHwImages(nextImages);

      // 즉시 DB 저장
      await saveHomework({ silent: true, overrideImages: nextImages });
      setHwSaveStatus("saved");
    } catch (err) {
      console.error("deleteHwImage error:", err);
      alert("이미지 삭제 중 오류가 났어요.");
      setHwSaveStatus("error");
    }
  };

  // =========================
  // 알람 설정(전체 유저용 표시)
  // =========================
  const [alarmKind, setAlarmKind] = useState("todo_remind");
  const [alarmTitle, setAlarmTitle] = useState("");
  const [alarmMessage, setAlarmMessage] = useState("오늘의 할 일을 끝내보세요.");
  const [alarmTime, setAlarmTime] = useState("19:30");
  const [alarmStartDay, setAlarmStartDay] = useState("");
  const [alarmEndDay, setAlarmEndDay] = useState("");
  const [editingAlarmId, setEditingAlarmId] = useState(null);
  const [alarmDayType, setAlarmDayType] = useState("all");
  const [alarmList, setAlarmList] = useState([]);
  const [alarmPeriodMode, setAlarmPeriodMode] = useState("always");

  const [alarmOnUsers, setAlarmOnUsers] = useState([]);

  const loadAlarmOnUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, nickname, alarm_enabled_at")
      .eq("alarm_enabled", true)
      .order("alarm_enabled_at", { ascending: false });

    if (error) {
      console.error("loadAlarmOnUsers error:", error);
      return [];
    }
    return data ?? [];
  };

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

    const rows = (data ?? []).map((r) => ({
      ...r,
      day_type: r?.day_type || "all",
    }));

    setAlarmList(rows);

    const users = await loadAlarmOnUsers();
    setAlarmOnUsers(users);
  };

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

    const todayKey = toDayKey(new Date());

    let resolvedStartDay = null;
    let resolvedEndDay = null;

    if (alarmPeriodMode === "today") {
      resolvedStartDay = todayKey;
      resolvedEndDay = todayKey;
    } else if (alarmPeriodMode === "range") {
      const s = String(alarmStartDay || "").trim();
      const e = String(alarmEndDay || "").trim();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) {
        alert("기간 날짜 형식이 올바르지 않습니다.");
        return;
      }
      if (keyToNum(s) > keyToNum(e)) {
        alert("시작일이 종료일보다 늦을 수 없어요.");
        return;
      }

      resolvedStartDay = s;
      resolvedEndDay = e;
    }

    const payload = {
      kind: alarmKind,
      title: String(alarmTitle ?? "").trim() || `${alarmKind} 알람`,
      message: msg,
      time_hhmm: hhmm,
      start_day: resolvedStartDay,
      end_day: resolvedEndDay,
      day_type: alarmDayType,
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

    const todayKey = toDayKey(new Date());
    if (row.start_day && row.end_day && String(row.start_day) === todayKey && String(row.end_day) === todayKey) {
      setAlarmPeriodMode("today");
    } else if (row.start_day || row.end_day) {
      setAlarmPeriodMode("range");
    } else {
      setAlarmPeriodMode("always");
    }

    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }

    setOpenAlarm(true);
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

  // =========================
  // 로그인 유저 확인 + 관리자 판별
  // =========================
  useEffect(() => {
    let mounted = true;

    const run = async () => {
      setLoading(true);

      // ✅ 접속 시 전부 접기
      setOpenVerseInput(false);
      setOpenWeekImage(false);
      setOpenDictationInput(false);
      setOpenHomeworkInput(false);
      setOpenAlarm(false);

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

      // ✅ 첫 진입에서도 "데이터가 있는 섹션"만 자동으로 펼치기
      const hasVerse = await loadVerse();
      const hasHw = await loadHomework();
      const hasDict = await loadDictation();
      await loadAlarmList();
      const hasWeekImg = await loadWeekImage();

      if (mounted) {
        setOpenVerseInput(Boolean(hasVerse));
        setOpenHomeworkInput(Boolean(hasHw));
        setOpenDictationInput(Boolean(hasDict));
        setOpenWeekImage(Boolean(hasWeekImg));
        setLoading(false);
      }
    };

    run();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // ✅ 날짜/학년 바꾸면: 데이터 새로 로드 + "있는 섹션만 펼치기"
  useEffect(() => {
    if (!isAdmin) return;

    const run = async () => {
      // 날짜 눌렀을 때도 기본은 접어두고, 있는 것만 펼침
      setOpenVerseInput(false);
      setOpenWeekImage(false);
      setOpenDictationInput(false);
      setOpenHomeworkInput(false);

      const hasVerse = await loadVerse();
      const hasHw = await loadHomework();
      const hasDict = await loadDictation();
      const hasWeekImg = await loadWeekImage();

      setOpenVerseInput(Boolean(hasVerse));
      setOpenHomeworkInput(Boolean(hasHw));
      setOpenDictationInput(Boolean(hasDict));
      setOpenWeekImage(Boolean(hasWeekImg));
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, dayKey, gradeCode]);

  // dayKey가 바뀌면 달력도 해당 달로 이동
  useEffect(() => {
    const d = parseDayKeyToDate(dayKey);
    setCalMonth({ y: d.getFullYear(), m: d.getMonth() });
  }, [dayKey]);

  // =============================================
  // 자동 저장 useEffect
  // =============================================

  // 말씀 암송 — 1.5초 debounce 자동 저장
  useEffect(() => {
    if (!verseInitialized.current) return;
    if (!String(verseText ?? "").trim()) return; // 내용 없으면 저장 안 함

    setVerseSaveStatus("pending");
    clearTimeout(verseTimer.current);
    verseTimer.current = setTimeout(async () => {
      setVerseSaveStatus("saving");
      try {
        const { data: ud } = await supabase.auth.getUser();
        const { error } = await supabase.from("daily_verses").upsert(
          {
            day_key: dayKey,
            grade_code: Number(gradeCode),
            ref_text: String(verseRef ?? "").trim() || null,
            content: String(verseText ?? "").trim(),
            created_by: ud?.user?.id ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "day_key,grade_code" }
        );
        if (error) throw error;
        setVerseSaveStatus("saved");
      } catch {
        setVerseSaveStatus("error");
      }
    }, 1500);

    return () => clearTimeout(verseTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verseRef, verseText]);

  // 받아쓰기 — 항목 변경 즉시 자동 저장
  useEffect(() => {
    if (!dictInitialized.current) return;

    setDictSaveStatus("saving");
    const run = async () => {
      try {
        await saveDictation({ silent: true, overrideItems: dictItems });
        setDictSaveStatus("saved");
      } catch {
        setDictSaveStatus("error");
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictItems]);

  // 숙제 항목 — 변경 즉시 자동 저장 (이미지는 별도 처리)
  useEffect(() => {
    if (!hwInitialized.current) return;

    setHwSaveStatus("saving");
    const run = async () => {
      try {
        await saveHomework({ silent: true, overrideItems: hwItems });
        setHwSaveStatus("saved");
      } catch {
        setHwSaveStatus("error");
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hwItems]);

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

      {/* 달력 카드: 날짜 + 학년 선택을 최상단에 고정 */}
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

        <div className="admin-row" style={{ marginTop: 10 }}>
          <span className="admin-label">학년</span>
          <select value={gradeCode} onChange={(e) => setGradeCode(Number(e.target.value))}>
            {GRADE_OPTIONS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>

          <div className="admin-help" style={{ marginLeft: 10 }}>
            날짜와 학년을 먼저 고르고 아래에서 입력하세요.
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

      {/* 오늘의 말씀 암송 (토글) */}
      <div className="admin-card">
        <button
          type="button"
          className="admin-row admin-row-between"
          onClick={() => setOpenVerseInput((v) => !v)}
          style={{ width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
          aria-expanded={openVerseInput}
        >
          <div className="admin-title" style={{ marginBottom: 8 }}>
            오늘의 말씀 암송
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SaveStatusBadge status={verseSaveStatus} />
            <div style={{ fontSize: 18, opacity: 0.8, paddingBottom: 6 }}>{openVerseInput ? "▾" : "▸"}</div>
          </div>
        </button>

        {openVerseInput ? (
          <>
            <div className="admin-help" style={{ marginBottom: 8 }}>
              입력하면 1.5초 후 자동으로 저장됩니다.
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

          </>
        ) : (
          <div className="admin-help">눌러서 펼치면 입력/수정할 수 있어요.</div>
        )}
      </div>

      {/* 일주일 숙제 사진 업로드 (토글) */}
      <div className="admin-card">
        <button
          type="button"
          className="admin-row admin-row-between"
          onClick={() => setOpenWeekImage((v) => !v)}
          style={{ width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
          aria-expanded={openWeekImage}
        >
          <div className="admin-title" style={{ marginBottom: 8 }}>
            주간학습 안내 / 숙제
          </div>
          <div style={{ fontSize: 18, opacity: 0.8, paddingBottom: 6 }}>{openWeekImage ? "▾" : "▸"}</div>
        </button>

        {openWeekImage ? (
          <>
            <div className="admin-help">
              이번 주 월요일 기준(주 시작일)로 1장만 저장됩니다. 같은 주에 다시 올리면 사진이 교체돼요. (주 시작일:{" "}
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

                // 파일 선택 즉시 자동 업로드
                uploadWeekImage(f);
              }}
            />

            {weekImgUrl ? (
              <div style={{ marginTop: 10, position: "relative" }}>
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
                {/* 저장된 사진(weekImgPath가 있을 때)만 삭제 버튼 표시 */}
                {weekImgPath && !weekImgFile && (
                  <button
                    type="button"
                    className="admin-mini-btn danger"
                    style={{ marginTop: 8 }}
                    onClick={deleteWeekImage}
                    disabled={weekImgDeleting}
                  >
                    {weekImgDeleting ? "삭제 중..." : "사진 삭제"}
                  </button>
                )}
              </div>
            ) : (
              <div className="admin-help">아직 주간 숙제 사진이 없어요.</div>
            )}

            <div className="admin-actions">
              {weekImgUploading && (
                <span className="admin-help" style={{ color: "#888" }}>업로드 중...</span>
              )}

              <button className="admin-btn ghost" type="button" onClick={loadWeekImage}>
                사진 새로고침
              </button>
            </div>
          </>
        ) : (
          <div className="admin-help">눌러서 펼치면 업로드/교체할 수 있어요.</div>
        )}
      </div>

      {/* 오늘의 받아쓰기 입력(토글) */}
      <div className="admin-card">
        <button
          type="button"
          className="admin-row admin-row-between"
          onClick={() => setOpenDictationInput((v) => !v)}
          style={{ width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
          aria-expanded={openDictationInput}
        >
          <div className="admin-title" style={{ marginBottom: 8 }}>
            오늘의 받아쓰기 입력
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SaveStatusBadge status={dictSaveStatus} />
            <div style={{ fontSize: 18, opacity: 0.8, paddingBottom: 6 }}>{openDictationInput ? "▾" : "▸"}</div>
          </div>
        </button>

        {openDictationInput ? (
          <>
            <div className="admin-help">
              줄마다 수정 버튼을 눌러 수정할 수 있어요. 문장을 추가하거나 삭제하면 자동으로 저장됩니다.
            </div>

            <div className="admin-row" style={{ gap: 10, flexWrap: "wrap" }}>
              <input
                type="text"
                value={dictInput}
                onChange={(e) => setDictInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDictLine();
                  }
                }}
                placeholder="문장 입력 (예: 나는 책을 읽는다.)"
                style={{ flex: 1, minWidth: 240 }}
              />

              <button className="admin-btn" type="button" onClick={addDictLine}>
                추가
              </button>

              <button
                className="admin-btn ghost"
                type="button"
                onClick={loadDictation}
                title="현재 날짜/학년 받아쓰기를 다시 불러옵니다"
              >
                받아쓰기 새로고침
              </button>
            </div>

            <div style={{ marginTop: 10 }}>
              {dictItems.length === 0 ? (
                <div className="admin-help">아직 입력된 받아쓰기가 없어요.</div>
              ) : (
                <div className="admin-help">
                  {dictItems
                    .slice()
                    .sort((a, b) => Number(a.item_no) - Number(b.item_no))
                    .map((it, idxSorted) => {
                      const originalIndex = (dictItems ?? []).findIndex(
                        (x) => x === it && Number(x.item_no) === Number(it.item_no) && String(x.text) === String(it.text)
                      );
                      const safeIndex = originalIndex >= 0 ? originalIndex : idxSorted;

                      const key = makeDictKey(it.item_no, safeIndex);
                      const isEditing = dictEditingKey === key;

                      return (
                        <div key={`dict-${key}`} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            {isEditing ? (
                              <>
                                <input
                                  type="number"
                                  value={dictEditNo}
                                  onChange={(e) => setDictEditNo(Number(e.target.value ?? 0))}
                                  style={{
                                    width: 80,
                                    padding: "8px 10px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(0,0,0,0.15)",
                                  }}
                                />

                                <input
                                  type="text"
                                  value={dictEditText}
                                  onChange={(e) => setDictEditText(e.target.value)}
                                  style={{
                                    flex: 1,
                                    minWidth: 220,
                                    padding: "8px 10px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(0,0,0,0.15)",
                                  }}
                                />

                                <button
                                  type="button"
                                  className="admin-mini-btn"
                                  onClick={() => applyEditDictLine(it, safeIndex)}
                                  title="이 줄 수정 적용"
                                >
                                  완료
                                </button>

                                <button type="button" className="admin-mini-btn" onClick={cancelEditDictLine} title="수정 취소">
                                  취소
                                </button>

                                <button
                                  type="button"
                                  className="admin-mini-btn danger"
                                  onClick={() => {
                                    const ok = window.confirm(`${it.item_no}번 문장을 삭제할까요?`);
                                    if (!ok) return;
                                    cancelEditDictLine();
                                    setDictItems((prev) => (prev ?? []).filter((x) => x !== it));
                                  }}
                                  title="이 줄 삭제"
                                >
                                  삭제
                                </button>
                              </>
                            ) : (
                              <>
                                <div
                                  style={{
                                    width: 80,
                                    padding: "8px 10px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(0,0,0,0.08)",
                                    background: "rgba(0,0,0,0.03)",
                                    textAlign: "center",
                                  }}
                                >
                                  {it.item_no}
                                </div>

                                <div
                                  style={{
                                    flex: 1,
                                    minWidth: 220,
                                    padding: "8px 10px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(0,0,0,0.08)",
                                    background: "rgba(0,0,0,0.03)",
                                  }}
                                >
                                  {it.text}
                                </div>

                                <button
                                  type="button"
                                  className="admin-mini-btn"
                                  onClick={() => startEditDictLine(it, safeIndex)}
                                  title="이 줄 수정"
                                >
                                  수정
                                </button>

                                <button
                                  type="button"
                                  className="admin-mini-btn danger"
                                  onClick={() => {
                                    const ok = window.confirm(`${it.item_no}번 문장을 삭제할까요?`);
                                    if (!ok) return;
                                    setDictItems((prev) => (prev ?? []).filter((x) => x !== it));
                                  }}
                                  title="이 줄 삭제"
                                >
                                  삭제
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

          </>
        ) : (
          <div className="admin-help">눌러서 펼치면 입력/수정할 수 있어요.</div>
        )}
      </div>

      {/* 오늘 숙제 입력(토글) */}
      <div className="admin-card">
        <button
          type="button"
          className="admin-row admin-row-between"
          onClick={() => setOpenHomeworkInput((v) => !v)}
          style={{ width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
          aria-expanded={openHomeworkInput}
        >
          <div className="admin-title" style={{ marginBottom: 8 }}>
            오늘 숙제 입력
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SaveStatusBadge status={hwSaveStatus} />
            <div style={{ fontSize: 18, opacity: 0.8, paddingBottom: 6 }}>{openHomeworkInput ? "▾" : "▸"}</div>
          </div>
        </button>

        {openHomeworkInput ? (
          <>
            <div className="admin-help">
              항목을 추가/삭제하면 자동으로 저장됩니다. 이미지는 최대 2장까지 첨부할 수 있어요.
            </div>

            {/* 숙제 항목 입력 */}
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const s = hwSubject.trim();
                    const c = hwContent.trim();
                    if (!s || !c) { alert("숙제 항목과 내용을 둘 다 입력해 주세요."); return; }
                    setHwItems((prev) => [...prev, { subject: s, content: c }]);
                    setHwSubject("");
                    setHwContent("");
                  }
                }}
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

            {/* 숙제 이미지 업로드 (최대 2장) */}
            <div style={{ marginTop: 14, borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 12 }}>
              <div className="admin-label" style={{ marginBottom: 8 }}>
                숙제 이미지 ({hwImages.length}/2)
              </div>

              {hwImages.length < 2 && (
                <label style={{ display: "inline-block", cursor: hwImgUploading ? "not-allowed" : "pointer" }}>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    disabled={hwImgUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = ""; // 같은 파일 재선택 허용
                      if (f) uploadHwImage(f);
                    }}
                  />
                  <span className="admin-btn" style={{ opacity: hwImgUploading ? 0.6 : 1 }}>
                    {hwImgUploading ? "업로드 중..." : "이미지 추가"}
                  </span>
                </label>
              )}

              {hwImages.length > 0 && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                  {hwImages.map((img, i) => (
                    <div key={`hwimg-${i}`} style={{ position: "relative", display: "inline-block" }}>
                      <img
                        src={img.url}
                        alt={`숙제 이미지 ${i + 1}`}
                        style={{
                          width: 120,
                          height: 120,
                          objectFit: "cover",
                          borderRadius: 10,
                          border: "1px solid rgba(0,0,0,0.1)",
                          background: "#f5f5f5",
                          display: "block",
                        }}
                      />
                      <button
                        type="button"
                        className="admin-mini-btn danger"
                        style={{ marginTop: 4, width: "100%" }}
                        onClick={() => deleteHwImage(img)}
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </>
        ) : (
          <div className="admin-help">눌러서 펼치면 입력할 수 있어요.</div>
        )}
      </div>

      {/* 알람 설정(토글) - 전체 유저용 */}
      <div className="admin-card">
        <button
          type="button"
          className="admin-row admin-row-between"
          onClick={() => setOpenAlarm((v) => !v)}
          style={{ width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
          aria-expanded={openAlarm}
        >
          <div className="admin-title" style={{ marginBottom: 8 }}>
            전체 유저 알림 설정
          </div>
          <div style={{ fontSize: 18, opacity: 0.8, paddingBottom: 6 }}>{openAlarm ? "▾" : "▸"}</div>
        </button>

        {openAlarm ? (
          <>
            <div className="admin-help">
              여기는 특정 한 명이 아니라, 알림을 켜둔 모든 유저에게 같은 내용으로 발송되는 설정입니다.
              항상 / 오늘만 / 기간 3가지로 동작합니다.
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
              <input type="text" value={alarmTitle} onChange={(e) => setAlarmTitle(e.target.value)} placeholder="예) 저녁 알림" />
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

                  const t = toDayKey(new Date());

                  if (next === "always") {
                    setAlarmStartDay("");
                    setAlarmEndDay("");
                  } else if (next === "today") {
                    setAlarmStartDay(t);
                    setAlarmEndDay(t);
                  } else if (next === "range") {
                    if (!alarmStartDay) setAlarmStartDay(t);
                    if (!alarmEndDay) setAlarmEndDay(t);
                  }
                }}
              >
                <option value="always">항상</option>
                <option value="today">오늘만</option>
                <option value="range">기간</option>
              </select>
            </div>

            {alarmPeriodMode === "range" ? (
              <div className="admin-row" style={{ gap: 10, flexWrap: "wrap" }}>
                <span className="admin-label">시작/종료</span>
                <input type="date" value={alarmStartDay} onChange={(e) => setAlarmStartDay(e.target.value)} aria-label="시작일" />
                <span>~</span>
                <input type="date" value={alarmEndDay} onChange={(e) => setAlarmEndDay(e.target.value)} aria-label="종료일" />
              </div>
            ) : alarmPeriodMode === "today" ? (
              <div className="admin-help">오늘만은 오늘({toDayKey(new Date())}) 하루만 적용되도록 저장됩니다.</div>
            ) : (
              <div className="admin-help">항상은 기간 없이 매일 적용됩니다.</div>
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

            {alarmOnUsers.length > 0 ? (
              <div className="admin-help" style={{ marginTop: 10 }}>
                알림 ON 유저: {alarmOnUsers.slice(0, 10).map((u) => String(u.nickname || "이름없음")).join(", ")}
                {alarmOnUsers.length > 10 ? " …" : ""}
              </div>
            ) : (
              <div className="admin-help" style={{ marginTop: 10 }}>
                알림 ON 유저가 아직 없어요.
              </div>
            )}

            <div className="admin-hamburger-menu">
              <HamburgerMenu />
            </div>
          </>
        ) : (
          <div className="admin-help">눌러서 펼치면 전체 유저 알림 설정을 할 수 있어요.</div>
        )}
      </div>
    </div>
  );
}
