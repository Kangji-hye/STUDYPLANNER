"""
구성도서관 도서 일괄 검색 스크립트 v6
=====================================================
v6 변경사항:
  - 제목 + 출판사 동시 매칭 → 청구기호 정확도 대폭 향상
  - 검색 완료 후 Supabase recommended_books 테이블 자동 upsert
  - grade_code 컬럼 지원 (CSV에 grade_code 열이 없으면 기본값 2 사용)

사용법:
  1. pip install requests beautifulsoup4 pandas python-dotenv
  2. 이 파일 + books_500.csv 같은 폴더에 두기
  3. 아래 SUPABASE_URL / SUPABASE_KEY 입력 (또는 .env 파일에 작성)
  4. python 구성도서관_검색스크립트_v6.py
"""

import requests
from bs4 import BeautifulSoup
import pandas as pd
import time, re, sys, json, os

# ============================================================
# ① Supabase 설정 (직접 입력하거나 .env 파일에 작성)
#    .env 파일 형식:
#      SUPABASE_URL=https://xxxx.supabase.co
#      SUPABASE_KEY=eyJhbGci...
# ============================================================
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv 없어도 직접 입력값으로 동작

SUPABASE_URL = os.getenv("SUPABASE_URL", "")   # ← 직접 입력 가능
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")   # ← anon key

# ============================================================
# ② 검색 설정
# ============================================================
INPUT_FILE    = "books_500.csv"
DEFAULT_GRADE = 2          # CSV에 grade_code 컬럼 없을 때 기본값
DELAY         = 1.5        # 요청 간격(초)
SUPABASE_BATCH = 50        # Supabase upsert 한 번에 보낼 행 수
# ============================================================

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


# ──────────────────────────────────────────
# 텍스트 정규화 헬퍼
# ──────────────────────────────────────────
def _clean(s: str) -> str:
    """특수문자·공백 제거 후 소문자 변환"""
    return re.sub(r'[\s\(\)\[\]\:\-\,\.·「」『』""''《》〈〉]', '', str(s).lower())


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


def extract_publisher_from_text(item_text: str) -> str:
    """
    모바일 검색결과 텍스트에서 출판사 추출.
    실제 HTML 구조: "출판사\n연도\n청구기호\n구성도서관" (줄바꿈 구분)
    연도 패턴(\d{4} 또는 [\d{4}]) 바로 앞 줄을 출판사로 인식.
    """
    lines = [l.strip() for l in item_text.split("\n") if l.strip()]
    for i, line in enumerate(lines):
        # 연도 패턴: 2024, [2020], [2015]. 등
        if re.fullmatch(r'\[?\d{4}\]?\.?', line):
            if i > 0:
                candidate = re.sub(r'[：:]$', '', lines[i - 1]).strip()
                # 너무 길거나 숫자만이면 제외
                if 1 <= len(candidate) <= 40 and not re.fullmatch(r'\d+', candidate):
                    return candidate
    return ""


