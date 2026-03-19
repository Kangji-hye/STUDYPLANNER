"""
리딩레이스 3단계 구성도서관 소장현황 수집 스크립트
=====================================================
- reading_race_books 에서 level='3' 인 책 목록을 가져와
- 구성도서관 모바일 검색으로 소장 여부 / 청구기호 / 위치 수집
- 개선된 파싱 로직 사용 (div.bookData > div.book_info.info02 세 번째 p)
- 수집 후 Supabase library_status, callno, location 업데이트

사용법:
  python 리딩레이스_3단계_소장현황_수집.py
"""

import requests
from bs4 import BeautifulSoup
import time, re, sys, json, os

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

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY", "")

DELAY          = 1.5   # 구성도서관 요청 간격(초)
SUPABASE_BATCH = 50

SEARCH_URL = "https://lib.yongin.go.kr/mobile/guseong/search/plusSearchResultList.do"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
                  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": "https://lib.yongin.go.kr/guseong/index.do",
}

session = requests.Session()
session.headers.update(HEADERS)


# ── 헬퍼 함수 ─────────────────────────────────────────────────
def _clean(s: str) -> str:
    return re.sub(r'[\s\(\)\[\]\:\-\,\.·「」『』""\'\'《》〈〉]', '', str(s).lower())


def title_match(search_title: str, found_title: str) -> bool:
    s = _clean(search_title)
    f = _clean(found_title)
    if not s or not f:
        return False
    if s in f or f in s:
        return True
    min_len = min(len(s), len(f))
    return min_len >= 5 and s[:min_len] == f[:min_len]


def publisher_match(expected_pub: str, found_pub: str) -> bool:
    if not expected_pub or not found_pub:
        return False
    e = _clean(expected_pub)
    f = _clean(found_pub)
    if not e or not f:
        return False
    if e == f:
        return True
    shorter_len = min(len(e), len(f))
    if shorter_len < 3:
        return e == f
    return e in f or f in e


# ── 구성도서관 검색 ────────────────────────────────────────────
def search_one(title: str, publisher: str = "") -> dict:
    """
    책 제목으로 구성도서관 검색.
    반환: {"library_status": "✅ 소장" | "⚠️ 소장(출판사확인필요)" | "❌ 미소장",
           "callno": "", "location": ""}
    """
    empty = {"library_status": "❌ 미소장", "callno": "", "location": ""}

    try:
        resp = session.get(
            SEARCH_URL,
            params={
                "searchType": "SIMPLE",
                "searchKey": "TITLE",
                "searchKeyword": title.strip(),
                "searchRecordCount": "50",
            },
            timeout=20
        )
        resp.raise_for_status()
        resp.encoding = "utf-8"
    except Exception as e:
        print(f"  ❗ 연결 오류: {e}")
        return {**empty, "library_status": "오류"}

    soup = BeautifulSoup(resp.text, "html.parser")

    if soup.find(string=re.compile(r"검색된\s*자료가\s*없|결과가\s*없")):
        return empty

    # div.bookData 단위로 탐색
    exact = None
    title_only = None

    for book in soup.find_all("div", class_="bookData"):
        # 구성도서관 소장 확인 (info03)
        info03 = book.find("div", class_=lambda c: c and "info03" in c)
        if not info03 or "구성도서관" not in info03.get_text():
            continue

        # 제목 매칭
        book_name_div = book.find("div", class_="book_name")
        item_title = book_name_div.get_text(strip=True) if book_name_div else ""
        if item_title and not title_match(title, item_title):
            continue

        # 출판사 / 청구기호 / 위치 (info02)
        info02 = book.find("div", class_=lambda c: c and "info02" in c)
        if not info02:
            continue
        ps = info02.find_all("p")
        found_pub  = ps[0].get_text(strip=True) if len(ps) > 0 else ""
        callno     = ps[2].get_text(strip=True) if len(ps) >= 3 else ""

        # 위치 (info03 두 번째 p)
        loc_ps = info03.find_all("p")
        location = loc_ps[1].get_text(strip=True) if len(loc_ps) >= 2 else ""

        pub_ok = publisher_match(publisher, found_pub) if publisher else False

        entry = {"callno": callno, "location": location, "pub_matched": pub_ok}
        if pub_ok and exact is None:
            exact = entry
        elif not pub_ok and title_only is None:
            title_only = entry

    if exact:
        return {
            "library_status": "✅ 소장",
            "callno":   exact["callno"],
            "location": exact["location"],
        }
    if title_only:
        return {
            "library_status": "⚠️ 소장(출판사확인필요)",
            "callno":   title_only["callno"],
            "location": title_only["location"],
        }
    return empty


