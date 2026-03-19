"""
청구기호 재수집 스크립트
==============================================
- recommended_books 에서 callno 가 있는 책(소장 중)만 대상
- 정규식을 개선해서 아 388.1-미293ㅈ-3=2 같이 잘리던 부분을 완전히 수집
- 수집 후 Supabase callno 컬럼 업데이트

사용법:
  1. .env 파일에 SUPABASE_URL, SUPABASE_KEY 설정
  2. python 청구기호_재수집.py
"""

import requests
from bs4 import BeautifulSoup
import time, re, sys, json, os

try:
    from dotenv import load_dotenv
    # 현재 폴더 또는 한 단계 위(프로젝트 루트)의 .env 파일을 자동으로 찾아 읽음
    _here = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(_here, ".env"))           # etc/.env
    load_dotenv(os.path.join(_here, "..", ".env"))     # 프로젝트 루트/.env
except ImportError:
    pass

# VITE_ 접두어 포함 이름도 함께 확인 (둘 중 하나라도 있으면 사용)
SUPABASE_URL = (os.getenv("SUPABASE_URL")
                or os.getenv("VITE_SUPABASE_URL", ""))
SUPABASE_KEY = (os.getenv("SUPABASE_KEY")
                or os.getenv("VITE_SUPABASE_ANON_KEY", ""))

DELAY = 1.5           # 요청 간격(초)
SUPABASE_BATCH = 50   # 한 번에 업로드할 행 수

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


# ── 헬퍼 함수 ────────────────────────────────────────────────
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


def extract_publisher_from_text(item_text: str) -> str:
    lines = [l.strip() for l in item_text.split("\n") if l.strip()]
    for i, line in enumerate(lines):
        if re.fullmatch(r'\[?\d{4}\]?\.?', line):
            if i > 0:
                candidate = re.sub(r'[：:]$', '', lines[i - 1]).strip()
                if 1 <= len(candidate) <= 40 and not re.fullmatch(r'\d+', candidate):
                    return candidate
    return ""


def extract_callno_from_soup(item) -> str:
    """
    BeautifulSoup item(div.bookData)에서 청구기호 추출.
    실제 HTML 구조:
      <div class="book_info barList info02">
        <div>
          <p>출판사</p>
          <p>연도</p>
          <p>아 808.9-비295ㄱ-48</p>  ← 세 번째 p가 청구기호
        </div>
      </div>
    """
    info02 = item.find("div", class_=lambda c: c and "info02" in c)
    if info02:
        ps = info02.find_all("p")
        if len(ps) >= 3:
            return ps[2].get_text(strip=True)
    return ""


def _extract_loan_status(text: str) -> str:
    if "대출가능" in text or "비치중" in text:
        return "대출가능"
    if "대출중" in text or "대출불가" in text:
        return "대출중"
    if "반납예정" in text:
        return "반납예정"
    if "예약" in text:
        return "예약가능"
    return ""


# ── 검색 함수 ────────────────────────────────────────────────
def search_callno(title: str, publisher: str = "") -> str:
    """책 제목으로 검색해서 청구기호만 반환. 못 찾으면 빈 문자열."""
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
        return ""

    soup = BeautifulSoup(resp.text, "html.parser")

    if soup.find(string=re.compile(r"검색된\s*자료가\s*없|결과가\s*없")):
        return ""

    # 실제 구조: div.bookData > div.book_dataInner
    result_items = soup.find_all("div", class_="bookData")

    exact_callno = ""
    title_only_callno = ""

    for item in result_items:
        item_text = item.get_text(separator="\n")

        # 구성도서관 소장인지 확인 (info03에 도서관명 있음)
        info03 = item.find("div", class_=lambda c: c and "info03" in c)
        if not info03 or "구성도서관" not in info03.get_text():
            continue

        # 제목 매칭 — div.book_name > a
        book_name_div = item.find("div", class_="book_name")
        item_title = book_name_div.get_text(strip=True) if book_name_div else ""

        if item_title and not title_match(title, item_title):
            continue

        # 출판사 매칭 — info02의 첫 번째 <p>
        info02 = item.find("div", class_=lambda c: c and "info02" in c)
        found_pub = ""
        if info02:
            ps = info02.find_all("p")
            if ps:
                found_pub = ps[0].get_text(strip=True)
        pub_ok = publisher_match(publisher, found_pub) if publisher else False

        # 청구기호 — info02의 세 번째 <p>
        callno = extract_callno_from_soup(item)

        if not callno:
            continue

        if pub_ok and not exact_callno:
            exact_callno = callno   # 제목+출판사 일치 → 최우선
        elif not title_only_callno:
            title_only_callno = callno  # 제목만 일치 → 폴백

    return exact_callno or title_only_callno