# ──────────────────────────────────────────
# 핵심 검색 함수
# ──────────────────────────────────────────
def search_one(title: str, publisher: str = "") -> dict:
    """
    모바일 검색 페이지로 책 검색.
    제목 + 출판사 모두 일치하는 항목의 청구기호를 우선 반환.
    출판사가 일치하는 항목이 없으면 제목만 일치하는 항목으로 폴백.
    """
    empty = {
        "소장": "X", "소장수": 0,
        "청구기호": "", "위치": "", "대출상태": "",
        "매칭방식": "", "오류": ""
    }

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
    except requests.exceptions.ConnectionError:
        return {**empty, "소장": "오류", "오류": "연결실패"}
    except requests.exceptions.Timeout:
        return {**empty, "소장": "오류", "오류": "시간초과"}
    except Exception as e:
        return {**empty, "소장": "오류", "오류": str(e)[:60]}

    soup = BeautifulSoup(resp.text, "html.parser")

    if soup.find(string=re.compile(r"검색된\s*자료가\s*없|결과가\s*없")):
        return empty

    # 검색결과 항목 파싱
    result_items = soup.select("li.item, div.item, ul.resultList li, .list_item, li")
    if not result_items:
        result_items = soup.find_all(["li", "div"],
                                     class_=re.compile(r"item|result|book|list", re.I))

    # 구성도서관 소장 항목 수집
    # exact_match = 제목+출판사 모두 일치
    # title_only  = 제목만 일치
    exact_matches = []
    title_only_matches = []

    for item in result_items:
        item_text = item.get_text(separator="\n")
        if "구성도서관" not in item_text:
            continue

        # 제목 추출
        item_title = ""
        title_tag = item.find(["a", "strong", "em"])
        if title_tag:
            item_title = title_tag.get_text(strip=True)
        else:
            lines = [l.strip() for l in item_text.split("\n") if l.strip()]
            if lines:
                item_title = lines[0]

        if item_title and not title_match(title, item_title):
            continue  # 제목 불일치 → 건너뜀

        # 출판사 추출
        found_pub = extract_publisher_from_text(item_text)
        pub_ok = publisher_match(publisher, found_pub) if publisher else False

        # 청구기호
        callno = ""
        m = re.search(
            r'(?:아\s+|유아\s+|아동\s+)?[0-9]{3}(?:\.[0-9]+)?[-\s][가-힣A-Za-z][가-힣A-Za-z0-9\-\.=]*',
            item_text
        )
        if m:
            callno = m.group().strip()

        # 위치
        location = ""
        loc_m = re.search(r'\[구성\][^\n\r]+', item_text)
        if loc_m:
            location = loc_m.group().strip()

        # 대출상태
        loan = _extract_loan_status(item_text)

        entry = {
            "청구기호": callno,
            "위치": location,
            "대출상태": loan,
            "출판사_매칭": found_pub,
        }

        if pub_ok:
            exact_matches.append(entry)
        else:
            title_only_matches.append(entry)

    # ── 항목 레벨 파싱 실패 시 전체 텍스트 폴백 ──────────────
    if not exact_matches and not title_only_matches:
        exact_matches, title_only_matches = _fallback_parse(
            soup, title, publisher
        )

    if not exact_matches and not title_only_matches:
        return empty

    # 제목+출판사 일치 우선, 없으면 제목만 일치
    if exact_matches:
        pool = exact_matches
        match_mode = "제목+출판사"
    else:
        pool = title_only_matches
        match_mode = "제목만"

    # 대출가능 우선 선택
    avail = [r for r in pool if r["대출상태"] == "대출가능"]
    best = avail[0] if avail else pool[0]

    return {
        "소장": "O",
        "소장수": len(pool),
        "청구기호": best["청구기호"],
        "위치": best["위치"],
        "대출상태": best["대출상태"],
        "매칭방식": match_mode,
        "오류": "",
    }


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


def _fallback_parse(soup, title: str, publisher: str):
    """전체 텍스트에서 구성도서관 위치 기반으로 파싱"""
    full_text = soup.get_text(separator="\n")
    lines = [l.strip() for l in full_text.split("\n") if l.strip()]

    guseong_idxs = [i for i, l in enumerate(lines)
                    if l == "구성도서관" or "[구성]" in l]
    if not guseong_idxs:
        return [], []

    exact, title_only = [], []

    for idx in guseong_idxs:
        # 앞쪽 15줄에서 제목·출판사 탐색
        context_lines = lines[max(0, idx - 15): idx]
        ctx_text = "\n".join(context_lines)

        title_ok = any(title_match(title, l) for l in context_lines)
        if not title_ok:
            continue

        found_pub = extract_publisher_from_text(ctx_text)
        pub_ok = publisher_match(publisher, found_pub) if publisher else False

        # 청구기호
        callno = ""
        for l in reversed(context_lines[-10:]):
            m = re.search(
                r'(?:아\s+|유아\s+|아동\s+)?[0-9]{3}(?:\.[0-9]+)?[-\s][가-힣A-Za-z][가-힣A-Za-z0-9\-\.=]*',
                l
            )
            if m:
                callno = l.strip()
                break

        # 위치
        location = ""
        for l in lines[idx: min(idx + 5, len(lines))]:
            if "[구성]" in l:
                location = l.strip()
                break

        # 대출상태
        loan = _extract_loan_status("\n".join(lines[idx: min(idx + 8, len(lines))]))

        entry = {"청구기호": callno, "위치": location, "대출상태": loan, "출판사_매칭": found_pub}
        if pub_ok:
            exact.append(entry)
        else:
            title_only.append(entry)

    return exact, title_only


