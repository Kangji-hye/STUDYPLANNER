"""
장미도서관 × 리딩레이스 2단계 / 3단계 수집 스크립트
=====================================================
- 드림스쿨에서 책 목록 크롤링 (2단계 또는 3단계)
- 장미도서관(roselib.winbook.kr) 소장 여부 / 청구기호 수집
- Supabase jangmi_reading_race_books 테이블에 upsert

사용법:
  python 장미_리딩레이스_2_3단계_수집.py 2   ← 2단계
  python 장미_리딩레이스_2_3단계_수집.py 3   ← 3단계
  python 장미_리딩레이스_2_3단계_수집.py     ← 2단계 (기본값)
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

# 실행 인자로 레벨 지정 (기본값 2)
LEVEL = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] in ("2", "3") else 2

READING_RACE_BASE = "https://rd.dreamschool.or.kr/reading/certmain"
JANGMI_BASE       = "https://roselib.winbook.kr"
SEARCH_URL        = f"{JANGMI_BASE}/front/bookSearch/simple/list"
DETAIL_URL        = f"{JANGMI_BASE}/front/bookSearch/detail/view"

CRAWL_DELAY   = 0.5
DETAIL_DELAY  = 0.5
LIBRARY_DELAY = 1.0
SUPABASE_BATCH = 50

HEADERS_RACE = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}
HEADERS_JANGMI = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Referer": f"{JANGMI_BASE}/front/bookSearch/simple/formSearch",
}

jangmi_session = requests.Session()
jangmi_session.headers.update(HEADERS_JANGMI)


# ── 세션 초기화 ───────────────────────────────────────────────
def init_jangmi_session():
    try:
        jangmi_session.get(f"{JANGMI_BASE}/front/main/main", timeout=20)
    except Exception:
        pass


# ── 헬퍼 ─────────────────────────────────────────────────────
def _clean(s):
    return re.sub(r'[\s\(\)\[\]\:\-\,\.·「」『』""\'\'《》〈〉]', '', str(s).lower())

def simplify_title(title):
    short = re.sub(r'\s*[\(\[].*', '', title).strip()
    return short if short else title

def title_match(search_title, found_title):
    s = _clean(search_title)
    f = _clean(found_title)
    if not s or not f:
        return False
    if s in f or f in s:
        return True
    min_len = min(len(s), len(f))
    return min_len >= 5 and s[:min_len] == f[:min_len]

def publisher_match(expected_pub, found_pub):
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


# ── 장미도서관 검색 ───────────────────────────────────────────
def parse_bib_seq(onclick_str):
    m = re.search(r"jsDetail\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)", onclick_str)
    return (m.group(1), m.group(2)) if m else None

def fetch_detail(bib_seq):
    """상세 페이지에서 청구기호 추출"""
    if not bib_seq:
        return ""
    try:
        resp = jangmi_session.get(DETAIL_URL,
                                  params={"bk_bib_seq": bib_seq}, timeout=20)
        if resp.status_code >= 400:
            return ""
        resp.encoding = resp.apparent_encoding or "utf-8"
    except Exception:
        return ""

    full_text = BeautifulSoup(resp.text, "html.parser").get_text(separator="\n")
    m = re.search(
        r'(?:아동\s+|유아\s+|아\s+)?[0-9]{3}(?:\.[0-9]+)?[-\s][가-힣A-Za-z][가-힣A-Za-z0-9\-\.=]*',
        full_text
    )
    return m.group().strip() if m else ""

def _do_search(keyword):
    try:
        resp = jangmi_session.get(SEARCH_URL,
                                  params={"SC_KEYWORD_FIRST": keyword.strip()},
                                  timeout=20)
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
        return BeautifulSoup(resp.text, "html.parser")
    except Exception:
        return None

def _parse_matches(soup, title, publisher):
    exact_matches = []
    title_only_matches = []
    full_text = soup.get_text()
    if "검색된 자료가 없" in full_text or "결과가 없" in full_text:
        return exact_matches, title_only_matches
    for tr in soup.select("table tbody tr"):
        tds = tr.find_all("td")
        if len(tds) < 4:
            continue
        found_title = tds[1].get_text(strip=True)
        found_pub   = tds[3].get_text(strip=True)
        if not title_match(title, found_title):
            continue
        bib_seq = ""
        for td in tds:
            for tag in td.find_all(onclick=True):
                parsed = parse_bib_seq(tag.get("onclick", ""))
                if parsed:
                    bib_seq = parsed[0]
                    break
            if bib_seq:
                break
        entry = {"bib_seq": bib_seq}
        if publisher_match(publisher, found_pub):
            exact_matches.append(entry)
        else:
            title_only_matches.append(entry)
    return exact_matches, title_only_matches

def search_jangmi(title, publisher=""):
    empty = {"소장": "X", "library_status": "❌ 미소장", "callno": ""}

    keywords = [title]
    short = simplify_title(title)
    if short != title:
        keywords.append(short)

    exact_matches = []
    title_only_matches = []

    for kw in keywords:
        soup = _do_search(kw)
        if soup is None:
            return {**empty, "소장": "오류"}
        exact_matches, title_only_matches = _parse_matches(soup, title, publisher)
        if exact_matches or title_only_matches:
            break

    if not exact_matches and not title_only_matches:
        return empty

    if exact_matches:
        lib_status = "✅ 소장"
        best = exact_matches[0]
    else:
        lib_status = "⚠️ 소장(출판사불일치)"
        best = title_only_matches[0]

    time.sleep(DETAIL_DELAY)
    callno = fetch_detail(best["bib_seq"])

    return {"소장": "O", "library_status": lib_status, "callno": callno}


# ── 드림스쿨 크롤링 ──────────────────────────────────────────
def crawl_page(page):
    params = {"field_id": "", "level": LEVEL, "sc": "regdate", "p": page}
    try:
        resp = requests.get(READING_RACE_BASE, params=params,
                            headers=HEADERS_RACE, timeout=20)
        resp.encoding = "utf-8"
    except Exception as e:
        print(f"  페이지 {page} 오류: {e}")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    books = []
    for box in soup.select(".book-box"):
        title_tag = box.select_one(".title a")
        if not title_tag:
            continue
        title = title_tag.get_text(strip=True)
        href = title_tag.get("href", "")
        book_id_m = re.search(r'book_id=(\d+)', href)
        book_id = int(book_id_m.group(1)) if book_id_m else None

        no_tag = box.select_one(".book-no")
        book_no = None
        if no_tag:
            no_m = re.search(r'\d+', no_tag.get_text())
            if no_m:
                book_no = int(no_m.group())

        info_items = box.select(".info-item")
        text_items = [i for i in info_items
                      if not i.find("label") and "level" not in i.get("class", [])]
        author    = text_items[0].get_text(strip=True) if len(text_items) > 0 else ""
        publisher = text_items[1].get_text(strip=True) if len(text_items) > 1 else ""

        level_tag = box.select_one(".info-item.level")
        level_text = level_tag.get_text(strip=True) if level_tag else f"{LEVEL}단계"

        pages = None
        for item in info_items:
            t = item.get_text(strip=True)
            if "쪽" in t:
                pg_m = re.search(r'(\d+)', t)
                if pg_m:
                    pages = int(pg_m.group(1))

        books.append({
            "book_id": book_id, "book_no": book_no,
            "title": title, "author": author, "publisher": publisher,
            "level": level_text, "pages": pages,
        })
    return books

def get_total_pages():
    resp = requests.get(READING_RACE_BASE,
                        params={"field_id": "", "level": LEVEL, "sc": "regdate", "p": 1},
                        headers=HEADERS_RACE, timeout=20)
    resp.encoding = "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")
    max_page = 1
    for link in soup.select("a[href*='p=']"):
        m = re.search(r'p=(\d+)', link.get("href", ""))
        if m:
            max_page = max(max_page, int(m.group(1)))
    return max_page


# ── Supabase 업로드 ───────────────────────────────────────────
def upload_to_supabase(results):
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("\n  ⚠️  SUPABASE 설정 없음 — 업로드 건너뜀")
        return

    url = (f"{SUPABASE_URL.rstrip('/')}/rest/v1/jangmi_reading_race_books"
           "?on_conflict=book_id")
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
            "level":          str(LEVEL),
            "pages":          r["pages"],
            "library_status": r["library_status"],
            "callno":         r.get("callno", ""),
            "location":       "",
        })

    total = len(rows)
    print(f"\n  📤 Supabase 업로드 ({total}건)...")
    success = fail = 0
    for i in range(0, total, SUPABASE_BATCH):
        batch = rows[i: i + SUPABASE_BATCH]
        try:
            resp = requests.post(url, headers=headers,
                                 data=json.dumps(batch), timeout=30)
            if resp.status_code in (200, 201):
                success += len(batch)
                print(f"    [{i + len(batch)}/{total}] ✅")
            else:
                fail += len(batch)
                print(f"    [{i + len(batch)}/{total}] ❌ {resp.status_code}: {resp.text[:120]}")
        except Exception as e:
            fail += len(batch)
            print(f"    [{i + len(batch)}/{total}] ❌ 예외: {e}")
        time.sleep(0.3)
    print(f"  완료: 성공 {success}건 / 실패 {fail}건\n")


# ── 메인 ─────────────────────────────────────────────────────
def main():
    print("=" * 62)
    print(f"  📚 장미도서관 × 리딩레이스 {LEVEL}단계 수집")
    print("=" * 62)

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ SUPABASE_URL / SUPABASE_KEY 가 설정되지 않았어요.")
        sys.exit(1)

    print("  장미도서관 세션 초기화 중...")
    init_jangmi_session()

    total_pages = get_total_pages()
    print(f"\n  총 {total_pages}페이지 크롤링 시작...\n")

    all_books = []
    for page in range(1, total_pages + 1):
        books = crawl_page(page)
        all_books.extend(books)
        print(f"  페이지 {page:2d}/{total_pages} — {len(books)}권 수집 (누적 {len(all_books)}권)")
        time.sleep(CRAWL_DELAY)

    # 중복 제거
    seen = set()
    unique_books = []
    for b in all_books:
        if b["book_id"] not in seen:
            seen.add(b["book_id"])
            unique_books.append(b)

    total = len(unique_books)
    print(f"\n  크롤링 완료: {total}권")
    print(f"  장미도서관 검색 시작 | 예상 {total * LIBRARY_DELAY / 60:.0f}분\n")

    results = []
    found_exact = found_title = not_found = error_count = 0

    for i, book in enumerate(unique_books):
        title = book["title"]
        pub   = book["publisher"]
        print(f"[{i+1:4d}/{total}] {title[:28]:<28}", end="  ")
        sys.stdout.flush()

        res = search_jangmi(title, pub)
        status = res["library_status"]

        if res["소장"] == "오류":
            error_count += 1
            print("❗ 오류")
        elif "미소장" in status:
            not_found += 1
            print("❌ 미소장")
        elif res["소장"] == "O":
            if "출판사불일치" in status:
                found_title += 1
                print(f"⚠️  {res.get('callno', '-')}")
            else:
                found_exact += 1
                print(f"✅ {res.get('callno', '-')}")

        results.append({**book, **res})
        time.sleep(LIBRARY_DELAY)

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
