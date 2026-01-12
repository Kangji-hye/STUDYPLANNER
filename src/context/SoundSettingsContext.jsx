// src/context/SoundSettingsContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";

const SoundSettingsContext = createContext(null);

const SFX_KEY = "sfxEnabled";
const FINISH_KEY = "finishEnabled";

export const SoundSettingsProvider = ({ children }) => {
  const [sfxEnabled, setSfxEnabled] = useState(() => {
    const saved = localStorage.getItem(SFX_KEY);
    return saved === null ? true : saved === "true";
  });

  const [finishEnabled, setFinishEnabled] = useState(() => {
    const saved = localStorage.getItem(FINISH_KEY);
    return saved === null ? true : saved === "true";
  });

  useEffect(() => {
    localStorage.setItem(SFX_KEY, String(sfxEnabled));
  }, [sfxEnabled]);

  useEffect(() => {
    localStorage.setItem(FINISH_KEY, String(finishEnabled));
  }, [finishEnabled]);

  return (
    <SoundSettingsContext.Provider
      value={{
        sfxEnabled,
        setSfxEnabled,
        finishEnabled,
        setFinishEnabled,
      }}
    >
      {children}
    </SoundSettingsContext.Provider>
  );
};

export const useSoundSettings = () => {
  const ctx = useContext(SoundSettingsContext);
  if (!ctx) throw new Error("useSoundSettings must be used within SoundSettingsProvider");
  return ctx;
};
