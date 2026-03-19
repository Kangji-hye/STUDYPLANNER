"""
리딩레이스 2단계 ISBN 수집 스크립트
=====================================================
대상: reading_race_books (level='2', isbn IS NULL) — 약 719권

동작:
  1. Supabase에서 isbn이 NULL인 2단계 책 목록 가져오기
  2. 구성도서관 모바일 검색으로 제목 검색
  3. 검색결과 HTML의 fnCollectionBookList onclick 파라미터에서 ISBN-13 직접 추출
     (상세 페이지 불필요 — 검색결과에 ISBN 포함)
  4. 매칭 우선순위:
       ① 제목 완전일치 + 출판사 일치
       ② 제목 완전일치
       ③ 제목 포함 + 출판사 일치
       ④ 제목 포함 (폴백)
  5. Supabase isbn 컬럼 업데이트 (찾은 경우만)
  6. isbn_2단계_progress.json에 진행 저장

ISBN이 null인 책은 구성도서관에 미소장인 경우이므로
찾지 못한 경우 건너뜁니다 (NULL 저장 안 함).

사용법:
  1. pip install requests beautifulsoup4 python-dotenv
  2. .env 또는 프로젝트 루트 .env에 아래 항목 입력:
       SUPABASE_URL=https://xxxx.supabase.co
       SUPABASE_KEY=eyJhbGci...
  3. python 리딩레이스_2단계_ISBN_수집.py
"""

import requests
from bs4 import BeautifulSoup
import time
import re
import sys
import json
import os

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    from dotenv import load_dotenv
    from pathlib import Path
    load_dotenv(Path(__file__).parent / ".env")
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

# ── 설정 ───────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY", "")

# 없으면 직접 입력
# SUPABASE_URL = "https://xxxx.supabase.co"
# SUPABASE_KEY = "eyJhbGci..."

SEARCH_URL    = "https://lib.yongin.go.kr/mobile/guseong/search/plusSearchResultList.do"
API_DELAY     = 1.5
BATCH_SIZE    = 200
SAVE_INTERVAL = 50
PROGRESS_FILE = "isbn_2단계_progress.json"
# ───────────────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": "https://lib.yongin.go.kr/guseong/index.do",
}

session = requests.Session()
session.headers.update(HEADERS)


# ── 텍스트 정규화 ──────────────────────────────────────────────────
def _clean(s: str) -> str:
    return re.sub(r'[\s\(\)\[\]\:\-\,\.·「」『』""\'\'《》〈〉!?~]', "", str(s).lower())


def title_score(query: str, found: str) -> int:
    """
    제목 유사도 점수:
      2 = 정규화 후 완전일치
      1 = 포함 관계 또는 앞부분 일치
      0 = 불일치
    """
    cq, cf = _clean(query), _clean(found)
    if not cq or not cf:
        return 0
    if cq == cf:
        return 2
    if cq in cf or cf in cq:
        return 1
    ml = min(len(cq), len(cf))
    if ml >= 5 and cq[:ml] == cf[:ml]:
        return 1
    return 0


def publisher_match(a: str, b: str) -> bool:
    if not a or not b:
        return False
    ca, cb = _clean(a), _clean(b)
    if not ca or not cb:
        return False
    sl = min(len(ca), len(cb))
    if sl < 3:
        return ca == cb
    return ca in cb or cb in ca
# ───────────────────────────────────────────────────────────────────


# ── 구성도서관 검색 & ISBN 추출 ───────────────────────────────────
def lookup_isbn(title: str, publisher: str = "") -> str | None:
    """
    구성도서관 모바일 검색 결과에서 ISBN 추출.
    fnCollectionBookList onclick의 4번째 파라미터가 ISBN-13.
    """
    try:
        resp = session.get(
            SEARCH_URL,
            params={
                "searchType": "SIMPLE",
                "searchKey": "TITLE",
                "searchKeyword": title.strip(),
                "searchRecordCount": "20",
            },
            timeout=20,
        )
        resp.raise_for_status()
        resp.encoding = "utf-8"
    except Exception as e:
        print(f"⚠️ 검색 오류: {e}")
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # (score, isbn) — score 높은 것 우선
    # score = title_score * 10 + (5 if pub_match else 0)
    best_score = -1
    best_isbn = None

    for name_div in soup.select(".book_name"):
        li = name_div.find_parent("li")
        if not li:
            continue

        # 제목 추출 (<b class="book_kind"> 제거)
        name_copy = BeautifulSoup(str(name_div), "html.parser")
        for b_tag in name_copy.find_all("b"):
            b_tag.decompose()
        item_title = name_copy.get_text(strip=True)

        ts = title_score(title, item_title)
        if ts == 0:
            continue

        # ISBN: fnCollectionBookList onclick 파라미터
        m = re.search(
            r"fnCollectionBookList\([^,]+,\s*'?[^,]+'?,\s*'BO',\s*'(97[89]\d{10})'",
            str(li),
        )
        if not m:
            continue
        isbn = m.group(1)

        # 출판사 추출 (.info02 의 연도 직전 p)
        info02 = li.select_one(".info02")
        found_pub = ""
        if info02:
            ps = info02.select("p")
            for idx, p in enumerate(ps):
                if re.fullmatch(r"\[?\d{4}\]?\.?", p.get_text(strip=True)):
                    if idx > 0:
                        found_pub = ps[idx - 1].get_text(strip=True)
                    break
            if not found_pub and len(ps) >= 2:
                found_pub = ps[1].get_text(strip=True)

        pub_bonus = 5 if publisher and publisher_match(publisher, found_pub) else 0
        score = ts * 10 + pub_bonus

        if score > best_score:
            best_score = score
            best_isbn = isbn

    return best_isbn
