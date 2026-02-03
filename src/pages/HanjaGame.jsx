// src/pages/HanjaGame.jsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./HanjaGame.css";
import HamburgerMenu from "../components/common/HamburgerMenu";

const HANJA_LEVELS = [
  {
    key: "8",
    label: "8급 (아주 쉬움)",
    items: [
      { word: "山", meaning: "산", hun: "뫼 산" },
      { word: "川", meaning: "내/강", hun: "내 천" },
      { word: "水", meaning: "물", hun: "물 수" },
      { word: "火", meaning: "불", hun: "불 화" },
      { word: "木", meaning: "나무", hun: "나무 목" },
      { word: "金", meaning: "쇠/금", hun: "쇠 금" },
      { word: "土", meaning: "흙", hun: "흙 토" },

      { word: "日", meaning: "해/날", hun: "날 일" },
      { word: "月", meaning: "달", hun: "달 월" },
      { word: "天", meaning: "하늘", hun: "하늘 천" },
      { word: "雨", meaning: "비", hun: "비 우" },
      { word: "風", meaning: "바람", hun: "바람 풍" },

      { word: "人", meaning: "사람", hun: "사람 인" },
      { word: "大", meaning: "큰", hun: "큰 대" },
      { word: "小", meaning: "작은", hun: "작을 소" },
      { word: "上", meaning: "위", hun: "위 상" },
      { word: "下", meaning: "아래", hun: "아래 하" },
      { word: "中", meaning: "가운데", hun: "가운데 중" },

      { word: "口", meaning: "입", hun: "입 구" },
      { word: "目", meaning: "눈", hun: "눈 목" },
      { word: "手", meaning: "손", hun: "손 수" },
      { word: "足", meaning: "발", hun: "발 족" },
      { word: "耳", meaning: "귀", hun: "귀 이" },

      { word: "子", meaning: "아이", hun: "아들 자" },
      { word: "女", meaning: "여자", hun: "여자 여" },
      { word: "男", meaning: "남자", hun: "사내 남" },

      { word: "一", meaning: "하나", hun: "한 일" },
      { word: "二", meaning: "둘", hun: "두 이" },
      { word: "三", meaning: "셋", hun: "석 삼" },
      { word: "四", meaning: "넷", hun: "넉 사" },
      { word: "五", meaning: "다섯", hun: "다섯 오" },

      { word: "六", meaning: "여섯", hun: "여섯 육" },
      { word: "七", meaning: "일곱", hun: "일곱 칠" },
      { word: "八", meaning: "여덟", hun: "여덟 팔" },
      { word: "九", meaning: "아홉", hun: "아홉 구" },
      { word: "十", meaning: "열", hun: "열 십" },
    ],
  },
  {
    key: "7",
    label: "7급 (쉬움)",
    items: [
      { word: "學校", meaning: "학교", hun: "배울 학, 학교 교" },
      { word: "先生", meaning: "선생님", hun: "먼저 선, 날 생" },
      { word: "學生", meaning: "학생", hun: "배울 학, 날 생" },
      { word: "朋友", meaning: "친구", hun: "벗 붕, 벗 우" },
      { word: "家族", meaning: "가족", hun: "집 가, 겨레 족" },
      { word: "父母", meaning: "부모", hun: "아비 부, 어미 모" },
      { word: "兄弟", meaning: "형제", hun: "형 형, 아우 제" },

      { word: "時間", meaning: "시간", hun: "때 시, 사이 간" },
      { word: "今日", meaning: "오늘", hun: "이제 금, 날 일" },
      { word: "明日", meaning: "내일", hun: "밝을 명, 날 일" },

      { word: "食事", meaning: "식사", hun: "먹을 식, 일 사" },
      { word: "朝食", meaning: "아침밥", hun: "아침 조, 먹을 식" },
      { word: "夕食", meaning: "저녁밥", hun: "저녁 석, 먹을 식" },
      { word: "牛乳", meaning: "우유", hun: "소 우, 젖 유" },
      { word: "水分", meaning: "수분", hun: "물 수, 나눌 분" },

      { word: "安全", meaning: "안전", hun: "편안할 안, 온전할 전" },
      { word: "注意", meaning: "주의", hun: "뜻 주, 뜻 의" },
      { word: "約束", meaning: "약속", hun: "맺을 약, 묶을 속" },

      { word: "勉強", meaning: "공부", hun: "힘쓸 면, 굳셀 강" },
      { word: "讀書", meaning: "독서", hun: "읽을 독, 글 서" },
      { word: "宿題", meaning: "숙제", hun: "잘 숙, 제목 제" },

      { word: "天氣", meaning: "날씨", hun: "하늘 천, 기운 기" },
      { word: "雨天", meaning: "비 오는 날", hun: "비 우, 하늘 천" },
      { word: "晴天", meaning: "맑은 날", hun: "갤 청, 하늘 천" },

      { word: "公園", meaning: "공원", hun: "공변될 공, 동산 원" },
      { word: "家", meaning: "집", hun: "집 가" },
      { word: "門", meaning: "문", hun: "문 문" },
      { word: "地圖", meaning: "지도", hun: "땅 지, 그림 도" },
      { word: "道路", meaning: "도로", hun: "길 도, 길 로" },
    ],
  },
  {
    key: "6",
    label: "6급 (보통)",
    items: [
      { word: "努力", meaning: "노력", hun: "힘쓸 노, 힘 력" },
      { word: "目標", meaning: "목표", hun: "눈 목, 표지 표" },
      { word: "成長", meaning: "성장", hun: "이룰 성, 자랄 장" },
      { word: "成功", meaning: "성공", hun: "이룰 성, 공 공" },
      { word: "失敗", meaning: "실패", hun: "잃을 실, 패할 패" },

      { word: "準備", meaning: "준비", hun: "준비할 준, 갖출 비" },
      { word: "計畫", meaning: "계획", hun: "셀 계, 그을 획" },
      { word: "習慣", meaning: "습관", hun: "익힐 습, 버릇 관" },
      { word: "反省", meaning: "반성", hun: "돌이킬 반, 살필 성" },

      { word: "集中", meaning: "집중", hun: "모을 집, 가운데 중" },
      { word: "練習", meaning: "연습", hun: "익힐 련, 익힐 습" },
      { word: "挑戰", meaning: "도전", hun: "돋울 도, 싸울 전" },

      { word: "規則", meaning: "규칙", hun: "법 규, 법 칙" },
      { word: "責任", meaning: "책임", hun: "맡을 책, 맡길 임" },
      { word: "協力", meaning: "협력", hun: "도울 협, 힘 력" },

      { word: "整理", meaning: "정리", hun: "가지런할 정, 다스릴 리" },
      { word: "掃除", meaning: "청소", hun: "쓸 소, 없앨 제" },
      { word: "點檢", meaning: "점검", hun: "점 점, 검사할 검" },

      { word: "健康", meaning: "건강", hun: "굳셀 건, 편안할 강" },
      { word: "運動", meaning: "운동", hun: "옮길 운, 움직일 동" },
      { word: "休息", meaning: "휴식", hun: "쉴 휴, 쉴 식" },

      { word: "順序", meaning: "순서", hun: "순할 순, 차례 서" },
      { word: "方法", meaning: "방법", hun: "모 방, 법 법" },
      { word: "說明", meaning: "설명", hun: "말씀 설, 밝을 명" },
      { word: "確認", meaning: "확인", hun: "굳을 확, 알 인" },
    ],
  },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getLevelByKey(levelKey) {
  return HANJA_LEVELS.find((lv) => lv.key === levelKey) ?? HANJA_LEVELS[0];
}

function formatChoice(item) {
  const meaning = String(item?.meaning ?? "").trim();
  const hun = String(item?.hun ?? "").trim();

  if (!hun) return meaning;
  return `${meaning} (${hun})`;
}

function makeChoices(levelItems, correctItem) {
  const labels = levelItems.map((it) => formatChoice(it));
  const correctLabel = formatChoice(correctItem);

  const wrongPool = labels.filter((s) => s !== correctLabel);
  const wrongs = shuffle(wrongPool).slice(0, 2);

  return shuffle([correctLabel, ...wrongs]);
}

function pickQuestion(items, usedIndexes) {
  if (!items || items.length === 0) return null;

  const allUsed = usedIndexes.size >= items.length;
  const used = allUsed ? new Set() : new Set(usedIndexes);

  let idx = Math.floor(Math.random() * items.length);
  let guard = 0;
  while (used.has(idx) && guard < 300) {
    idx = Math.floor(Math.random() * items.length);
    guard++;
  }

  used.add(idx);

  const item = items[idx];
  const correctLabel = formatChoice(item);

  return {
    nextUsedIndexes: used,
    current: {
      word: item.word,
      meaning: item.meaning,
      hun: item.hun,
      correctLabel,
      choices: makeChoices(items, item),
    },
    wasReset: allUsed,
  };
}

export default function HanjaGame() {
  const navigate = useNavigate();

  const [levelKey, setLevelKey] = useState("8");

  const init = useMemo(() => {
    const lv = getLevelByKey("8");
    const q = pickQuestion(lv.items, new Set());
    return q;
  }, []);

  const [score, setScore] = useState(0);
  const [usedIndexes, setUsedIndexes] = useState(() => init?.nextUsedIndexes ?? new Set());
  const [current, setCurrent] = useState(() => init?.current ?? null);
  const [picked, setPicked] = useState(null);
  const [resultMsg, setResultMsg] = useState("");

  const level = useMemo(() => getLevelByKey(levelKey), [levelKey]);

  const startFreshForLevel = (nextKey, msg = "") => {
    const lv = getLevelByKey(nextKey);
    const q = pickQuestion(lv.items, new Set());

    setScore(0);
    setPicked(null);
    setResultMsg(msg);

    setUsedIndexes(q?.nextUsedIndexes ?? new Set());
    setCurrent(q?.current ?? null);
  };

  const onChangeLevel = (nextKey) => {
    setLevelKey(nextKey);
    startFreshForLevel(nextKey, "");
  };

  const pickNextQuestion = () => {
    const q = pickQuestion(level.items, usedIndexes);

    if (!q || !q.current) {
      setResultMsg("문제가 비어 있어요. 급수 데이터를 확인해 주세요.");
      return;
    }

    if (q.wasReset) {
      setScore(0);
      setResultMsg("문제를 다 풀어서 처음부터 다시 시작해요.");
    } else {
      setResultMsg("");
    }

    setUsedIndexes(q.nextUsedIndexes);
    setPicked(null);
    setCurrent(q.current);
  };

  const onPickChoice = (choice) => {
    if (!current) return;
    if (picked) return;

    setPicked(choice);

    const isCorrect = choice === current.correctLabel;

    if (isCorrect) {
      setScore((s) => s + 10);
      setResultMsg("정답이에요. +10점");
    } else {
      setScore((s) => s - 5);
      setResultMsg(`아쉬워요. 정답은 "${current.correctLabel}" 이에요. -5점`);
    }
  };

  const onReset = () => {
    startFreshForLevel(levelKey, "");
  };

  if (!current) {
    return (
      <div className="gugu-page notranslate">
        <div className="gugu-head">
          <button type="button" className="gugu-back" onClick={() => navigate("/planner")}>
            ← 플래너
          </button>

          <div className="gugu-title">한자놀이</div>

          <div className="gugu-head-right">
            <button type="button" className="gugu-restart" onClick={onReset}>
              다시하기
            </button>
            <div className="gugu-menu">
              <HamburgerMenu />
            </div>
          </div>
        </div>

        <div className="hanja-card">
          <div className="hanja-loading">문제를 불러오지 못했어요. 급수 데이터를 확인해 주세요.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="gugu-page notranslate">
      <div className="gugu-head">
        <button type="button" className="gugu-back" onClick={() => navigate("/planner")}>
          ← 플래너
        </button>

        <div className="gugu-title">한자놀이</div>

        <div className="gugu-head-right">
          <button type="button" className="gugu-restart" onClick={onReset}>
            다시하기
          </button>

          <div className="gugu-menu">
            <HamburgerMenu />
          </div>
        </div>
      </div>

      <div className="hanja-card">
        <div className="hanja-row">
          <div className="hanja-label">급수</div>

          <select className="hanja-select" value={levelKey} onChange={(e) => onChangeLevel(e.target.value)}>
            {HANJA_LEVELS.map((lv) => (
              <option key={lv.key} value={lv.key}>
                {lv.label}
              </option>
            ))}
          </select>
        </div>

        <div className="hanja-score">
          점수: <b>{score}</b>
          <span className="hanja-mini">
            (푼 문제: {Math.min(usedIndexes.size, level.items.length)}/{level.items.length})
          </span>
        </div>

        <div className="hanja-word-box" aria-label="한자 단어">
          <div className="hanja-word">{current.word}</div>
          <div className="hanja-hint">뜻을 골라 주세요</div>
        </div>

        <div className="hanja-choices" aria-label="보기 3개">
          {current.choices.map((c) => {
            const isPicked = picked === c;
            const isCorrect = c === current.correctLabel;

            let cls = "hanja-choice";
            if (picked) {
              if (isCorrect) cls += " correct";
              if (isPicked && !isCorrect) cls += " wrong";
            } else if (isPicked) {
              cls += " picked";
            }

            return (
              <button key={c} type="button" className={cls} onClick={() => onPickChoice(c)}>
                {c}
              </button>
            );
          })}
        </div>

        {resultMsg && <div className="hanja-result">{resultMsg}</div>}

        <div className="hanja-actions">
          <button type="button" className="hanja-btn" onClick={pickNextQuestion}>
            다음 문제
          </button>

          <button type="button" className="hanja-btn ghost" onClick={onReset}>
            처음부터
          </button>
        </div>
      </div>
    </div>
  );
}
