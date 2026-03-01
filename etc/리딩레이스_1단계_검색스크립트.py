"""
리딩레이스(드림스쿨) 2단계 도서 크롤링 + 구성도서관 검색 스크립트 v1
=====================================================
1. https://rd.dreamschool.or.kr/reading/certmain?field_id=&level=2&sc=regdate
   전체 페이지를 크롤링해서 책 제목/저자/출판사 추출
2. 구성도서관 소장 여부 및 청구기호 검색 (v6 로직 재활용)
3. Supabase reading_race_books 테이블에 upsert

사용법:
  1. pip install requests beautifulsoup4 pandas python-dotenv
  2. 이 파일을 실행
  3. 아래 SUPABASE_URL / SUPABASE_KEY 입력 (또는 .env 파일)
"""

import requests
from bs4 import BeautifulSoup
import time, re, sys, json, os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# ── 설정 ──────────────────────────────────────────
READING_RACE_BASE = "https://rd.dreamschool.or.kr/reading/certmain"
LEVEL             = 1
LIBRARY_DELAY     = 1.5    # 구성도서관 검색 요청 간격(초)
CRAWL_DELAY       = 0.5    # 리딩레이스 페이지 요청 간격(초)
SUPABASE_BATCH    = 50
# ──────────────────────────────────────────────────

LIBRARY_SEARCH_URL = "https://lib.yongin.go.kr/mobile/guseong/search/plusSearchResultList.do"

HEADERS_LIBRARY = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
                  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": "https://lib.yongin.go.kr/guseong/index.do",
}

HEADERS_RACE = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}

lib_session = requests.Session()
lib_session.headers.update(HEADERS_LIBRARY)


# ──────────────────────────────────────────────────
# 텍스트 정규화
# ──────────────────────────────────────────────────
def _clean(s: str) -> str:
    return re.sub(r'[\s\(\)\[\]\:\-\,\.·「」『』""''《》〈〉]', '', str(s).lower())


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


def _extract_loan_status(text: str) -> str:
    if "대출가능" in text or "비치중" in text:
        return "대출가능"
    if "대출중" in text or "대출불가" in text:
        return "대출중"
    if "반납예정" in text:
        return "반납예정"
    return ""


# ──────────────────────────────────────────────────
# 구성도서관 검색 (v6 로직)
# ──────────────────────────────────────────────────
def search_library(title: str, publisher: str = "") -> dict:
    empty = {"소장": "X", "library_status": "❌ 미소장", "callno": "", "location": "", "매칭방식": "", "오류": ""}

    try:
        resp = lib_session.get(
            LIBRARY_SEARCH_URL,
            params={"searchType": "SIMPLE", "searchKey": "TITLE",
                    "searchKeyword": title.strip(), "searchRecordCount": "50"},
            timeout=20
        )
        resp.raise_for_status()
        resp.encoding = "utf-8"
    except requests.exceptions.ConnectionError:
        return {**empty, "소장": "오류", "오류": "연결실패"}
    except requests.exceptions.Timeout:
        return {**empty, "소장": "오류", "오류": "시간초과"}
    except Exception as e:
        return {**empty, "소장": "오류", "오류": str(e)[:60]}

    soup = BeautifulSoup(resp.text, "html.parser")

    if soup.find(string=re.compile(r"검색된\s*자료가\s*없|결과가\s*없")):
        return empty

    result_items = soup.select("li.item, div.item, ul.resultList li, .list_item, li")
    if not result_items:
        result_items = soup.find_all(["li", "div"], class_=re.compile(r"item|result|book|list", re.I))

    exact_matches = []
    title_only_matches = []

    for item in result_items:
        item_text = item.get_text(separator="\n")
        if "구성도서관" not in item_text:
            continue

        item_title = ""
        title_tag = item.find(["a", "strong", "em"])
        if title_tag:
            item_title = title_tag.get_text(strip=True)
        else:
            lines = [l.strip() for l in item_text.split("\n") if l.strip()]
            if lines:
                item_title = lines[0]

        if item_title and not title_match(title, item_title):
            continue

        found_pub = extract_publisher_from_text(item_text)
        pub_ok = publisher_match(publisher, found_pub) if publisher else False

        callno = ""
        m = re.search(
            r'(?:아\s+|유아\s+|아동\s+)?[0-9]{3}(?:\.[0-9]+)?[-\s][가-힣A-Za-z][가-힣A-Za-z0-9\-\.=]*',
            item_text
        )
        if m:
            callno = m.group().strip()

        location = ""
        loc_m = re.search(r'\[구성\][^\n\r]+', item_text)
        if loc_m:
            location = loc_m.group().strip()

        loan = _extract_loan_status(item_text)
        entry = {"callno": callno, "location": location, "대출상태": loan, "출판사_매칭": found_pub}

        if pub_ok:
            exact_matches.append(entry)
        else:
            title_only_matches.append(entry)

    # 폴백
    if not exact_matches and not title_only_matches:
        full_text = soup.get_text(separator="\n")
        lines = [l.strip() for l in full_text.split("\n") if l.strip()]
        guseong_idxs = [i for i, l in enumerate(lines) if l == "구성도서관" or "[구성]" in l]

        for idx in guseong_idxs:
            context_lines = lines[max(0, idx - 15): idx]
            ctx_text = "\n".join(context_lines)
            title_ok = any(title_match(title, l) for l in context_lines)
            if not title_ok:
                continue

            found_pub = extract_publisher_from_text(ctx_text)
            pub_ok = publisher_match(publisher, found_pub) if publisher else False

            callno = ""
            for l in reversed(context_lines[-10:]):
                m = re.search(
                    r'(?:아\s+|유아\s+|아동\s+)?[0-9]{3}(?:\.[0-9]+)?[-\s][가-힣A-Za-z][가-힣A-Za-z0-9\-\.=]*', l
                )
                if m:
                    callno = l.strip()
                    break

            location = ""
            for l in lines[idx: min(idx + 5, len(lines))]:
                if "[구성]" in l:
                    location = l.strip()
                    break

            loan = _extract_loan_status("\n".join(lines[idx: min(idx + 8, len(lines))]))
            entry = {"callno": callno, "location": location, "대출상태": loan, "출판사_매칭": found_pub}
            if pub_ok:
                exact_matches.append(entry)
            else:
                title_only_matches.append(entry)

    if not exact_matches and not title_only_matches:
        return empty

    if exact_matches:
        pool = exact_matches
        match_mode = "제목+출판사"
    else:
        pool = title_only_matches
        match_mode = "제목만"

    avail = [r for r in pool if r["대출상태"] == "대출가능"]
    best = avail[0] if avail else pool[0]

    if match_mode == "제목+출판사":
        lib_status = "✅ 소장"
    else:
        lib_status = "⚠️ 소장(출판사확인필요)"

    return {
        "소장": "O",
        "library_status": lib_status,
        "callno": best["callno"],
        "location": best["location"],
        "매칭방식": match_mode,
        "오류": "",
    }


