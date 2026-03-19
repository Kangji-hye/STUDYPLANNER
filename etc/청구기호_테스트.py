"""
청구기호 HTML 구조 테스트 스크립트
'꽃을 좋아하는 소 페르디난드' 검색 후 HTML 구조 출력
"""

import requests
from bs4 import BeautifulSoup

SEARCH_URL = "https://lib.yongin.go.kr/mobile/guseong/search/plusSearchResultList.do"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
                  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    "Accept-Language": "ko-KR,ko;q=0.9",
}

resp = requests.get(
    SEARCH_URL,
    params={
        "searchType": "SIMPLE",
        "searchKey": "TITLE",
        "searchKeyword": "할머니의 편지",
        "searchRecordCount": "10",
    },
    headers=HEADERS,
    timeout=20,
)
resp.encoding = "utf-8"
soup = BeautifulSoup(resp.text, "html.parser")

# 1. callnum 클래스 태그 찾기
print("=== <span class='callnum'> 검색 ===")
tags = soup.find_all(class_="callnum")
for t in tags:
    print(repr(t))

# 2. 808.9 텍스트 주변 HTML 출력
print("\n=== '808.9' 포함된 태그 주변 ===")
for tag in soup.find_all(string=lambda s: s and "808.9" in s):
    print("텍스트:", repr(tag))
    print("부모태그:", tag.parent)
    print()

# 3. 할머니의 편지 검색 결과 구조 확인
print("=== 할머니의 편지 검색 결과 ===")
for book in soup.find_all("div", class_="bookData"):
    text = book.get_text()
    book_name_div = book.find("div", class_="book_name")
    item_title = book_name_div.get_text(strip=True) if book_name_div else ""
    info03 = book.find("div", class_=lambda c: c and "info03" in c)
    lib = info03.get_text(strip=True) if info03 else ""
    info02 = book.find("div", class_=lambda c: c and "info02" in c)
    ps = info02.find_all("p") if info02 else []
    callno = ps[2].get_text(strip=True) if len(ps) >= 3 else "없음"
    print(f"제목: {item_title[:40]}")
    print(f"도서관: {lib[:30]}")
    print(f"청구기호: {callno}")
    print()
