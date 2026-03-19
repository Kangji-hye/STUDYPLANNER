"""
장미도서관 리딩레이스 ISBN 수집 스크립트 v2
=====================================================
대상: jangmi_reading_race_books (isbn IS NULL)

동작:
  1. Supabase에서 isbn=NULL인 책 목록 가져오기
  2. 1순위: 도서관 정보나루 API (srchBooks) — 제목으로 ISBN 검색
            하루 1,000건 무료 제한 → 이틀에 나눠 실행 가능
  3. 2순위: Google Books API — 폴백 (키 불필요, 무료)
  4. 매칭 우선순위:
       ① 제목 완전일치 + 출판사 일치  (score 25)
       ② 제목 완전일치               (score 20)
       ③ 제목 포함                   (score 10)
  5. 미발견 시 "NOT_FOUND" 저장 → 다음 실행 시 재조회 방지
  6. isbn_장미_v2_progress.json에 진행 저장 (중단 후 재개 가능)

사용법:
  1. pip install requests python-dotenv
  2. .env에 아래 항목:
       SUPABASE_URL=https://xxxx.supabase.co
       SUPABASE_KEY=eyJhbGci...
       LIB_API_KEY=도서관정보나루_인증키   ← 필수
  3. python 장미_ISBN_수집_v2.py

하루 제한 안내:
  - 도서관 정보나루 API는 하루 1,000건 무료
  - 1,384권 → 1일차 1,000권 + 2일차 384권
  - Google Books 폴백 덕분에 실제 누락 최소화
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
SUPABASE_URL  = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL", "")
SUPABASE_KEY  = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY", "")
LIB_API_KEY   = os.getenv("LIB_APIKEY") or os.getenv("LIB_API_KEY") or os.getenv("VITE_LIB_APIKEY", "")

LIB_API_URL   = "https://www.data4library.kr/api/srchBooks"
GOOGLE_URL    = "https://www.googleapis.com/books/v1/volumes"

API_DELAY     = 0.5   # 요청 간격 (초) — 정보나루는 빠름
BATCH_SIZE    = 200
SAVE_INTERVAL = 50
PROGRESS_FILE = "isbn_장미_v2_progress.json"
# ────────────────────────────────────────────────────────────────────


# ── 텍스트 정규화 ────────────────────────────────────────────────────
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
# ────────────────────────────────────────────────────────────────────


# ── 1순위: 도서관 정보나루 API ───────────────────────────────────────
def lookup_isbn_lib4(title: str, publisher: str = "") -> str | None:
    """
    도서관 정보나루 srchBooks API로 제목 검색 → ISBN-13 추출.
    하루 1,000건 무료 제한.

    검색 후보 순서:
      1) 괄호/대괄호 앞 짧은 제목
      2) 원본 제목
    매칭 전략:
      - 제목 score >= 1 이면 채택 (완전일치 우선)
      - score 0이어도 검색 결과가 1건이면 폴백으로 채택
    """
    # 괄호/대괄호 앞 짧은 제목 추출
    short_title = re.sub(r'\s*[\(\[].*', '', title).strip() or title

    # 짧은 제목을 먼저 시도, 그 다음 원본
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

        # 응답 구조: response → docs → [{ doc: {...} }]
        docs = data.get("response", {}).get("docs", [])
        if not docs:
            continue

        best_score  = -1
        best_isbn   = None
        first_isbn  = None   # 폴백용: 첫 번째 결과의 ISBN

        for idx, item in enumerate(docs):
            doc = item.get("doc", {})
            found_title = doc.get("bookname", "")
            found_pub   = doc.get("publisher", "")
            isbn_raw    = doc.get("isbn13", "") or doc.get("isbn", "")

            # ISBN-13 형식만 사용 (978 또는 979로 시작하는 13자리)
            m = re.search(r'97[89]\d{10}', str(isbn_raw))
            if not m:
                continue
            isbn13 = m.group()

            # 첫 번째 유효한 ISBN 저장 (폴백용)
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

        # 매칭 실패했지만 검색 결과가 정확히 1건이면 폴백 채택
        # (제목이 너무 특이해서 매칭 점수가 안 나오는 경우 대비)
        if first_isbn and len(docs) == 1:
            return first_isbn

    return None
# ────────────────────────────────────────────────────────────────────


# ── 2순위: Google Books API (폴백) ───────────────────────────────────
def lookup_isbn_google(title: str, publisher: str = "") -> str | None:
    """
    Google Books API로 제목 검색 → ISBN-13 추출.
    키 없이 무료 사용 가능 (하루 1,000건 제한).
    """
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
        first_isbn = None  # 폴백용

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

        # 검색 결과 1건이면 폴백 채택
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


def fetch_books(offset: int) -> list:
    """jangmi_reading_race_books에서 isbn=NULL인 책 조회"""
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/jangmi_reading_race_books"
    params = {
        "select": "id,title,publisher",
        "isbn":   "is.null",
        "limit":  BATCH_SIZE,
        "offset": offset,
        "order":  "id.asc",
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
# ────────────────────────────────────────────────────────────────────


# ── 진행 저장/로드 ────────────────────────────────────────────────────
def load_progress() -> dict:
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {"done": 0, "found_lib4": 0, "found_google": 0, "skipped": 0}


def save_progress(progress: dict):
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)
# ────────────────────────────────────────────────────────────────────


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ SUPABASE_URL / SUPABASE_KEY 를 설정해주세요.")
        sys.exit(1)
    if not LIB_API_KEY:
        print("⚠️  LIB_API_KEY 없음 → Google Books API만 사용합니다.")

    print("=" * 60)
    print("  📚 장미도서관 리딩레이스 ISBN 수집 v2")
    print("=" * 60)
    print(f"  1순위: 도서관 정보나루 API {'✅' if LIB_API_KEY else '❌ (키 없음)'}")
    print(f"  2순위: Google Books API (폴백)")
    print(f"  요청 간격: {API_DELAY}초  |  배치 크기: {BATCH_SIZE}")
    print()

    # 대상 총 건수 확인
    try:
        count_url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/jangmi_reading_race_books"
        cr = requests.get(
            count_url,
            headers={**sb_headers(), "Prefer": "count=exact", "Range": "0-0"},
            params={"select": "id", "isbn": "is.null"},
            timeout=10,
        )
        m = re.search(r'/(\d+)', cr.headers.get("Content-Range", ""))
        total_target = int(m.group(1)) if m else "?"
    except Exception:
        total_target = "?"
    print(f"  조회 대상: {total_target}권")
    print()

    progress = load_progress()
    session_done = session_lib4 = session_google = session_skipped = 0

    found_prev = progress.get("found_lib4", 0) + progress.get("found_google", 0)
    print(f"  이전 진행: {progress['done']}권 처리 / ISBN {found_prev}건 수집")
    print()

    while True:
        try:
            books = fetch_books(0)  # isbn IS NULL 기준 → 처리 후 자동 제외
        except Exception as e:
            print(f"❌ Supabase 조회 오류: {e}")
            break

        if not books:
            print("  ✅ 모든 대상 처리 완료!")
            break

        for book in books:
            row_id    = book["id"]
            title     = str(book.get("title", "") or "").strip()
            publisher = str(book.get("publisher", "") or "").strip()

            total_so_far = progress["done"] + session_done + 1
            print(f"  [{total_so_far:4d}] {title[:30]:<30}", end="  ")
            sys.stdout.flush()

            if not title:
                print("— 제목 없음, 건너뜀")
                update_isbn(row_id, "NOT_FOUND")
                session_done += 1
                session_skipped += 1
                continue

            isbn   = None
            source = ""

            # 1순위: 도서관 정보나루
            if LIB_API_KEY:
                isbn = lookup_isbn_lib4(title, publisher)
                source = "정보나루"

            # 2순위: Google Books (폴백)
            if not isbn:
                time.sleep(0.3)
                isbn = lookup_isbn_google(title, publisher)
                source = "Google"

            if isbn:
                ok = update_isbn(row_id, isbn)
                print(f"✅ {isbn} [{source}]" if ok else f"⚠️  DB저장실패 ({isbn})")
                if source == "정보나루":
                    session_lib4 += 1
                else:
                    session_google += 1
            else:
                update_isbn(row_id, "NOT_FOUND")
                print("❌ 미발견 (NOT_FOUND 저장)")
                session_skipped += 1

            session_done += 1

            # SAVE_INTERVAL 권마다 중간 저장
            if session_done % SAVE_INTERVAL == 0:
                progress["done"]        += session_done
                progress["found_lib4"]   = progress.get("found_lib4", 0) + session_lib4
                progress["found_google"] = progress.get("found_google", 0) + session_google
                progress["skipped"]     += session_skipped
                save_progress(progress)
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
    progress["skipped"]      += session_skipped
    save_progress(progress)

    found_total = progress["found_lib4"] + progress["found_google"]
    print()
    print("=" * 60)
    print(f"  이번 세션: {session_done}권 / 정보나루 {session_lib4}건 / Google {session_google}건 / 미발견 {session_skipped}건")
    print(f"  누적 합계: {progress['done']}권 / ISBN {found_total}건")
    print(f"            (정보나루 {progress['found_lib4']} + Google {progress['found_google']})")
    print(f"  진행 파일: {PROGRESS_FILE}")
    print("=" * 60)
    print()
    print("  📊 확인 SQL:")
    print("  SELECT COUNT(*) FROM jangmi_reading_race_books WHERE isbn IS NOT NULL AND isbn != 'NOT_FOUND';")


if __name__ == "__main__":
    main()
