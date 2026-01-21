// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
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

      if (isPwa && window.location.pathname === "/") {
        navigate("/planner", { replace: true });
      }
    } catch {
      // 실패해도 앱은 계속 진행
    }
  }, [navigate]);

  return null;
}

const App = () => {
  return (
    <SoundSettingsProvider>
      {/* ✅ BrowserRouter는 반드시 있어야 합니다 */}
      <BrowserRouter>
        {/* ✅ PwaGate는 Router 안에서만 동작합니다 */}
        <PwaGate />

        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
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
