"""
구성도서관 도서 일괄 검색 스크립트 v5 (최종 완성판)
=====================================================
핵심 변경: 모바일 검색 페이지 사용
  - 모바일 페이지는 청구기호·도서관·위치·대출상태가 JS 없이 정적 HTML로 제공됨
  - 각 결과 항목에서 "구성도서관" 포함 여부로 정확히 판별

사용법:
  1. pip install requests beautifulsoup4 openpyxl pandas
  2. 이 파일 + books_500.csv + 2학년_추천도서목록.html 같은 폴더에 두기
  3. python 구성도서관_검색스크립트_v5.py
"""

import requests
from bs4 import BeautifulSoup
import pandas as pd
import time, re, sys
from pathlib import Path

# ============ 설정 ============
INPUT_FILE   = "books_500.csv"
OUTPUT_EXCEL = "구성도서관_검색결과.xlsx"
OUTPUT_HTML  = "2학년_추천도서목록.html"
DELAY        = 1.5    # 요청 간격(초)
# ==============================

# ✅ 핵심: 모바일 검색 URL (정적 HTML로 소장정보 제공)
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


def title_match(search_title: str, found_title: str) -> bool:
    """검색 제목과 결과 제목이 충분히 일치하는지 확인"""
    # 특수문자/공백 제거 후 비교
    def clean(s):
        return re.sub(r'[\s\(\)\[\]\:\-\,\.·]', '', s.lower())
    
    s = clean(search_title)
    f = clean(found_title)
    
    # 정확히 일치하거나 한쪽이 다른 쪽을 포함하면 매칭
    if s in f or f in s:
        return True
    
    # 첫 5글자 이상 일치하면 같은 책으로 간주
    min_len = min(len(s), len(f))
    if min_len >= 5 and s[:min_len] == f[:min_len]:
        return True
    
    return False


