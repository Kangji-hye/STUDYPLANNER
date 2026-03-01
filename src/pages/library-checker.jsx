import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";

const POLYFILL_URL = "https://fastly.jsdelivr.net/npm/barcode-detector@3/dist/iife/polyfill.min.js";

function usePolyfill() {
  const [ready, setReady] = useState(() => typeof BarcodeDetector !== "undefined");
  useEffect(() => {
    if (ready) return;
    const s = document.createElement("script");
    s.src = POLYFILL_URL;
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, [ready]);
  return ready;
}

const API = "https://www.data4library.kr/api";
const DEFAULT_LIBS = [
  { id: 1, name: "구성도서관", code: "" },
  { id: 2, name: "청덕도서관", code: "" },
  { id: 3, name: "장미도서관", code: "" },
];

const STATUS = {
  loading:     { label: "조회 중…",    bg: "#e8e0d0", color: "#7a6a52" },
  available:   { label: "✅ 대출 가능", bg: "#d4f0e2", color: "#1a6640" },
  unavailable: { label: "🔴 대출 중",   bg: "#fde8e8", color: "#9b2335" },
  none:        { label: "⬜ 미소장",    bg: "#eeeeee", color: "#888"    },
  nocode:      { label: "코드 미설정",  bg: "#fff3cd", color: "#856404" },
  error:       { label: "⚠ 오류",      bg: "#fff3cd", color: "#856404" },
};

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.error;
  return <span style={{ padding:"3px 12px", borderRadius:"20px", fontSize:"12px", fontWeight:700, background:s.bg, color:s.color, fontFamily:"'Noto Sans KR',sans-serif", whiteSpace:"nowrap" }}>{s.label}</span>;
}

function CameraScanner({ onDetected, onClose, polyfillReady }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const onDetectedRef = useRef(onDetected);
  useLayoutEffect(() => { onDetectedRef.current = onDetected; });
  const [err, setErr] = useState("");
  const [scanning, setScanning] = useState(false);
  const stop = useCallback(() => { cancelAnimationFrame(rafRef.current); streamRef.current?.getTracks().forEach(t => t.stop()); }, []);
  useEffect(() => {
    if (!polyfillReady) return;
    let alive = true, detector;
    async function init() {
      try { detector = new BarcodeDetector({ formats: ["ean_13","ean_8","upc_a","upc_e"] }); }
      catch { setErr("이 브라우저는 바코드 인식을 지원하지 않아요."); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:"environment", width:{ideal:1280} } });
        if (!alive) { stream.getTracks().forEach(t=>t.stop()); return; }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanning(true);
        scan();
      } catch { setErr("카메라 접근 권한이 필요해요. 브라우저 설정에서 허용해주세요."); }
    }
    async function scan() {
      if (!alive) return;
      if (!videoRef.current || videoRef.current.readyState < 2) { rafRef.current = requestAnimationFrame(scan); return; }
      try {
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes.length > 0) {
          const val = barcodes[0].rawValue;
          if (/^97[89]\d{10}$/.test(val) || /^\d{10}$/.test(val)) { stop(); onDetectedRef.current(val); return; }
        }
      } catch { /* ignore detection errors */ }
      rafRef.current = requestAnimationFrame(scan);
    }
    init();
    return () => { alive = false; stop(); };
  }, [polyfillReady, stop]);

  const corners = [["top","left"],["top","right"],["bottom","left"],["bottom","right"]];
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(10,10,20,0.93)", zIndex:1000, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px" }}>
      <div style={{ width:"100%", maxWidth:"420px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"14px" }}>
          <span style={{ color:"#c9a96e", fontFamily:"'Noto Sans KR',sans-serif", fontSize:"14px", fontWeight:700 }}>📷 바코드를 가운데에 맞춰주세요</span>
          <button onClick={() => { stop(); onClose(); }} style={{ background:"none", border:"none", color:"#aaa", fontSize:"26px", cursor:"pointer" }}>✕</button>
        </div>
        {err ? (
          <div style={{ background:"#fde8e8", borderRadius:"12px", padding:"20px", color:"#9b2335", fontFamily:"'Noto Sans KR',sans-serif", fontSize:"14px", textAlign:"center", lineHeight:1.7 }}>{err}</div>
        ) : (
          <div style={{ position:"relative", borderRadius:"16px", overflow:"hidden", background:"#000", aspectRatio:"4/3" }}>
            <video ref={videoRef} muted playsInline style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
              <div style={{ width:"75%", height:"28%", position:"relative", boxShadow:"0 0 0 9999px rgba(0,0,0,0.45)" }}>
                {corners.map(([v,h],i) => (
                  <div key={i} style={{ position:"absolute", [v]:0, [h]:0, width:"20px", height:"20px",
                    borderTop: v==="top"?"4px solid #f5e0b0":"none", borderBottom: v==="bottom"?"4px solid #f5e0b0":"none",
                    borderLeft: h==="left"?"4px solid #f5e0b0":"none", borderRight: h==="right"?"4px solid #f5e0b0":"none",
                    borderRadius: v==="top"&&h==="left"?"4px 0 0 0": v==="top"&&h==="right"?"0 4px 0 0": v==="bottom"&&h==="left"?"0 0 0 4px":"0 0 4px 0" }} />
                ))}
              </div>
            </div>
            {scanning && (
              <div style={{ position:"absolute", bottom:"14px", left:0, right:0, textAlign:"center" }}>
                <span style={{ background:"rgba(0,0,0,0.6)", color:"#c9a96e", padding:"4px 14px", borderRadius:"20px", fontSize:"12px", fontFamily:"'Noto Sans KR',sans-serif" }}>스캔 중…</span>
              </div>
            )}
          </div>
        )}
        <p style={{ color:"#777", textAlign:"center", fontSize:"12px", marginTop:"12px", fontFamily:"'Noto Sans KR',sans-serif" }}>책 뒷면의 바코드(EAN-13 / ISBN)를 비춰주세요</p>
      </div>
    </div>
  );
}

