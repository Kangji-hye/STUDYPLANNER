// src/pages/RecommendedBooks.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import HamburgerMenu from "../components/common/HamburgerMenu";
import "./RecommendedBooks.css";

const DEFAULT_GRADE_CODE = 2;

const STATUS_FILTER_OPTIONS = [
  { value: "yes_child", label: "소장도서 + 어린이자료실" },
  { value: "yes", label: "소장도서만" },
  { value: "no", label: "미소장도서만" },
  { value: "all", label: "전체" },
];

function norm(s) {
  return String(s ?? "").trim();
}

function includesIgnoreCase(haystack, needle) {
  const h = norm(haystack).toLowerCase();
  const n = norm(needle).toLowerCase();
  if (!n) return true;
  return h.includes(n);
}

function isOwned(statusText) {
  const s = norm(statusText);
  return s.includes("✅") || s.includes("⚠️");
}

function isChildRoom(locationText) {
  return norm(locationText).includes("어린이자료실");
}

function getColsStorageKey(userId) {
  return `recommended_books_visible_cols_v1:${userId || "guest"}`;
}

function safeParseCols(jsonStr) {
  try {
    const v = JSON.parse(jsonStr);
    if (!v || typeof v !== "object") return null;
    return {
      no: v.no !== false,
      author: v.author !== false,
      publisher: v.publisher !== false,
      status: v.status !== false,
      location: v.location !== false,
    };
  } catch {
    return null;
  }
}

function sortList(list, sortKey, sortDir) {
  if (!sortKey) return list;
  const dir = sortDir === "desc" ? -1 : 1;
  return [...list].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (sortKey === "no") return (Number(av) - Number(bv)) * dir;
    const as = norm(av);
    const bs = norm(bv);
    if (sortKey === "status") {
      const ao = isOwned(as) ? 0 : 1;
      const bo = isOwned(bs) ? 0 : 1;
      if (ao !== bo) return (ao - bo) * dir;
      return as.localeCompare(bs, "ko") * dir;
    }
    return as.localeCompare(bs, "ko") * dir;
  });
}

function mapBookRow(row) {
  return {
    no: Number(row.book_no),
    title: row.title ?? "",
    author: row.author ?? "",
    publisher: row.publisher ?? "",
    status: row.library_status ?? "",
    callno: row.callno ?? "",
    location: row.location ?? "",
  };
}

