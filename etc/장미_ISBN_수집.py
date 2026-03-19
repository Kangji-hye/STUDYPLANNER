"""
장미도서관 리딩레이스 ISBN 수집 스크립트
=====================================================
대상: jangmi_reading_race_books (isbn IS NULL, library_status에 '소장' 포함)

동작:
  1. Supabase에서 소장 도서 중 isbn=NULL인 책 목록 가져오기
  2. Google Books API로 책 제목 검색 → ISBN-13 추출
     (키 불필요, 무료)
  3. 매칭 우선순위:
       ① 제목 완전일치 + 출판사 일치
       ② 제목 완전일치
       ③ 제목 포함 (폴백)
  4. Supabase isbn 컬럼 업데이트 (찾은 경우만)
  5. isbn_장미_progress.json에 진행 저장

사용법:
  1. pip install requests python-dotenv
  2. .env에 아래 항목:
       SUPABASE_URL=https://xxxx.supabase.co
       SUPABASE_KEY=eyJhbGci...
  3. python 장미_ISBN_수집.py
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

# ── 설정 ───────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY", "")

API_DELAY     = 1.2   # Google Books API 요청 간격 (초)
BATCH_SIZE    = 200
SAVE_INTERVAL = 50
PROGRESS_FILE = "isbn_장미_progress.json"
# ───────────────────────────────────────────────────────────────────


# ── 텍스트 정규화 ──────────────────────────────────────────────────
def _clean(s: str) -> str:
    """공백·특수문자 제거 후 소문자 변환 — 제목 비교용"""
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
    """출판사 유사도 확인"""
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


# ── Google Books API ISBN 조회 ────────────────────────────────────
def lookup_isbn_google(title: str, publisher: str = "") -> str | None:
    """
    Google Books API로 제목 검색 → ISBN-13 추출.
    키 없이 무료 사용 가능 (하루 1,000건 제한).
    """
    # 괄호 이전 짧은 제목으로 검색 (정확도 향상)
    short_title = re.sub(r'\s*[\(\[].*', '', title).strip() or title

    # 검색어 후보: 원본 → 짧은 버전
    candidates = [title]
    if short_title != title:
        candidates.append(short_title)

    for search_q in candidates:
        try:
            resp = requests.get(
                "https://www.googleapis.com/books/v1/volumes",
                params={
                    "q": f"intitle:{search_q}",
                    "langRestrict": "ko",
                    "maxResults": 5,
                    "printType": "books",
                },
                timeout=15,
            )
            data = resp.json()
        except Exception as e:
            print(f"⚠️ API 오류: {e}")
            return None

        items = data.get("items", [])
        if not items:
            continue

        best_score = -1
        best_isbn  = None

        for item in items:
            vi = item.get("volumeInfo", {})
            found_title = vi.get("title", "")
            found_pub   = vi.get("publisher", "")

            ts = title_score(title, found_title)
            if ts == 0:
                continue

            # ISBN-13 추출
            isbn13 = ""
            for id_info in vi.get("industryIdentifiers", []):
                if id_info.get("type") == "ISBN_13":
                    isbn13 = id_info["identifier"]
                    break
            if not isbn13:
                # ISBN-10 → ISBN-13 변환은 생략, 없으면 패스
                continue

            pub_bonus = 5 if publisher and publisher_match(publisher, found_pub) else 0
            score = ts * 10 + pub_bonus

            if score > best_score:
                best_score = score
                best_isbn  = isbn13

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
    """
    jangmi_reading_race_books에서 소장 중이고 isbn=NULL인 책 조회.
    library_status에 '소장' 문자열이 포함된 행만 대상.
    """
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/jangmi_reading_race_books"
    params = {
        "select": "id,title,publisher,library_status",
        "isbn": "is.null",
        # library_status에 '소장' 포함 (미소장 제외)
        "library_status": "like.*소장*",
        "limit": BATCH_SIZE,
        "offset": offset,
        "order": "id.asc",
    }
    resp = requests.get(url, headers=sb_headers(), params=params, timeout=20)
    resp.raise_for_status()
    return resp.json()


def update_isbn(row_id: int, isbn: str) -> bool:
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/jangmi_reading_race_books?id=eq.{row_id}"
    resp = requests.patch(
        url, headers=sb_headers(),
        data=json.dumps({"isbn": isbn}), timeout=15
    )
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
    print("  📚 장미도서관 리딩레이스 ISBN 수집 — Google Books API")
    print("=" * 60)
    print(f"  대상: jangmi_reading_race_books (소장 + isbn IS NULL)")
    print(f"  요청 간격: {API_DELAY}초  |  배치 크기: {BATCH_SIZE}")
    print()

    # 대상 총 건수 미리 확인
    count_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/jangmi_reading_race_books"
    count_params = {
        "select": "id",
        "isbn": "is.null",
        "library_status": "like.*소장*",
    }
    count_headers = {**sb_headers(), "Prefer": "count=exact", "Range": "0-0"}
    try:
        cr = requests.get(count_url, headers=count_headers, params=count_params, timeout=10)
        content_range = cr.headers.get("Content-Range", "")
        m = re.search(r'/(\d+)', content_range)
        total_target = int(m.group(1)) if m else "?"
    except Exception:
        total_target = "?"
    print(f"  조회 대상: {total_target}권")
    print()

    progress = load_progress()
    session_done = session_found = session_skipped = 0

    print(f"  이전 진행: {progress['done']}권 처리 / ISBN {progress['found']}건 수집")
    print()

    while True:
        try:
            books = fetch_books(0)   # isbn=NULL 기준 → 처리 후 자동 제외
        except Exception as e:
            print(f"❌ Supabase 조회 오류: {e}")
            # 오류 시 session 카운터는 건드리지 않고 종료
            session_done = session_found = session_skipped = 0
            break

        if not books:
            print("  ✅ 모든 대상 처리 완료.")
            break

        for book in books:
            row_id    = book["id"]
            title     = str(book.get("title", "") or "").strip()
            publisher = str(book.get("publisher", "") or "").strip()
            lib_st    = str(book.get("library_status", "") or "")

            # 소장 여부 재확인 (혹시 like 필터가 미소장도 포함할 경우 대비)
            if "미소장" in lib_st or "소장" not in lib_st:
                session_done += 1
                session_skipped += 1
                continue

            total_so_far = progress["done"] + session_done + 1
            print(f"  [{total_so_far:4d}] {title[:32]:<32}", end="  ")
            sys.stdout.flush()

            if not title:
                print("— 제목 없음, 건너뜀")
                session_done += 1
                session_skipped += 1
                continue

            isbn = lookup_isbn_google(title, publisher)

            if isbn:
                ok = update_isbn(row_id, isbn)
                print(f"✅ {isbn}" if ok else f"⚠️  DB저장실패 ({isbn})")
                session_found += 1
            else:
                # 미발견 시 NOT_FOUND 마커 저장 → 다음 실행 시 재조회 방지
                update_isbn(row_id, "NOT_FOUND")
                print("❌ ISBN 미발견 (NOT_FOUND 저장)")
                session_skipped += 1

            session_done += 1

            # 50권마다 중간 저장
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

    # 최종 저장
    progress["done"]    += session_done
    progress["found"]   += session_found
    progress["skipped"] += session_skipped
    save_progress(progress)

    print()
    print("=" * 60)
    print(f"  이번 세션: {session_done}권 / ISBN {session_found}건 / 미발견 {session_skipped}건")
    print(f"  누적 합계: {progress['done']}권 / ISBN {progress['found']}건")
    print(f"  진행 파일: {PROGRESS_FILE}")
    print("=" * 60)
    print()
    print("  📊 확인 SQL:")
    print("  SELECT COUNT(*) FROM jangmi_reading_race_books WHERE isbn IS NOT NULL;")


if __name__ == "__main__":
    main()
