// src/hooks/useAppSounds.js
import { useEffect, useRef } from "react";


export function useAppSounds({
  todoDoneSrc = "/done.mp3",
  timerEndSrc = "/time1.mp3",
  allDoneDefaultSrc = "/finish1.mp3",
  finishEnabled = true,
} = {}) {
  const unlockedRef = useRef(false);

  const todoDoneRef = useRef(null);
  const timerEndRef = useRef(null);
  const allDoneRef = useRef(null);

  useEffect(() => {
    if (!todoDoneRef.current) {
      const a = new Audio(todoDoneSrc);
      a.preload = "auto";
      todoDoneRef.current = a;
    }
    if (!timerEndRef.current) {
      const a = new Audio(timerEndSrc);
      a.preload = "auto";
      timerEndRef.current = a;
    }
    if (!allDoneRef.current) {
      const a = new Audio(allDoneDefaultSrc);
      a.preload = "auto";
      allDoneRef.current = a;
    }

    return () => {
      [todoDoneRef.current, timerEndRef.current, allDoneRef.current].forEach((a) => {
        try {
          if (!a) return;
          a.pause();
        } catch {
          //
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unlockOnce = async () => {
      if (unlockedRef.current) return;

      const audios = [todoDoneRef.current, timerEndRef.current, allDoneRef.current].filter(Boolean);
      if (audios.length === 0) return;

      try {
        for (const a of audios) {
          if (!a.src) continue;
          a.muted = true;
          a.volume = 0;
          await a.play();
          a.pause();
          a.currentTime = 0;
          a.muted = false;
          a.volume = 1;
        }
        unlockedRef.current = true;
      } catch {
        // 
      }
    };

    window.addEventListener("pointerdown", unlockOnce, { once: true });
    window.addEventListener("keydown", unlockOnce, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockOnce);
      window.removeEventListener("keydown", unlockOnce);
    };
  }, []);

  const play = async (audioRef, src, { volume = 0.9 } = {}) => {
    const a = audioRef.current;
    if (!a) return;

    const next = String(src || "").trim();
    if (next) {
      const nextHref = new URL(next, window.location.origin).href;
      if (a.src !== nextHref) {
        a.src = next;
        try {
          a.load();
        } catch {
          //
        }
      }
    }

    try {
      a.pause();
    } catch {
      //
    }
    try {
      a.currentTime = 0;
    } catch {
      //
    }

    a.volume = volume;

    try {
      await a.play();
    } catch {
      // 
    }
  };

  const playTodoDone = () => {
    return play(todoDoneRef, todoDoneSrc, { volume: 0.9 });
  };

  const playTimerEnd = () => {
    return play(timerEndRef, timerEndSrc, { volume: 0.9 });
  };

  const playAllDone = (userPickedSrc) => {
    if (finishEnabled === false) return;

    const src = String(userPickedSrc || "").trim() || allDoneDefaultSrc;
    return play(allDoneRef, src, { volume: 0.9 });
  };

  const previewAllDone = (userPickedSrc) => {
    const src = String(userPickedSrc || "").trim() || allDoneDefaultSrc;
    return play(allDoneRef, src, { volume: 0.9 });
  };

  return {
    playTodoDone,
    playTimerEnd,
    playAllDone,
    previewAllDone,
  };
}
