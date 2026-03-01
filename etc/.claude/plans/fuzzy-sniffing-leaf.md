# 장미도서관 추천도서 크롤링 + React 연동 플랜

## Context
장미도서관(roselib.winbook.kr)을 구성도서관과 동일하게 지원하기 위한 작업.
- `jangmi_recommended_books` 테이블은 이미 Supabase에 생성 완료
- React에서 `libraryCode` state는 있지만 실제 쿼리에 미사용 상태 → 연결 필요
- 구성도서관 스크립트(v6) 패턴을 최대한 재사용

---

## 작업 1: Python 크롤링 스크립트

**파일**: `etc/장미도서관_검색스크립트_v1.py`

### 흐름
1. Supabase `recommended_books` 에서 전체 책 목록 읽기 (500권, 모든 grade_code)
2. `requests.Session()` 으로 장미도서관 세션 초기화 (쿠키 획득)
3. 각 책마다:
   - `GET https://roselib.winbook.kr/front/bookSearch/simple/list?SC_KEYWORD_FIRST=<제목>`
   - 결과 테이블 파싱: `table tbody tr > td` (2=제목, 3=저자, 4=발행처)
   - `title_match` + `publisher_match` (v6에서 동일 로직 재사용)
   - 매칭된 행의 `jsDetail('bib_seq','item_seq')` onclick 파싱
   - `GET /front/bookSearch/detail/view?bk_bib_seq=<bib_seq>` 로 청구기호 추출
   - 상태: `✅ 소장` / `⚠️ 소장(출판사불일치)` / `❌ 미소장`
4. `jangmi_recommended_books` 에 배치 upsert (`on_conflict=book_no,grade_code`)

### 재사용 함수 (v6에서 복사)
- `_clean(s)` — 정규화
- `title_match(search, found)` — 제목 매칭
- `publisher_match(expected, found)` — 출판사 매칭

### 설정값
```python
SUPABASE_URL  = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY  = os.getenv("SUPABASE_KEY", "")
JANGMI_BASE   = "https://roselib.winbook.kr"
SEARCH_URL    = f"{JANGMI_BASE}/front/bookSearch/simple/list"
DETAIL_URL    = f"{JANGMI_BASE}/front/bookSearch/detail/view"
DELAY         = 1.0   # 검색 요청 간격
DETAIL_DELAY  = 0.5   # 상세 페이지 간격 (매칭된 책만)
SUPABASE_BATCH = 50
```

### 주의사항
- 상세 페이지 417 오류 대비: `try/except` 처리, 실패 시 청구기호 빈 문자열
- Session Referer 헤더 필수: `Referer: <JANGMI_BASE>/front/bookSearch/simple/formSearch`
- 업로드 명령: `PYTHONIOENCODING=utf-8 SUPABASE_URL=... SUPABASE_KEY=... python etc/장미도서관_검색스크립트_v1.py > etc/장미_실행결과.log 2>&1`

---

## 작업 2: React 쿼리 연결

**파일**: `src/pages/RecommendedBooks.jsx`

### 변경 내용

#### loadBooks 함수
```js
// 변경 전: 항상 recommended_books 쿼리
.from("recommended_books").eq("grade_code", gradeCode)

// 변경 후: libraryCode에 따라 테이블 선택
const tableName = libraryCode === "jangmi"
  ? "jangmi_recommended_books"
  : "recommended_books";
.from(tableName).eq("grade_code", gradeCode)
```
- `useCallback` 의존성에 `libraryCode` 추가: `[gradeCode, libraryCode]`

#### useEffect 수정
```js
// 변경 전
useEffect(() => {
  if (activeTab === "recommend") loadBooks();
}, [loadBooks, activeTab]);

// 변경 후: libraryCode 변경 시에도 재로드
useEffect(() => {
  if (activeTab === "recommend" && libraryCode !== "cheongdeok") loadBooks();
}, [loadBooks, activeTab, libraryCode]);
```

#### 주의: 청덕도서관 처리
- `cheongdeok` 는 테이블 없음 → 기존 "준비 중" UI가 이미 처리함 (tableWrap 조건)
- `loadBooks` 가 불필요하게 호출되지 않도록 useEffect에서 `cheongdeok` 제외

---

## 작업 순서

1. `etc/장미도서관_검색스크립트_v1.py` 작성
2. 스크립트 백그라운드 실행 (`> etc/장미_실행결과.log 2>&1`)
3. `RecommendedBooks.jsx` - `loadBooks` + `useEffect` 수정
4. 앱에서 장미도서관 탭 전환 후 데이터 확인

---

## 검증

- `etc/장미_실행결과.log` 에서 ✅/⚠️/❌ 통계 확인
- Supabase `jangmi_recommended_books` 테이블 row 수 확인
- 앱에서 추천도서 탭 → 장미도서관 선택 → 데이터 표시 확인
- 소장/어린이자료실 필터, 검색어 필터 정상 동작 확인
