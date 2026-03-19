"""
추천도서 ISBN 수집 스크립트
=====================================================
대상: recommended_books, jangmi_recommended_books (isbn IS NULL)

동작:
  1. Supabase에서 isbn=NULL인 추천도서 목록 가져오기
  2. 1순위: 도서관 정보나루 API (srchBooks) — 제목으로 ISBN 검색
  3. 2순위: Google Books API — 폴백 (키 불필요, 무료)
  4. 미발견 시 "NOT_FOUND" 저장 → 다음 실행 시 재조회 방지
  5. 진행 파일에 저장 (중단 후 재개 가능)

사용법:
  python -u 추천도서_ISBN_수집.py          # 구성도서관 (기본)
  python -u 추천도서_ISBN_수집.py jangmi   # 장미도서관
  python -u 추천도서_ISBN_수집.py all      # 구성 + 장미 순서대로
"""

import requests
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
LIB_API_KEY  = os.getenv("LIB_APIKEY") or os.getenv("LIB_API_KEY") or os.getenv("VITE_LIB_APIKEY", "")

LIB_API_URL  = "https://www.data4library.kr/api/srchBooks"
GOOGLE_URL   = "https://www.googleapis.com/books/v1/volumes"

API_DELAY    = 0.5
BATCH_SIZE   = 200
SAVE_INTERVAL = 50

# 실행 인수로 대상 결정
_arg = sys.argv[1].strip().lower() if len(sys.argv) > 1 else "guseong"
TARGET = _arg if _arg in ("guseong", "jangmi", "all") else "guseong"
# ────────────────────────────────────────────────────────────────────


# ── 텍스트 정규화 ────────────────────────────────────────────────────
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
# ────────────────────────────────────────────────────────────────────


# ── 1순위: 도서관 정보나루 API ───────────────────────────────────────
def lookup_isbn_lib4(title: str, publisher: str = "") -> str | None:
    short_title = re.sub(r'\s*[\(\[].*', '', title).strip() or title
    candidates = [short_title]
    if short_title != title:
        candidates.append(title)

    for search_q in candidates:
        try:
            resp = requests.get(
                LIB_API_URL,
                params={
                    "authKey":  LIB_API_KEY,
                    "title":    search_q,
                    "format":   "json",
                    "pageSize": 5,
                },
                timeout=15,
            )
            data = resp.json()
        except Exception as e:
            print(f"⚠️ 정보나루 API 오류: {e}")
            return None

        docs = data.get("response", {}).get("docs", [])
        if not docs:
            continue

        best_score = -1
        best_isbn  = None
        first_isbn = None

        for item in docs:
            doc = item.get("doc", {})
            found_title = doc.get("bookname", "")
            found_pub   = doc.get("publisher", "")
            isbn_raw    = doc.get("isbn13", "") or doc.get("isbn", "")

            m = re.search(r'97[89]\d{10}', str(isbn_raw))
            if not m:
                continue
            isbn13 = m.group()

            if first_isbn is None:
                first_isbn = isbn13

            ts = title_score(search_q, found_title)
            if ts == 0:
                continue

            pub_bonus = 5 if publisher and publisher_match(publisher, found_pub) else 0
            score = ts * 10 + pub_bonus

            if score > best_score:
                best_score = score
                best_isbn  = isbn13

        if best_isbn:
            return best_isbn

        # 결과 1건이면 폴백 채택
        if first_isbn and len(docs) == 1:
            return first_isbn

    return None
# ────────────────────────────────────────────────────────────────────


# ── 2순위: Google Books API (폴백) ───────────────────────────────────
def lookup_isbn_google(title: str, publisher: str = "") -> str | None:
    short_title = re.sub(r'\s*[\(\[].*', '', title).strip() or title
    candidates = [short_title]
    if short_title != title:
        candidates.append(title)

    for search_q in candidates:
        try:
            resp = requests.get(
                GOOGLE_URL,
                params={
                    "q":            f"intitle:{search_q}",
                    "langRestrict": "ko",
                    "maxResults":   5,
                    "printType":    "books",
                },
                timeout=15,
            )
            data = resp.json()
        except Exception:
            return None

        items = data.get("items", [])
        if not items:
            continue

        best_score = -1
        best_isbn  = None
        first_isbn = None

        for item in items:
            vi = item.get("volumeInfo", {})
            found_title = vi.get("title", "")
            found_pub   = vi.get("publisher", "")

            isbn13 = ""
            for id_info in vi.get("industryIdentifiers", []):
                if id_info.get("type") == "ISBN_13":
                    isbn13 = id_info["identifier"]
                    break
            if not isbn13:
                continue

            if first_isbn is None:
                first_isbn = isbn13

            ts = title_score(search_q, found_title)
            if ts == 0:
                continue

            pub_bonus = 5 if publisher and publisher_match(publisher, found_pub) else 0
            score = ts * 10 + pub_bonus

            if score > best_score:
                best_score = score
                best_isbn  = isbn13

        if best_isbn:
            return best_isbn

        if first_isbn and len(items) == 1:
            return first_isbn

    return None
# ────────────────────────────────────────────────────────────────────


# ── Supabase 헬퍼 ────────────────────────────────────────────────────
def sb_headers():
    return {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
    }

def fetch_books(table: str, offset: int) -> list:
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}"
    params = {
        "select": "book_no,title,publisher",  # id 없음 → book_no가 PK
        "isbn":   "is.null",
        "limit":  BATCH_SIZE,
        "offset": offset,
        "order":  "book_no.asc",
    }
    resp = requests.get(url, headers=sb_headers(), params=params, timeout=20)
    resp.raise_for_status()
    return resp.json()

