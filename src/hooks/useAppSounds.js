// src/hooks/useAppSounds.js
import { useEffect, useRef } from "react";

/**
 * 앱 전체 사운드 전담 훅
 * - 오디오 객체를 1번만 만들고 계속 재사용해서 안정성을 높입니다.
 * - 모바일/PWA 자동재생 차단을 줄이기 위해 "언락(무음 재생)"을 한 번만 시도합니다.
 */
export function useAppSounds({
  // 1) 할 일 하나 완료할 때 나는 효과음
  todoDoneSrc = "/done.mp3",

  // 2) 타이머(알람) 끝날 때 나는 효과음
  timerEndSrc = "/time1.mp3",

  // 3) 전부 완료할 때 나는 음악(사용자 선택), 없으면 기본값
  allDoneDefaultSrc = "/finish1.mp3",

  // 전체 사운드 꺼짐(원하면 todo/timer에도 동일 적용 가능)
  finishEnabled = true,
} = {}) {
  const unlockedRef = useRef(false);

  const todoDoneRef = useRef(null);
  const timerEndRef = useRef(null);
  const allDoneRef = useRef(null);

  // 오디오 객체 생성은 "한 번만"
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
      // 페이지 이동/언마운트 때 깔끔히 정리
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

  // iOS/PWA 자동재생 차단 완화: 첫 사용자 제스처에서 무음 재생 후 정지
  useEffect(() => {
    const unlockOnce = async () => {
      if (unlockedRef.current) return;

      const audios = [todoDoneRef.current, timerEndRef.current, allDoneRef.current].filter(Boolean);
      if (audios.length === 0) return;

      try {
        for (const a of audios) {
          // 일부 기기에서 src가 비어있으면 실패하니 방어
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
        // 실패해도 괜찮아요. 다음 사용자 제스처에서 다시 시도될 수 있습니다.
      }
    };

    window.addEventListener("pointerdown", unlockOnce, { once: true });
    window.addEventListener("keydown", unlockOnce, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockOnce);
      window.removeEventListener("keydown", unlockOnce);
    };
  }, []);

  // 공통 재생 함수(안전하게)
  const play = async (audioRef, src, { volume = 0.9 } = {}) => {
    const a = audioRef.current;
    if (!a) return;

    // src 교체가 필요하면 교체
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

    // 되감고 재생
    try {
      a.pause();
    } catch {
      //
    }
    try {
      a.currentTime = 0;
    } catch {
      // 일부 스트리밍/코덱에서 막히면 무시
    }

    a.volume = volume;

    try {
      await a.play();
    } catch {
      // 모바일에서 막힐 수 있음(언락으로 대부분 줄어듭니다)
    }
  };

  // 1) 할 일 1개 완료 소리
  const playTodoDone = () => {
    // 여기서도 “전체 사운드 끄기”를 같이 적용하고 싶으면 아래 조건을 살리면 됩니다.
    // if (finishEnabled === false) return;

    return play(todoDoneRef, todoDoneSrc, { volume: 0.9 });
  };

  // 2) 타이머 종료 소리
  const playTimerEnd = () => {
    return play(timerEndRef, timerEndSrc, { volume: 0.9 });
  };

  // 3) 전체 완료 음악(사용자 선택 우선, 없으면 기본 1번)
  const playAllDone = (userPickedSrc) => {
    if (finishEnabled === false) return;

    const src = String(userPickedSrc || "").trim() || allDoneDefaultSrc;
    return play(allDoneRef, src, { volume: 0.9 });
  };

  // 마이페이지 미리듣기 전용(설정 OFF여도 미리듣기는 되게 하고 싶을 때)
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
