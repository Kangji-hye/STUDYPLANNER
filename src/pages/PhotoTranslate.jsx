// src/pages/PhotoTranslate.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import "./PhotoTranslate.css";

// 이미지를 최대 1200px로 리사이즈하여 canvas Blob으로 반환 (OCR 성능 최적화)
function resizeImage(file, maxPx = 1200) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // 원본이 충분히 작으면 그냥 반환
      if (img.width <= maxPx && img.height <= maxPx) {
        resolve(file);
        return;
      }

      // 비율 유지하며 축소
      const ratio = Math.min(maxPx / img.width, maxPx / img.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.9);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // 실패 시 원본 그대로 사용
    };

    img.src = url;
  });
}

// MyMemory API로 영어 → 한국어 번역 (500자 청크 분할)
async function translateText(text) {
  if (!text.trim()) return "";

  // 500자씩 청크로 분할
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 500));
    remaining = remaining.slice(500);
  }

  const results = [];
  for (const chunk of chunks) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|ko`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("번역 서버에 연결할 수 없어요.");
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (!translated) throw new Error("번역 결과를 받지 못했어요.");
    results.push(translated);
  }

  return results.join(" ");
}

export default function PhotoTranslate() {
  const navigate = useNavigate();

  const [imgSrc, setImgSrc] = useState(null);        // 미리보기 이미지 URL
  const [ocrText, setOcrText] = useState("");         // 인식된 영어 원문 (수정 가능)
  const [translated, setTranslated] = useState("");  // 번역 결과
  const [ocrProgress, setOcrProgress] = useState(0); // OCR 진행률 0~100
  const [status, setStatus] = useState("idle");       // idle | ocring | translating | done | error
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedOcr, setCopiedOcr] = useState(false);
  const [copiedTrans, setCopiedTrans] = useState(false);

  const galleryRef = useRef(null);  // 갤러리 파일 input
  const cameraRef = useRef(null);   // 카메라 파일 input
  const workerRef = useRef(null);   // Tesseract worker

  // 페이지 진입 시 카메라 자동 열기
  useEffect(() => {
    const timer = setTimeout(() => {
      cameraRef.current?.click();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // 컴포넌트 언마운트 시 Tesseract worker 정리
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate().catch(() => {});
        workerRef.current = null;
      }
    };
  }, []);

  // OCR 실행 함수
  const runOcr = useCallback(async (file) => {
    let alive = true;

    try {
      setStatus("ocring");
      setOcrProgress(0);
      setOcrText("");
      setTranslated("");
      setErrorMsg("");

      // 이미지 리사이즈
      const resized = await resizeImage(file);

      // Tesseract.js — 동적 import (코드 스플리팅)
      const { createWorker } = await import("tesseract.js");

      const worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (!alive) return;
          if (m.status === "recognizing text") {
            setOcrProgress(Math.round((m.progress ?? 0) * 100));
          }
        },
      });

      workerRef.current = worker;

      const { data } = await worker.recognize(resized);
      await worker.terminate();
      workerRef.current = null;

      if (!alive) return;

      const text = (data?.text ?? "").trim();

      if (!text) {
        setStatus("error");
        setErrorMsg("영어 글자를 찾지 못했어요. 더 밝고 선명하게 찍어볼까요?");
        return;
      }

      setOcrText(text);
      setOcrProgress(100);

      // 번역 자동 시작
      setStatus("translating");
      const result = await translateText(text);

      if (!alive) return;

      setTranslated(result);
      setStatus("done");
    } catch (err) {
      if (!alive) return;
      console.error("PhotoTranslate error:", err);
      setStatus("error");
      setErrorMsg(err?.message ?? "오류가 났어요. 다시 시도해볼까요?");
    }

    return () => { alive = false; };
  }, []);

  // 파일 선택 핸들러 (갤러리/카메라 공용)
  const handleFileChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = ""; // 같은 파일 재선택 허용

      // 미리보기 설정
      try {
        setImgSrc(URL.createObjectURL(file));
      } catch {
        setImgSrc(null);
      }

      await runOcr(file);
    },
    [runOcr]
  );

  // 재번역 (원문 수정 후)
  const retranslate = useCallback(async () => {
    if (!ocrText.trim()) return;
    let alive = true;

    try {
      setStatus("translating");
      setErrorMsg("");
      const result = await translateText(ocrText);
      if (alive) {
        setTranslated(result);
        setStatus("done");
      }
    } catch (err) {
      if (alive) {
        setStatus("error");
        setErrorMsg(err?.message ?? "번역 중 오류가 났어요.");
      }
    }

    return () => { alive = false; };
  }, [ocrText]);

  // 초기화
  const reset = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate().catch(() => {});
      workerRef.current = null;
    }
    setImgSrc(null);
    setOcrText("");
    setTranslated("");
    setOcrProgress(0);
    setStatus("idle");
    setErrorMsg("");
  }, []);

  // 클립보드 복사
  const copyText = useCallback(async (text, setFlag) => {
    try {
      await navigator.clipboard.writeText(text);
      setFlag(true);
      setTimeout(() => setFlag(false), 1500);
    } catch {
      alert("복사에 실패했어요.");
    }
  }, []);

  const isBusy = status === "ocring" || status === "translating";

  return (
    <div className="photoPage">
      {/* 헤더 */}
      <div className="photoHeader">
        <div className="photoHeaderLeft">
          <button
            type="button"
            className="photoBack"
            onClick={() => navigate(-1)}
          >
            ← 뒤로
          </button>
        </div>
        <div className="photoHeaderCenter">
          <div className="photoTitle">📷 영어 사진 번역기</div>
          <div className="photoSubtitle">영어 사진을 찍으면 한국어로 번역해줘요</div>
        </div>
        <div className="photoHeaderRight">
          <HamburgerMenu />
        </div>
      </div>

      <div className="photoBody">
        {/* 이미지 미리보기 영역 */}
        <div className="photoUploadArea" onClick={() => !isBusy && galleryRef.current?.click()}>
          {imgSrc ? (
            <img src={imgSrc} alt="선택한 사진" className="photoPreview" />
          ) : (
            <div className="photoUploadPlaceholder">
              <div className="photoUploadIcon">📷</div>
              <div className="photoUploadHint">여기를 눌러 사진을 선택하거나</div>
              <div className="photoUploadHint">아래 버튼을 눌러요</div>
            </div>
          )}
        </div>

        {/* 갤러리 / 카메라 버튼 */}
        <div className="photoBtnRow">
          <button
            type="button"
            className="photoActionBtn"
            disabled={isBusy}
            onClick={() => galleryRef.current?.click()}
          >
            📁 갤러리에서 선택
          </button>
          <button
            type="button"
            className="photoActionBtn"
            disabled={isBusy}
            onClick={() => cameraRef.current?.click()}
          >
            📷 카메라로 찍기
          </button>
        </div>

        {/* 숨긴 파일 input — 갤러리 */}
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        {/* 숨긴 파일 input — 카메라 */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {/* OCR 진행률 */}
        {status === "ocring" && (
          <div className="photoProgressBox">
            <div className="photoProgressLabel">영어 글자 읽는 중... {ocrProgress}%</div>
            <div className="photoProgressBar">
              <div
                className="photoProgressFill"
                style={{ width: `${ocrProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* 번역 중 */}
        {status === "translating" && (
          <div className="photoProgressBox">
            <div className="photoProgressLabel">한국어로 번역 중... ✨</div>
          </div>
        )}

        {/* 오류 */}
        {status === "error" && (
          <div className="photoErrorBox">
            <div>😢 {errorMsg}</div>
          </div>
        )}

        {/* 인식된 영어 원문 */}
        {ocrText !== "" && (
          <div className="photoSection">
            <div className="photoSectionTitle">📝 인식된 영어 원문</div>
            <textarea
              className="photoOcrText"
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
              rows={5}
              placeholder="인식된 영어 글자가 여기에 나와요"
            />
            <div className="photoSectionActions">
              <button
                type="button"
                className="photoMiniBtn"
                onClick={() => copyText(ocrText, setCopiedOcr)}
              >
                {copiedOcr ? "✅ 복사됨" : "📋 복사"}
              </button>
              <button
                type="button"
                className="photoMiniBtn primary"
                onClick={retranslate}
                disabled={isBusy}
              >
                🔄 재번역
              </button>
            </div>
          </div>
        )}

        {/* 번역 결과 */}
        {translated !== "" && (
          <div className="photoSection">
            <div className="photoSectionTitle">🇰🇷 한국어 번역 결과</div>
            <div className="photoResultBox">{translated}</div>
            <div className="photoSectionActions">
              <button
                type="button"
                className="photoMiniBtn"
                onClick={() => copyText(translated, setCopiedTrans)}
              >
                {copiedTrans ? "✅ 복사됨" : "📋 복사"}
              </button>
            </div>
          </div>
        )}

        {/* 다시 번역하기 (초기화) */}
        {status !== "idle" && (
          <button
            type="button"
            className="photoResetBtn"
            onClick={reset}
            disabled={isBusy}
          >
            🔄 다시 번역하기
          </button>
        )}
      </div>
    </div>
  );
}
