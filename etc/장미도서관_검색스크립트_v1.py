"""
장미도서관 도서 일괄 검색 스크립트 v1
=====================================================
장미도서관(roselib.winbook.kr) 소장 현황 조회

흐름:
  1. Supabase recommended_books 에서 전체 책 목록 읽기 (모든 grade_code)
  2. requests.Session() 으로 장미도서관 세션 초기화 (쿠키 획득)
  3. 각 책마다:
     - GET /front/bookSearch/simple/list?SC_KEYWORD_FIRST=<제목> 검색
     - 결과 테이블 파싱: table tbody tr > td (2=제목, 3=저자, 4=발행처)
     - title_match + publisher_match (구성도서관 v6 동일 로직)
     - 매칭된 행의 jsDetail('bib_seq','item_seq') onclick 파싱
     - GET /front/bookSearch/detail/view?bk_bib_seq=<bib_seq> 로 청구기호 추출
     - 상태: ✅ 소장 / ⚠️ 소장(출판사불일치) / ❌ 미소장
  4. jangmi_recommended_books 에 배치 upsert

사용법:
  pip install requests beautifulsoup4 python-dotenv
  PYTHONIOENCODING=utf-8 SUPABASE_URL=... SUPABASE_KEY=... python etc/장미도서관_검색스크립트_v1.py > etc/장미_실행결과.log 2>&1
"""

import requests
from bs4 import BeautifulSoup
import time, re, sys, json, os

# ============================================================
# ① Supabase 설정
# ============================================================
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# ============================================================
# ② 장미도서관 설정
# ============================================================
JANGMI_BASE  = "https://roselib.winbook.kr"
SEARCH_URL   = f"{JANGMI_BASE}/front/bookSearch/simple/list"
DETAIL_URL   = f"{JANGMI_BASE}/front/bookSearch/detail/view"
DELAY        = 1.0    # 검색 요청 간격(초)
DETAIL_DELAY = 0.5    # 상세 페이지 간격(초) — 매칭된 책만
SUPABASE_BATCH = 50
# ============================================================

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Referer": f"{JANGMI_BASE}/front/bookSearch/simple/formSearch",
}


# ──────────────────────────────────────────
# 텍스트 정규화 헬퍼 (v6에서 재사용)
# ──────────────────────────────────────────
def _clean(s: str) -> str:
    """특수문자·공백 제거 후 소문자 변환"""
    return re.sub(r'[\s\(\)\[\]\:\-\,\.·「」『』""\'\'《》〈〉]', '', str(s).lower())


def title_match(search_title: str, found_title: str) -> bool:
    """제목 유사 매칭 (포함 관계 또는 앞부분 일치)"""
    s = _clean(search_title)
    f = _clean(found_title)
    if not s or not f:
        return False
    if s in f or f in s:
        return True
    min_len = min(len(s), len(f))
    return min_len >= 5 and s[:min_len] == f[:min_len]


def publisher_match(expected_pub: str, found_pub: str) -> bool:
    """
    출판사 매칭:
      - 정규화 후 한쪽이 다른 쪽을 포함하면 매칭
      - 짧은 쪽이 3글자 미만이면 정확 일치 요구
    """
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
# Supabase 도서 목록 불러오기
# ──────────────────────────────────────────
def load_books_from_supabase() -> list:
    """Supabase recommended_books 테이블에서 전체 도서 목록 읽기"""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ SUPABASE_URL / SUPABASE_KEY 환경변수를 설정해 주세요.")
        sys.exit(1)

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/recommended_books"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept": "application/json",
    }

    all_rows = []
    offset = 0
    page_size = 1000

    while True:
        params = {
            "select": "book_no,grade_code,title,author,publisher",
            "order": "book_no.asc",
            "offset": str(offset),
            "limit": str(page_size),
        }
        try:
            resp = requests.get(url, headers=headers, params=params, timeout=30)
            resp.raise_for_status()
            rows = resp.json()
        except Exception as e:
            print(f"❌ Supabase 도서 목록 조회 실패: {e}")
            sys.exit(1)

        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size

    print(f"  📖 Supabase에서 {len(all_rows)}권 로드 완료")
    return all_rows


# ──────────────────────────────────────────
# 장미도서관 세션 초기화
# ──────────────────────────────────────────
def init_session() -> requests.Session:
    """장미도서관 세션 초기화 (쿠키 획득)"""
    sess = requests.Session()
    sess.headers.update(HEADERS)
    try:
        # 메인 페이지 접속으로 세션 쿠키 획득
        resp = sess.get(f"{JANGMI_BASE}/front/main/main", timeout=20)
        resp.raise_for_status()
        print(f"  🌐 장미도서관 세션 초기화 완료 (쿠키: {len(sess.cookies)}개)")
    except Exception as e:
        print(f"  ⚠️  세션 초기화 실패 (계속 진행): {e}")
    return sess


