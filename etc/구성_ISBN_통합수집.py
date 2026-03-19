"""
구성도서관 리딩레이스 ISBN 통합 수집 스크립트
=====================================================
대상: reading_race_books (isbn IS NULL) — level 1 또는 2 선택

동작:
  1. Supabase에서 isbn=NULL인 책 목록 가져오기
  2. 1순위: 구성도서관 모바일 검색으로 ISBN 추출
  3. 2순위: Google Books API로 ISBN 추출 (구성도서관 미소장 시 폴백)
  4. Supabase isbn 컬럼 업데이트 (찾은 경우만)
  5. progress JSON에 진행 저장 (중단 후 재개 가능)

사용법:
  python 구성_ISBN_통합수집.py          # 기본: level 1 처리
  python 구성_ISBN_통합수집.py 2        # level 2 처리
  python 구성_ISBN_통합수집.py all      # 전체 처리
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
SUPABASE_URL  = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL", "")
SUPABASE_KEY  = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY", "")

GUSEONG_URL   = "https://lib.yongin.go.kr/mobile/guseong/search/plusSearchResultList.do"
GOOGLE_URL    = "https://www.googleapis.com/books/v1/volumes"

API_DELAY     = 1.5   # 요청 간격 (초)
BATCH_SIZE    = 200
SAVE_INTERVAL = 50

# 실행 인수로 level 결정
_arg = sys.argv[1].strip() if len(sys.argv) > 1 else "1"
LEVEL = _arg if _arg in ("1", "2", "3", "4", "all") else "1"
PROGRESS_FILE = f"isbn_통합_{LEVEL}단계_progress.json"
# ───────────────────────────────────────────────────────────────────

GUSEONG_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": "https://lib.yongin.go.kr/guseong/index.do",
}
guseong_session = requests.Session()
guseong_session.headers.update(GUSEONG_HEADERS)


# ── 텍스트 정규화 ──────────────────────────────────────────────────
def _clean(s: str) -> str:
    return re.sub(r'[\s\(\)\[\]\:\-\,\.·「」『』""\'\'《》〈〉!?~]', "", str(s).lower())


def title_score(query: str, found: str) -> int:
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


# ── 1순위: 구성도서관 ISBN 조회 ───────────────────────────────────
def lookup_isbn_guseong(title: str, publisher: str = "") -> str | None:
    try:
        resp = guseong_session.get(
            GUSEONG_URL,
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
    except Exception:
        return None

    soup = BeautifulSoup(resp.text, "html.parser")
    best_score, best_isbn = -1, None

    for name_div in soup.select(".book_name"):
        li = name_div.find_parent("li")
        if not li:
            continue
        name_copy = BeautifulSoup(str(name_div), "html.parser")
        for b_tag in name_copy.find_all("b"):
            b_tag.decompose()
        item_title = name_copy.get_text(strip=True)

        ts = title_score(title, item_title)
        if ts == 0:
            continue

        m = re.search(
            r"fnCollectionBookList\([^,]+,\s*'?[^,]+'?,\s*'BO',\s*'(97[89]\d{10})'",
            str(li),
        )
        if not m:
            continue
        isbn = m.group(1)

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


# ── 2순위: Google Books API ISBN 조회 ────────────────────────────
def lookup_isbn_google(title: str, publisher: str = "") -> str | None:
    short_title = re.sub(r'\s*[\(\[].*', '', title).strip() or title
    candidates = [title]
    if short_title != title:
        candidates.append(short_title)

    for search_q in candidates:
        try:
            resp = requests.get(
                GOOGLE_URL,
                params={
                    "q": f"intitle:{search_q}",
                    "langRestrict": "ko",
                    "maxResults": 5,
                    "printType": "books",
                },
                timeout=15,
            )
            data = resp.json()
        except Exception:
            return None

        items = data.get("items", [])
        if not items:
            continue

        best_score, best_isbn = -1, None
        for item in items:
            vi = item.get("volumeInfo", {})
            found_title = vi.get("title", "")
            found_pub   = vi.get("publisher", "")

            ts = title_score(title, found_title)
            if ts == 0:
                continue

            isbn13 = ""
            for id_info in vi.get("industryIdentifiers", []):
                if id_info.get("type") == "ISBN_13":
                    isbn13 = id_info["identifier"]
                    break
            if not isbn13:
                continue

            pub_bonus = 5 if publisher and publisher_match(publisher, found_pub) else 0
            score = ts * 10 + pub_bonus
            if score > best_score:
                best_score = score
                best_isbn = isbn13

        if best_isbn:
            return best_isbn

    return None
# ───────────────────────────────────────────────────────────────────


# ── Supabase 헬퍼 ──────────────────────────────────────────────────
def sb_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def fetch_books(offset: int) -> list:
    # isbn IS NULL 인 것만 조회 (NOT_FOUND 저장 후 is.null 조건에서 제외됨)
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/reading_race_books"
    params = {
        "select": "id,title,publisher",
        "isbn": "is.null",
        "limit": BATCH_SIZE,
        "offset": offset,
        "order": "id.asc",
    }
    # level 필터
    if LEVEL != "all":
        params["level"] = f"eq.{LEVEL}"

    resp = requests.get(url, headers=sb_headers(), params=params, timeout=20)
    resp.raise_for_status()
    return resp.json()


def update_isbn(row_id: int, isbn: str) -> bool:
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/reading_race_books?id=eq.{row_id}"
    resp = requests.patch(
        url, headers=sb_headers(),
        data=json.dumps({"isbn": isbn}), timeout=15
    )
    return resp.status_code in (200, 204)
# ───────────────────────────────────────────────────────────────────


# ── 진행 저장/로드 ─────────────────────────────────────────────────
def load_progress() -> dict:
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {"done": 0, "found_guseong": 0, "found_google": 0, "skipped": 0}


def save_progress(progress: dict):
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)
# ───────────────────────────────────────────────────────────────────


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ SUPABASE_URL / SUPABASE_KEY 를 설정해주세요.")
        sys.exit(1)

    level_label = f"{LEVEL}단계" if LEVEL != "all" else "전체"
    print("=" * 60)
    print(f"  📚 구성도서관 ISBN 통합 수집 — {level_label}")
    print("=" * 60)
    print(f"  대상: reading_race_books (level={LEVEL}, isbn IS NULL)")
    print(f"  1순위: 구성도서관 | 2순위: Google Books API")
    print(f"  요청 간격: {API_DELAY}초")
    print()

    progress = load_progress()
    session_done = session_guseong = session_google = session_skipped = 0

    found_total = progress.get("found_guseong", 0) + progress.get("found_google", 0)
    print(f"  이전 진행: {progress['done']}권 처리 / ISBN {found_total}건 수집")
    print()

    while True:
        try:
            books = fetch_books(0)
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

            # 1순위: Google Books (적중률 높음)
            isbn = lookup_isbn_google(title, publisher)
            source = "Google"

            # 2순위: 구성도서관 (폴백)
            if not isbn:
                time.sleep(0.5)
                isbn = lookup_isbn_guseong(title, publisher)
                source = "구성"

            if isbn:
                ok = update_isbn(row_id, isbn)
                print(f"✅ {isbn} [{source}]" if ok else f"⚠️  DB저장실패 ({isbn})")
                if source == "구성":
                    session_guseong += 1
                else:
                    session_google += 1
            else:
                # 미발견 시 NOT_FOUND 마커 저장 → 다음 실행 시 재조회 방지
                update_isbn(row_id, "NOT_FOUND")
                print("❌ 미발견 (NOT_FOUND 저장)")
                session_skipped += 1

            session_done += 1

            if session_done % SAVE_INTERVAL == 0:
                progress["done"]          += session_done
                progress["found_guseong"] = progress.get("found_guseong", 0) + session_guseong
                progress["found_google"]  = progress.get("found_google", 0) + session_google
                progress["skipped"]       += session_skipped
                save_progress(progress)
                found_now = progress["found_guseong"] + progress["found_google"]
                print(f"\n  💾 중간 저장 ({progress['done']}권 처리, ISBN {found_now}건)\n")
                session_done = session_guseong = session_google = session_skipped = 0

            time.sleep(API_DELAY)

        if len(books) < BATCH_SIZE:
            print("\n  마지막 배치 처리 완료.")
            break

    progress["done"]          += session_done
    progress["found_guseong"] = progress.get("found_guseong", 0) + session_guseong
    progress["found_google"]  = progress.get("found_google", 0) + session_google
    progress["skipped"]       += session_skipped
    save_progress(progress)

    found_total = progress["found_guseong"] + progress["found_google"]
    print()
    print("=" * 60)
    print(f"  이번 세션: {session_done}권 / 구성 {session_guseong}건 / Google {session_google}건 / 미발견 {session_skipped}건")
    print(f"  누적 합계: {progress['done']}권 / ISBN {found_total}건 (구성 {progress['found_guseong']} + Google {progress['found_google']})")
    print("=" * 60)


if __name__ == "__main__":
    main()
