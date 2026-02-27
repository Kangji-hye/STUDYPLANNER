// src/pages/RecommendedBooks.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import HamburgerMenu from "../components/common/HamburgerMenu";
import "./RecommendedBooks.css";

const DEFAULT_GRADE_CODE = 2;

// HTML의 statusFilter 옵션 값을 그대로 유지합니다.
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
  // "✅ 소장" / "❌ 미소장" 형태를 사용한다고 가정
  return norm(statusText).includes("✅");
}

function isChildRoom(locationText) {
  return norm(locationText).includes("어린이자료실");
}

function getColsStorageKey(userId) {
  // 사용자별로 저장 (같은 브라우저에서 유지)
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

export default function RecommendedBooks() {
  const navigate = useNavigate();

  const [userId, setUserId] = useState(null);

  const [gradeCode, setGradeCode] = useState(DEFAULT_GRADE_CODE);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("yes_child");
  const [onlyUnchecked, setOnlyUnchecked] = useState(false);

  // 책 목록(Supabase에서 로드)
  const [booksForGrade, setBooksForGrade] = useState([]);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [booksError, setBooksError] = useState("");

  // "대여" 체크(행 체크)
  const [checkedSet, setCheckedSet] = useState(() => new Set());
  const [loadingChecks, setLoadingChecks] = useState(false);

  // 열 표시 체크(번호/작가/출판사/구성도서관/자료실 위치)
  const [visibleCols, setVisibleCols] = useState({
    no: true,
    author: true,
    publisher: true,
    status: true,
    location: true,
  });

  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc"); // "asc" | "desc"

  // 로그인 사용자 확인
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!alive) return;

      if (error) {
        console.error(error);
        setUserId(null);
        return;
      }

      setUserId(data?.user?.id ?? null);
    })();

    return () => {
      alive = false;
    };
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

  // Supabase에서 학년별 책 목록 불러오기
  const loadBooks = useCallback(async () => {
    setLoadingBooks(true);
    setBooksError("");

    try {
      const { data, error } = await supabase
        .from("recommended_books")
        .select("book_no, title, author, publisher, library_status, callno, location")
        .eq("grade_code", gradeCode)
        .order("book_no", { ascending: true });

      if (error) throw error;

      const mapped = (data ?? []).map((row) => ({
        no: Number(row.book_no),
        title: row.title ?? "",
        author: row.author ?? "",
        publisher: row.publisher ?? "",
        status: row.library_status ?? "",
        callno: row.callno ?? "",
        location: row.location ?? "",
      }));

      setBooksForGrade(mapped);
    } catch (e) {
      console.error(e);
      setBooksForGrade([]);
      setBooksError("도서 목록을 불러오지 못했어요. (Supabase 테이블/정책/컬럼명을 확인해 주세요)");
    } finally {
      setLoadingBooks(false);
    }
  }, [gradeCode]);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  // Supabase에서 체크 상태(대여 체크) 불러오기
  const loadChecks = useCallback(async () => {
    if (!userId) {
      setCheckedSet(new Set());
      return;
    }

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
      (data ?? []).forEach((row) => {
        if (row?.checked) s.add(Number(row.book_no));
      });

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

  // 체크 토글 저장(대여 체크)
  const toggleCheck = useCallback(
    async (bookNo) => {
      const no = Number(bookNo);

      if (!userId) {
        alert("로그인 후 사용할 수 있어요.");
        navigate("/login");
        return;
      }

      // 화면 먼저 반영
      setCheckedSet((prev) => {
        const next = new Set(prev);
        if (next.has(no)) next.delete(no);
        else next.add(no);
        return next;
      });

      try {
        // setState는 비동기라서, 여기서는 "현재 checkedSet" 기준으로 next를 계산
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
        // 실패 시 서버 상태 다시 로드해서 화면 복구
        loadChecks();
        alert("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    },
    [userId, gradeCode, navigate, checkedSet, loadChecks]
  );

  const filteredBooks = useMemo(() => {
    let list = booksForGrade;

    list = list.filter((b) => {
      const owned = isOwned(b.status);
      const child = isChildRoom(b.location);

      if (statusFilter === "yes_child") return owned && child;
      if (statusFilter === "yes") return owned;
      if (statusFilter === "no") return !owned;
      return true;
    });

    if (norm(searchTerm)) {
      list = list.filter((b) => {
        return (
          includesIgnoreCase(b.title, searchTerm) ||
          includesIgnoreCase(b.author, searchTerm) ||
          includesIgnoreCase(b.publisher, searchTerm)
        );
      });
    }

    if (onlyUnchecked) {
      list = list.filter((b) => !checkedSet.has(Number(b.no)));
    }

    if (sortKey) {
      const dir = sortDir === "desc" ? -1 : 1;
      const key = sortKey;

      list = [...list].sort((a, b) => {
        const av = a[key];
        const bv = b[key];

        if (key === "no") return (Number(av) - Number(bv)) * dir;

        const as = norm(av);
        const bs = norm(bv);

        if (key === "status") {
          const ao = isOwned(as) ? 0 : 1;
          const bo = isOwned(bs) ? 0 : 1;
          if (ao !== bo) return (ao - bo) * dir;
          return as.localeCompare(bs, "ko") * dir;
        }

        return as.localeCompare(bs, "ko") * dir;
      });
    }

    return list;
  }, [booksForGrade, statusFilter, searchTerm, onlyUnchecked, checkedSet, sortKey, sortDir]);

  const stats = useMemo(() => {
    const total = booksForGrade.length;
    const owned = booksForGrade.filter((b) => isOwned(b.status)).length;
    const notOwned = total - owned;
    const childRoom = booksForGrade.filter((b) => isChildRoom(b.location)).length;
    const checked = checkedSet.size;

    const shown = filteredBooks.length;
    return { total, owned, notOwned, childRoom, checked, shown };
  }, [booksForGrade, checkedSet, filteredBooks]);

  const onSort = useCallback((key) => {
    setSortKey((prevKey) => {
      if (prevKey !== key) {
        setSortDir("asc");
        return key;
      }
      setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
      return prevKey;
    });
  }, []);

  const toggleCol = useCallback((key) => {
    setVisibleCols((v) => ({ ...v, [key]: !v[key] }));
  }, []);

  return (
    <div className="booksPage">
      <div className="booksHeaderWrap">
        <div className="hamburgerAbs">
          <HamburgerMenu />
        </div>

        <div className="header">
          <h1>📚 카라 {gradeCode}학년 추천 도서목록</h1>
          <p>
            구성도서관(용인특례시) 소장 현황 &nbsp;|&nbsp; 총 {stats.total}권
          </p>
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

        <label className="borrowFilter">
          <input
            type="checkbox"
            id="onlyNotBorrowed"
            checked={onlyUnchecked}
            onChange={(e) => setOnlyUnchecked(e.target.checked)}
          />
          <span>대여 안한것만</span>
        </label>

        <div className="stats" aria-live="polite">
          <span className="badge">표시: {stats.shown}권</span>
          <span className="badge green">소장: {stats.owned}권</span>
          <span className="badge red">미소장: {stats.notOwned}권</span>
          <span className="badge">어린이자료실: {stats.childRoom}권</span>
          <span className="badge blue">
            완료: {stats.checked}권{loadingChecks ? " (불러오는 중)" : ""}
          </span>
        </div>
      </div>

      {/* columnToggles만 sticky로 만들고 싶다면, CSS에서 .controls sticky 제거하고
          .columnToggles에 position:sticky 적용하면 됩니다(현재 구조는 바깥으로 이미 분리되어 있어요). */}
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
          구성도서관
        </label>
        <label>
          <input type="checkbox" checked={visibleCols.location} onChange={() => toggleCol("location")} />
          자료실
        </label>
      </div>

      <div className="tableWrap">
        {loadingBooks ? (
          <div className="no-result">도서 목록 불러오는 중...</div>
        ) : booksError ? (
          <div className="no-result">{booksError}</div>
        ) : booksForGrade.length === 0 ? (
          <div className="emptyState">
            <h2>아직 준비중이에요</h2>
            <p>선택한 학년의 추천도서 데이터가 아직 없어요.</p>
          </div>
        ) : (
          <table id="booksTable">
            <thead>
              <tr>
                {/* 대여 열 폭: inline style은 CSS보다 강해서 공간이 커집니다.
                   여기서는 inline style 제거하고 CSS에서 th/td 폭을 잡는 게 좋아요. */}
                <th className="borrowCol">대여</th>

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
                    구성도서관
                  </th>
                )}

                <th onClick={() => onSort("callno")} role="button" tabIndex={0}>
                  청구기호 ↕
                </th>

                {visibleCols.location && (
                  <th onClick={() => onSort("location")} role="button" tabIndex={0}>
                    자료실 위치
                  </th>
                )}
              </tr>
            </thead>

            <tbody id="tableBody">
              {filteredBooks.map((b) => {
                const no = Number(b.no);
                const checked = checkedSet.has(no);

                return (
                  <tr key={no} className={checked ? "rowChecked" : ""}>
                    <td className="borrowCol">
                      <input
                        type="checkbox"
                        className="borrowChk"
                        checked={checked}
                        onChange={() => toggleCheck(no)}
                      />
                    </td>

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
                    {visibleCols.location && <td>{b.location}</td>}
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