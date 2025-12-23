// src/utils/emoji.js
export const EMOJI_POOL = [
  "🚀", "🛸", "⚡", "🔥", "⭐",
  "🚗", "🏎️", "🚓", "🚒", "🚜",
  "🦖", "🦕", "🦁", "🐯", "🦈",
  "⚽", "🏀", "⚾", "🥅", "🏆",
  "🎮", "🕹️", "🛡️", "⚔️", "👑",
];

export const getRandomEmoji = () => {
  return EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)];
};
