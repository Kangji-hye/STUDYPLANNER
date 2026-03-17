// src/components/common/HamburgerMenu.jsx
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import supabase from "../../supabaseClient";
import "./HamburgerMenu.css";

const PROFILE_CACHE_KEY = "planner_profile_cache_v1";

export default function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let alive = true;

    Promise.resolve().then(() => {
      if (!alive) return;
      setOpen(false);
    });

    // 컴포넌트가 사라지거나 effect가 다시 실행되면 실행 막기(안전장치)
    return () => {
      alive = false;
    };
  }, [location.pathname]);


  useEffect(() => {
    if (!open) return;

    const onDown = (e) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target)) return;
      setOpen(false);
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("touchstart", onDown);

    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const go = async (key) => {
    if (key === "planner") return navigate("/planner");
    if (key === "mypage") return navigate("/mypage");
    if (key === "ranking") return navigate("/ranking");

    if (key === "share") return navigate("/share");
    if (key === "recommended-books") return navigate("/recommended-books");

    if (key === "readingrace") {
        window.open(
            "https://rd.dreamschool.or.kr/",
            "_blank",
            "noopener,noreferrer"
        );
        return;
        }
    if (key === "grapeseed") {
        window.open(
            "https://students.grapeseed.com",
            "_blank",
            "noopener,noreferrer"
        );
        return;
        }

    // 3) 로그아웃
    if (key === "logout") {
      const ok = window.confirm("로그아웃 하시겠습니까?");
      if (!ok) return;

      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        alert("로그아웃 중 오류가 발생했습니다.");
        return;
      }

      try {
        localStorage.removeItem(PROFILE_CACHE_KEY);
      } catch {
        //
      }

      navigate("/login");
    }
  };

  return (
    <div className="hamburger">
      <button
        type="button"
        className="hamburger-btn"
        aria-label="메뉴 열기"
        title="메뉴"
        onClick={() => setOpen((v) => !v)}
      >
        ☰
      </button>

      {open && (
        <div className="hamburger-panel" ref={panelRef} role="menu" aria-label="메뉴">
          <button className="hamburger-item" onClick={() => go("planner")} role="menuitem">
            🗓️ 플래너
          </button>

          <button className="hamburger-item" onClick={() => go("mypage")} role="menuitem">
            😊 마이페이지
          </button>

          <button className="hamburger-item" onClick={() => go("recommended-books")} role="menuitem">
            📚 추천도서
          </button>

          <button className="hamburger-item" onClick={() => go("ranking")} role="menuitem">
            🏆 랭킹보기
          </button>

          <button className="hamburger-item" onClick={() => go("share")} role="menuitem">
            🔗 공유하기
          </button>

          <div className="hamburger-divider" />

          <button className="hamburger-item"  type="button" onClick={() => navigate("/gugudan")}>
            ✖️ 구구단 놀이
          </button>

          <button
            className="hamburger-item" type="button" onClick={() => navigate("/wordchain")}>
            🎯 한글끝말잇기
          </button>

          <button className="hamburger-item" type="button" onClick={() => navigate("/english-word-game")}>
            🔠 영어 놀이
          </button>

          <button className="hamburger-item" type="button" onClick={() => navigate("/hanja")} >
            🈶 한자 놀이
          </button>

          <button className="hamburger-item"  type="button" onClick={() => navigate("/bible-quiz")}>
            📖 성경퀴즈
          </button>

          <button className="hamburger-item" type="button" onClick={() => navigate("/typing")}>
           ✍️ 타이핑 연습
          </button>

          <button className="hamburger-item" type="button" onClick={() => navigate("/omok")}>
            ⚫ 오목
          </button>

          <button className="hamburger-item" type="button" onClick={() => navigate("/baduk")}>
            ⚪ 바둑
          </button>

          <button className="hamburger-item" type="button" onClick={() => navigate("/baduk-battle")}>
            ⚔️ 바둑대전
          </button>

          <div className="hamburger-divider" />

          <button className="hamburger-item" type="button" onClick={() => window.open("https://books-tan-three.vercel.app/", "_blank", "noopener,noreferrer")}>
            📷 책 스캐너
          </button>
          <div className="hamburger-divider" />

          <button className="hamburger-item danger" onClick={() => go("logout")} role="menuitem">
            🚪 로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