# ──────────────────────────────────────────
# 검색 + 파싱
# ──────────────────────────────────────────
def parse_bib_seq(onclick_str: str):
    """
    onclick="jsDetail('bib_seq','item_seq')" 에서 bib_seq 추출
    반환: (bib_seq, item_seq) 또는 None
    """
    m = re.search(r"jsDetail\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)", onclick_str)
    if m:
        return m.group(1), m.group(2)
    return None


def search_one(sess: requests.Session, title: str, publisher: str = "") -> dict:
    """
    장미도서관에서 책 검색.
    반환: {"소장": "O"|"X"|"오류", "매칭방식": "", "bib_seq": "", "청구기호": "", "위치": "", "오류": ""}
    """
    empty = {
        "소장": "X", "매칭방식": "",
        "bib_seq": "", "청구기호": "", "위치": "", "오류": ""
    }

    # ── 검색 요청 ──
    try:
        resp = sess.get(
            SEARCH_URL,
            params={"SC_KEYWORD_FIRST": title.strip()},
            timeout=20
        )
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
    except requests.exceptions.ConnectionError:
        return {**empty, "소장": "오류", "오류": "연결실패"}
    except requests.exceptions.Timeout:
        return {**empty, "소장": "오류", "오류": "시간초과"}
    except Exception as e:
        return {**empty, "소장": "오류", "오류": str(e)[:60]}

    soup = BeautifulSoup(resp.text, "html.parser")

    # 검색 결과 없음 확인
    no_result_text = soup.get_text()
    if "검색된 자료가 없" in no_result_text or "결과가 없" in no_result_text:
        return empty

    # ── 결과 테이블 파싱: table tbody tr > td ──
    # td 인덱스: 0=체크박스, 1=번호, 2=제목, 3=저자, 4=발행처, 5=발행연도, ...
    exact_matches = []    # 제목 + 출판사 모두 일치
    title_only_matches = []  # 제목만 일치

    rows = soup.select("table tbody tr")
    for tr in rows:
        tds = tr.find_all("td")
        if len(tds) < 5:
            continue

        # 제목 (td 인덱스 2)
        found_title = tds[2].get_text(strip=True) if len(tds) > 2 else ""
        # 저자 (td 인덱스 3)
        # found_author = tds[3].get_text(strip=True) if len(tds) > 3 else ""
        # 발행처 (td 인덱스 4)
        found_pub = tds[4].get_text(strip=True) if len(tds) > 4 else ""

        # 제목 매칭
        if not title_match(title, found_title):
            continue

        # onclick에서 bib_seq 추출 (제목 링크 또는 체크박스 등)
        bib_seq = ""
        for td in tds:
            for tag in td.find_all(onclick=True):
                parsed = parse_bib_seq(tag.get("onclick", ""))
                if parsed:
                    bib_seq = parsed[0]
                    break
            if bib_seq:
                break

        pub_ok = publisher_match(publisher, found_pub) if publisher else False

        entry = {"bib_seq": bib_seq, "found_pub": found_pub}
        if pub_ok:
            exact_matches.append(entry)
        else:
            title_only_matches.append(entry)

    if not exact_matches and not title_only_matches:
        return empty

    # 제목+출판사 일치 우선, 없으면 제목만 일치
    if exact_matches:
        best = exact_matches[0]
        match_mode = "제목+출판사"
    else:
        best = title_only_matches[0]
        match_mode = "제목만"

    return {
        "소장": "O",
        "매칭방식": match_mode,
        "bib_seq": best["bib_seq"],
        "청구기호": "",   # 상세 페이지에서 채움
        "위치": "",
        "오류": "",
    }


# ──────────────────────────────────────────
# 상세 페이지에서 청구기호·위치 추출
# ──────────────────────────────────────────
def fetch_detail(sess: requests.Session, bib_seq: str) -> dict:
    """
    /front/bookSearch/detail/view?bk_bib_seq=<bib_seq> 에서 청구기호·위치 추출.
    실패 시 빈 문자열 반환.
    """
    if not bib_seq:
        return {"청구기호": "", "위치": ""}

    try:
        resp = sess.get(
            DETAIL_URL,
            params={"bk_bib_seq": bib_seq},
            timeout=20
        )
        # 417 Expectation Failed 등 대비
        if resp.status_code >= 400:
            return {"청구기호": "", "위치": ""}
        resp.encoding = resp.apparent_encoding or "utf-8"
    except Exception:
        return {"청구기호": "", "위치": ""}

    soup = BeautifulSoup(resp.text, "html.parser")
    full_text = soup.get_text(separator="\n")

    # 청구기호 추출: 숫자로 시작하는 KDC 형식
    callno = ""
    m = re.search(
        r'(?:아동\s+|유아\s+|아\s+)?[0-9]{3}(?:\.[0-9]+)?[-\s][가-힣A-Za-z][가-힣A-Za-z0-9\-\.=]*',
        full_text
    )
    if m:
        callno = m.group().strip()

    # 위치: 자료실 정보 탐색
    location = ""
    loc_patterns = [
        r'어린이자료실[^\n\r]*',
        r'자료실[^\n\r]*',
        r'서고[^\n\r]*',
    ]
    for pat in loc_patterns:
        lm = re.search(pat, full_text)
        if lm:
            location = lm.group().strip()[:50]
            break

    return {"청구기호": callno, "위치": location}


