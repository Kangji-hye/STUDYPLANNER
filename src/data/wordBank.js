// src/data/wordBank.js
// ✅ 단어 파일들을 한 곳에서 모아서 export
import { WORDS as EASY } from "./easyWords";
import { WORDS as NORMAL } from "./normalWords";
import { WORDS as HARD } from "./hardWords";
import { WORDS as ANCHORS } from "./anchors";
import { WORDS as BIBLE_WORDS } from "./bibleWords";

export const BOT_WORDS = {
  easy: EASY,
  normal: NORMAL,
  hard: HARD,
};

export { ANCHORS, BIBLE_WORDS };
