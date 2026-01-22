// src/hooks/useRestoreToToday.js
import { useEffect } from "react";
import { toKstDayKey } from "../utils/dateKst";

export const useRestoreToToday = (setSelectedDate) => {
  useEffect(() => {
    const KEY = "planner_last_active_day_key_v1";

    const sync = () => {
      const todayKey = toKstDayKey(new Date());
      try {
        const lastKey = localStorage.getItem(KEY);

        // "복원 상황"에서만 오늘로 이동
        if (lastKey && lastKey !== todayKey) {
          setSelectedDate(new Date());
        }

        localStorage.setItem(KEY, todayKey);
      } catch {}
    };

    sync();

    const onVisibility = () => document.visibilityState === "visible" && sync();
    const onFocus = () => sync();
    const onPageShow = () => sync();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [setSelectedDate]);
};
