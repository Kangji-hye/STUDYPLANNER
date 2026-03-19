"""
장미도서관 리딩레이스 2단계 수집 스크립트
=====================================================
흐름:
  1. Supabase reading_race_books 에서 level='2' 책 목록 읽기
  2. 장미도서관 세션 초기화
  3. 각 책마다:
     - 제목으로 검색
     - 매칭된 행의 bib_seq 추출
     - 상세 페이지에서 청구기호 + 위치 + ISBN 수집
     - 소장 상태: ✅ 소장 / ⚠️ 소장(출판사불일치) / ❌ 미소장
  4. jangmi_reading_race_books 에 배치 upsert (level='2')

사용법:
  pip install requests beautifulsoup4 python-dotenv
  PYTHONIOENCODING=utf-8 python etc/장미_리딩레이스_2단계_수집.py
"""

import requests
from bs4 import BeautifulSoup
import time, re, sys, json, os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ============================================================
# 설정
# ============================================================
SUPABASE_URL   = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL", "")
SUPABASE_KEY   = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY", "")

JANGMI_BASE    = "https://roselib.winbook.kr"
SEARCH_URL     = f"{JANGMI_BASE}/front/bookSearch/simple/list"
DETAIL_URL     = f"{JANGMI_BASE}/front/bookSearch/detail/view"

DELAY          = 1.0   # 검색 요청 간격(초)
DETAIL_DELAY   = 0.5   # 상세 페이지 요청 간격(초)
SUPABASE_BATCH = 50

# 진행 상황 저장 파일 (중단 후 이어서 실행 가능)
PROGRESS_FILE  = "etc/isbn_장미_2단계_progress.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Referer": f"{JANGMI_BASE}/front/bookSearch/simple/formSearch",
}

# ──────────────────────────────────────────
# 텍스트 정규화 헬퍼
# ──────────────────────────────────────────
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