function LibSearchModal({ apiKey, onAdd, onClose }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const search = async () => {
    if (!q.trim()) return;
    if (!apiKey) { setErr("API 키를 먼저 설정해주세요."); return; }
    setLoading(true); setErr(""); setResults([]);
    try {
      const res = await fetch(`${API}/libSrch?authKey=${apiKey}&libName=${encodeURIComponent(q)}&format=json`);
      const data = await res.json();
      const libs = data?.response?.libs;
      if (!libs || libs.length === 0) setErr("검색 결과가 없어요.");
      else setResults(libs.map(l => l.lib));
    } catch { setErr("검색에 실패했어요. API 키를 확인해주세요."); }
    setLoading(false);
  };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(10,10,20,0.75)", zIndex:900, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}>
      <div style={{ background:"#fffdf7", borderRadius:"16px", padding:"26px", width:"100%", maxWidth:"500px", maxHeight:"80vh", display:"flex", flexDirection:"column", gap:"14px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h3 style={{ margin:0, fontFamily:"'Noto Sans KR',sans-serif", fontSize:"16px", color:"#1a1a2e" }}>🔍 도서관 코드 검색</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:"22px", cursor:"pointer", color:"#888" }}>✕</button>
        </div>
        <div style={{ display:"flex", gap:"8px" }}>
          <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} placeholder="예: 청덕도서관"
            style={{ flex:1, padding:"10px 14px", borderRadius:"8px", border:"1.5px solid #d5c9b0", background:"#faf8f3", fontFamily:"'Noto Sans KR',sans-serif", fontSize:"14px", outline:"none" }} />
          <button onClick={search} style={{ background:"#1a1a2e", color:"#c9a96e", border:"none", padding:"10px 18px", borderRadius:"8px", cursor:"pointer", fontFamily:"'Noto Sans KR',sans-serif", fontSize:"13px", fontWeight:700 }}>검색</button>
        </div>
        <div style={{ overflowY:"auto", flex:1 }}>
          {loading && <p style={{ textAlign:"center", color:"#888", fontFamily:"'Noto Sans KR',sans-serif" }}>검색 중…</p>}
          {err && <p style={{ textAlign:"center", color:"#cc4444", fontFamily:"'Noto Sans KR',sans-serif", fontSize:"13px" }}>{err}</p>}
          {results.map((lib,i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", borderRadius:"8px", marginBottom:"6px", background:"#f5f0e8" }}>
              <div>
                <div style={{ fontFamily:"'Noto Sans KR',sans-serif", fontSize:"14px", color:"#1a1a2e", marginBottom:"2px" }}>{lib.libName}</div>
                <div style={{ fontSize:"11px", color:"#888", fontFamily:"'Noto Sans KR',sans-serif" }}>코드: <b>{lib.libCode}</b> · {lib.address}</div>
              </div>
              <button onClick={() => onAdd({ name:lib.libName, code:lib.libCode })}
                style={{ background:"#1a1a2e", color:"#c9a96e", border:"none", padding:"5px 14px", borderRadius:"12px", cursor:"pointer", fontSize:"12px", fontWeight:700, fontFamily:"'Noto Sans KR',sans-serif", flexShrink:0, marginLeft:"10px" }}>추가</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const polyfillReady = usePolyfill();
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("lib_apikey") || "");
  const [apiInput, setApiInput] = useState(() => localStorage.getItem("lib_apikey") || "");
  const [showApi, setShowApi] = useState(!localStorage.getItem("lib_apikey"));
  const [isbn, setIsbn] = useState("");
  const [libraries, setLibraries] = useState(() => { try { return JSON.parse(localStorage.getItem("lib_list")) || DEFAULT_LIBS; } catch { return DEFAULT_LIBS; } });
  const [results, setResults] = useState({});
  const [bookInfo, setBookInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showLibMgr, setShowLibMgr] = useState(false);
  const [showLibSearch, setShowLibSearch] = useState(false);
  const [newLib, setNewLib] = useState({ name:"", code:"" });

  useEffect(() => { localStorage.setItem("lib_list", JSON.stringify(libraries)); }, [libraries]);
  const saveKey = () => { localStorage.setItem("lib_apikey", apiInput); setApiKey(apiInput); setShowApi(false); };
  const doSearch = async (isbnVal) => {
    const clean = (isbnVal || isbn).replace(/-/g,"").trim();
    if (!clean || !apiKey) return;
    setIsbn(isbnVal || isbn); setResults({}); setBookInfo(null); setLoading(true);
    try { const r = await fetch(`${API}/srchBooks?authKey=${apiKey}&isbn=${clean}&format=json`); const d = await r.json(); const doc = d?.response?.docs?.[0]?.doc; if (doc) setBookInfo(doc); } catch { /* ignore */ }
    await Promise.all(libraries.map(async lib => {
      if (!lib.code) { setResults(p => ({ ...p, [lib.id]:{status:"nocode"} })); return; }
      setResults(p => ({ ...p, [lib.id]:{status:"loading"} }));
      try {
        const r = await fetch(`${API}/bookExist?authKey=${apiKey}&libCode=${lib.code}&isbn13=${clean}&format=json`);
        const d = await r.json(); const res = d?.response?.result;
        if (!res) { setResults(p => ({...p,[lib.id]:{status:"error"}})); return; }
        setResults(p => ({...p,[lib.id]:{status: res.hasBook==="N"?"none":res.loanAvailable==="Y"?"available":"unavailable"}}));
      } catch { setResults(p => ({...p,[lib.id]:{status:"error"}})); }
    }));
    setLoading(false);
  };
  const addLib = lib => setLibraries(p => [...p, { ...lib, id:Date.now() }]);
  const removeLib = id => setLibraries(p => p.filter(l => l.id !== id));
  const updateCode = (id, code) => setLibraries(p => p.map(l => l.id===id ? {...l,code} : l));
  const F = "'Noto Sans KR',sans-serif", gold="#c9a96e", navy="#1a1a2e";

  return (
    <div style={{ minHeight:"100vh", background:"#f5f0e8", fontFamily:"'Noto Serif KR',Georgia,serif" }}>
      {showCamera && <CameraScanner polyfillReady={polyfillReady} onDetected={v=>{setShowCamera(false);doSearch(v);}} onClose={()=>setShowCamera(false)} />}
      {showLibSearch && <LibSearchModal apiKey={apiKey} onAdd={lib=>addLib(lib)} onClose={()=>setShowLibSearch(false)} />}

      <div style={{ background:navy, padding:"22px 20px 18px", boxShadow:"0 4px 24px rgba(0,0,0,0.2)" }}>
        <div style={{ maxWidth:"720px", margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:"12px" }}>
          <div>
            <div style={{ color:gold, fontSize:"10px", letterSpacing:"0.25em", marginBottom:"4px", fontFamily:F, fontWeight:500 }}>LIBRARY BOOK FINDER</div>
            <h1 style={{ color:"#f5f0e8", margin:0, fontSize:"20px", fontWeight:400 }}>📚 도서관 소장 조회</h1>
          </div>
          <div style={{ display:"flex", gap:"8px" }}>
            <button onClick={()=>setShowLibMgr(!showLibMgr)} style={{ background:"transparent", border:`1px solid ${gold}`, color:gold, padding:"7px 13px", borderRadius:"8px", cursor:"pointer", fontFamily:F, fontSize:"12px" }}>🏛 도서관 관리</button>
            <button onClick={()=>setShowApi(!showApi)} style={{ background:"transparent", border:"1px solid #555", color:"#aaa", padding:"7px 13px", borderRadius:"8px", cursor:"pointer", fontFamily:F, fontSize:"12px" }}>🔑 API 키</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:"720px", margin:"0 auto", padding:"24px 16px" }}>
        {showApi && (
          <div style={{ background:"#fffdf7", border:"1px solid #e0d5c0", borderRadius:"14px", padding:"22px", marginBottom:"18px" }}>
            <div style={{ fontSize:"13px", color:"#7a6a52", fontFamily:F, fontWeight:600, marginBottom:"8px" }}>🔑 API 키 설정</div>
            <p style={{ margin:"0 0 14px", fontSize:"12px", color:"#9a8a72", fontFamily:F, lineHeight:1.7 }}>
              <a href="https://www.data4library.kr" target="_blank" rel="noreferrer" style={{ color:gold }}>data4library.kr</a> 에서 무료 발급 후 입력하세요.
            </p>
            <div style={{ display:"flex", gap:"8px" }}>
              <input type="text" value={apiInput} onChange={e=>setApiInput(e.target.value)} placeholder="인증키를 붙여넣으세요"
                style={{ flex:1, padding:"10px 13px", borderRadius:"8px", border:"1.5px solid #d5c9b0", background:"#faf8f3", fontFamily:"monospace", fontSize:"13px", outline:"none" }} />
              <button onClick={saveKey} style={{ background:navy, color:gold, border:"none", padding:"10px 18px", borderRadius:"8px", cursor:"pointer", fontFamily:F, fontSize:"13px", fontWeight:700 }}>저장</button>
            </div>
          </div>
        )}

        {showLibMgr && (
          <div style={{ background:"#fffdf7", border:"1px solid #e0d5c0", borderRadius:"14px", padding:"22px", marginBottom:"18px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"10px" }}>
              <div style={{ fontSize:"13px", color:"#7a6a52", fontFamily:F, fontWeight:600 }}>🏛 조회 도서관 관리</div>
              <button onClick={()=>setShowLibSearch(true)} style={{ background:gold, color:navy, border:"none", padding:"6px 13px", borderRadius:"8px", cursor:"pointer", fontFamily:F, fontSize:"12px", fontWeight:700 }}>🔍 도서관명으로 코드 검색</button>
            </div>
            <p style={{ margin:"0 0 12px", fontSize:"12px", color:"#aa8855", fontFamily:F, lineHeight:1.6, background:"#fdf5e0", padding:"8px 12px", borderRadius:"8px" }}>
              💡 코드를 모르면 <b>"도서관명으로 코드 검색"</b> 버튼을 클릭하세요. 검색 후 <b>"추가"</b>를 누르면 자동 입력됩니다.
            </p>
            {libraries.map(lib => (
              <div key={lib.id} style={{ display:"flex", alignItems:"center", gap:"8px", background:"#f5f0e8", padding:"9px 11px", borderRadius:"8px", marginBottom:"7px" }}>
                <span style={{ flex:"0 0 auto", fontFamily:F, fontSize:"14px", color:navy, minWidth:"80px" }}>{lib.name}</span>
                <input value={lib.code} onChange={e=>updateCode(lib.id,e.target.value)} placeholder="도서관 코드 (예: 312345)"
                  style={{ flex:1, padding:"6px 10px", borderRadius:"6px", border:`1.5px solid ${lib.code?"#c9a96e":"#d5c9b0"}`, background:"#faf8f3", fontFamily:"monospace", fontSize:"13px", outline:"none" }} />
                <button onClick={()=>removeLib(lib.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"#cc4444", fontSize:"18px" }}>×</button>
              </div>
            ))}
            <div style={{ display:"flex", gap:"8px", marginTop:"4px" }}>
              <input placeholder="도서관 이름" value={newLib.name} onChange={e=>setNewLib(p=>({...p,name:e.target.value}))}
                style={{ flex:2, padding:"8px 11px", borderRadius:"8px", border:"1px solid #d5c9b0", background:"#faf8f3", fontFamily:F, fontSize:"13px", outline:"none" }} />
              <input placeholder="코드" value={newLib.code} onChange={e=>setNewLib(p=>({...p,code:e.target.value}))}
                style={{ flex:1, padding:"8px 11px", borderRadius:"8px", border:"1px solid #d5c9b0", background:"#faf8f3", fontFamily:"monospace", fontSize:"13px", outline:"none" }} />
              <button onClick={()=>{addLib(newLib);setNewLib({name:"",code:""}); }} style={{ background:navy, color:gold, border:"none", padding:"8px 14px", borderRadius:"8px", cursor:"pointer", fontSize:"18px" }}>+</button>
            </div>
          </div>
        )}

        <div style={{ background:"#fffdf7", border:"1px solid #e0d5c0", borderRadius:"16px", padding:"24px", marginBottom:"20px", boxShadow:"0 4px 18px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize:"12px", color:"#7a6a52", fontFamily:F, fontWeight:600, marginBottom:"10px", letterSpacing:"0.06em" }}>ISBN 번호</div>
          <div style={{ display:"flex", gap:"10px", flexWrap:"wrap" }}>
            <input value={isbn} onChange={e=>setIsbn(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSearch()} placeholder="예: 9788936434120"
              style={{ flex:"1 1 180px", padding:"12px 14px", borderRadius:"10px", border:"1.5px solid #d5c9b0", background:"#faf8f3", fontFamily:"monospace", fontSize:"15px", letterSpacing:"0.08em", outline:"none" }} />
            <button onClick={()=>setShowCamera(true)} title="카메라로 스캔"
              style={{ background:gold, color:navy, border:"none", padding:"12px 16px", borderRadius:"10px", cursor:"pointer", fontSize:"20px", flexShrink:0 }}>📷</button>
            <button onClick={()=>doSearch()} disabled={loading||!apiKey||!isbn.trim()}
              style={{ background:loading||!apiKey||!isbn.trim()?"#ccc":navy, color:gold, border:"none", padding:"12px 22px", borderRadius:"10px", cursor:"pointer", fontFamily:F, fontSize:"14px", fontWeight:700, flexShrink:0 }}>
              {loading?"조회 중…":"조회"}
            </button>
          </div>
          {!apiKey && <p style={{ margin:"10px 0 0", fontSize:"12px", color:"#cc6644", fontFamily:F }}>⚠️ API 키를 먼저 설정해주세요.</p>}
        </div>

        {bookInfo && (
          <div style={{ background:navy, borderRadius:"14px", padding:"18px 22px", marginBottom:"14px", display:"flex", gap:"16px", alignItems:"flex-start" }}>
            {bookInfo.bookImageURL && <img src={bookInfo.bookImageURL} alt="cover" style={{ width:"56px", height:"78px", objectFit:"cover", borderRadius:"4px", flexShrink:0, boxShadow:"0 4px 12px rgba(0,0,0,0.5)" }} />}
            <div>
              <div style={{ color:gold, fontSize:"10px", letterSpacing:"0.2em", marginBottom:"4px", fontFamily:F }}>BOOK INFO</div>
              <div style={{ color:"#f5f0e8", fontSize:"15px", marginBottom:"4px", lineHeight:1.4 }}>{bookInfo.bookname}</div>
              <div style={{ color:"#aaa", fontSize:"12px", fontFamily:F }}>{bookInfo.authors} · {bookInfo.publisher} · {bookInfo.publication_year}</div>
            </div>
          </div>
        )}

        {Object.keys(results).length > 0 && (
          <div style={{ background:"#fffdf7", border:"1px solid #e0d5c0", borderRadius:"16px", overflow:"hidden", boxShadow:"0 4px 18px rgba(0,0,0,0.07)" }}>
            <div style={{ padding:"13px 22px", borderBottom:"1px solid #e0d5c0", background:"#f5f0e8" }}>
              <span style={{ fontSize:"12px", color:"#7a6a52", fontFamily:F, fontWeight:700, letterSpacing:"0.08em" }}>도서관별 소장 현황</span>
            </div>
            {libraries.map((lib,i) => (
              <div key={lib.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"15px 22px", borderBottom:i<libraries.length-1?"1px solid #f0ebe0":"none" }}>
                <div>
                  <div style={{ fontFamily:F, fontSize:"15px", color:navy, marginBottom:"2px" }}>{lib.name}</div>
                  <div style={{ fontFamily:"monospace", fontSize:"11px", color:lib.code?"#bbb":"#e09050" }}>{lib.code||"코드를 설정해주세요"}</div>
                </div>
                <StatusBadge status={results[lib.id]?.status||"loading"} />
              </div>
            ))}
          </div>
        )}

        {Object.keys(results).length===0 && !loading && (
          <div style={{ textAlign:"center", padding:"50px 20px", color:"#c5b89a" }}>
            <div style={{ fontSize:"50px", marginBottom:"12px" }}>📖</div>
            <p style={{ fontFamily:F, fontSize:"14px", lineHeight:1.9, margin:0 }}>📷 버튼으로 바코드를 스캔하거나<br/>ISBN을 직접 입력해 조회해보세요.</p>
          </div>
        )}
        <p style={{ textAlign:"center", marginTop:"24px", fontSize:"11px", color:"#c5b89a", fontFamily:F, lineHeight:1.7 }}>도서관 정보나루 (data4library.kr) API 기반</p>
      </div>
    </div>
  );
}
