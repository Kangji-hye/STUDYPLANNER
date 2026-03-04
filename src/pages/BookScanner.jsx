// src/pages/BookScanner.jsx
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import HamburgerMenu from "../components/common/HamburgerMenu";

// ── 바코드 폴리필 ────────────────────────────────────────────────────────────
const POLYFILL_URL =
  "https://fastly.jsdelivr.net/npm/barcode-detector@3/dist/iife/polyfill.min.js";

function usePolyfill() {
  const [ready, setReady] = useState(
    () => typeof BarcodeDetector !== "undefined"
  );
  useEffect(() => {
    if (ready) return;
    const s = document.createElement("script");
    s.src = POLYFILL_URL;
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, [ready]);
  return ready;
}

// ── 카메라 스캐너 ────────────────────────────────────────────────────────────
function CameraScanner({ onDetected, onClose, polyfillReady }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const onDetectedRef = useRef(onDetected);
  useLayoutEffect(() => { onDetectedRef.current = onDetected; });

  const [err, setErr] = useState("");
  const [scanning, setScanning] = useState(false);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    if (!polyfillReady) return;
    let alive = true;
    let detector;

    async function init() {
      try {
        detector = new BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
        });
      } catch {
        setErr("이 브라우저는 바코드 인식을 지원하지 않아요.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 } },
        });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanning(true);
        scan();
      } catch {
        setErr("카메라 접근 권한이 필요해요. 브라우저 설정에서 허용해주세요.");
      }
    }

    async function scan() {
      if (!alive) return;
      if (!videoRef.current || videoRef.current.readyState < 2) {
        rafRef.current = requestAnimationFrame(scan);
        return;
      }
      try {
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes.length > 0) {
          const val = barcodes[0].rawValue;
          if (/^97[89]\d{10}$/.test(val) || /^\d{10}$/.test(val)) {
            stop();
            onDetectedRef.current(val);
            return;
          }
        }
      } catch { /* ignore */ }
      rafRef.current = requestAnimationFrame(scan);
    }

    init();
    return () => { alive = false; stop(); };
  }, [polyfillReady, stop]);

  const corners = [
    ["top", "left"],
    ["top", "right"],
    ["bottom", "left"],
    ["bottom", "right"],
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(10,10,20,0.93)",
      zIndex: 1000, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "20px",
    }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: "14px",
        }}>
          <span style={{
            color: "#c9a96e", fontFamily: "'Noto Sans KR',sans-serif",
            fontSize: "14px", fontWeight: 700,
          }}>
            📷 바코드를 가운데에 맞춰주세요
          </span>
          <button
            onClick={() => { stop(); onClose(); }}
            style={{
              background: "none", border: "none", color: "#aaa",
              fontSize: "26px", cursor: "pointer",
            }}
          >✕</button>
        </div>

        {err ? (
          <div style={{
            background: "#fde8e8", borderRadius: "12px", padding: "20px",
            color: "#9b2335", fontFamily: "'Noto Sans KR',sans-serif",
            fontSize: "14px", textAlign: "center", lineHeight: 1.7,
          }}>{err}</div>
        ) : (
          <div style={{
            position: "relative", borderRadius: "16px", overflow: "hidden",
            background: "#000", aspectRatio: "4/3",
          }}>
            <video
              ref={videoRef} muted playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center", pointerEvents: "none",
            }}>
              <div style={{
                width: "75%", height: "28%", position: "relative",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
              }}>
                {corners.map(([v, h], i) => (
                  <div key={i} style={{
                    position: "absolute", [v]: 0, [h]: 0,
                    width: "20px", height: "20px",
                    borderTop: v === "top" ? "4px solid #f5e0b0" : "none",
                    borderBottom: v === "bottom" ? "4px solid #f5e0b0" : "none",
                    borderLeft: h === "left" ? "4px solid #f5e0b0" : "none",
                    borderRight: h === "right" ? "4px solid #f5e0b0" : "none",
                    borderRadius:
                      v === "top" && h === "left" ? "4px 0 0 0"
                        : v === "top" && h === "right" ? "0 4px 0 0"
                        : v === "bottom" && h === "left" ? "0 0 0 4px"
                        : "0 0 4px 0",
                  }} />
                ))}
              </div>
            </div>
            {scanning && (
              <div style={{
                position: "absolute", bottom: "14px", left: 0, right: 0, textAlign: "center",
              }}>
                <span style={{
                  background: "rgba(0,0,0,0.6)", color: "#c9a96e",
                  padding: "4px 14px", borderRadius: "20px",
                  fontSize: "12px", fontFamily: "'Noto Sans KR',sans-serif",
                }}>스캔 중…</span>
              </div>
            )}
          </div>
        )}
        <p style={{
          color: "#777", textAlign: "center", fontSize: "12px",
          marginTop: "12px", fontFamily: "'Noto Sans KR',sans-serif",
        }}>
          책 뒷면의 바코드(EAN-13 / ISBN)를 비춰주세요
        </p>
      </div>
    </div>
  );
}

