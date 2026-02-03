// src/data/englishWords.js

export const WORDS = {
  low: [
    { word: "apple", meanings: ["사과"], wrong: [["바나나"], ["포도"]] },
    { word: "banana", meanings: ["바나나"], wrong: [["사과"], ["딸기"]] },
    { word: "grape", meanings: ["포도"], wrong: [["오렌지"], ["사과"]] },
    { word: "orange", meanings: ["오렌지"], wrong: [["포도"], ["복숭아"]] },
    { word: "milk", meanings: ["우유"], wrong: [["물"], ["주스"]] },
    { word: "water", meanings: ["물"], wrong: [["우유"], ["빵"]] },
    { word: "bread", meanings: ["빵"], wrong: [["밥"], ["우유"]] },
    { word: "rice", meanings: ["밥"], wrong: [["빵"], ["국"]] },

    { word: "cat", meanings: ["고양이"], wrong: [["강아지"], ["토끼"]] },
    { word: "dog", meanings: ["강아지"], wrong: [["고양이"], ["곰"]] },
    { word: "rabbit", meanings: ["토끼"], wrong: [["사자"], ["고양이"]] },
    { word: "bear", meanings: ["곰"], wrong: [["기린"], ["강아지"]] },

    { word: "sun", meanings: ["해"], wrong: [["달"], ["별"]] },
    { word: "moon", meanings: ["달"], wrong: [["해"], ["비"]] },
    { word: "rain", meanings: ["비"], wrong: [["눈"], ["바람"]] },
    { word: "snow", meanings: ["눈"], wrong: [["비"], ["구름"]] },

    { word: "red", meanings: ["빨강"], wrong: [["파랑"], ["초록"]] },
    { word: "blue", meanings: ["파랑"], wrong: [["노랑"], ["빨강"]] },
    { word: "green", meanings: ["초록"], wrong: [["검정"], ["빨강"]] },
    { word: "yellow", meanings: ["노랑"], wrong: [["초록"], ["파랑"]] },
  ],

  mid: [
    { word: "school", meanings: ["학교"], wrong: [["병원"], ["공원"]] },
    { word: "teacher", meanings: ["선생님"], wrong: [["학생"], ["의사"]] },
    { word: "student", meanings: ["학생"], wrong: [["선생님"], ["요리사"]] },
    { word: "homework", meanings: ["숙제"], wrong: [["점심"], ["운동"]] },
    { word: "library", meanings: ["도서관"], wrong: [["시장"], ["놀이터"]] },
    { word: "classroom", meanings: ["교실"], wrong: [["침실"], ["주방"]] },

    { word: "morning", meanings: ["아침"], wrong: [["저녁"], ["밤"]] },
    { word: "afternoon", meanings: ["오후"], wrong: [["아침"], ["새벽"]] },
    { word: "evening", meanings: ["저녁"], wrong: [["아침"], ["정오"]] },
    { word: "weekend", meanings: ["주말"], wrong: [["평일"], ["방학"]] },

    { word: "healthy", meanings: ["건강한"], wrong: [["배고픈"], ["느린"]] },
    { word: "tired", meanings: ["피곤한"], wrong: [["신나는"], ["깨끗한"]] },
    { word: "hungry", meanings: ["배고픈"], wrong: [["피곤한"], ["무서운"]] },
    { word: "happy", meanings: ["행복한"], wrong: [["화난"], ["슬픈"]] },

    { word: "practice", meanings: ["연습하다", "연습"], wrong: [["잊다"], ["싸우다"]] },
    { word: "remember", meanings: ["기억하다"], wrong: [["잊다"], ["자르다"]] },
    { word: "forget", meanings: ["잊다"], wrong: [["기억하다"], ["만들다"]] },
    { word: "help", meanings: ["돕다", "도움"], wrong: [["밀다"], ["숨다"]] },

    { word: "music", meanings: ["음악"], wrong: [["미술"], ["체육"]] },
    { word: "science", meanings: ["과학"], wrong: [["국어"], ["역사"]] },
    { word: "history", meanings: ["역사"], wrong: [["수학"], ["과학"]] },
    { word: "math", meanings: ["수학"], wrong: [["미술"], ["음악"]] },
  ],

  high: [
    { word: "improve", meanings: ["개선하다", "향상시키다"], wrong: [["포기하다"], ["숨기다"]] },
    { word: "decide", meanings: ["결정하다"], wrong: [["기다리다"], ["반복하다"]] },
    { word: "prepare", meanings: ["준비하다"], wrong: [["망치다"], ["멀리하다"]] },
    { word: "increase", meanings: ["늘리다", "증가하다"], wrong: [["줄이다"], ["멈추다"]] },
    { word: "reduce", meanings: ["줄이다", "감소하다"], wrong: [["늘리다"], ["채우다"]] },

    { word: "important", meanings: ["중요한"], wrong: [["시끄러운"], ["바쁜"]] },
    { word: "different", meanings: ["다른"], wrong: [["같은"], ["늦은"]] },
    { word: "careful", meanings: ["조심스러운", "주의 깊은"], wrong: [["부주의한"], ["졸린"]] },
    { word: "comfortable", meanings: ["편안한"], wrong: [["위험한"], ["답답한"]] },

    { word: "promise", meanings: ["약속", "약속하다"], wrong: [["변명"], ["실수"]] },
    { word: "schedule", meanings: ["일정", "스케줄"], wrong: [["지도"], ["가격표"]] },
    { word: "habit", meanings: ["습관"], wrong: [["벌"], ["기분"]] },
    { word: "rule", meanings: ["규칙"], wrong: [["선물"], ["소리"]] },

    { word: "responsible", meanings: ["책임감 있는"], wrong: [["게으른"], ["불친절한"]] },
    { word: "challenge", meanings: ["도전", "도전하다"], wrong: [["포기"], ["복사하다"]] },
    { word: "focus", meanings: ["집중", "집중하다"], wrong: [["흩어지다"], ["미루다"]] },
    { word: "consider", meanings: ["고려하다"], wrong: [["무시하다"], ["반드시 하다"]] },
    { word: "experience", meanings: ["경험", "경험하다"], wrong: [["약속"], ["장소"]] },
    { word: "encourage", meanings: ["격려하다"], wrong: [["혼내다"], ["막다"]] },
  ],
};