# ──────────────────────────────────────────
# Supabase upsert
# ──────────────────────────────────────────
def build_library_status(search_result: dict) -> str:
    s = search_result.get("소장", "")
    mm = search_result.get("매칭방식", "")
    if s == "O" and mm == "제목+출판사":
        return "✅ 소장"
    if s == "O":
        return "⚠️ 소장(출판사불일치)"
    if s == "오류":
        return "오류"
    return "❌ 미소장"


def upload_to_supabase(results: list):
    """jangmi_recommended_books 테이블에 upsert"""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("\n  ⚠️  SUPABASE_URL / SUPABASE_KEY 가 설정되지 않아 업로드를 건너뜁니다.")
        return

    url = (
        f"{SUPABASE_URL.rstrip('/')}/rest/v1/jangmi_recommended_books"
        "?on_conflict=book_no,grade_code"
    )
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    rows_to_upload = []
    for r in results:
        if r.get("소장") == "오류":
            continue
        rows_to_upload.append({
            "book_no":        int(r.get("book_no", 0)),
            "grade_code":     int(r.get("grade_code", 2)),
            "title":          str(r.get("title", "")),
            "author":         str(r.get("author", "")),
            "publisher":      str(r.get("publisher", "")),
            "library_status": build_library_status(r),
            "callno":         str(r.get("청구기호", "")),
            "location":       str(r.get("위치", "")),
        })

    if not rows_to_upload:
        print("  업로드할 데이터가 없습니다.")
        return

    total = len(rows_to_upload)
    print(f"\n  📤 Supabase 업로드 시작 ({total}건)...")

    success = 0
    fail = 0
    for i in range(0, total, SUPABASE_BATCH):
        batch = rows_to_upload[i: i + SUPABASE_BATCH]
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


# ──────────────────────────────────────────
# 메인
# ──────────────────────────────────────────
def main():
    print("=" * 62)
    print("  📚 장미도서관 도서 일괄 검색 v1")
    print("=" * 62)

    # Supabase에서 도서 목록 로드
    books = load_books_from_supabase()
    total = len(books)
    mins = total * DELAY / 60
    print(f"\n  총 {total}권  |  예상 소요시간: 약 {mins:.0f}분\n")

    # 장미도서관 세션 초기화
    sess = init_session()
    print()

    results = []
    found_exact = 0     # 제목+출판사 일치
    found_title = 0     # 제목만 일치
    not_found = 0
    error_count = 0

    for i, book in enumerate(books):
        book_no   = int(book.get("book_no", i + 1))
        title     = str(book.get("title", "")).strip()
        author    = str(book.get("author", "")).strip()
        pub       = str(book.get("publisher", "")).strip()
        grade     = int(book.get("grade_code", 2))

        if not title:
            continue

        print(f"[{book_no:3d}/{total}] {title[:28]:<28}", end="  ")
        sys.stdout.flush()

        res = search_one(sess, title, pub)

        # 소장된 경우 상세 페이지에서 청구기호 추출
        if res["소장"] == "O" and res.get("bib_seq"):
            time.sleep(DETAIL_DELAY)
            detail = fetch_detail(sess, res["bib_seq"])
            res["청구기호"] = detail["청구기호"]
            res["위치"] = detail["위치"]

        if res["소장"] == "O":
            mm = res["매칭방식"]
            cn = res["청구기호"][:15] if res["청구기호"] else "-"
            loc = res["위치"][:20] if res["위치"] else "-"
            if mm == "제목+출판사":
                found_exact += 1
                print(f"✅ {cn}  {loc}")
            else:
                found_title += 1
                print(f"⚠️  {cn}  {loc}  [출판사불일치]")
        elif res["소장"] == "오류":
            error_count += 1
            print(f"❗ 오류: {res['오류']}")
        else:
            not_found += 1
            print("❌ 미소장")

        results.append({
            "book_no": book_no,
            "title": title,
            "author": author,
            "publisher": pub,
            "grade_code": grade,
            **res,
        })
        time.sleep(DELAY)

    # ── Supabase 업로드 ────────────────────────────────────
    upload_to_supabase(results)

    # ── 최종 요약 ──────────────────────────────────────────
    print("=" * 62)
    print(f"  ✅ 소장(정확): {found_exact}권")
    print(f"  ⚠️  소장(출판사불일치): {found_title}권  ← 현장 확인 필요")
    print(f"  ❌ 미소장: {not_found}권")
    if error_count:
        print(f"  ❗ 오류: {error_count}권")
    print("=" * 62)


if __name__ == "__main__":
    main()