// ── 책 정보 조회 ─────────────────────────────────────────────────────────────
// 1순위: 도서관 정보나루 API (한국 도서에 강함, lib_apikey 있을 때)
// 2순위: Google Books API (키 없이 무료, 폴백)
const LIB_API = "https://www.data4library.kr/api";

async function fetchBookInfo(isbn) {
  const clean = isbn.replace(/-/g, "").trim();

  // 1순위: 도서관 정보나루 API
  const apiKey = localStorage.getItem("lib_apikey") || import.meta.env.VITE_LIB_APIKEY || "";
  if (apiKey) {
    try {
      const res = await fetch(
        `${LIB_API}/srchBooks?authKey=${apiKey}&isbn=${clean}&format=json`
      );
      const data = await res.json();
      const doc = data?.response?.docs?.[0]?.doc;
      if (doc) {
        return {
          title: doc.bookname ?? "",
          author: doc.authors ?? "",
          thumbnail: doc.bookImageURL ?? "",
        };
      }
    } catch { /* ignore, try next */ }
  }

  // 2순위: Google Books API
  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}`
    );
    const data = await res.json();
    const item = data?.items?.[0]?.volumeInfo;
    if (item) {
      return {
        title: item.title ?? "",
        author: (item.authors ?? []).join(", "),
        thumbnail: (item.imageLinks?.thumbnail ?? "").replace("http:", "https:"),
      };
    }
  } catch { /* ignore */ }

  return null;
}

// ── ISBN으로 Supabase 직접 조회 ───────────────────────────────────────────────
async function searchByIsbn(isbn) {
  const clean = isbn.replace(/-/g, "").trim();

  const [rb, jrb, rrb, jrrb] = await Promise.all([
    supabase.from("recommended_books").select("grade_code,book_no,title,author").eq("isbn", clean),
    supabase.from("jangmi_recommended_books").select("grade_code,book_no,title,author").eq("isbn", clean),
    supabase.from("reading_race_books").select("title,author,level").eq("isbn", clean),
    supabase.from("jangmi_reading_race_books").select("title,author,level").eq("isbn", clean),
  ]);

  const seen = new Set();
  const recommended = [...(rb.data ?? []), ...(jrb.data ?? [])].filter((r) => {
    const key = `${r.grade_code}-${r.book_no}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const rSeen = new Set();
  const race = [...(rrb.data ?? []), ...(jrrb.data ?? [])].filter((r) => {
    const key = `${r.level}-${r.title}`;
    if (rSeen.has(key)) return false;
    rSeen.add(key);
    return true;
  });

  const first = recommended[0] ?? race[0];
  const bookInfo = first ? { title: first.title, author: first.author, thumbnail: "" } : null;

  return { recommended, race, bookInfo };
}

// ── Supabase 제목 검색 ────────────────────────────────────────────────────────
const GRADE_LABEL = {
  "-1": "유치원",
  "1": "1학년", "2": "2학년", "3": "3학년",
  "4": "4학년", "5": "5학년", "6": "6학년",
};