export default function RecommendedBooks() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("reading_race"); // "recommend" | "reading_race"
  const [userId, setUserId] = useState(null);

  const [gradeCode, setGradeCode] = useState(DEFAULT_GRADE_CODE);
  const [libraryCode, setLibraryCode] = useState("guseong"); // "guseong" | "cheongdeok" | "jangmi"
  const [raceLevel, setRaceLevel] = useState(2);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("yes_child");

  // 장미도서관은 위치 데이터 없으므로 "소장도서만"으로 자동 전환
  useEffect(() => {
    if (libraryCode === "jangmi" && statusFilter === "yes_child") {
      setStatusFilter("yes");
    } else if (libraryCode !== "jangmi" && statusFilter === "yes") {
      setStatusFilter("yes_child");
    }
  }, [libraryCode]); // eslint-disable-line react-hooks/exhaustive-deps
  const [onlyUnchecked, setOnlyUnchecked] = useState(false);

  // 추천도서
  const [booksForGrade, setBooksForGrade] = useState([]);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [booksError, setBooksError] = useState("");

  // 리딩레이스 도서
  const [raceBooksAll, setRaceBooksAll] = useState([]);
  const [loadingRace, setLoadingRace] = useState(false);
  const [raceError, setRaceError] = useState("");

  // "대여" 체크(추천도서 탭 전용)
  const [checkedSet, setCheckedSet] = useState(() => new Set());
  const [loadingChecks, setLoadingChecks] = useState(false);

  // 열 표시 체크
  const [visibleCols, setVisibleCols] = useState({
    no: true,
    author: true,
    publisher: true,
    status: true,
    location: true,
  });

  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  // 로그인 사용자 확인
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!alive) return;
      if (error) { console.error(error); setUserId(null); return; }
      setUserId(data?.user?.id ?? null);
    })();
    return () => { alive = false; };
  }, []);

  // 사용자별 열 표시 상태 불러오기
  useEffect(() => {
    const key = getColsStorageKey(userId);
    const saved = localStorage.getItem(key);
    const parsed = saved ? safeParseCols(saved) : null;
    if (parsed) setVisibleCols(parsed);
  }, [userId]);

  // 사용자별 열 표시 상태 저장하기
  useEffect(() => {
    const key = getColsStorageKey(userId);
    localStorage.setItem(key, JSON.stringify(visibleCols));
  }, [userId, visibleCols]);

  // 추천도서 로드
  const loadBooks = useCallback(async () => {
    setLoadingBooks(true);
    setBooksError("");
    try {
      const tableName = libraryCode === "jangmi"
        ? "jangmi_recommended_books"
        : "recommended_books";
      const { data, error } = await supabase
        .from(tableName)
        .select("book_no, title, author, publisher, library_status, callno, location")
        .eq("grade_code", gradeCode)
        .order("book_no", { ascending: true })
        .range(0, 9999); // Supabase 기본 limit(1000) 우회
      if (error) throw error;
      setBooksForGrade((data ?? []).map(mapBookRow));
    } catch (e) {
      console.error(e);
      setBooksForGrade([]);
      setBooksError("도서 목록을 불러오지 못했어요. (Supabase 테이블/정책/컬럼명을 확인해 주세요)");
    } finally {
      setLoadingBooks(false);
    }
  }, [gradeCode, libraryCode]);

  useEffect(() => {
    if (activeTab === "recommend" && libraryCode !== "cheongdeok") loadBooks();
  }, [loadBooks, activeTab, libraryCode]);

  // 리딩레이스 도서 로드
  const loadRaceBooks = useCallback(async () => {
    if (libraryCode === "cheongdeok") { setRaceBooksAll([]); return; }
    setLoadingRace(true);
    setRaceError("");
    try {
      const tableName = libraryCode === "jangmi"
        ? "jangmi_reading_race_books"
        : "reading_race_books";
      const { data, error } = await supabase
        .from(tableName)
        .select("book_no, title, author, publisher, library_status, callno, location")
        .eq("level", String(raceLevel))
        .order("book_no", { ascending: true })
        .range(0, 9999); // Supabase 기본 limit(1000) 우회
      if (error) throw error;
      setRaceBooksAll((data ?? []).map(mapBookRow));
    } catch (e) {
      console.error(e);
      setRaceBooksAll([]);
      setRaceError("리딩레이스 도서 목록을 불러오지 못했어요.");
    } finally {
      setLoadingRace(false);
    }
  }, [raceLevel, libraryCode]);

  useEffect(() => {
    if (activeTab === "reading_race") loadRaceBooks();
  }, [activeTab, loadRaceBooks]);

  // 체크 상태(대여) 로드
  const loadChecks = useCallback(async () => {
    if (!userId) { setCheckedSet(new Set()); return; }
    setLoadingChecks(true);
    try {
      const { data, error } = await supabase
        .from("recommended_book_checks")
        .select("book_no, checked")
        .eq("user_id", userId)
        .eq("grade_code", gradeCode)
        .eq("checked", true);
      if (error) throw error;
      const s = new Set();
      (data ?? []).forEach((row) => { if (row?.checked) s.add(Number(row.book_no)); });
      setCheckedSet(s);
    } catch (e) {
      console.error(e);
      setCheckedSet(new Set());
    } finally {
      setLoadingChecks(false);
    }
  }, [userId, gradeCode]);

  useEffect(() => {
    loadChecks();
  }, [loadChecks]);

  // 체크 토글(대여)
  const toggleCheck = useCallback(async (bookNo) => {
    const no = Number(bookNo);
    if (!userId) { alert("로그인 후 사용할 수 있어요."); navigate("/login"); return; }
    setCheckedSet((prev) => {
      const next = new Set(prev);
      if (next.has(no)) next.delete(no); else next.add(no);
      return next;
    });
    try {
      const nextChecked = !checkedSet.has(no);
      const payload = {
        user_id: userId,
        grade_code: gradeCode,
        book_no: no,
        checked: nextChecked,
        checked_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("recommended_book_checks")
        .upsert(payload, { onConflict: "user_id,grade_code,book_no" });
      if (error) throw error;
    } catch (e) {
      console.error(e);
      loadChecks();
      alert("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
  }, [userId, gradeCode, navigate, checkedSet, loadChecks]);

  // 추천도서 필터링
  const filteredBooks = useMemo(() => {
    let list = booksForGrade.filter((b) => {
      const owned = isOwned(b.status);
      const child = isChildRoom(b.location);
      if (statusFilter === "yes_child") return owned && child;
      if (statusFilter === "yes") return owned;
      if (statusFilter === "no") return !owned;
      return true;
    });
    if (norm(searchTerm)) {
      list = list.filter((b) =>
        includesIgnoreCase(b.title, searchTerm) ||
        includesIgnoreCase(b.author, searchTerm) ||
        includesIgnoreCase(b.publisher, searchTerm)
      );
    }
    if (onlyUnchecked) {
      list = list.filter((b) => !checkedSet.has(Number(b.no)));
    }
    return sortList(list, sortKey, sortDir);
  }, [booksForGrade, statusFilter, searchTerm, onlyUnchecked, checkedSet, sortKey, sortDir]);

  // 리딩레이스 필터링
  const filteredRaceBooks = useMemo(() => {
    let list = raceBooksAll.filter((b) => {
      const owned = isOwned(b.status);
      const child = isChildRoom(b.location);
      if (statusFilter === "yes_child") return owned && child;
      if (statusFilter === "yes") return owned;
      if (statusFilter === "no") return !owned;
      return true;
    });
    if (norm(searchTerm)) {
      list = list.filter((b) =>
        includesIgnoreCase(b.title, searchTerm) ||
        includesIgnoreCase(b.author, searchTerm) ||
        includesIgnoreCase(b.publisher, searchTerm)
      );
    }
    return sortList(list, sortKey, sortDir);
  }, [raceBooksAll, statusFilter, searchTerm, sortKey, sortDir]);

  const stats = useMemo(() => {
    const total = booksForGrade.length;
    const owned = booksForGrade.filter((b) => isOwned(b.status)).length;
    const notOwned = total - owned;
    const childRoom = booksForGrade.filter((b) => isChildRoom(b.location)).length;
    const checked = checkedSet.size;
    const shown = filteredBooks.length;
    return { total, owned, notOwned, childRoom, checked, shown };
  }, [booksForGrade, checkedSet, filteredBooks]);

  const raceStats = useMemo(() => {
    const total = raceBooksAll.length;
    const owned = raceBooksAll.filter((b) => isOwned(b.status)).length;
    const notOwned = total - owned;
    const childRoom = raceBooksAll.filter((b) => isChildRoom(b.location)).length;
    const shown = filteredRaceBooks.length;
    return { total, owned, notOwned, childRoom, shown };
  }, [raceBooksAll, filteredRaceBooks]);

  const onSort = useCallback((key) => {
    setSortKey((prevKey) => {
      if (prevKey !== key) { setSortDir("asc"); return key; }
      setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
      return prevKey;
    });
  }, []);

  const toggleCol = useCallback((key) => {
    setVisibleCols((v) => ({ ...v, [key]: !v[key] }));
  }, []);

  const isRaceTab = activeTab === "reading_race";
  const currentBooks = isRaceTab ? filteredRaceBooks : filteredBooks;
  const currentLoading = isRaceTab ? loadingRace : loadingBooks;
  const currentError = isRaceTab ? raceError : booksError;
  const currentAllBooks = isRaceTab ? raceBooksAll : booksForGrade;
  const currentStats = isRaceTab ? raceStats : stats;

  return (
    <div className="booksPage">
      <div className="booksHeaderWrap">
        <div className="hamburgerAbs">
          <HamburgerMenu />
        </div>

        {/* 탭 */}
        <div className="booksTabs">
          <button
            className={`booksTab${isRaceTab ? " booksTabActive" : ""}`}
            onClick={() => setActiveTab("reading_race")}
          >
            리딩레이스
          </button>
          <button
            className={`booksTab${!isRaceTab ? " booksTabActive" : ""}`}
            onClick={() => setActiveTab("recommend")}
          >
            독서수첩 추천도서
          </button>
        </div>

        <div className="header">
          {isRaceTab ? (
            <>
              <h1>🏃 리딩레이스 {raceLevel}단계</h1>
              <p>
                드림스쿨 리딩레이스 {raceLevel}단계 &nbsp;|&nbsp; 총 {currentStats.total}권
              </p>
            </>
          ) : (
            <>
              <h1>📚 카라 {gradeCode}학년 추천 도서목록</h1>
              <p>
                {libraryCode === "jangmi" ? "장미도서관" : "구성도서관"}(용인특례시) 소장 현황 &nbsp;|&nbsp; 총 {currentStats.total}권
              </p>
            </>
          )}
          <div className="legend"></div>
        </div>
      </div>

      <div className="controls">
        <input
          type="text"
          id="searchInput"
          placeholder="🔍 제목, 작가, 출판사 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        {!isRaceTab ? (
          <>
            <select
              id="gradeFilter"
              value={gradeCode}
              onChange={(e) => setGradeCode(Number(e.target.value))}
            >
              <option value={1}>1학년</option>
              <option value={2}>2학년</option>
              <option value={3}>3학년</option>
              <option value={4}>4학년</option>
              <option value={5}>5학년</option>
              <option value={6}>6학년</option>
            </select>

            <select
              id="libraryFilter"
              value={libraryCode}
              onChange={(e) => setLibraryCode(e.target.value)}
            >
              <option value="guseong">구성도서관</option>
              <option value="cheongdeok">청덕도서관</option>
              <option value="jangmi">장미도서관</option>
            </select>
          </>
        ) : (
          <>
            <select
              id="raceLevelFilter"
              value={raceLevel}
              onChange={(e) => setRaceLevel(Number(e.target.value))}
            >
              {[1, 2, 3].map((lv) => (
                <option key={lv} value={lv}>{lv}단계</option>
              ))}
            </select>

            <select
              id="libraryFilterRace"
              value={libraryCode}
              onChange={(e) => setLibraryCode(e.target.value)}
            >
              <option value="guseong">구성도서관</option>
              <option value="cheongdeok">청덕도서관</option>
              <option value="jangmi">장미도서관</option>
            </select>
          </>
        )}

        <select
          id="statusFilter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {!isRaceTab && (
          <label className="borrowFilter">
            <input
              type="checkbox"
              id="onlyNotBorrowed"
              checked={onlyUnchecked}
              onChange={(e) => setOnlyUnchecked(e.target.checked)}
            />
            <span>대여 안한것만</span>
          </label>
        )}

        <div className="stats" aria-live="polite">
          <span className="badge">표시: {currentStats.shown}권</span>
          <span className="badge green">소장: {currentStats.owned}권</span>
          <span className="badge red">미소장: {currentStats.notOwned}권</span>
          <span className="badge">어린이자료실: {currentStats.childRoom}권</span>
          {!isRaceTab && (
            <span className="badge blue">
              완료: {currentStats.checked}권{loadingChecks ? " (불러오는 중)" : ""}
            </span>
          )}
        </div>
      </div>

      <div className="statusNote">
        <span>✅ <b>소장</b> — 제목·출판사 일치</span>
        <span className="statusNoteSep">|</span>
        <span>⚠️ <b>소장(출판사불일치)</b> — 개정판이거나 다른 판본일 수 있음 (직접 확인 필요)</span>
        <span className="statusNoteSep">|</span>
        <span>❌ <b>미소장</b> — 미보유</span>
      </div>

      <div className="columnToggles" aria-label="열 표시 설정">
        <label>
          <input type="checkbox" checked={visibleCols.no} onChange={() => toggleCol("no")} />
          번호
        </label>
        <label>
          <input type="checkbox" checked={visibleCols.author} onChange={() => toggleCol("author")} />
          작가
        </label>
        <label>
          <input type="checkbox" checked={visibleCols.publisher} onChange={() => toggleCol("publisher")} />
          출판사
        </label>
        <label>
          <input type="checkbox" checked={visibleCols.status} onChange={() => toggleCol("status")} />
          {libraryCode === "jangmi" ? "장미도서관" : "구성도서관"}
        </label>
        {libraryCode !== "jangmi" && (
          <label>
            <input type="checkbox" checked={visibleCols.location} onChange={() => toggleCol("location")} />
            자료실
          </label>
        )}
      </div>

      <div className="tableWrap">
        {libraryCode === "cheongdeok" ? (
          <div className="emptyState">
            <h2>준비 중이에요</h2>
            <p>청덕도서관 데이터는 아직 준비 중이에요.</p>
          </div>
        ) : currentLoading ? (
          <div className="no-result">도서 목록 불러오는 중...</div>
        ) : currentError ? (
          <div className="no-result">{currentError}</div>
        ) : currentAllBooks.length === 0 ? (
          <div className="emptyState">
            <h2>아직 준비중이에요</h2>
            <p>
              {isRaceTab
                ? "리딩레이스 도서 데이터가 아직 없어요."
                : "선택한 학년의 추천도서 데이터가 아직 없어요."}
            </p>
          </div>
        ) : (
          <table id="booksTable">
            <thead>
              <tr>
                {!isRaceTab && <th className="borrowCol">대여</th>}

                {visibleCols.no && (
                  <th onClick={() => onSort("no")} role="button" tabIndex={0}>
                    번호 ↕
                  </th>
                )}

                <th onClick={() => onSort("title")} role="button" tabIndex={0}>
                  책제목 ↕
                </th>

                {visibleCols.author && (
                  <th onClick={() => onSort("author")} role="button" tabIndex={0}>
                    작가 ↕
                  </th>
                )}

                {visibleCols.publisher && (
                  <th onClick={() => onSort("publisher")} role="button" tabIndex={0}>
                    출판사 ↕
                  </th>
                )}

                {visibleCols.status && (
                  <th onClick={() => onSort("status")} role="button" tabIndex={0}>
                    {libraryCode === "jangmi" ? "장미도서관" : "구성도서관"}
                  </th>
                )}

                <th onClick={() => onSort("callno")} role="button" tabIndex={0}>
                  청구기호 ↕
                </th>

                {visibleCols.location && libraryCode !== "jangmi" && (
                  <th onClick={() => onSort("location")} role="button" tabIndex={0}>
                    자료실 위치
                  </th>
                )}
              </tr>
            </thead>

            <tbody id="tableBody">
              {currentBooks.map((b) => {
                const no = Number(b.no);
                const checked = !isRaceTab && checkedSet.has(no);

                return (
                  <tr key={`${activeTab}-${no}`} className={checked ? "rowChecked" : ""}>
                    {!isRaceTab && (
                      <td className="borrowCol">
                        <input
                          type="checkbox"
                          className="borrowChk"
                          checked={checked}
                          onChange={() => toggleCheck(no)}
                        />
                      </td>
                    )}

                    {visibleCols.no && <td>{b.no}</td>}
                    <td className="titleCell">{b.title}</td>
                    {visibleCols.author && <td>{b.author}</td>}
                    {visibleCols.publisher && <td>{b.publisher}</td>}

                    {visibleCols.status && (
                      <td className={isOwned(b.status) ? "owned" : "notOwned"}>
                        {b.status}
                      </td>
                    )}

                    <td>{b.callno}</td>
                    {visibleCols.location && libraryCode !== "jangmi" && <td>{b.location}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