def search_one(title: str) -> dict:
    """
    모바일 검색 페이지로 책 검색 후 구성도서관 소장 여부 반환.
    
    모바일 검색 결과 항목 예시:
      급류: 정대건 장편소설
      정대건 지음 / 민음사 / 2025
      813.7-정23ㄱ=2
      기흥도서관
      [기흥]제1종합자료실
      대출불가 (대출중)
    """
    empty = {"소장": "X", "소장수": 0, "청구기호": "", "위치": "", "대출상태": "", "오류": ""}

    try:
        resp = session.get(
            SEARCH_URL,
            params={
                "searchType": "SIMPLE",
                "searchKey": "TITLE",
                "searchKeyword": title.strip(),
                "searchRecordCount": "50",   # 최대 50개 결과
            },
            timeout=20
        )
        resp.raise_for_status()
        resp.encoding = "utf-8"
    except requests.exceptions.ConnectionError:
        return {**empty, "소장": "오류", "오류": "연결실패 - 인터넷 확인"}
    except requests.exceptions.Timeout:
        return {**empty, "소장": "오류", "오류": "시간초과"}
    except Exception as e:
        return {**empty, "소장": "오류", "오류": str(e)[:60]}

    soup = BeautifulSoup(resp.text, "html.parser")

    # ── 1. 전체 결과 수 확인 (결과 없으면 바로 X) ──────────────
    no_result = soup.find(string=re.compile(r"검색된\s*자료가\s*없|결과가\s*없"))
    if no_result:
        return empty

    # ── 2. 각 결과 항목 파싱 ────────────────────────────────────
    # 모바일 페이지 구조: <li> 또는 <div> 안에
    #   - 제목 텍스트
    #   - 청구기호 (숫자.숫자-한글 패턴)
    #   - 도서관명 (구성도서관, 기흥도서관, ...)
    #   - 자료실 위치 ([구성]어린이자료실, ...)
    #   - 대출상태 (대출가능, 대출중, ...)
    
    result_items = soup.select("li.item, div.item, ul.resultList li, .list_item, li")
    
    # li 태그로 못 찾으면 텍스트 기반 파싱으로 폴백
    if not result_items:
        result_items = soup.find_all(["li", "div"], class_=re.compile(r"item|result|book|list", re.I))

    guseong_results = []
    
    for item in result_items:
        item_text = item.get_text(separator="\n")
        
        # 구성도서관이 포함된 항목만 처리
        if "구성도서관" not in item_text:
            continue
        
        # 제목 추출 (첫 번째 줄 또는 <a>/<strong> 텍스트)
        item_title = ""
        title_tag = item.find(["a", "strong", "em"])
        if title_tag:
            item_title = title_tag.get_text(strip=True)
        else:
            lines = [l.strip() for l in item_text.split("\n") if l.strip()]
            if lines:
                item_title = lines[0]
        
        # 제목 일치 확인
        if item_title and not title_match(title, item_title):
            continue
        
        # 청구기호 추출
        callno = ""
        callno_match = re.search(
            r'(?:아\s+|유아\s+|아동\s+)?[0-9]{3}(?:\.[0-9]+)?[-\s][가-힣A-Za-z][가-힣A-Za-z0-9\-\.=]*',
            item_text
        )
        if callno_match:
            callno = callno_match.group().strip()
        
        # 자료실 위치 추출
        location = ""
        loc_match = re.search(r'\[구성\][^\n\r]+', item_text)
        if loc_match:
            location = loc_match.group().strip()
        
        # 대출상태 추출
        loan = ""
        if "대출가능" in item_text or "비치중" in item_text:
            loan = "대출가능"
        elif "대출중" in item_text or "대출불가" in item_text:
            loan = "대출중"
        elif "반납예정" in item_text:
            loan = "반납예정"
        elif "예약" in item_text:
            loan = "예약가능"
        
        guseong_results.append({
            "청구기호": callno,
            "위치": location,
            "대출상태": loan,
        })
    
    # ── 3. 항목 레벨에서 못 찾은 경우: 전체 텍스트에서 구성도서관 영역 파싱 ──
    if not guseong_results:
        # 전체 텍스트에서 "구성도서관" 앞뒤 영역 분석
        full_text = soup.get_text(separator="\n")
        lines = [l.strip() for l in full_text.split("\n") if l.strip()]
        
        # 구성도서관이 포함된 줄 위치 찾기
        guseong_lines = []
        for i, line in enumerate(lines):
            if line == "구성도서관" or ("[구성]" in line):
                guseong_lines.append(i)
        
        if not guseong_lines:
            return empty
        
        for idx in guseong_lines:
            # 이 항목의 제목이 검색한 책과 일치하는지 확인
            # 앞쪽 15줄에서 제목 탐색
            item_title_found = False
            for j in range(max(0, idx-15), idx):
                if title_match(title, lines[j]):
                    item_title_found = True
                    break
            
            if not item_title_found and guseong_lines:
                # 제목 매칭 실패해도 구성도서관이 명확히 있으면 소장으로 처리
                # (단, 제목이 전혀 없는 경우 제외)
                pass
            
            callno = ""
            for j in range(max(0, idx-10), idx):
                m = re.search(
                    r'(?:아\s+|유아\s+|아동\s+)?[0-9]{3}(?:\.[0-9]+)?[-\s][가-힣A-Za-z][가-힣A-Za-z0-9\-\.=]*',
                    lines[j]
                )
                if m:
                    callno = lines[j].strip()
                    break
            
            location = ""
            for j in range(idx, min(idx+5, len(lines))):
                if "[구성]" in lines[j]:
                    location = lines[j].strip()
                    break
            
            loan = ""
            for j in range(idx, min(idx+8, len(lines))):
                if "대출가능" in lines[j] or "비치중" in lines[j]:
                    loan = "대출가능"
                    break
                elif "대출중" in lines[j] or "대출불가" in lines[j]:
                    loan = "대출중"
                    break
                elif "반납예정" in lines[j]:
                    loan = "반납예정"
                    break
            
            guseong_results.append({
                "청구기호": callno,
                "위치": location,
                "대출상태": loan,
            })
    
    if not guseong_results:
        return empty
    
    # 첫 번째 구성도서관 결과 반환 (대출가능 우선)
    avail = [r for r in guseong_results if r["대출상태"] == "대출가능"]
    best = avail[0] if avail else guseong_results[0]
    
    return {
        "소장": "O",
        "소장수": len(guseong_results),
        "청구기호": best["청구기호"],
        "위치": best["위치"],
        "대출상태": best["대출상태"],
        "오류": "",
    }


def load_books():
    try:
        df = pd.read_csv(INPUT_FILE, encoding="utf-8-sig")
    except UnicodeDecodeError:
        df = pd.read_csv(INPUT_FILE, encoding="cp949")
    return df


