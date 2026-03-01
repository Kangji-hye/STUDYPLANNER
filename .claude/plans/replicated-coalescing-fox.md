# Context
BookScanner.jsx에서 도서관 정보나루 API 키를 사용자가 매번 직접 입력해야 하는 불편함이 있음.
Vercel 환경 변수로 키를 설정하면 모든 사용자가 자동으로 사용 가능.

# 변경 내용

## 1. BookScanner.jsx — fetchBookInfo 함수 수정
`import.meta.env.VITE_LIB_APIKEY`를 localStorage 키보다 우선 사용하도록 fallback 순서 변경:

```
우선순위:
1. localStorage의 lib_apikey (사용자가 직접 입력한 경우)
2. import.meta.env.VITE_LIB_APIKEY (Vercel 환경 변수)
3. Google Books API (키 없을 때 폴백)
```

수정 위치: `src/pages/BookScanner.jsx` — `fetchBookInfo` 함수 내
```js
const apiKey = localStorage.getItem("lib_apikey") || import.meta.env.VITE_LIB_APIKEY || "";
```

## 2. Vercel 대시보드에서 환경 변수 추가 (사용자가 직접)
- Vercel 프로젝트 → Settings → Environment Variables
- Key: `VITE_LIB_APIKEY`
- Value: (API 키 값)
- Environment: Production, Preview, Development 모두 체크
- 저장 후 Redeploy

# 검증
배포 후 아이폰 사파리에서 바코드 스캔 → 책 정보 자동 조회 확인
