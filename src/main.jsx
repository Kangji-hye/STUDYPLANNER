// src/main.jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

//  PWA 서비스워커 등록 (vite-plugin-pwa 사용 시)
import { registerSW } from "virtual:pwa-register";

registerSW({
  immediate: true, // 앱 열 때 바로 등록 (설치/실행 안정성↑)
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