# ──────────────────────────────────────────────────
# 리딩레이스 사이트 크롤링
# ──────────────────────────────────────────────────
def crawl_page(page: int) -> list:
    url = READING_RACE_BASE
    params = {"field_id": "", "level": LEVEL, "sc": "regdate", "p": page}
    try:
        resp = requests.get(url, params=params, headers=HEADERS_RACE, timeout=20)
        resp.encoding = "utf-8"
    except Exception as e:
        print(f"  페이지 {page} 오류: {e}")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    books = []

    for box in soup.select(".book-box"):
        # 제목
        title_tag = box.select_one(".title a")
        if not title_tag:
            continue
        title = title_tag.get_text(strip=True)

        # book_id (URL에서 추출)
        href = title_tag.get("href", "")
        book_id_m = re.search(r'book_id=(\d+)', href)
        book_id = int(book_id_m.group(1)) if book_id_m else None

        # No. 번호
        no_tag = box.select_one(".book-no")
        book_no = None
        if no_tag:
            no_m = re.search(r'\d+', no_tag.get_text())
            if no_m:
                book_no = int(no_m.group())

        # info-item 파싱
        info_items = box.select(".info-item")
        text_items = [i for i in info_items
                      if not i.find("label") and "level" not in i.get("class", [])]

        author    = text_items[0].get_text(strip=True) if len(text_items) > 0 else ""
        publisher = text_items[1].get_text(strip=True) if len(text_items) > 1 else ""

        # 단계
        level_tag = box.select_one(".info-item.level")
        level_text = level_tag.get_text(strip=True) if level_tag else f"{LEVEL}단계"

        # 쪽수
        pages = None
        for item in info_items:
            t = item.get_text(strip=True)
            if "쪽" in t:
                pg_m = re.search(r'(\d+)', t)
                if pg_m:
                    pages = int(pg_m.group(1))

        books.append({
            "book_id": book_id,
            "book_no": book_no,
            "title": title,
            "author": author,
            "publisher": publisher,
            "level": level_text,
            "pages": pages,
        })

    return books


