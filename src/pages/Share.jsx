// src/pages/Share.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import "./Share.css";
import HamburgerMenu from "../components/common/HamburgerMenu";

// ✅ 카카오 SDK는 index.html에서 script로 로드할 예정이라 window.Kakao를 씁니다.
function getKakao() {
  return window.Kakao;
}

export default function Share() {
  const navigate = useNavigate();
  const [copyMsg, setCopyMsg] = useState("");

  // ✅ 공유할 링크(배포/로컬 모두 대응): 현재 사이트의 기본 주소를 사용
  // 예: https://studyplanner-tau.vercel.app/
  const shareUrl = useMemo(() => window.location.origin, []);

  // ✅ 로고는 public 폴더에 있는 걸 쓰면 제일 편합니다.
  // 아래는 예시로 PWA 아이콘을 사용(없으면 파일명만 바꿔주세요)
  const logoSrc = "/pwa-192x192.png";

  // ✅ 카카오 SDK 초기화
  useEffect(() => {
    const Kakao = getKakao();
    const jsKey = import.meta.env.VITE_KAKAO_JS_KEY;

    // 키가 없거나 SDK가 아직 로드되지 않았으면 그냥 넘어감(페이지는 정상 사용 가능)
    if (!Kakao || !jsKey) return;

    // 이미 초기화 되어있으면 또 init 하지 않음
    if (!Kakao.isInitialized()) {
      Kakao.init(jsKey);
    }
  }, []);

  // ✅ 링크 복사(모바일/PC 모두 최대한 잘 되게)
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyMsg("링크를 복사했어요!");
    } catch {
      // 일부 브라우저(권한/보안)에서 clipboard가 막히면 fallback
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

  // 카카오 공유
  // const shareKakao = () => {
  //   const Kakao = getKakao();
  //   const jsKey = import.meta.env.VITE_KAKAO_JS_KEY;

  //   if (!jsKey) {
  //     alert("카카오 공유를 쓰려면 VITE_KAKAO_JS_KEY 설정이 필요해요.");
  //     return;
  //   }
  //   if (!Kakao) {
  //     alert("카카오 SDK가 아직 준비되지 않았어요. (index.html 스크립트 확인)");
  //     return;
  //   }
  //   if (!Kakao.isInitialized()) {
  //     alert("카카오 SDK 초기화가 안 됐어요. 키/도메인 설정을 확인해 주세요.");
  //     return;
  //   }

  //   // 가장 무난한 피드 템플릿(공식 문서 흐름)
  //   Kakao.Share.sendDefault({
  //     objectType: "feed",
  //     content: {
  //       title: "초등 스터디 플래너",
  //       description: "오늘 할 일 체크하고, 도장 모으고, 레벨 올려요!",
  //       imageUrl: `${shareUrl}${logoSrc}`, // 이미지가 실제로 열리는 URL이어야 해요
  //       link: {
  //         mobileWebUrl: shareUrl,
  //         webUrl: shareUrl,
  //       },
  //     },
  //     buttons: [
  //       {
  //         title: "플래너 열기",
  //         link: {
  //           mobileWebUrl: shareUrl,
  //           webUrl: shareUrl,
  //         },
  //       },
  //     ],
  //   });
  // };

  return (
    <div className="share-page">
      <header className="top-header">
        <div className="top-row">
            {/* 왼쪽: 타이틀 */}
            <h1
            className="app-title app-title-link"
            onClick={() => navigate("/planner")}
            title="플래너로 이동"
            >
            공유하기
            </h1>

            {/* 오른쪽: 햄버거 메뉴 (모든 페이지 공통 위치) */}
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

        {/* <div className="share-actions">
          <button type="button" className="share-btn kakao" onClick={shareKakao}>
            💬 카카오로 공유
          </button>
        </div> */}

        {/* <div className="share-tip">
          카카오 공유는 아직 준비 중이에요.. 
        </div> */}
      </div>
    </div>
  );
}
