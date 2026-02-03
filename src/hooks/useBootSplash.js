// src/hooks/useBootSplash.js
import { useEffect } from "react";

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
