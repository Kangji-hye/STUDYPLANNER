// src/pages/PlayRoom.jsx
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import "./PlayRoom.css";

const GAMES = [
  { emoji: "⚫", name: "오목",       desc: "5개를 먼저 연결하면 승리!", path: "/omok",              color: "gray"   },
  { emoji: "⚪", name: "바둑 (AI)",  desc: "AI와 맞붙는 바둑 대결",    path: "/baduk",             color: "blue"   },
  { emoji: "⚔️", name: "바둑대전",  desc: "친구와 실시간 바둑 대전",   path: "/baduk-battle",      color: "red"    },
  { emoji: "9️⃣", name: "구구단 놀이",desc: "구구단을 빠르게 맞혀요",   path: "/gugudan",           color: "orange" },
  { emoji: "🎯", name: "끝말잇기",   desc: "한글 끝말잇기로 어휘력 UP", path: "/wordchain",         color: "green"  },
  { emoji: "🔠", name: "영어 놀이",  desc: "영어 단어를 맞혀 보세요",   path: "/english-word-game", color: "blue"   },
  { emoji: "🈶", name: "한자 놀이",  desc: "한자의 뜻과 음을 맞혀요",   path: "/hanja",             color: "purple" },
  { emoji: "📖", name: "성경퀴즈",   desc: "성경 말씀 퀴즈 도전!",     path: "/bible-quiz",        color: "yellow" },
  { emoji: "⌨️", name: "타이핑 연습",desc: "빠르고 정확하게 타이핑!",   path: "/typing",            color: "pink"   },
];

// 배경 떠다니는 파티클 이모지
const PARTICLES = ["⭐", "✨", "🌟", "💫", "🎉", "🎊", "🎈", "🎮", "🏆", "🌈"];

function GameCard({ game, index, onClick }) {
  const cardRef = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [ripples, setRipples] = useState([]);
  const [isHovered, setIsHovered] = useState(false);

  // 마우스 이동 → 3D 틸트
  const handleMouseMove = useCallback((e) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    setTilt({ x: dy * -12, y: dx * 12 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  }, []);

  // 클릭 → 리플 효과
  const handleClick = useCallback((e) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const id = Date.now();
    setRipples((prev) => [
      ...prev,
      { id, x: e.clientX - rect.left, y: e.clientY - rect.top },
    ]);
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 600);
    onClick();
  }, [onClick]);

  return (
    <button
      ref={cardRef}
      type="button"
      className={`playroom-card playroom-card--${game.color}${isHovered ? " is-hovered" : ""}`}
      style={{
        animationDelay: `${index * 70}ms`,
        transform: `perspective(600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateZ(${isHovered ? "8px" : "0px"})`,
        transition: tilt.x === 0 && tilt.y === 0
          ? "transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"
          : "transform 0.1s linear",
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {/* 리플 */}
      {ripples.map((r) => (
        <span
          key={r.id}
          className="playroom-ripple"
          style={{ left: r.x, top: r.y }}
        />
      ))}

      {/* 빛 반사 레이어 */}
      <div className="playroom-card-shine" />

      <div className="playroom-card-emoji">{game.emoji}</div>
      <div className="playroom-card-name">{game.name}</div>
      <div className="playroom-card-desc">{game.desc}</div>
      <div className="playroom-card-arrow">▶ 시작</div>
    </button>
  );
}

export default function PlayRoom() {
  const navigate = useNavigate();

  return (
    <div className="playroom-page">
      {/* 배경 파티클 */}
      <div className="playroom-particles" aria-hidden="true">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="playroom-particle"
            style={{
              left: `${(i * 97 + 7) % 100}%`,
              animationDelay: `${i * 0.8}s`,
              animationDuration: `${6 + (i % 4)}s`,
              fontSize: `${14 + (i % 3) * 6}px`,
            }}
          >
            {p}
          </span>
        ))}
      </div>

      {/* 헤더 */}
      <div className="playroom-header">
        <div className="playroom-header-left">
          <button type="button" className="playroom-back" onClick={() => navigate(-1)}>
            ← 뒤로
          </button>
        </div>
        <div className="playroom-header-center">
          <div className="playroom-title">
            {Array.from("🎮 놀이방").map((ch, i) => (
              <span key={i} className="playroom-title-char" style={{ animationDelay: `${i * 60}ms` }}>
                {ch}
              </span>
            ))}
          </div>
          <div className="playroom-subtitle">오늘 할일을 다 마치면 게임이 열려요! 🌟</div>
        </div>
        <div className="playroom-header-right">
          <HamburgerMenu />
        </div>
      </div>

      {/* 게임 카드 그리드 */}
      <div className="playroom-body">
        <div className="playroom-grid">
          {GAMES.map((game, i) => (
            <GameCard
              key={game.path}
              game={game}
              index={i}
              onClick={() => navigate(game.path)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
