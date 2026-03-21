# 사진 번역기 (PhotoTranslate) 구현 계획

## Context
플래너 푸터 및 햄버거 메뉴에서 접근 가능한 "📸 사진 번역기" 페이지를 추가한다.
초등학생이 영어 교재·학습지 사진을 찍으면 OCR로 텍스트를 추출하고 한국어로 번역해주는 기능.
Tesseract.js(OCR, 무료) + MyMemory API(번역, 무료, 키 불필요)를 사용해 비용 없이 구현한다.

---

## 설치

```bash
npm install tesseract.js
```

---

## 구현 파일 목록

| 파일 | 작업 |
|------|------|
| `src/pages/PhotoTranslate.jsx` | 신규 생성 |
| `src/pages/PhotoTranslate.css` | 신규 생성 |
| `src/App.jsx` | import + Route 추가 |
| `src/components/common/HamburgerMenu.jsx` | 메뉴 항목 추가 |
| `src/pages/Planner.jsx` | 푸터 링크 추가 |

---

## 1. PhotoTranslate.jsx 구조

### 상태
```js
const [imgSrc, setImgSrc] = useState(null);       // 미리보기 이미지 URL
const [ocrText, setOcrText] = useState("");        // 인식된 영어 원문 (textarea, 수정 가능)
const [translated, setTranslated] = useState(""); // 번역 결과
const [ocrProgress, setOcrProgress] = useState(0); // OCR 진행률 0~100
const [status, setStatus] = useState("idle");      // idle | ocring | translating | done | error
const [errorMsg, setErrorMsg] = useState("");
```

### 플로우
1. 이미지 선택 (`<input type="file" accept="image/*">`) → imgSrc 설정 → OCR 자동 시작
2. OCR: `Tesseract.recognize(file, "eng", { logger })` → ocrText 설정 → 번역 자동 시작
3. 번역: MyMemory API 호출 (500자 초과 시 청크 분할) → translated 설정
4. 오류 처리: 각 단계 try/catch → errorMsg 표시

### MyMemory API 호출
```js
// 500자씩 청크 분할 번역
const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|ko`;
const res = await fetch(url);
const data = await res.json();
// data.responseData.translatedText
```

### 이미지 리사이즈 (성능 최적화)
- canvas로 최대 1200px 리사이즈 후 OCR에 전달
- Tesseract Worker는 useEffect cleanup에서 `worker.terminate()` 호출
- `let alive = true` 패턴으로 언마운트 후 setState 방지

### UI 구조 (Dictation.jsx 헤더 패턴 그대로 사용)
```
<div className="photoPage">
  <div className="photoHeader">
    <div className="photoHeaderLeft"><button>← 뒤로</button></div>
    <div className="photoHeaderCenter"><div className="photoTitle">📸 사진 번역기</div></div>
    <div className="photoHeaderRight"><HamburgerMenu /></div>
  </div>

  {/* 이미지 업로드 영역 */}
  <div className="photoUploadArea"> ... </div>
  <input type="file" accept="image/*" ... /> (갤러리)
  <input type="file" accept="image/*" capture="environment" ... /> (카메라)

  {/* OCR 진행률 */}
  {status === "ocring" && <div className="photoProgress">...</div>}

  {/* 인식된 원문 */}
  {ocrText && <textarea className="photoOcrText" ... />}
  <button onClick={retranslate}>재번역</button>

  {/* 번역 결과 */}
  {translated && <div className="photoResult">...</div>}

  {/* 다시 번역하기(초기화) */}
  <button onClick={reset}>🔄 다시 번역하기</button>
</div>
```

---

## 2. App.jsx 수정

### import 추가 (기존 직접 import 패턴 유지)
```jsx
import PhotoTranslate from "./pages/PhotoTranslate";
```

### Route 추가 (ProtectedRoute만, GameGuard 불필요)
```jsx
<Route
  path="/photo-translate"
  element={
    <ProtectedRoute>
      <PhotoTranslate />
    </ProtectedRoute>
  }
/>
```
**위치**: `/dictation` Route 바로 아래

---

## 3. HamburgerMenu.jsx 수정

"📷 책 스캐너" 버튼 바로 위에 추가:
```jsx
<button onClick={() => { navigate("/photo-translate"); onClose?.(); }}>
  📸 사진 번역기
</button>
```

---

## 4. Planner.jsx 푸터 수정

"🌐구글번역"과 "❓도움말" 사이에 추가:
```jsx
<span>|</span>
<a
  className="footer-link-secondary"
  onClick={() => navigate("/photo-translate")}
  role="button"
  title="사진 번역기"
>
  📸사진번역
</a>
```

---

## 검증 방법

1. `npm run dev` 실행
2. 플래너 푸터 "📸사진번역" 클릭 → `/photo-translate` 진입 확인
3. 햄버거 메뉴 "📸 사진 번역기" 클릭 → 동일 페이지 이동 확인
4. 갤러리에서 영어 텍스트 있는 이미지 선택 → OCR 진행률 표시 후 원문 추출 확인
5. 번역 결과 한국어로 표시 확인
6. "재번역" 버튼으로 원문 수정 후 재번역 확인
7. "🔄 다시 번역하기" 버튼으로 초기화 확인
8. 모바일에서 카메라 버튼 동작 확인