# ── 구성도서관 소장 여부만 확인 ──────────────────────────────
def book_exists_in_guseong(title: str) -> bool:
    """제목으로 검색해서 구성도서관에 한 건이라도 있으면 True"""
    try:
        resp = session.get(
            SEARCH_URL,
            params={
                "searchType": "SIMPLE",
                "searchKey": "TITLE",
                "searchKeyword": title.strip(),
                "searchRecordCount": "10",
            },
            timeout=20
        )
        resp.raise_for_status()
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")
        for book in soup.find_all("div", class_="bookData"):
            info03 = book.find("div", class_=lambda c: c and "info03" in c)
            if info03 and "구성도서관" in info03.get_text():
                return True
        return False
    except Exception:
        return True  # 오류 시 섣불리 미소장으로 바꾸지 않음


# ── Supabase에서 소장 책 목록 조회 ───────────────────────────
def fetch_owned_books():
    """callno 가 있는 책 = 소장 중인 책만 가져옴"""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ SUPABASE_URL / SUPABASE_KEY 가 설정되지 않았어요.")
        sys.exit(1)

    url = (f"{SUPABASE_URL.rstrip('/')}/rest/v1/recommended_books"
           f"?select=book_no,grade_code,title,publisher,callno"
           f"&callno=neq.&order=grade_code.asc,book_no.asc"
           f"&limit=1000")
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json()


# ── Supabase callno 업데이트 ──────────────────────────────────
def upload_callnos(updates: list):
    """
    updates = [{"book_no": 139, "grade_code": 2, "callno": "아 388.1-미293ㅈ-3=2"}, ...]
    """
    if not updates:
        print("  업로드할 데이터가 없어요.")
        return

    url = (f"{SUPABASE_URL.rstrip('/')}/rest/v1/recommended_books"
           f"?on_conflict=book_no,grade_code")
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    total = len(updates)
    success = 0
    fail = 0
    print(f"\n  📤 Supabase 업로드 시작 ({total}건)...")
    for i in range(0, total, SUPABASE_BATCH):
        batch = updates[i: i + SUPABASE_BATCH]
        try:
            resp = requests.post(url, headers=headers,
                                 data=json.dumps(batch), timeout=30)
            if resp.status_code in (200, 201):
                success += len(batch)
                print(f"    [{i + len(batch)}/{total}] ✅")
            else:
                fail += len(batch)
                print(f"    [{i + len(batch)}/{total}] ❌ {resp.status_code}: {resp.text[:100]}")
        except Exception as e:
            fail += len(batch)
            print(f"    [{i + len(batch)}/{total}] ❌ 예외: {e}")
        time.sleep(0.3)

    print(f"  📤 완료: 성공 {success}건 / 실패 {fail}건\n")


# ── 메인 ─────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  📚 청구기호 재수집 (소장 도서만)")
    print("=" * 60)

    books = fetch_owned_books()
    total = len(books)
    print(f"\n  대상: {total}권  |  예상 소요: 약 {total * DELAY / 60:.0f}분\n")

    updates = []       # callno 업데이트
    not_owned = []     # 미소장으로 바꿀 것
    changed = 0
    unchanged = 0
    failed = 0

    for i, book in enumerate(books):
        no    = book["book_no"]
        grade = book["grade_code"]
        title = book["title"]
        pub   = book.get("publisher", "")
        old_callno = book.get("callno", "")

        print(f"[{i+1:3d}/{total}] {title[:28]:<28}", end="  ")
        sys.stdout.flush()

        new_callno = search_callno(title, pub)

        if not new_callno:
            # 구성도서관에 없는지 한 번 더 확인 (제목만으로 재검색)
            is_really_gone = not book_exists_in_guseong(title)
            if is_really_gone:
                failed += 1
                print(f"❌ 미소장 확인 → library_status 업데이트 (기존 callno: {old_callno})")
                not_owned.append({
                    "book_no":        no,
                    "grade_code":     grade,
                    "library_status": "❌ 미소장",
                    "callno":         "",
                    "location":       "",
                })
            else:
                failed += 1
                print(f"❓ 못찾음-제목불일치 (기존: {old_callno})")
        elif new_callno == old_callno:
            unchanged += 1
            print(f"✓  변화없음: {new_callno}")
        else:
            changed += 1
            print(f"✅ {old_callno!r:20s} → {new_callno!r}")
            updates.append({
                "book_no":    no,
                "grade_code": grade,
                "callno":     new_callno,
            })

        time.sleep(DELAY)

    # DB 업로드
    upload_callnos(updates)
    if not_owned:
        upload_callnos(not_owned)
        print(f"  📤 미소장 업데이트: {len(not_owned)}건")

    print("=" * 60)
    print(f"  ✅ 변경됨: {changed}권")
    print(f"  ✓  변화없음: {unchanged}권")
    print(f"  ❓ 못찾음: {failed}권")
    print("=" * 60)


if __name__ == "__main__":
    main()