def update_html(results: list):
    path = Path(OUTPUT_HTML)
    if not path.exists():
        return

    with open(path, encoding="utf-8") as f:
        html = f.read()

    tbody_s = html.find("<tbody")
    tbody_e = html.find("</tbody>") + 8
    if tbody_s == -1:
        return

    rows = []
    for r in results:
        t = str(r.get("책제목","")).replace("<","&lt;").replace(">","&gt;")
        a = str(r.get("작가","")).replace("<","&lt;").replace(">","&gt;")
        p = str(r.get("출판사","")).replace("<","&lt;").replace(">","&gt;")
        s = r.get("소장","")
        if s == "O":
            badge = '<span class="status yes">✅ 소장</span>'
        elif s == "X":
            badge = '<span class="status no">❌ 미소장</span>'
        elif s == "오류":
            badge = '<span class="status pending">⚠ 오류</span>'
        else:
            badge = '<span class="status pending">⏳ 확인중</span>'

        rows.append(
            f'    <tr><td>{r.get("번호","")}</td>'
            f'<td class="title">{t}</td><td>{a}</td><td>{p}</td>'
            f'<td>{badge}</td>'
            f'<td class="callno">{r.get("청구기호","")}</td>'
            f'<td class="location">{r.get("위치","")}</td>'
            f'<td class="loan">{r.get("대출상태","")}</td></tr>'
        )

    new_tbody = '<tbody id="tbody">\n' + "\n".join(rows) + "\n  </tbody>"
    html = html.replace(html[tbody_s:tbody_e], new_tbody)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print("  ✅ HTML 업데이트 완료")


def main():
    print("=" * 58)
    print("  📚 구성도서관 도서 일괄 검색 v5 (최종)")
    print("=" * 58)

    df    = load_books()
    total = len(df)
    mins  = total * DELAY / 60
    print(f"\n  총 {total}권  |  예상 소요시간: 약 {mins:.0f}분\n")

    results     = []
    found_count = 0
    error_count = 0

    for i, (_, row) in enumerate(df.iterrows()):
        num   = int(row.get("번호", i + 1))
        title = str(row.get("책제목", "")).strip()
        auth  = str(row.get("작가", "")).strip()
        pub   = str(row.get("출판사", "")).strip()

        if not title:
            continue

        print(f"[{num:3d}/{total}] {title[:30]:<30}", end="  ")
        sys.stdout.flush()

        res = search_one(title)

        if res["소장"] == "O":
            found_count += 1
            loc  = res["위치"][:18] if res["위치"] else "-"
            loan = res["대출상태"] or "-"
            cn   = res["청구기호"][:15] if res["청구기호"] else "-"
            print(f"✅ {cn}  {loc}  {loan}")
        elif res["소장"] == "오류":
            error_count += 1
            print(f"⚠  오류: {res['오류']}")
        else:
            print("❌ 미소장")

        results.append({"번호": num, "책제목": title, "작가": auth, "출판사": pub, **res})
        time.sleep(DELAY)

    # ── Excel ─────────────────────────────────────────
    df_all = pd.DataFrame(results)
    cols   = ["번호", "책제목", "작가", "출판사", "소장", "소장수", "청구기호", "위치", "대출상태", "오류"]
    for c in cols:
        if c not in df_all.columns:
            df_all[c] = ""
    df_yes = df_all[df_all["소장"] == "O"]
    df_no  = df_all[df_all["소장"] == "X"]

    with pd.ExcelWriter(OUTPUT_EXCEL, engine="openpyxl") as writer:
        df_all[cols].to_excel(writer, sheet_name="전체결과",       index=False)
        df_yes[cols].to_excel(writer, sheet_name="구성도서관_소장", index=False)
        df_no [cols].to_excel(writer, sheet_name="미소장도서",      index=False)

    # ── HTML ──────────────────────────────────────────
    update_html(results)

    not_found = total - found_count - error_count
    print("\n" + "=" * 58)
    print(f"  ✅ 완료!  소장: {found_count}권  미소장: {not_found}권", end="")
    if error_count:
        print(f"  오류: {error_count}권")
    else:
        print()
    print(f"  📊 {OUTPUT_EXCEL}")
    print(f"  🌐 {OUTPUT_HTML}")
    print("=" * 58)


if __name__ == "__main__":
    main()
