// src/hooks/useWeatherYongin.js
import { useEffect, useState } from "react";

// 기본 위치: 대한민국 경기도 용인시 (위경도)
// 참고 좌표: 약 37.23825, 127.17795 :contentReference[oaicite:2]{index=2}
const DEFAULT_LAT = 37.23825;
const DEFAULT_LON = 127.17795;

export const useWeatherYongin = () => {
  const [weatherCode, setWeatherCode] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchWeather = async () => {
      try {
        // Open-Meteo: 키 없이 호출 가능 :contentReference[oaicite:3]{index=3}
        const url =
          "https://api.open-meteo.com/v1/forecast" +
          `?latitude=${DEFAULT_LAT}&longitude=${DEFAULT_LON}` +
          "&current=weather_code" +
          "&timezone=Asia%2FSeoul";

        const res = await fetch(url);
        if (!res.ok) throw new Error(`weather fetch failed: ${res.status}`);
        const json = await res.json();

        if (cancelled) return;

        const code = json?.current?.weather_code;
        setWeatherCode(Number.isFinite(code) ? code : null);
      } catch {
        if (cancelled) return;
        setWeatherCode(null);
      }
    };

    fetchWeather();
    return () => {
      cancelled = true;
    };
  }, []);

  return weatherCode;
};