# ───────────────────────────────────────────────────────────────────


# ── Supabase 헬퍼 ──────────────────────────────────────────────────
def sb_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def fetch_books(offset: int) -> list:
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/reading_race_books"
    params = {
        "select": "id,title,publisher",
        "level": "eq.2",
        "isbn": "is.null",
        "limit": BATCH_SIZE,
        "offset": offset,
        "order": "id.asc",
    }
    resp = requests.get(url, headers=sb_headers(), params=params, timeout=20)
    resp.raise_for_status()
    return resp.json()


def update_isbn(row_id: int, isbn: str) -> bool:
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/reading_race_books?id=eq.{row_id}"
    resp = requests.patch(url, headers=sb_headers(), data=json.dumps({"isbn": isbn}), timeout=15)
    return resp.status_code in (200, 204)
# ───────────────────────────────────────────────────────────────────


# ── 진행 상황 저장/로드 ────────────────────────────────────────────
def load_progress() -> dict:
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {"done": 0, "found": 0, "skipped": 0}


def save_progress(progress: dict):
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)
# ───────────────────────────────────────────────────────────────────


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ SUPABASE_URL / SUPABASE_KEY 를 설정해주세요.")
        sys.exit(1)

    print("=" * 60)
    print("  📚 리딩레이스 2단계 ISBN 수집 — 구성도서관 모바일 검색")
    print("=" * 60)
    print(f"  대상: reading_race_books (level=2, isbn IS NULL)")
    print(f"  요청 간격: {API_DELAY}초  |  배치 크기: {BATCH_SIZE}")
    print()

    progress = load_progress()
    session_done = session_found = session_skipped = 0

    print(f"  이전 진행: {progress['done']}권 처리 / ISBN {progress['found']}건 수집")
    print()

    while True:
        try:
            books = fetch_books(0)  # isbn=NULL 기준 → 처리된 건 자동 제외
        except Exception as e:
            print(f"❌ Supabase 조회 오류: {e}")
            break

        if not books:
            print("  ✅ 모든 대상 처리 완료.")
            break

        for book in books:
            row_id    = book["id"]
            title     = str(book.get("title", "") or "").strip()
            publisher = str(book.get("publisher", "") or "").strip()

            total_so_far = progress["done"] + session_done + 1
            print(f"  [{total_so_far:4d}] {title[:32]:<32}", end="  ")
            sys.stdout.flush()

            if not title:
                print("— 제목 없음, 건너뜀")
                session_done += 1
                session_skipped += 1
                time.sleep(0.1)
                continue

            isbn = lookup_isbn(title, publisher)

            if isbn:
                ok = update_isbn(row_id, isbn)
                print(f"✅ {isbn}" if ok else f"⚠️  DB저장실패 ({isbn})")
                session_found += 1
            else:
                print("❌ 미소장(구성도서관)")
                session_skipped += 1

            session_done += 1

            if session_done % SAVE_INTERVAL == 0:
                progress["done"]    += session_done
                progress["found"]   += session_found
                progress["skipped"] += session_skipped
                save_progress(progress)
                print(f"\n  💾 중간 저장 ({progress['done']}권 처리, ISBN {progress['found']}건)\n")
                session_done = session_found = session_skipped = 0

            time.sleep(API_DELAY)

        if len(books) < BATCH_SIZE:
            print("\n  마지막 배치 처리 완료.")
            break

    progress["done"]    += session_done
    progress["found"]   += session_found
    progress["skipped"] += session_skipped
    save_progress(progress)

    print()
    print("=" * 60)
    print(f"  이번 세션: {session_done}권 / ISBN {session_found}건 / 미소장 {session_skipped}건")
    print(f"  누적 합계: {progress['done']}권 / ISBN {progress['found']}건")
    print(f"  진행 파일: {PROGRESS_FILE}")
    print("=" * 60)
    print()
    print("  📊 확인 SQL:")
    print("  SELECT COUNT(*) FROM reading_race_books WHERE level='2' AND isbn IS NOT NULL;")


if __name__ == "__main__":
    main()
