/* src/pages/RecommendedBooks.jsx */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import HamburgerMenu from "../components/common/HamburgerMenu";
import "./RecommendedBooks.css";

// 학년 옵션 (프로젝트에서 grade_code를 다르게 쓰고 있다면 여기만 맞춰주면 됩니다)
const GRADE_OPTIONS = [
  { label: "1학년", value: 1 },
  { label: "2학년", value: 2 },
  { label: "3학년", value: 3 },
  { label: "4학년", value: 4 },
  { label: "5학년", value: 5 },
  { label: "6학년", value: 6 },
];

// HTML에서 쓰던 상태 필터를 그대로 가져옵니다.
const STATUS_FILTERS = [
  { label: "소장도서 + 어린이자료실", value: "yes_child" },
  { label: "소장도서만", value: "yes" },
  { label: "미소장", value: "no" },
  { label: "보존서고", value: "preserve" },
];

export default function RecommendedBooks() {
  const navigate = useNavigate();

  const [gradeCode, setGradeCode] = useState(2);

  const [statusFilter, setStatusFilter] = useState("yes_child");
  const [onlyUnchecked, setOnlyUnchecked] = useState(false);
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingMap, setSavingMap] = useState(() => new Map()); // book_no별 저장중 표시
  const [books, setBooks] = useState([]);
  const [checkedSet, setCheckedSet] = useState(() => new Set());

  const [errorMsg, setErrorMsg] = useState("");

  // 입력 디바운스(모바일 버벅임 방지)
  const searchTimerRef = useRef(null);
  const [searchDebounced, setSearchDebounced] = useState("");

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchDebounced(search.trim().toLowerCase());
    }, 200);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  // 1) 현재 로그인 사용자 확인
  async function getUserId() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!data?.user?.id) throw new Error("로그인이 필요합니다.");
    return data.user.id;
  }

  // 2) 추천도서 목록 불러오기 (학년별)
  async function loadBooks(grade) {
    const { data, error } = await supabase
      .from("recommended_books")
      .select("grade_code, book_no, title, author, publisher, status_class, status_text, callno, location, library")
      .eq("grade_code", grade)
      .order("book_no", { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  // 3) 내 체크 상태 불러오기 (학년별)
  async function loadChecks(userId, grade) {
    const { data, error } = await supabase
      .from("recommended_book_checks")
      .select("book_no, is_checked")
      .eq("user_id", userId)
      .eq("grade_code", grade);

    if (error) throw error;

    const set = new Set();
    (data ?? []).forEach((row) => {
      if (row.is_checked) set.add(row.book_no);
    });
    return set;
  }

  // 4) 화면 진입/학년 변경 시 로딩
  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setErrorMsg("");

      try {
        const userId = await getUserId();

        const [b, checks] = await Promise.all([
          loadBooks(gradeCode),
          loadChecks(userId, gradeCode),
        ]);

        if (!alive) return;

        setBooks(b);
        setCheckedSet(checks);
      } catch (e) {
        if (!alive) return;
        setErrorMsg(e?.message || "불러오기 실패");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [gradeCode]);

  // 5) 체크 저장 (업서트)
  async function toggleCheck(bookNo) {
    setErrorMsg("");

    // 화면은 먼저 바꿔서 빠르게 반응하게 합니다.
    setCheckedSet((prev) => {
      const next = new Set(prev);
      if (next.has(bookNo)) next.delete(bookNo);
      else next.add(bookNo);
      return next;
    });

    setSavingMap((prev) => {
      const next = new Map(prev);
      next.set(bookNo, true);
      return next;
    });

    try {
      const userId = await getUserId();

      // 지금 최신 상태(토글 후)를 계산
      const willBeChecked = !checkedSet.has(bookNo);

      const payload = {
        user_id: userId,
        grade_code: gradeCode,
        book_no: bookNo,
        is_checked: willBeChecked,
        checked_at: willBeChecked ? new Date().toISOString() : null,
      };

      const { error } = await supabase
        .from("recommended_book_checks")
        .upsert(payload, { onConflict: "user_id,grade_code,book_no" });

      if (error) throw error;
    } catch (e) {
      // 실패하면 원래대로 되돌립니다.
      setCheckedSet((prev) => {
        const next = new Set(prev);
        // 방금 바꾼 걸 다시 되돌림
        if (next.has(bookNo)) next.delete(bookNo);
        else next.add(bookNo);
        return next;
      });
      setErrorMsg(e?.message || "저장 실패");
    } finally {
      setSavingMap((prev) => {
        const next = new Map(prev);
        next.delete(bookNo);
        return next;
      });
    }
  }

  // 6) HTML의 필터 로직을 그대로 React로 옮긴 것
  const filteredBooks = useMemo(() => {
    return (books ?? []).filter((b) => {
      const text = `${b.title ?? ""} ${b.author ?? ""} ${b.publisher ?? ""}`.toLowerCase();

      // (1) 검색
      const matchText = !searchDebounced || text.includes(searchDebounced);

      // (2) 상태 필터
      const locationText = (b.location ?? "").trim();
      let matchStatus = true;

      if (statusFilter === "yes") {
        matchStatus = b.status_class === "yes";
      } else if (statusFilter === "no") {
        matchStatus = b.status_class === "no";
      } else if (statusFilter === "yes_child") {
        matchStatus = b.status_class === "yes" && locationText.includes("어린이자료실");
      } else if (statusFilter === "preserve") {
        matchStatus = locationText.includes("보존서고");
      }

      // (3) 대여 안 한 것만(체크 안 된 것만)
      const isChecked = checkedSet.has(b.book_no);
      const matchBorrow = !onlyUnchecked || !isChecked;

      return matchText && matchStatus && matchBorrow;
    });
  }, [books, checkedSet, onlyUnchecked, searchDebounced, statusFilter]);

  const totalCount = books.length;
  const checkedCount = useMemo(() => {
    // 현재 학년의 책 중 체크된 것만 카운트
    const allNos = new Set(books.map((b) => b.book_no));
    let n = 0;
    checkedSet.forEach((no) => {
      if (allNos.has(no)) n++;
    });
    return n;
  }, [books, checkedSet]);

  const visibleCount = filteredBooks.length;

  const gradeLabel = useMemo(() => {
    const found = GRADE_OPTIONS.find((g) => g.value === gradeCode);
    return found ? found.label : `${gradeCode}학년`;
  }, [gradeCode]);

  return (
    <div className="booksPage">
      <header className="booksHeader">
        <div className="booksHeaderTop">
          <h1>카라 {gradeLabel} 추천 도서목록</h1>
          <div className="booksHeaderRight">
            <HamburgerMenu />
          </div>
        </div>

        <p className="booksHeaderSub">
          구성도서관 소장 현황 기반 · 체크는 로그인한 아이(계정)별로 저장됩니다.
        </p>
      </header>

      <div className="booksControls">
        <div className="controlsRow">
          <label className="control">
            <span className="controlLabel">학년</span>
            <select value={gradeCode} onChange={(e) => setGradeCode(Number(e.target.value))}>
              {GRADE_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>

          <label className="control grow">
            <span className="controlLabel">검색</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="제목/작가/출판사 검색"
            />
          </label>

          <label className="control">
            <span className="controlLabel">상태</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_FILTERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="control checkboxControl">
            <input
              type="checkbox"
              checked={onlyUnchecked}
              onChange={(e) => setOnlyUnchecked(e.target.checked)}
            />
            <span>대여 안 한 것만</span>
          </label>
        </div>

        <div className="statsRow">
          <span className="pill">총 {totalCount}권</span>
          <span className="pill">표시 {visibleCount}권</span>
          <span className="pill">완료 {checkedCount}권</span>
          <span className="pill">남은 {Math.max(totalCount - checkedCount, 0)}권</span>

          <button className="ghostBtn" onClick={() => navigate(-1)}>
            뒤로
          </button>
        </div>

        {errorMsg ? <div className="errorBox">{errorMsg}</div> : null}
      </div>

      <main className="booksMain">
        {loading ? (
          <div className="loadingBox">불러오는 중...</div>
        ) : (
          <>
            {filteredBooks.length === 0 ? (
              <div className="noResult">조건에 맞는 도서가 없습니다.</div>
            ) : (
              <div className="tableWrap">
                <table className="booksTable">
                  <thead>
                    <tr>
                      <th className="colChk">대여</th>
                      <th className="colNo">번호</th>
                      <th>제목</th>
                      <th className="colAuthor">작가</th>
                      <th className="colPub">출판사</th>
                      <th className="colStatus">소장여부</th>
                      <th className="colCallno">청구기호</th>
                      <th className="colLoc">위치</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredBooks.map((b) => {
                      const checked = checkedSet.has(b.book_no);
                      const saving = savingMap.get(b.book_no) === true;

                      return (
                        <tr key={b.book_no} className={checked ? "rowChecked" : ""}>
                          <td className="colChk">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={saving}
                              onChange={() => toggleCheck(b.book_no)}
                            />
                          </td>

                          <td className="colNo">{b.book_no}</td>
                          <td className="colTitle">{b.title}</td>
                          <td className="colAuthor">{b.author}</td>
                          <td className="colPub">{b.publisher}</td>

                          <td className="colStatus">
                            <span className={b.status_class === "yes" ? "status yes" : "status no"}>
                              {b.status_text}
                            </span>
                          </td>

                          <td className="colCallno">{b.callno || "-"}</td>
                          <td className="colLoc">{b.location || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