# ── Supabase 3단계 책 목록 조회 ──────────────────────────────
def fetch_level3_books():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ SUPABASE_URL / SUPABASE_KEY 가 설정되지 않았어요.")
        sys.exit(1)

    url = (f"{SUPABASE_URL.rstrip('/')}/rest/v1/reading_race_books"
           f"?select=id,book_id,title,publisher&level=eq.3"
           f"&order=book_id.asc&limit=1000")
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json()


# ── Supabase 업로드 ───────────────────────────────────────────
def upload_results(updates: list):
    if not updates:
        print("  업로드할 데이터가 없어요.")
        return

    # book_id 기준 upsert
    url = (f"{SUPABASE_URL.rstrip('/')}/rest/v1/reading_race_books"
           f"?on_conflict=book_id")
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    total = len(updates)
    success = 0
    fail = 0
    print(f"\n  📤 Supabase 업로드 ({total}건)...")
    for i in range(0, total, SUPABASE_BATCH):
        batch = updates[i: i + SUPABASE_BATCH]
        try:
            resp = requests.post(url, headers=headers,
                                 data=json.dumps(batch), timeout=30)
            if resp.status_code in (200, 201):
                success += len(batch)
                print(f"    [{i+len(batch)}/{total}] ✅")
            else:
                fail += len(batch)
                print(f"    [{i+len(batch)}/{total}] ❌ {resp.status_code}: {resp.text[:100]}")
        except Exception as e:
            fail += len(batch)
            print(f"    [{i+len(batch)}/{total}] ❌ 예외: {e}")
        time.sleep(0.3)

    print(f"  완료: 성공 {success}건 / 실패 {fail}건\n")


# ── 메인 ─────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  📚 리딩레이스 3단계 구성도서관 소장현황 수집")
    print("=" * 60)

    books = fetch_level3_books()
    total = len(books)
    print(f"\n  대상: {total}권  |  예상 소요: 약 {total * DELAY / 60:.0f}분\n")

    updates = []
    owned = 0
    not_owned = 0
    error = 0

    for i, book in enumerate(books):
        book_id = book.get("book_id")
        title   = book.get("title", "")
        pub     = book.get("publisher", "")

        print(f"[{i+1:3d}/{total}] {title[:30]:<30}", end="  ")
        sys.stdout.flush()

        result = search_one(title, pub)
        status = result["library_status"]

        if status == "오류":
            error += 1
            print("❗ 오류")
        elif "소장" in status and "미소장" not in status:
            owned += 1
            print(f"{'✅' if status == '✅ 소장' else '⚠️ '} {result['callno']}  {result['location'][:20]}")
        else:
            not_owned += 1
            print("❌ 미소장")

        updates.append({
            "book_id":        book_id,
            "library_status": status,
            "callno":         result["callno"],
            "location":       result["location"],
        })

        time.sleep(DELAY)

    upload_results(updates)

    print("=" * 60)
    print(f"  ✅ 소장: {owned}권")
    print(f"  ❌ 미소장: {not_owned}권")
    if error:
        print(f"  ❗ 오류: {error}권")
    print("=" * 60)


if __name__ == "__main__":
    main()
