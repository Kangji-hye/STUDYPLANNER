"""
ISBN 수집 스크립트 — 도서관 정보나루 API
=====================================================
대상 테이블:
  - reading_race_books        (2124권)
  - jangmi_reading_race_books (1405권)
  - recommended_books         ( 500권)
  - jangmi_recommended_books  ( 500권)

동작:
  1. Supabase에서 isbn이 NULL인 책 목록 가져오기
  2. 도서관 정보나루 API로 제목+저자 검색 → isbn13 추출
  3. Supabase isbn 컬럼 업데이트
  4. 리딩레이스 테이블은 쪽수(pages)도 API 값으로 업데이트

사용법:
  1. pip install requests python-dotenv
  2. .env 파일에 아래 항목 입력 (또는 스크립트 상단 직접 입력):
       SUPABASE_URL=https://xxxx.supabase.co
       SUPABASE_KEY=eyJhbGci...     ← service_role key 권장 (anon key도 가능)
       LIB_APIKEY=...               ← 도서관 정보나루 인증키
  3. python ISBN_수집_스크립트.py

진행 상황은 isbn_progress.json 파일에 저장되어 중단 후 재실행해도 이어서 진행.
"""

import requests
import time
import re
import sys
import json
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ── 설정 ───────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
LIB_APIKEY   = os.getenv("LIB_APIKEY", "")

# 없으면 직접 입력
# SUPABASE_URL = "https://xxxx.supabase.co"
# SUPABASE_KEY = "eyJhbGci..."
# LIB_APIKEY   = "..."

API_DELAY    = 1.2   # 도서관 API 요청 간격(초) — 너무 빠르면 차단될 수 있음
BATCH_SIZE   = 200   # Supabase에서 한 번에 가져올 행 수
PROGRESS_FILE = "isbn_progress.json"

# 쪽수 업데이트 대상 테이블 (이미 값 있어도 API 값이 다르면 덮어씀)
UPDATE_PAGES_TABLES = {"reading_race_books", "jangmi_reading_race_books"}

LIB_API_URL = "https://www.data4library.kr/api/srchBooks"
# ───────────────────────────────────────────────────────────────────


# ── 텍스트 정규화 ──────────────────────────────────────────────────
def _clean(s: str) -> str:
    """특수문자·공백 제거 후 소문자"""
    return re.sub(r'[\s\(\)\[\]\:\-\,\.·「」『』""\'\'《》〈〉!?~]', '', str(s).lower())


def title_match(a: str, b: str) -> bool:
    ca, cb = _clean(a), _clean(b)
    if not ca or not cb:
        return False
    if ca == cb:
        return True
    if ca in cb or cb in ca:
        return True
    min_len = min(len(ca), len(cb))
    return min_len >= 5 and ca[:min_len] == cb[:min_len]


def author_match(a: str, b: str) -> bool:
    """저자 성(姓)만 비교 — '손원평 지음' vs '손원평' 처리"""
    ca = _clean(a.split()[0] if a.strip() else a)
    cb = _clean(b.split()[0] if b.strip() else b)
    if not ca or not cb:
        return False
    return ca in cb or cb in ca
# ───────────────────────────────────────────────────────────────────


# ── 도서관 정보나루 API 호출 ─────────────────────────────────────────
def lookup_isbn(title: str, author: str = "") -> dict | None:
    """
    반환값: {"isbn": "9788936434120", "pages": 264} 또는 None
    """
    try:
        resp = requests.get(
            LIB_API_URL,
            params={"authKey": LIB_APIKEY, "title": title.strip(), "format": "json", "pageSize": 10},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  ⚠️  API 오류: {e}")
        return None

    docs = data.get("response", {}).get("docs", [])
    if not docs:
        return None

    # 제목 일치 우보 → 저자도 일치하면 최우선
    title_hits = []
    for item in docs:
        doc = item.get("doc", {})
        found_title  = doc.get("bookname", "")
        found_author = doc.get("authors", "")
        isbn13       = doc.get("isbn13", "").strip()
        vol_raw      = doc.get("vol", "")

        if not isbn13 or not title_match(title, found_title):
            continue

        pages = None
        if vol_raw:
            m = re.search(r'\d+', str(vol_raw))
            if m:
                pages = int(m.group())

        score = 2 if author and author_match(author, found_author) else 1
        title_hits.append({"isbn": isbn13, "pages": pages, "score": score})

    if not title_hits:
        return None

    # score 높은 것 우선, 같으면 첫 번째
    title_hits.sort(key=lambda x: -x["score"])
    best = title_hits[0]
    return {"isbn": best["isbn"], "pages": best["pages"]}
# ───────────────────────────────────────────────────────────────────


# ── Supabase 헬퍼 ──────────────────────────────────────────────────
def sb_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def fetch_books(table: str, offset: int) -> list:
    """isbn이 NULL인 행을 BATCH_SIZE만큼 가져오기"""
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}"
    params = {
        "select": "id,title,author,pages" if table in UPDATE_PAGES_TABLES else "id,title,author",
        "isbn": "is.null",
        "limit": BATCH_SIZE,
        "offset": offset,
        "order": "id.asc",
    }
    resp = requests.get(url, headers=sb_headers(), params=params, timeout=20)
    resp.raise_for_status()
    return resp.json()


