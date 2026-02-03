// src/pages/Share.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import "./Share.css";
import HamburgerMenu from "../components/common/HamburgerMenu";

function getKakao() {
  return window.Kakao;
}

export default function Share() {
  const navigate = useNavigate();
  const [copyMsg, setCopyMsg] = useState("");

  const shareUrl = useMemo(() => window.location.origin, []);

  const logoSrc = "/pwa-192x192.png";

  useEffect(() => {
    const Kakao = getKakao();
    const jsKey = import.meta.env.VITE_KAKAO_JS_KEY;

    if (!Kakao || !jsKey) return;

    if (!Kakao.isInitialized()) {
      Kakao.init(jsKey);
    }
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyMsg("링크를 복사했어요!");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopyMsg("링크를 복사했어요!");
      } catch {
        setCopyMsg("복사에 실패했어요. 링크를 길게 눌러 복사해 주세요.");
      }
    } finally {
      setTimeout(() => setCopyMsg(""), 1800);
    }
  };

  return (
    <div className="share-page">
      <header className="top-header">
        <div className="top-row">
            <h1
            className="app-title app-title-link"
            onClick={() => navigate("/planner")}
            title="플래너로 이동"
            >
            공유하기
            </h1>

            <div className="header-right">
            <HamburgerMenu />
            </div>
        </div>
        </header>


      <div className="share-card">
        <img className="share-logo" src={logoSrc} alt="스터디 플래너 로고" />

        <div className="share-link-box">
          <div className="share-link-title">공유 링크</div>
          <div className="share-link">{shareUrl}</div>

          <button type="button" className="share-btn" onClick={copyLink}>
            🔗 링크 복사
          </button>

          {copyMsg && <div className="share-msg">{copyMsg}</div>}
        </div>

        <div className="share-qr-box">
          <div className="share-link-title">QR 코드</div>

          <div className="share-qr">
            <QRCodeCanvas value={shareUrl} size={180} />
          </div>

          <div className="share-qr-help">카메라로 찍으면 바로 열려요.</div>
        </div>
      </div>
    </div>
  );
}