def get_total_pages(soup=None) -> int:
    if soup is None:
        resp = requests.get(READING_RACE_BASE,
                            params={"field_id": "", "level": LEVEL, "sc": "regdate", "p": 1},
                            headers=HEADERS_RACE, timeout=20)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")

    # 페이지 링크에서 최대 페이지 번호 추출
    page_links = soup.select("a[href*='p=']")
    max_page = 1
    for link in page_links:
        href = link.get("href", "")
        m = re.search(r'p=(\d+)', href)
        if m:
            max_page = max(max_page, int(m.group(1)))
    return max_page


# ──────────────────────────────────────────────────
# Supabase 업로드
# ──────────────────────────────────────────────────
def upload_to_supabase(results: list):
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("\n  ⚠️  SUPABASE 설정 없음 — 업로드 건너뜀")
        return

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/reading_race_books?on_conflict=book_id"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    rows = []
    for r in results:
        if r.get("소장") == "오류":
            continue
        rows.append({
            "book_id":        r["book_id"],
            "book_no":        r["book_no"],
            "title":          r["title"],
            "author":         r["author"],
            "publisher":      r["publisher"],
            "level":          r["level"],
            "pages":          r["pages"],
            "library_status": r["library_status"],
            "callno":         r["callno"],
            "location":       r["location"],
        })

    total = len(rows)
    print(f"\n  📤 Supabase 업로드 시작 ({total}건)...")
    success = fail = 0

    for i in range(0, total, SUPABASE_BATCH):
        batch = rows[i: i + SUPABASE_BATCH]
        try:
            resp = requests.post(url, headers=headers, data=json.dumps(batch), timeout=30)
            if resp.status_code in (200, 201):
                success += len(batch)
                print(f"    [{i + len(batch)}/{total}] ✅ 업로드 완료")
            else:
                fail += len(batch)
                print(f"    [{i + len(batch)}/{total}] ❌ 오류 {resp.status_code}: {resp.text[:120]}")
        except Exception as e:
            fail += len(batch)
            print(f"    [{i + len(batch)}/{total}] ❌ 예외: {e}")
        time.sleep(0.3)

    print(f"  📤 업로드 완료: 성공 {success}건 / 실패 {fail}건\n")


# ──────────────────────────────────────────────────
# 메인
# ──────────────────────────────────────────────────
def main():
    print("=" * 62)
    print("  📚 리딩레이스 2단계 도서 크롤링 + 구성도서관 검색 v1")
    print("=" * 62)

    # 전체 페이지 수 확인
    total_pages = get_total_pages()
    print(f"\n  총 {total_pages}페이지 크롤링 시작...\n")

    # 1단계: 리딩레이스 사이트 전체 크롤링
    all_books = []
    for page in range(1, total_pages + 1):
        books = crawl_page(page)
        all_books.extend(books)
        print(f"  페이지 {page:2d}/{total_pages} — {len(books)}권 수집 (누적 {len(all_books)}권)")
        time.sleep(CRAWL_DELAY)

    print(f"\n  크롤링 완료: 총 {len(all_books)}권\n")

    # 중복 제거 (book_id 기준)
    seen = set()
    unique_books = []
    for b in all_books:
        if b["book_id"] not in seen:
            seen.add(b["book_id"])
            unique_books.append(b)

    total = len(unique_books)
    mins = total * LIBRARY_DELAY / 60
    print(f"  구성도서관 검색 시작: {total}권 | 예상 {mins:.0f}분\n")

    # 2단계: 구성도서관 검색
    results = []
    found_exact = found_title = not_found = error_count = 0

    for i, book in enumerate(unique_books):
        title = book["title"]
        pub   = book["publisher"]
        print(f"[{i+1:3d}/{total}] {title[:28]:<28}", end="  ")
        sys.stdout.flush()

        res = search_library(title, pub)

        if res["소장"] == "O":
            mm = res["매칭방식"]
            cn = res["callno"][:15] if res["callno"] else "-"
            loc = res["location"][:16] if res["location"] else "-"
            if mm == "제목+출판사":
                found_exact += 1
                print(f"✅ {cn}  {loc}")
            else:
                found_title += 1
                print(f"⚠️  {cn}  {loc}  [출판사불일치]")
        elif res["소장"] == "오류":
            error_count += 1
            print(f"❗ {res['오류']}")
        else:
            not_found += 1
            print("❌ 미소장")

        results.append({**book, **res})
        time.sleep(LIBRARY_DELAY)

    # 3단계: Supabase 업로드
    upload_to_supabase(results)

    print("=" * 62)
    print(f"  ✅ 소장(정확): {found_exact}권")
    print(f"  ⚠️  소장(출판사불일치): {found_title}권")
    print(f"  ❌ 미소장: {not_found}권")
    if error_count:
        print(f"  ❗ 오류: {error_count}권")
    print("=" * 62)


if __name__ == "__main__":
    main()
