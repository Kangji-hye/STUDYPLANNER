// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation   } from "react-router-dom";
import { useEffect } from "react";

import AuthLayout from "./layouts/AuthLayout";
import AppLayout from "./layouts/AppLayout";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Find from "./pages/Find";
import ResetPassword from "./pages/ResetPassword";

import MyPage from "./pages/MyPage";
import Planner from "./pages/Planner";
import AuthCallback from "./pages/AuthCallback";

import ProtectedRoute from "./components/ProtectedRoute";
import { SoundSettingsProvider } from "./context/SoundSettingsContext";


function PwaGate() {
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const isPwa =
        params.get("source") === "pwa" ||
        window.matchMedia("(display-mode: standalone)").matches;

      // PWA 실행 + 루트 경로면 planner로 보정
      if (isPwa && window.location.pathname === "/") {
        navigate("/planner", { replace: true });
      }
    } catch {
      // 실패해도 앱은 계속 진행
    }
  }, [navigate]);

  return null;
}




function BootSplashKiller() {
  const location = useLocation();

  useEffect(() => {
    const splash = document.getElementById("boot-splash");
    if (!splash) return;

    // 너무 빨리 지우면 “하얀 화면”이 잠깐 보일 수 있어서
    // 한 프레임 늦춰서 제거(안정)
    requestAnimationFrame(() => {
      try {
        splash.remove();
      } catch {}
    });
  }, [location.pathname]);

  return null;
}




const App = () => {
  return (
    <SoundSettingsProvider>
      <BrowserRouter>


        <PwaGate />
        <BootSplashKiller />


        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            {/* 비번 재설정 */}
            <Route path="/find" element={<Find />} />
            <Route path="/reset" element={<ResetPassword />} />
          </Route>

           <Route path="/auth/callback" element={<AuthCallback />} />

          <Route element={<AppLayout />}>
            <Route
              path="/planner"
              element={
                <ProtectedRoute>
                  <Planner />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mypage"
              element={
                <ProtectedRoute>
                  <MyPage />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="/" element={<Navigate to="/planner" replace />} />

        </Routes>
      </BrowserRouter>
    </SoundSettingsProvider>
  );
};

export default App;
