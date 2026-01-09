// src/context/SoundSettingsContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";

const SoundSettingsContext = createContext(null);

export const SoundSettingsProvider = ({ children }) => {
  // 기본값: 켜짐(true). 저장값이 있으면 그걸 우선.
  const [sfxEnabled, setSfxEnabled] = useState(() => {
    const saved = localStorage.getItem("sfxEnabled");
    return saved === null ? true : saved === "true";
  });

  useEffect(() => {
    localStorage.setItem("sfxEnabled", String(sfxEnabled));
  }, [sfxEnabled]);

  return (
    <SoundSettingsContext.Provider value={{ sfxEnabled, setSfxEnabled }}>
      {children}
    </SoundSettingsContext.Provider>
  );
};

export const useSoundSettings = () => {
  const ctx = useContext(SoundSettingsContext);
  if (!ctx) throw new Error("useSoundSettings must be used within SoundSettingsProvider");
  return ctx;
};
