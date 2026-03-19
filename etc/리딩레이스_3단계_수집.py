"""
리딩레이스 3단계 도서 목록 수집 스크립트
=====================================================
대상: https://rd.dreamschool.or.kr/reading/certmain?field_id=&level=3&sc=regdate
저장: reading_race_books (level='3')

동작:
  1. 드림스쿨 홈페이지 3단계 목록 크롤링 (전체 페이지)
  2. 각 책의 제목/저자/출판사/쪽수/book_id 추출
  3. Supabase reading_race_books에 upsert (book_id 기준 중복 방지)
  4. 진행 상황 출력

사용법:
  1. pip install requests beautifulsoup4 python-dotenv
  2. .env에 아래 항목:
       SUPABASE_URL=https://xxxx.supabase.co
       SUPABASE_KEY=eyJhbGci...
  3. python -u 리딩레이스_3단계_수집.py
"""

import requests
from bs4 import BeautifulSoup
import time
import re
import sys
import json
import os

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

try:
    from dotenv import load_dotenv
    from pathlib import Path
    load_dotenv(Path(__file__).parent / ".env")
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

# ── 설정 ────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY", "")

BASE_URL     = "https://rd.dreamschool.or.kr/reading/certmain"
LEVEL        = "3"
PAGE_DELAY   = 1.0   # 페이지 요청 간격 (초)
# ────────────────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": "https://rd.dreamschool.or.kr/",
}

session = requests.Session()
session.headers.update(HEADERS)


# ── 페이지 파싱 ──────────────────────────────────────────────────────
def parse_page(page_num: int) -> tuple[list[dict], int]:
    """
    한 페이지 크롤링 → (책 목록, 전체 페이지 수) 반환
    책 목록 각 항목: {book_id, title, author, publisher, pages}
    """
    try:
        resp = session.get(
            BASE_URL,
            params={
                "field_id": "",
                "level":    LEVEL,
                "sc":       "regdate",
                "p":        page_num,
            },
            timeout=20,
        )
        resp.raise_for_status()
        resp.encoding = "utf-8"
    except Exception as e:
        print(f"⚠️ 페이지 {page_num} 요청 오류: {e}")
        return [], 0

    soup = BeautifulSoup(resp.text, "html.parser")

    # 전체 페이지 수 파싱 ("총 646개, 쪽번호 1/27" 형식)
    total_pages = 1
    paging_text = soup.get_text()
    m = re.search(r'쪽번호\s*\d+\s*/\s*(\d+)', paging_text)
    if m:
        total_pages = int(m.group(1))

    books = []

    # 각 책 항목 파싱
    # 구조: 제목링크 | 영역 | 저자 | 출판사 | 단계 | 쪽수 | 인증자수
    for a_tag in soup.select("a[href*='bookdetail']"):
        href = a_tag.get("href", "")

        # book_id 추출
        m_id = re.search(r'book_id=(\d+)', href)
        if not m_id:
            continue
        book_id = int(m_id.group(1))

        # 텍스트 전체 ("|"로 구분된 정보)
        # 보통 부모 li 또는 td 안에 파이프 구분 텍스트 있음
        parent = a_tag.find_parent("li") or a_tag.find_parent("td") or a_tag.find_parent("tr")
        if not parent:
            raw_text = a_tag.get_text(strip=True)
        else:
            raw_text = parent.get_text(separator="|", strip=True)

        # 파이프로 분리
        parts = [p.strip() for p in raw_text.split("|") if p.strip()]

        # 제목은 a_tag 텍스트
        title = a_tag.get_text(strip=True)
        if not title:
            continue

        # 나머지 파트에서 저자/출판사/쪽수 추출
        author    = ""
        publisher = ""
        pages     = None

        for part in parts:
            # 쪽수: 숫자+"쪽"
            if re.fullmatch(r'\d+쪽?', part):
                try:
                    pages = int(re.sub(r'[^\d]', '', part))
                except ValueError:
                    pass
                continue
            # 단계 표시 제외
            if re.search(r'\d+단계', part):
                continue
            # 인증자 제외
            if '인증자' in part:
                continue
            # 영역 (문학/역사/사회/과학/철학/예술/종교) 제외
            if part in ('문학', '역사', '사회', '과학', '철학', '예술', '종교', '기술'):
                continue
            # 제목 자체 제외
            if part == title:
                continue

            # 저자/출판사 순서로 채우기
            if not author:
                author = part
            elif not publisher:
                publisher = part

        books.append({
            "book_id":   book_id,
            "title":     title,
            "author":    author,
            "publisher": publisher,
            "pages":     pages,
        })

    return books, total_pages
# ────────────────────────────────────────────────────────────────────


# ── Supabase 헬퍼 ────────────────────────────────────────────────────
def sb_headers():
    return {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates",  # upsert용
    }


def upsert_books(books: list[dict]) -> int:
    """
    reading_race_books에 upsert.
    book_id + level 조합으로 중복 방지.
    반환: 성공 건수
    """
    if not books:
        return 0

    rows = []
    for b in books:
        rows.append({
            "book_id":       b["book_id"],
            "title":         b["title"],
            "author":        b.get("author") or None,
            "publisher":     b.get("publisher") or None,
            "pages":         b.get("pages") or None,
            "level":         LEVEL,
            "library_status": None,
            "callno":        None,
            "location":      None,
            "isbn":          None,
        })

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/reading_race_books"
    resp = requests.post(
        url,
        headers={**sb_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
        data=json.dumps(rows),
        timeout=30,
    )
    if resp.status_code in (200, 201, 204):
        return len(rows)
    else:
        print(f"  ⚠️ DB저장 오류 {resp.status_code}: {resp.text[:200]}")
        return 0
# ────────────────────────────────────────────────────────────────────


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ SUPABASE_URL / SUPABASE_KEY 를 설정해주세요.")
        sys.exit(1)

    print("=" * 60)
    print(f"  📚 리딩레이스 {LEVEL}단계 도서 목록 수집")
    print("=" * 60)
    print(f"  출처: {BASE_URL}")
    print()

    # 1페이지 먼저 요청해서 전체 페이지 수 파악
    print("  1페이지 조회 중…")
    books_p1, total_pages = parse_page(1)
    if not books_p1:
        print("  ❌ 첫 페이지 파싱 실패. 사이트 구조를 확인해주세요.")
        sys.exit(1)

    print(f"  전체 페이지: {total_pages}페이지")
    print()

    all_books = []
    all_books.extend(books_p1)
    print(f"  p.1 → {len(books_p1)}권 수집")

    for page in range(2, total_pages + 1):
        time.sleep(PAGE_DELAY)
        books, _ = parse_page(page)
        all_books.extend(books)
        print(f"  p.{page} → {len(books)}권 수집  (누적: {len(all_books)}권)")

    print()
    print(f"  총 {len(all_books)}권 수집 완료!")
    print()

    # DB에 저장
    print("  Supabase에 저장 중…")
    saved = upsert_books(all_books)
    print(f"  ✅ {saved}권 저장 완료!")
    print()
    print("  📊 확인 SQL:")
    print(f"  SELECT COUNT(*) FROM reading_race_books WHERE level='{LEVEL}';")
    print()
    print("  ✅ 다음 단계: ISBN 수집")
    print(f"  python -u 구성_ISBN_통합수집.py {LEVEL}")


if __name__ == "__main__":
    main()
