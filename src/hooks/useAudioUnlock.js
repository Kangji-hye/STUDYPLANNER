// src/hooks/useAudioUnlock.js
import { useEffect } from "react";

export const useAudioUnlock = (finishAudioRef, src) => {
  useEffect(() => {
    const unlock = async () => {
      try {
        if (!finishAudioRef.current) {
          finishAudioRef.current = new Audio(src || "/finish.mp3");
          finishAudioRef.current.preload = "auto";
        }
        const a = finishAudioRef.current;
        if (a.__unlocked) return;

        a.muted = true;
        await a.play();
        a.pause();
        a.currentTime = 0;
        a.muted = false;

        a.__unlocked = true;
      } catch {
        //
      }
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [finishAudioRef, src]);
};