async function searchLists(title) {
  const q = title.replace(/\(.*?\)/g, "").trim(); // 괄호 안 부제목 제거
  if (!q) return { recommended: [], race: [] };

  const [rb, jrb, rrb, jrrb] = await Promise.all([
    supabase
      .from("recommended_books")
      .select("grade_code,book_no,title,author")
      .ilike("title", `%${q}%`),
    supabase
      .from("jangmi_recommended_books")
      .select("grade_code,book_no,title,author")
      .ilike("title", `%${q}%`),
    supabase
      .from("reading_race_books")
      .select("title,author,level")
      .ilike("title", `%${q}%`),
    supabase
      .from("jangmi_reading_race_books")
      .select("title,author,level")
      .ilike("title", `%${q}%`),
  ]);

  // 추천도서: grade_code + book_no 기준 중복 제거
  const seen = new Set();
  const recommended = [...(rb.data ?? []), ...(jrb.data ?? [])].filter((r) => {
    const key = `${r.grade_code}-${r.book_no}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 리딩레이스: level + title 기준 중복 제거
  const rSeen = new Set();
  const race = [...(rrb.data ?? []), ...(jrrb.data ?? [])].filter((r) => {
    const key = `${r.level}-${r.title}`;
    if (rSeen.has(key)) return false;
    rSeen.add(key);
    return true;
  });

  return { recommended, race };
}

// ── 도서관 소장 조회 ──────────────────────────────────────────────────────────
// 메모리에 저장된 도서관 코드 하드코딩
const LIBRARIES = [
  { id: "guseong", name: "구성도서관", code: "141118" },
  { id: "jangmi",  name: "장미도서관", code: "141219" },
  { id: "cheongdeok", name: "청덕도서관", code: "141564" },
];

// 소장 상태별 라벨/색상
const LIB_STATUS = {
  loading:     { label: "조회 중…",    bg: "#e8e0d0", color: "#7a6a52" },
  available:   { label: "✅ 대출 가능", bg: "#d4f0e2", color: "#1a6640" },
  unavailable: { label: "🔴 대출 중",   bg: "#fde8e8", color: "#9b2335" },
  none:        { label: "⬜ 미소장",    bg: "#eeeeee", color: "#888"    },
  error:       { label: "⚠ 오류",      bg: "#fff3cd", color: "#856404" },
};

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function BookScanner() {
  const navigate = useNavigate();
  const polyfillReady = usePolyfill();

  const [apiKey, setApiKey] = useState(() => localStorage.getItem("lib_apikey") || import.meta.env.VITE_LIB_APIKEY || "");
  const [apiInput, setApiInput] = useState(() => localStorage.getItem("lib_apikey") || "");
  const [showApiSetup, setShowApiSetup] = useState(false);

  const [isbn, setIsbn] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bookInfo, setBookInfo] = useState(null);
  const [noBookInfo, setNoBookInfo] = useState(false);
  const [results, setResults] = useState(null);
  const [manualTitle, setManualTitle] = useState("");

  // 도서관 소장 조회 상태
  const [selectedLibs, setSelectedLibs] = useState(() => {
    // localStorage에서 이전 선택 불러오기 (기본값: 전체 선택)
    try { return JSON.parse(localStorage.getItem("lib_selected")) || ["guseong","jangmi","cheongdeok"]; }
    catch { return ["guseong","jangmi","cheongdeok"]; }
  });
  const [libResults, setLibResults] = useState({}); // { libId: "available"|"unavailable"|"none"|"error"|"loading" }
  const [libLoading, setLibLoading] = useState(false);
  const currentIsbnRef = useRef(""); // 현재 조회 중인 ISBN 추적

  const saveApiKey = () => {
    localStorage.setItem("lib_apikey", apiInput);
    setApiKey(apiInput);
    setShowApiSetup(false);
  };

  // 체크박스 토글 + localStorage 저장
  const toggleLib = (id) => {
    setSelectedLibs(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem("lib_selected", JSON.stringify(next));
      return next;
    });
  };

  // 도서관 소장 조회 실행
  const doLibSearch = useCallback(async () => {
    const clean = currentIsbnRef.current;
    if (!clean || !apiKey || selectedLibs.length === 0) return;

    setLibLoading(true);
    // 선택된 도서관만 loading 상태로 초기화
    const initState = {};
    selectedLibs.forEach(id => { initState[id] = "loading"; });
    setLibResults(initState);

    // 선택된 도서관에 대해 병렬 조회
    await Promise.all(
      LIBRARIES.filter(lib => selectedLibs.includes(lib.id)).map(async (lib) => {
        try {
          const res = await fetch(
            `${LIB_API}/bookExist?authKey=${apiKey}&libCode=${lib.code}&isbn13=${clean}&format=json`
          );
          const data = await res.json();
          const result = data?.response?.result;
          if (!result) {
            setLibResults(p => ({ ...p, [lib.id]: "error" }));
            return;
          }
          // hasBook: Y/N, loanAvailable: Y/N
          const status = result.hasBook === "N" ? "none"
            : result.loanAvailable === "Y" ? "available"
            : "unavailable";
          setLibResults(p => ({ ...p, [lib.id]: status }));
        } catch {
          setLibResults(p => ({ ...p, [lib.id]: "error" }));
        }
      })
    );
    setLibLoading(false);
  }, [apiKey, selectedLibs]);

  const doSearch = useCallback(async (isbnVal) => {
    const clean = (isbnVal || isbn).replace(/-/g, "").trim();
    if (!clean) return;

    // 새 ISBN 저장 (도서관 조회용)
    currentIsbnRef.current = clean;

    setLoading(true);
    setBookInfo(null);
    setNoBookInfo(false);
    setResults(null);
    setManualTitle("");
    setLibResults({}); // 이전 도서관 조회 결과 초기화

    // 1순위: ISBN으로 DB 직접 조회 (빠름, 정확)
    const direct = await searchByIsbn(clean);
    if (direct.recommended.length > 0 || direct.race.length > 0) {
      setBookInfo(direct.bookInfo);
      setResults({ recommended: direct.recommended, race: direct.race });
      setLoading(false);
      return;
    }

    // 2순위: 외부 API로 제목 조회 후 제목으로 DB 검색 (폴백)
    const info = await fetchBookInfo(clean);
    if (info) {
      setBookInfo(info);
      const res = await searchLists(info.title);
      setResults(res);
    } else {
      setNoBookInfo(true);
    }
    setLoading(false);
  }, [isbn]);

  const doManualSearch = useCallback(async () => {
    const q = manualTitle.trim();
    if (!q) return;
    setLoading(true);
    setResults(null);
    const res = await searchLists(q);
    setResults(res);
    setLoading(false);
  }, [manualTitle]);

  // 바코드 인식 → 카메라 즉시 닫고 자동 조회 (논스톱)
  const handleDetected = useCallback((val) => {
    setShowCamera(false);
    setIsbn(val);
    doSearch(val);
  }, [doSearch]);

  const hasRecommended = results && results.recommended.length > 0;
  const hasRace = results && results.race.length > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f0e8" }}>
      {showCamera && (
        <CameraScanner
          polyfillReady={polyfillReady}
          onDetected={handleDetected}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* 헤더 */}
      <div style={{
        background: "#1a1a2e", padding: "16px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: "none", border: "none", color: "#c9a96e",
            fontSize: "20px", cursor: "pointer", padding: "4px 8px",
          }}
        >←</button>
        <div style={{ textAlign: "center" }}>
          <div style={{
            color: "#c9a96e", fontSize: "10px",
            letterSpacing: "0.2em", fontFamily: "'Noto Sans KR',sans-serif",
            marginBottom: "2px",
          }}>BOOK CHECKER</div>
          <h1 style={{
            color: "#f5f0e8", margin: 0, fontSize: "17px", fontWeight: 400,
          }}>
            📷 바코드로 책 인식
          </h1>
        </div>
        <HamburgerMenu />
      </div>

      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "24px 16px" }}>

        {/* API 키 설정 */}
        {!apiKey && !showApiSetup && (
          <div style={{
            background: "#fff8e8", border: "1px solid #e8d5a0",
            borderRadius: "12px", padding: "12px 16px", marginBottom: "16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: "13px", color: "#856404", fontFamily: "'Noto Sans KR',sans-serif" }}>
              ⚠️ API 키 설정 필요 (ISBN 조회용)
            </span>
            <button
              onClick={() => setShowApiSetup(true)}
              style={{
                background: "#1a1a2e", color: "#c9a96e", border: "none",
                padding: "6px 14px", borderRadius: "8px", cursor: "pointer",
                fontFamily: "'Noto Sans KR',sans-serif", fontSize: "12px", fontWeight: 700,
              }}
            >설정하기</button>
          </div>
        )}
        {showApiSetup && (
          <div style={{
            background: "#fff8e8", border: "1px solid #e8d5a0",
            borderRadius: "12px", padding: "16px 20px", marginBottom: "16px",
          }}>
            <div style={{
              fontSize: "13px", color: "#856404",
              fontFamily: "'Noto Sans KR',sans-serif", fontWeight: 700, marginBottom: "8px",
            }}>🔑 도서관 정보나루 API 키</div>
            <p style={{
              margin: "0 0 10px", fontSize: "12px", color: "#78350f",
              fontFamily: "'Noto Sans KR',sans-serif", lineHeight: 1.7,
            }}>
              <a href="https://www.data4library.kr" target="_blank" rel="noreferrer"
                style={{ color: "#b45309" }}>data4library.kr</a>에서 무료 발급받을 수 있어요.
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                value={apiInput}
                onChange={(e) => setApiInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveApiKey()}
                placeholder="인증키를 붙여넣으세요"
                style={{
                  flex: 1, padding: "9px 12px", borderRadius: "8px",
                  border: "1.5px solid #d5c9b0", background: "#faf8f3",
                  fontFamily: "monospace", fontSize: "13px", outline: "none",
                }}
              />
              <button onClick={saveApiKey} style={{
                background: "#1a1a2e", color: "#c9a96e", border: "none",
                padding: "9px 16px", borderRadius: "8px", cursor: "pointer",
                fontFamily: "'Noto Sans KR',sans-serif", fontSize: "13px", fontWeight: 700,
              }}>저장</button>
              <button onClick={() => setShowApiSetup(false)} style={{
                background: "none", border: "1px solid #ccc", color: "#888",
                padding: "9px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "13px",
              }}>취소</button>
            </div>
          </div>
        )}
        {apiKey && (
          <div style={{
            textAlign: "right", marginBottom: "8px",
          }}>
            <button
              onClick={() => { setShowApiSetup(v => !v); setApiInput(apiKey); }}
              style={{
                background: "none", border: "none", color: "#aaa",
                fontSize: "11px", cursor: "pointer",
                fontFamily: "'Noto Sans KR',sans-serif",
              }}
            >🔑 API 키 변경</button>
          </div>
        )}

        {/* ISBN 입력 */}
        <div style={{
          background: "#fffdf7", border: "1px solid #e0d5c0",
          borderRadius: "16px", padding: "22px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.06)", marginBottom: "20px",
        }}>
          <div style={{
            fontSize: "12px", color: "#7a6a52",
            fontFamily: "'Noto Sans KR',sans-serif",
            fontWeight: 600, marginBottom: "10px", letterSpacing: "0.06em",
          }}>
            ISBN 번호
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
                placeholder="예: 9788936434120"
                style={{
                  flex: 1, minWidth: 0, padding: "12px 14px", borderRadius: "10px",
                  border: "1.5px solid #d5c9b0", background: "#faf8f3",
                  fontFamily: "monospace", fontSize: "15px",
                  letterSpacing: "0.08em", outline: "none",
                }}
              />
              <button
                onClick={() => setShowCamera(true)}
                title="카메라로 스캔"
                style={{
                  background: "#c9a96e", color: "#1a1a2e", border: "none",
                  padding: "12px 16px", borderRadius: "10px",
                  cursor: "pointer", fontSize: "20px", flexShrink: 0,
                }}
              >📷</button>
            </div>
            <button
              onClick={() => doSearch()}
              disabled={loading || !isbn.trim()}
              style={{
                width: "100%", background: loading || !isbn.trim() ? "#ccc" : "#1a1a2e",
                color: "#c9a96e", border: "none",
                padding: "13px", borderRadius: "10px",
                cursor: loading || !isbn.trim() ? "default" : "pointer",
                fontFamily: "'Noto Sans KR',sans-serif",
                fontSize: "15px", fontWeight: 700,
              }}
            >
              {loading ? "조회 중…" : "🔍 조회"}
            </button>
          </div>
        </div>

        {/* 책 정보 카드 */}
        {bookInfo && (
          <div style={{
            background: "#1a1a2e", borderRadius: "14px",
            padding: "18px 22px", marginBottom: "16px",
            display: "flex", gap: "16px", alignItems: "flex-start",
          }}>
            {bookInfo.thumbnail && (
              <img
                src={bookInfo.thumbnail}
                alt="표지"
                style={{
                  width: "60px", height: "84px", objectFit: "cover",
                  borderRadius: "4px", flexShrink: 0,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                }}
              />
            )}
            <div>
              <div style={{
                color: "#c9a96e", fontSize: "10px",
                letterSpacing: "0.2em", marginBottom: "6px",
                fontFamily: "'Noto Sans KR',sans-serif",
              }}>BOOK INFO</div>
              <div style={{
                color: "#f5f0e8", fontSize: "16px",
                lineHeight: 1.4, marginBottom: "6px",
                fontFamily: "'Noto Serif KR',Georgia,serif",
              }}>{bookInfo.title}</div>
              <div style={{
                color: "#aaa", fontSize: "13px",
                fontFamily: "'Noto Sans KR',sans-serif",
              }}>{bookInfo.author}</div>
            </div>
          </div>
        )}

        {/* ISBN으로 책 정보를 못 찾은 경우 → 제목 직접 검색 */}
        {noBookInfo && (
          <div style={{
            background: "#fff8e8", border: "1px solid #e8d5a0",
            borderRadius: "14px", padding: "18px 22px", marginBottom: "16px",
          }}>
            <div style={{
              color: "#856404", fontFamily: "'Noto Sans KR',sans-serif",
              fontSize: "13px", fontWeight: 600, marginBottom: "10px",
            }}>
              ⚠️ 책 정보를 찾지 못했어요. 제목으로 직접 검색해보세요.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <input
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doManualSearch()}
                placeholder="책 제목을 입력하세요"
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "10px 13px", borderRadius: "8px",
                  border: "1.5px solid #d5c9b0", background: "#faf8f3",
                  fontFamily: "'Noto Sans KR',sans-serif", fontSize: "14px", outline: "none",
                }}
              />
              <button
                onClick={doManualSearch}
                disabled={loading || !manualTitle.trim()}
                style={{
                  width: "100%", background: "#1a1a2e", color: "#c9a96e", border: "none",
                  padding: "11px", borderRadius: "8px",
                  cursor: "pointer", fontFamily: "'Noto Sans KR',sans-serif",
                  fontSize: "14px", fontWeight: 700,
                }}
              >검색</button>
            </div>
          </div>
        )}

        {/* 검색 결과 */}
        {results && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

            {/* 리딩레이스 결과 (위로 이동) */}
            <div style={{
              background: "#fffdf7", border: `2px solid ${hasRace ? "#5b8dd9" : "#e0d5c0"}`,
              borderRadius: "14px", overflow: "hidden",
            }}>
              <div style={{
                padding: "14px 20px",
                background: hasRace ? "#e8f0fc" : "#f5f0e8",
                display: "flex", alignItems: "center", gap: "10px",
              }}>
                <span style={{ fontSize: "22px" }}>
                  {hasRace ? "✅" : "❌"}
                </span>
                <div>
                  <div style={{
                    fontFamily: "'Noto Sans KR',sans-serif",
                    fontSize: "15px", fontWeight: 700,
                    color: hasRace ? "#1a3a6e" : "#666",
                  }}>
                    리딩레이스 목록
                  </div>
                  <div style={{
                    fontFamily: "'Noto Sans KR',sans-serif",
                    fontSize: "12px",
                    color: hasRace ? "#2e507d" : "#999",
                  }}>
                    {hasRace
                      ? `${results.race.length}건 일치`
                      : "목록에 없어요"}
                  </div>
                </div>
              </div>

              {hasRace && (
                <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {results.race.map((r, i) => (
                    <div key={i} style={{
                      background: "#eef3fc", borderRadius: "8px",
                      padding: "10px 14px", display: "flex",
                      alignItems: "center", gap: "12px",
                    }}>
                      {r.level && (
                        <span style={{
                          background: "#5b8dd9", color: "#fff",
                          borderRadius: "6px", padding: "3px 10px",
                          fontSize: "12px", fontWeight: 700,
                          fontFamily: "'Noto Sans KR',sans-serif", flexShrink: 0,
                        }}>
                          {r.level}
                        </span>
                      )}
                      <div>
                        <div style={{
                          fontFamily: "'Noto Sans KR',sans-serif",
                          fontSize: "13px", color: "#1a2040", fontWeight: 600,
                        }}>{r.title}</div>
                        {r.author && (
                          <div style={{
                            fontFamily: "'Noto Sans KR',sans-serif",
                            fontSize: "11px", color: "#666",
                          }}>{r.author}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 추천도서 결과 (아래로 이동) */}
            <div style={{
              background: "#fffdf7", border: `2px solid ${hasRecommended ? "#4caf7d" : "#e0d5c0"}`,
              borderRadius: "14px", overflow: "hidden",
            }}>
              <div style={{
                padding: "14px 20px",
                background: hasRecommended ? "#e8f8ef" : "#f5f0e8",
                display: "flex", alignItems: "center", gap: "10px",
              }}>
                <span style={{ fontSize: "22px" }}>
                  {hasRecommended ? "✅" : "❌"}
                </span>
                <div>
                  <div style={{
                    fontFamily: "'Noto Sans KR',sans-serif",
                    fontSize: "15px", fontWeight: 700,
                    color: hasRecommended ? "#1a6640" : "#666",
                  }}>
                    독서수첩 추천도서
                  </div>
                  <div style={{
                    fontFamily: "'Noto Sans KR',sans-serif",
                    fontSize: "12px",
                    color: hasRecommended ? "#2e7d50" : "#999",
                  }}>
                    {hasRecommended
                      ? `${results.recommended.length}건 일치`
                      : "목록에 없어요"}
                  </div>
                </div>
              </div>

              {hasRecommended && (
                <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {results.recommended.map((r, i) => (
                    <div key={i} style={{
                      background: "#f0faf5", borderRadius: "8px",
                      padding: "10px 14px", display: "flex",
                      alignItems: "center", gap: "12px",
                    }}>
                      <span style={{
                        background: "#4caf7d", color: "#fff",
                        borderRadius: "6px", padding: "3px 10px",
                        fontSize: "12px", fontWeight: 700,
                        fontFamily: "'Noto Sans KR',sans-serif", flexShrink: 0,
                      }}>
                        {GRADE_LABEL[String(r.grade_code)] ?? `${r.grade_code}학년`}
                      </span>
                      <div>
                        <div style={{
                          fontFamily: "'Noto Sans KR',sans-serif",
                          fontSize: "13px", color: "#1a2e1a", fontWeight: 600,
                        }}>{r.title}</div>
                        {r.author && (
                          <div style={{
                            fontFamily: "'Noto Sans KR',sans-serif",
                            fontSize: "11px", color: "#666",
                          }}>{r.author}</div>
                        )}
                      </div>
                      {r.book_no && (
                        <span style={{
                          marginLeft: "auto", color: "#999",
                          fontSize: "11px", fontFamily: "monospace", flexShrink: 0,
                        }}>No.{r.book_no}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 둘 다 없을 때 */}
            {!hasRecommended && !hasRace && (
              <div style={{
                textAlign: "center", padding: "20px",
                color: "#9a8a72", fontFamily: "'Noto Sans KR',sans-serif",
                fontSize: "13px", lineHeight: 1.8,
              }}>
                두 목록 모두에 없는 책이에요.<br />
                제목이 다르게 저장되어 있을 수 있어요.<br />
                아래에서 제목 일부로 직접 검색해보세요.
              </div>
            )}

            {/* 결과 나온 후에도 제목 직접 검색 가능 */}
            {(bookInfo || noBookInfo) && (
              <div style={{
                background: "#fffdf7", border: "1px solid #e0d5c0",
                borderRadius: "12px", padding: "16px 20px",
              }}>
                <div style={{
                  fontSize: "12px", color: "#7a6a52",
                  fontFamily: "'Noto Sans KR',sans-serif",
                  fontWeight: 600, marginBottom: "8px",
                }}>
                  🔍 제목으로 다시 검색
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <input
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && doManualSearch()}
                    placeholder="책 제목 일부를 입력하세요"
                    style={{
                      width: "100%", boxSizing: "border-box",
                      padding: "9px 12px", borderRadius: "8px",
                      border: "1.5px solid #d5c9b0", background: "#faf8f3",
                      fontFamily: "'Noto Sans KR',sans-serif", fontSize: "13px", outline: "none",
                    }}
                  />
                  <button
                    onClick={doManualSearch}
                    disabled={loading || !manualTitle.trim()}
                    style={{
                      width: "100%", background: "#1a1a2e", color: "#c9a96e", border: "none",
                      padding: "10px", borderRadius: "8px",
                      cursor: "pointer", fontFamily: "'Noto Sans KR',sans-serif",
                      fontSize: "13px", fontWeight: 700,
                    }}
                  >검색</button>
                </div>
              </div>
            )}

            {/* ── 도서관 소장 조회 섹션 ── */}
            <div style={{
              background: "#fffdf7", border: "1px solid #e0d5c0",
              borderRadius: "14px", overflow: "hidden",
            }}>
              {/* 헤더 */}
              <div style={{
                padding: "14px 20px", background: "#f5f0e8",
                borderBottom: "1px solid #e0d5c0",
              }}>
                <div style={{
                  fontFamily: "'Noto Sans KR',sans-serif",
                  fontSize: "14px", fontWeight: 700, color: "#1a1a2e",
                  marginBottom: "10px",
                }}>
                  🏛 도서관 소장 확인
                </div>
                {/* 체크박스 목록 */}
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
                  {LIBRARIES.map(lib => (
                    <label key={lib.id} style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      cursor: "pointer", userSelect: "none",
                      fontFamily: "'Noto Sans KR',sans-serif",
                      fontSize: "14px", color: "#1a1a2e",
                    }}>
                      <input
                        type="checkbox"
                        checked={selectedLibs.includes(lib.id)}
                        onChange={() => toggleLib(lib.id)}
                        style={{ width: "17px", height: "17px", cursor: "pointer", accentColor: "#1a1a2e" }}
                      />
                      {lib.name}
                    </label>
                  ))}
                </div>
                {/* 조회 버튼 */}
                {!apiKey ? (
                  <div style={{
                    fontSize: "12px", color: "#856404",
                    fontFamily: "'Noto Sans KR',sans-serif",
                    background: "#fff8e8", padding: "8px 12px",
                    borderRadius: "8px",
                  }}>
                    ⚠️ 도서관 정보나루 API 키를 설정하면 소장 여부를 확인할 수 있어요.
                  </div>
                ) : (
                  <button
                    onClick={doLibSearch}
                    disabled={libLoading || selectedLibs.length === 0 || !currentIsbnRef.current}
                    style={{
                      width: "100%",
                      background: libLoading || selectedLibs.length === 0 ? "#ccc" : "#1a1a2e",
                      color: "#c9a96e", border: "none",
                      padding: "11px", borderRadius: "10px",
                      cursor: libLoading || selectedLibs.length === 0 ? "default" : "pointer",
                      fontFamily: "'Noto Sans KR',sans-serif",
                      fontSize: "14px", fontWeight: 700,
                    }}
                  >
                    {libLoading ? "조회 중…" : "📍 소장 여부 확인"}
                  </button>
                )}
              </div>

              {/* 조회 결과 */}
              {Object.keys(libResults).length > 0 && (
                <div>
                  {LIBRARIES.filter(lib => libResults[lib.id] !== undefined).map((lib, i, arr) => {
                    const status = libResults[lib.id];
                    const s = LIB_STATUS[status] || LIB_STATUS.error;
                    return (
                      <div key={lib.id} style={{
                        display: "flex", alignItems: "center",
                        justifyContent: "space-between",
                        padding: "13px 20px",
                        borderBottom: i < arr.length - 1 ? "1px solid #f0ebe0" : "none",
                      }}>
                        <span style={{
                          fontFamily: "'Noto Sans KR',sans-serif",
                          fontSize: "14px", color: "#1a1a2e",
                        }}>
                          {lib.name}
                        </span>
                        <span style={{
                          padding: "4px 14px", borderRadius: "20px",
                          fontSize: "12px", fontWeight: 700,
                          background: s.bg, color: s.color,
                          fontFamily: "'Noto Sans KR',sans-serif",
                          whiteSpace: "nowrap",
                        }}>
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* 초기 안내 */}
        {!results && !loading && !noBookInfo && (
          <div style={{
            textAlign: "center", padding: "50px 20px", color: "#c5b89a",
          }}>
            <div style={{ fontSize: "56px", marginBottom: "14px" }}>📚</div>
            <p style={{
              fontFamily: "'Noto Sans KR',sans-serif", fontSize: "14px",
              lineHeight: 2, margin: 0, color: "#9a8a72",
            }}>
              📷 버튼으로 바코드를 스캔하거나<br />
              ISBN을 직접 입력해 조회하면<br />
              <b>추천도서</b>와 <b>리딩레이스</b> 목록을 확인해드려요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