# ──────────────────────────────────────────
# CSV 로드
# ──────────────────────────────────────────
def load_books():
    for enc in ("utf-8-sig", "cp949"):
        try:
            return pd.read_csv(INPUT_FILE, encoding=enc)
        except UnicodeDecodeError:
            continue
    raise RuntimeError(f"{INPUT_FILE} 을 읽을 수 없습니다.")


# ──────────────────────────────────────────
# Supabase upsert
# ──────────────────────────────────────────
def build_library_status(row: dict) -> str:
    """소장 여부와 매칭 방식으로 library_status 문자열 생성"""
    s = row.get("소장", "")
    mm = row.get("매칭방식", "")
    if s == "O" and mm == "제목+출판사":
        return "✅ 소장"
    if s == "O":
        return "⚠️ 소장(출판사확인필요)"
    if s == "오류":
        return "오류"
    return "❌ 미소장"


def upload_to_supabase(results: list):
    """
    Supabase recommended_books 테이블에 upsert.
    upsert 기준: book_no + grade_code (복합 unique key 필요)
    업데이트 대상 컬럼: library_status, callno, location, loan_status
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("\n  ⚠️  SUPABASE_URL / SUPABASE_KEY 가 설정되지 않아 업로드를 건너뜁니다.")
        print("     스크립트 상단 또는 .env 파일에 값을 입력하세요.\n")
        return

    # book_no + grade_code 복합 unique key 기준 upsert
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/recommended_books?on_conflict=book_no,grade_code"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",  # upsert
    }

    # 업로드용 행 생성 (오류 행 제외)
    rows_to_upload = []
    for r in results:
        if r.get("소장") == "오류":
            continue
        rows_to_upload.append({
            "book_no":        int(r.get("번호", 0)),
            "grade_code":     int(r.get("grade_code", DEFAULT_GRADE)),
            "title":          str(r.get("책제목", "")),
            "author":         str(r.get("작가", "")),
            "publisher":      str(r.get("출판사", "")),
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
        time.sleep(0.3)  # Supabase rate-limit 방지

    print(f"  📤 업로드 완료: 성공 {success}건 / 실패 {fail}건\n")


# ──────────────────────────────────────────
# 메인
# ──────────────────────────────────────────
def main():
    print("=" * 62)
    print("  📚 구성도서관 도서 일괄 검색 v6 (제목+출판사 매칭)")
    print("=" * 62)

    df = load_books()
    total = len(df)
    mins = total * DELAY / 60
    print(f"\n  총 {total}권  |  예상 소요시간: 약 {mins:.0f}분\n")

    results = []
    found_exact = 0    # 제목+출판사 일치
    found_title = 0    # 제목만 일치
    not_found = 0
    error_count = 0

    for i, (_, row) in enumerate(df.iterrows()):
        num   = int(row.get("번호", i + 1))
        title = str(row.get("책제목", "")).strip()
        auth  = str(row.get("작가", "")).strip()
        pub   = str(row.get("출판사", "")).strip()
        grade = int(row.get("grade_code", DEFAULT_GRADE))

        if not title:
            continue

        print(f"[{num:3d}/{total}] {title[:28]:<28}", end="  ")
        sys.stdout.flush()

        res = search_one(title, pub)

        if res["소장"] == "O":
            mm = res["매칭방식"]
            cn = res["청구기호"][:15] if res["청구기호"] else "-"
            loc = res["위치"][:16] if res["위치"] else "-"
            loan = res["대출상태"] or "-"
            if mm == "제목+출판사":
                found_exact += 1
                print(f"✅ {cn}  {loc}  [{loan}]")
            else:
                found_title += 1
                print(f"⚠️  {cn}  {loc}  [출판사불일치] {loan}")
        elif res["소장"] == "오류":
            error_count += 1
            print(f"❗ 오류: {res['오류']}")
        else:
            not_found += 1
            print("❌ 미소장")

        results.append({
            "번호": num, "책제목": title, "작가": auth,
            "출판사": pub, "grade_code": grade, **res
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