def update_isbn(table: str, row_id: int, isbn: str) -> bool:
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}?book_no=eq.{row_id}"
    resp = requests.patch(
        url, headers=sb_headers(),
        data=json.dumps({"isbn": isbn}), timeout=15
    )
    return resp.status_code in (200, 204)
# ────────────────────────────────────────────────────────────────────


# ── 진행 저장/로드 ────────────────────────────────────────────────────
def load_progress(progress_file: str) -> dict:
    if os.path.exists(progress_file):
        with open(progress_file, encoding="utf-8") as f:
            return json.load(f)
    return {"done": 0, "found_lib4": 0, "found_google": 0, "skipped": 0}

def save_progress(progress_file: str, progress: dict):
    with open(progress_file, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)
# ────────────────────────────────────────────────────────────────────


def run_one(table: str, label: str):
    """단일 테이블 ISBN 수집 실행"""
    progress_file = f"isbn_추천도서_{label}_progress.json"

    print("=" * 60)
    print(f"  📚 {label} 추천도서 ISBN 수집")
    print("=" * 60)
    print(f"  테이블: {table}")
    print(f"  1순위: 정보나루 API {'✅' if LIB_API_KEY else '❌(키없음)'} | 2순위: Google Books")
    print()

    # 대상 건수 확인
    try:
        cr = requests.get(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}",
            headers={**sb_headers(), "Prefer": "count=exact", "Range": "0-0"},
            params={"select": "id", "isbn": "is.null"},
            timeout=10,
        )
        m = re.search(r'/(\d+)', cr.headers.get("Content-Range", ""))
        total_target = int(m.group(1)) if m else "?"
    except Exception:
        total_target = "?"
    print(f"  조회 대상: {total_target}권")

    progress = load_progress(progress_file)
    session_done = session_lib4 = session_google = session_skipped = 0
    found_prev = progress.get("found_lib4", 0) + progress.get("found_google", 0)
    print(f"  이전 진행: {progress['done']}권 처리 / ISBN {found_prev}건 수집")
    print()

    while True:
        try:
            books = fetch_books(table, 0)
        except Exception as e:
            print(f"❌ Supabase 조회 오류: {e}")
            break

        if not books:
            print("  ✅ 모든 대상 처리 완료!")
            break

        for book in books:
            row_id    = book["book_no"]   # PK는 book_no
            title     = str(book.get("title", "") or "").strip()
            publisher = str(book.get("publisher", "") or "").strip()

            total_so_far = progress["done"] + session_done + 1
            print(f"  [{total_so_far:4d}] {title[:30]:<30}", end="  ")
            sys.stdout.flush()

            if not title:
                print("— 제목 없음, 건너뜀")
                update_isbn(table, row_id, "NOT_FOUND")
                session_done += 1
                session_skipped += 1
                continue

            isbn = source = None

            # 1순위: 정보나루
            if LIB_API_KEY:
                isbn = lookup_isbn_lib4(title, publisher)
                source = "정보나루"

            # 2순위: Google Books
            if not isbn:
                time.sleep(0.3)
                isbn = lookup_isbn_google(title, publisher)
                source = "Google"

            if isbn:
                ok = update_isbn(table, row_id, isbn)
                print(f"✅ {isbn} [{source}]" if ok else f"⚠️  DB저장실패 ({isbn})")
                if source == "정보나루":
                    session_lib4 += 1
                else:
                    session_google += 1
            else:
                update_isbn(table, row_id, "NOT_FOUND")
                print("❌ 미발견 (NOT_FOUND 저장)")
                session_skipped += 1

            session_done += 1

            if session_done % SAVE_INTERVAL == 0:
                progress["done"]        += session_done
                progress["found_lib4"]   = progress.get("found_lib4", 0) + session_lib4
                progress["found_google"] = progress.get("found_google", 0) + session_google
                progress["skipped"]     += session_skipped
                save_progress(progress_file, progress)
                found_now = progress["found_lib4"] + progress["found_google"]
                print(f"\n  💾 중간 저장 ({progress['done']}권 처리, ISBN {found_now}건)\n")
                session_done = session_lib4 = session_google = session_skipped = 0

            time.sleep(API_DELAY)

        if len(books) < BATCH_SIZE:
            print("\n  마지막 배치 처리 완료.")
            break

    # 최종 저장
    progress["done"]        += session_done
    progress["found_lib4"]   = progress.get("found_lib4", 0) + session_lib4
    progress["found_google"] = progress.get("found_google", 0) + session_google
    progress["skipped"]     += session_skipped
    save_progress(progress_file, progress)

    found_total = progress["found_lib4"] + progress["found_google"]
    print()
    print(f"  이번 세션: {session_done}권 / 정보나루 {session_lib4} / Google {session_google} / 미발견 {session_skipped}")
    print(f"  누적 합계: {progress['done']}권 / ISBN {found_total}건")
    print("=" * 60)
    print()


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ SUPABASE_URL / SUPABASE_KEY 를 설정해주세요.")
        sys.exit(1)

    if TARGET == "all":
        run_one("recommended_books",        "구성")
        run_one("jangmi_recommended_books", "장미")
    elif TARGET == "jangmi":
        run_one("jangmi_recommended_books", "장미")
    else:
        run_one("recommended_books", "구성")


if __name__ == "__main__":
    main()
