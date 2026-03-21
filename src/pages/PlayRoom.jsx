// src/pages/PlayRoom.jsx
import { useNavigate } from "react-router-dom";
import HamburgerMenu from "../components/common/HamburgerMenu";
import "./PlayRoom.css";

// 게임 목록 (우선순위 순서)
const GAMES = [
  {
    emoji: "⚫",
    name: "오목",
    desc: "5개를 먼저 연결하면 승리!",
    path: "/omok",
    color: "gray",
  },
  {
    emoji: "⚪",
    name: "바둑 (AI)",
    desc: "AI와 맞붙는 바둑 대결",
    path: "/baduk",
    color: "blue",
  },
  {
    emoji: "⚔️",
    name: "바둑대전",
    desc: "친구와 실시간 바둑 대전",
    path: "/baduk-battle",
    color: "red",
  },
  {
    emoji: "✖️",
    name: "구구단 놀이",
    desc: "구구단을 빠르게 맞혀요",
    path: "/gugudan",
    color: "orange",
  },
  {
    emoji: "🎯",
    name: "끝말잇기",
    desc: "한글 끝말잇기로 어휘력 UP",
    path: "/wordchain",
    color: "green",
  },
  {
    emoji: "🔠",
    name: "영어 놀이",
    desc: "영어 단어를 맞혀 보세요",
    path: "/english-word-game",
    color: "blue",
  },
  {
    emoji: "🈶",
    name: "한자 놀이",
    desc: "한자의 뜻과 음을 맞혀요",
    path: "/hanja",
    color: "purple",
  },
  {
    emoji: "📖",
    name: "성경퀴즈",
    desc: "성경 말씀 퀴즈 도전!",
    path: "/bible-quiz",
    color: "yellow",
  },
  {
    emoji: "✍️",
    name: "타이핑 연습",
    desc: "빠르고 정확하게 타이핑!",
    path: "/typing",
    color: "pink",
  },
];

export default function PlayRoom() {
  const navigate = useNavigate();

  return (
    <div className="playroom-page">
      {/* 헤더 */}
      <div className="playroom-header">
        <div className="playroom-header-left">
          <button
            type="button"
            className="playroom-back"
            onClick={() => navigate(-1)}
          >
            ← 뒤로
          </button>
        </div>
        <div className="playroom-header-center">
          <div className="playroom-title">🎮 놀이방</div>
          <div className="playroom-subtitle">오늘 할일을 다 마치면 게임이 열려요!</div>
        </div>
        <div className="playroom-header-right">
          <HamburgerMenu />
        </div>
      </div>

      {/* 게임 카드 그리드 */}
      <div className="playroom-body">
        <div className="playroom-grid">
          {GAMES.map((game, i) => (
            <button
              key={game.path}
              type="button"
              className={`playroom-card playroom-card--${game.color}`}
              style={{ animationDelay: `${i * 60}ms` }}
              onClick={() => navigate(game.path)}
            >
              <div className="playroom-card-emoji">{game.emoji}</div>
              <div className="playroom-card-name">{game.name}</div>
              <div className="playroom-card-desc">{game.desc}</div>
              <div className="playroom-card-arrow">▶</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
