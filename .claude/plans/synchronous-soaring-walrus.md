# 플랜: 2단계 리딩레이스 ISBN 수집 스크립트

## Context

기존 `ISBN_수집_스크립트.py`는 도서관정보나루 API를 사용했으나 500권 처리 중 ISBN 수집 0건으로 실패함.
반면 구성도서관 모바일 검색 스크립트(v5/v6)는 제목+출판사 매칭으로 책 정보 수집에 성공함.
이미 DB에 title, author, publisher가 채워진 `reading_race_books` (level='2', 719권)를 대상으로
같은 구성도서관 검색 방식으로 ISBN을 추출·저장하는 스크립트를 신규 작성한다.

## 대상 데이터

- 테이블: `reading_race_books`
- 조건: `level = '2'` AND `isbn IS NULL` → 현재 719권
- 업데이트 컬럼: `isbn`
- PK: `id` (bigint)

## 신규 파일

`etc/리딩레이스_2단계_ISBN_수집.py`

## 동작 흐름

```
Supabase 조회 (level='2', isbn IS NULL)
       ↓
  [각 책마다]
  구성도서관 모바일 검색 (제목으로 검색)
       ↓
  title_match + publisher_match로 최적 결과 선택
       ↓
  매칭된 책의 상세 페이지 URL 추출 → 상세 페이지 fetch
       ↓
  ISBN 파싱 (정규식: \d{13} 또는 ISBN 레이블 근처)
       ↓
  Supabase PATCH: reading_race_books.isbn 업데이트
       ↓
  isbn_2단계_progress.json에 진행 저장
```

## 재사용할 기존 로직 (구성도서관_검색스크립트_v6.py에서)

- `_clean(s)` — 특수문자/공백 제거 후 소문자
- `title_match(a, b)` — 포함 관계 또는 앞 5글자 일치
- `publisher_match(a, b)` — 3글자 이상 포함 관계

## 구성도서관 URL

- 검색 목록: `https://lib.yongin.go.kr/mobile/guseong/search/plusSearchResultList.do`
  - params: `searchType=SIMPLE`, `searchKey=TITLE`, `searchKeyword=제목`, `searchRecordCount=20`
- 상세 페이지: href에서 추출한 controlNo로 접근
  - 예: `https://lib.yongin.go.kr/mobile/guseong/search/plusDetailView.do?controlNo=XXX`
  - 상세 페이지 HTML에서 ISBN 13자리 숫자 파싱

## ISBN 파싱 전략

1. `<dd>` 또는 텍스트에서 `ISBN` 레이블 다음 13자리 숫자 추출
2. 정규식: `978\d{10}` 또는 `979\d{10}` (ISBN-13 형식)
3. 매칭 실패 시 `None` 저장 (건너뜀)

## 설정

```python
SEARCH_URL = "https://lib.yongin.go.kr/mobile/guseong/search/plusSearchResultList.do"
DETAIL_BASE = "https://lib.yongin.go.kr"
API_DELAY = 1.5        # 초 (구성도서관 과부하 방지)
BATCH_SIZE = 200       # Supabase에서 한 번에 가져올 행 수
SAVE_INTERVAL = 50     # N권마다 진행 저장
PROGRESS_FILE = "isbn_2단계_progress.json"
```

## 환경 변수 (.env)

```
SUPABASE_URL=...
SUPABASE_KEY=...   # service_role 또는 anon key
```

(VITE_ 접두사 폴백 지원 — 기존 .env 그대로 사용 가능)

## 진행 파일 구조

```json
{
  "done": 150,
  "found": 102,
  "skipped": 48
}
```

`isbn IS NULL` 기준으로 조회하므로 이미 채워진 건 자동 제외됨.

## 검증 방법

1. 스크립트 실행 후 터미널 출력에서 ✅/❌ 비율 확인
2. Supabase 콘솔에서:
   ```sql
   SELECT COUNT(*) FROM reading_race_books WHERE level='2' AND isbn IS NOT NULL;
   ```
3. 샘플 확인:
   ```sql
   SELECT title, publisher, isbn FROM reading_race_books WHERE level='2' AND isbn IS NOT NULL LIMIT 5;
   ```
