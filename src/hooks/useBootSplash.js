// src/hooks/useBootSplash.js
import { useEffect } from "react";

// loading이 false가 되면 #boot-splash 제거
export const useBootSplash = (loading) => {
  useEffect(() => {
    if (loading) return;

    const splash = document.getElementById("boot-splash");
    if (!splash) return;

    requestAnimationFrame(() => {
      splash.remove();
    });
  }, [loading]);
};