def update_book(table: str, row_id: int, isbn: str, pages: int | None, update_pages: bool):
    """단건 업데이트"""
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}?id=eq.{row_id}"
    body = {"isbn": isbn}
    if update_pages and pages is not None:
        body["pages"] = pages
    resp = requests.patch(url, headers=sb_headers(), data=json.dumps(body), timeout=15)
    return resp.status_code in (200, 204)
# ───────────────────────────────────────────────────────────────────


# ── 진행 상황 저장/로드 ────────────────────────────────────────────
def load_progress() -> dict:
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_progress(progress: dict):
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)
# ───────────────────────────────────────────────────────────────────


# ── 테이블별 처리 ──────────────────────────────────────────────────
def process_table(table: str, progress: dict):
    update_pages = table in UPDATE_PAGES_TABLES
    done = progress.get(table, {}).get("done", 0)
    found_total = progress.get(table, {}).get("found", 0)

    print(f"\n{'='*60}")
    print(f"  📋 {table}  (이미 처리: {done}건)")
    print(f"{'='*60}")

    offset = 0  # isbn=NULL 기준이라 offset은 항상 0 (처리된 건 이미 isbn 있음)
    session_done = 0
    session_found = 0
    no_more = False

    while not no_more:
        try:
            books = fetch_books(table, offset)
        except Exception as e:
            print(f"  ❌ Supabase 조회 오류: {e}")
            break

        if not books:
            no_more = True
            break

        for book in books:
            row_id = book["id"]
            title  = book.get("title", "").strip()
            author = book.get("author", "").strip()

            print(f"  [{done + session_done + 1:4d}] {title[:30]:<30}", end="  ")
            sys.stdout.flush()

            if not title:
                print("— 제목 없음, 건너뜀")
                session_done += 1
                continue

            result = lookup_isbn(title, author)

            if result and result["isbn"]:
                isbn   = result["isbn"]
                pages  = result["pages"]
                ok = update_book(table, row_id, isbn, pages, update_pages)
                pages_str = f"  {pages}p" if pages and update_pages else ""
                print(f"✅ {isbn}{pages_str}" if ok else f"⚠️  DB저장실패 ({isbn})")
                session_found += 1
            else:
                print("❌ ISBN 없음")

            session_done += 1
            time.sleep(API_DELAY)

        # 이번 배치에서 isbn 없는 게 BATCH_SIZE 미만이면 다음 페이지 없음
        if len(books) < BATCH_SIZE:
            no_more = True

    total_done  = done + session_done
    total_found = found_total + session_found

    progress[table] = {"done": total_done, "found": total_found}
    save_progress(progress)

    print(f"\n  → {table}: {session_done}건 처리 / ISBN 수집 {session_found}건")
    return session_done, session_found
# ───────────────────────────────────────────────────────────────────


# ── 메인 ───────────────────────────────────────────────────────────
def main():
    # 사전 검증
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ SUPABASE_URL / SUPABASE_KEY 를 설정해주세요.")
        print("   .env 파일 또는 스크립트 상단에 직접 입력하세요.")
        sys.exit(1)
    if not LIB_APIKEY:
        print("❌ LIB_APIKEY (도서관 정보나루 인증키)를 설정해주세요.")
        sys.exit(1)

    print("=" * 60)
    print("  📚 ISBN 수집 스크립트 — 도서관 정보나루 API")
    print("=" * 60)
    print(f"  대상: reading_race_books, jangmi_reading_race_books,")
    print(f"         recommended_books, jangmi_recommended_books")
    print(f"  요청 간격: {API_DELAY}초  |  배치 크기: {BATCH_SIZE}")
    print(f"  쪽수 업데이트: reading_race 계열만")
    print()

    progress = load_progress()

    tables = [
        "reading_race_books",
        "jangmi_reading_race_books",
        "recommended_books",
        "jangmi_recommended_books",
    ]

    grand_done = grand_found = 0
    for table in tables:
        d, f = process_table(table, progress)
        grand_done  += d
        grand_found += f

    print()
    print("=" * 60)
    print(f"  🎉 전체 완료: {grand_done}건 처리 / ISBN 수집 {grand_found}건")
    print(f"  진행 파일: {PROGRESS_FILE}")
    print("=" * 60)


if __name__ == "__main__":
    main()