# ──────────────────────────────────────────
# Supabase 책 목록 로드
# ──────────────────────────────────────────
def load_books_from_supabase() -> list:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("SUPABASE_URL / SUPABASE_KEY 환경변수를 설정해 주세요.")
        sys.exit(1)

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/reading_race_books"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept": "application/json",
    }
    all_rows = []
    offset = 0
    while True:
        params = {
            "select": "book_no,title,author,publisher",
            "level": "eq.2",
            "order": "book_no.asc",
            "offset": str(offset),
            "limit": "1000",
        }
        resp = requests.get(url, headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        rows = resp.json()
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < 1000:
            break
        offset += 1000

    print(f"  Supabase에서 리딩레이스 2단계 {len(all_rows)}권 로드 완료")
    return all_rows

# ──────────────────────────────────────────
# 장미도서관 세션 초기화
# ──────────────────────────────────────────
def init_session() -> requests.Session:
    sess = requests.Session()
    sess.headers.update(HEADERS)
    try:
        resp = sess.get(f"{JANGMI_BASE}/front/main/main", timeout=20)
        resp.raise_for_status()
        print(f"  장미도서관 세션 초기화 완료 (쿠키: {len(sess.cookies)}개)")
    except Exception as e:
        print(f"  세션 초기화 실패 (계속 진행): {e}")
    return sess

# ──────────────────────────────────────────
# bib_seq 파싱
# ──────────────────────────────────────────
def parse_bib_seq(onclick_str: str):
    m = re.search(r"jsDetail\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)", onclick_str)
    if m:
        return m.group(1), m.group(2)
    return None

# ──────────────────────────────────────────
# 검색
# ──────────────────────────────────────────
def search_one(sess: requests.Session, title: str, publisher: str = "") -> dict:
    empty = {"소장": "X", "매칭방식": "", "bib_seq": "", "오류": ""}

    try:
        resp = sess.get(SEARCH_URL, params={"SC_KEYWORD_FIRST": title.strip()}, timeout=20)
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
    except requests.exceptions.ConnectionError:
        return {**empty, "소장": "오류", "오류": "연결실패"}
    except requests.exceptions.Timeout:
        return {**empty, "소장": "오류", "오류": "시간초과"}
    except Exception as e:
        return {**empty, "소장": "오류", "오류": str(e)[:60]}

    soup = BeautifulSoup(resp.text, "html.parser")
    text = soup.get_text()
    if "검색된 자료가 없" in text or "결과가 없" in text:
        return empty

    exact_matches = []
    title_only_matches = []

    for tr in soup.select("table tbody tr"):
        tds = tr.find_all("td")
        if len(tds) < 5:
            continue
        found_title = tds[2].get_text(strip=True) if len(tds) > 2 else ""
        found_pub   = tds[4].get_text(strip=True) if len(tds) > 4 else ""

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

        entry = {"bib_seq": bib_seq, "found_pub": found_pub}
        if publisher_match(publisher, found_pub):
            exact_matches.append(entry)
        else:
            title_only_matches.append(entry)

    if not exact_matches and not title_only_matches:
        return empty

    if exact_matches:
        best = exact_matches[0]
        match_mode = "제목+출판사"
    else:
        best = title_only_matches[0]
        match_mode = "제목만"

    return {"소장": "O", "매칭방식": match_mode, "bib_seq": best["bib_seq"], "오류": ""}

# ──────────────────────────────────────────
# 상세 페이지에서 청구기호 + 위치 + ISBN 추출
# ──────────────────────────────────────────
def fetch_detail(sess: requests.Session, bib_seq: str) -> dict:
    empty = {"청구기호": "", "위치": "", "isbn": ""}
    if not bib_seq:
        return empty

    try:
        resp = sess.get(DETAIL_URL, params={"bk_bib_seq": bib_seq}, timeout=20)
        if resp.status_code >= 400:
            return empty
        resp.encoding = resp.apparent_encoding or "utf-8"
    except Exception:
        return empty

    soup = BeautifulSoup(resp.text, "html.parser")
    full_text = soup.get_text(separator="\n")

    # 청구기호
    callno = ""
    m = re.search(
        r'(?:아동\s+|유아\s+|아\s+)?[0-9]{3}(?:\.[0-9]+)?[-\s][가-힣A-Za-z][가-힣A-Za-z0-9\-\.=]*',
        full_text
    )
    if m:
        callno = m.group().strip()

    # 위치
    location = ""
    for pat in [r'어린이자료실[^\n\r]*', r'자료실[^\n\r]*', r'서고[^\n\r]*']:
        lm = re.search(pat, full_text)
        if lm:
            location = lm.group().strip()[:50]
            break

    # ISBN: 978 또는 979 로 시작하는 13자리 숫자
    isbn = ""
    m_isbn = re.search(r'97[89][- ]?[0-9][- ]?[0-9]{2}[- ]?[0-9]{6}[- ]?[0-9]', full_text)
    if m_isbn:
        isbn = re.sub(r'[- ]', '', m_isbn.group())

    return {"청구기호": callno, "위치": location, "isbn": isbn}

# ──────────────────────────────────────────
# 소장 상태 문자열 생성
# ──────────────────────────────────────────
def build_library_status(search_result: dict) -> str:
    s  = search_result.get("소장", "")
    mm = search_result.get("매칭방식", "")
    if s == "O" and mm == "제목+출판사":
        return "✅ 소장"
    if s == "O":
        return "⚠️ 소장(출판사불일치)"
    if s == "오류":
        return "오류"
    return "❌ 미소장"

# ──────────────────────────────────────────
# 진행 상황 저장/로드
# ──────────────────────────────────────────
def load_progress() -> dict:
    try:
        with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def save_progress(progress: dict):
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)

# ──────────────────────────────────────────
# Supabase upsert
# ──────────────────────────────────────────
def upload_to_supabase(results: list):
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("SUPABASE_URL / SUPABASE_KEY 없음 — 업로드 건너뜀")
        return

    url = (
        f"{SUPABASE_URL.rstrip('/')}/rest/v1/jangmi_reading_race_books"
        "?on_conflict=book_no,level"
    )
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
            "book_no":        int(r["book_no"]),
            "level":          "2",
            "title":          str(r["title"]),
            "author":         str(r["author"]),
            "publisher":      str(r["publisher"]),
            "library_status": build_library_status(r),
            "callno":         str(r.get("청구기호", "")),
            "location":       str(r.get("위치", "")),
            "isbn":           str(r.get("isbn", "")),
        })

    if not rows:
        print("  업로드할 데이터 없음")
        return

    total = len(rows)
    print(f"\n  Supabase 업로드 시작 ({total}건)...")
    success = fail = 0
    for i in range(0, total, SUPABASE_BATCH):
        batch = rows[i: i + SUPABASE_BATCH]
        try:
            resp = requests.post(url, headers=headers, data=json.dumps(batch), timeout=30)
            if resp.status_code in (200, 201):
                success += len(batch)
                print(f"    [{i + len(batch)}/{total}] 업로드 완료")
            else:
                fail += len(batch)
                print(f"    [{i + len(batch)}/{total}] 오류 {resp.status_code}: {resp.text[:120]}")
        except Exception as e:
            fail += len(batch)
            print(f"    [{i + len(batch)}/{total}] 예외: {e}")
        time.sleep(0.3)

    print(f"  업로드 완료: 성공 {success}건 / 실패 {fail}건\n")

# ──────────────────────────────────────────
# 메인
# ──────────────────────────────────────────
def main():
    print("=" * 62)
    print("  장미도서관 리딩레이스 2단계 수집")
    print("=" * 62)

    books = load_books_from_supabase()
    total = len(books)
    print(f"  총 {total}권  |  예상 소요시간: 약 {total * DELAY / 60:.0f}분\n")

    # 이전 진행 상황 로드 (중단 후 이어서 실행)
    progress = load_progress()
    print(f"  이전 진행: {len(progress)}권 완료\n")

    sess = init_session()
    print()

    results = []
    found_exact = found_title_only = not_found = error_count = 0

    for i, book in enumerate(books):
        book_no   = int(book.get("book_no", i + 1))
        title     = str(book.get("title", "")).strip()
        author    = str(book.get("author", "")).strip()
        pub       = str(book.get("publisher", "")).strip()

        if not title:
            continue

        # 이미 처리된 항목은 건너뜀
        key = str(book_no)
        if key in progress:
            r = progress[key]
            r["book_no"] = book_no
            r["title"]   = title
            r["author"]  = author
            r["publisher"] = pub
            results.append(r)
            print(f"[{book_no:3d}/{total}] {title[:28]:<28}  (이전 결과 재사용)")
            continue

        print(f"[{book_no:3d}/{total}] {title[:28]:<28}", end="  ")
        sys.stdout.flush()

        res = search_one(sess, title, pub)

        # 소장된 경우 상세 페이지에서 청구기호 + ISBN 추출
        if res["소장"] == "O" and res.get("bib_seq"):
            time.sleep(DETAIL_DELAY)
            detail = fetch_detail(sess, res["bib_seq"])
            res["청구기호"] = detail["청구기호"]
            res["위치"]     = detail["위치"]
            res["isbn"]     = detail["isbn"]
        else:
            res["청구기호"] = ""
            res["위치"]     = ""
            res["isbn"]     = ""

        if res["소장"] == "O":
            mm  = res["매칭방식"]
            cn  = res["청구기호"][:15] if res["청구기호"] else "-"
            loc = res["위치"][:20] if res["위치"] else "-"
            isn = res["isbn"] if res["isbn"] else "-"
            if mm == "제목+출판사":
                found_exact += 1
                print(f"✅  {cn}  {loc}  ISBN:{isn}")
            else:
                found_title_only += 1
                print(f"⚠️   {cn}  {loc}  ISBN:{isn}  [출판사불일치]")
        elif res["소장"] == "오류":
            error_count += 1
            print(f"오류: {res['오류']}")
        else:
            not_found += 1
            print("미소장")

        row = {
            "book_no": book_no, "title": title,
            "author": author, "publisher": pub,
            **res,
        }
        results.append(row)

        # 진행 상황 저장
        progress[key] = {k: v for k, v in res.items()}
        save_progress(progress)

        time.sleep(DELAY)

    # Supabase 업로드
    upload_to_supabase(results)

    print("=" * 62)
    print(f"  소장(정확): {found_exact}권")
    print(f"  소장(출판사불일치): {found_title_only}권")
    print(f"  미소장: {not_found}권")
    if error_count:
        print(f"  오류: {error_count}권")
    print("=" * 62)


if __name__ == "__main__":
    main()
