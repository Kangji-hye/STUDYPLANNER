// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import AuthLayout from "./layouts/AuthLayout";
import AppLayout from "./layouts/AppLayout";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Admin from "./pages/Admin";
import Find from "./pages/Find";
import ResetPassword from "./pages/ResetPassword";

import MyPage from "./pages/MyPage";
import Ranking from "./pages/Ranking";
import Planner from "./pages/Planner";
import AuthCallback from "./pages/AuthCallback";

import ProtectedRoute from "./components/ProtectedRoute";
import { SoundSettingsProvider } from "./context/SoundSettingsContext";

import Share from "./pages/Share";
import GugudanGame from "./pages/GugudanGame";
import OmokGame from "./pages/OmokGame";

function BootSplashKiller() {
  const location = useLocation();

  useEffect(() => {
    const splash = document.getElementById("boot-splash");
    if (!splash) return;

    // 너무 빨리 지우면 깜빡일 수 있어서 한 프레임 뒤에 제거
    requestAnimationFrame(() => {
      try { splash.remove(); } catch {
        //
      }
    });
  }, [location.pathname]);

  return null;
}


// 라우트가 바뀔 때마다 화면 맨 위로 올려주는 컴포넌트
function ScrollToTopOnRouteChange() {
  const location = useLocation();

  useEffect(() => {
    // 1) 일반 브라우저용
    window.scrollTo(0, 0);

    // 2) iOS/PWA에서 가끔 window만으로 안 먹을 때 대비
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // 3) 혹시 #root가 스크롤 컨테이너처럼 동작하는 경우까지 대비
    const root = document.getElementById("root");
    if (root) root.scrollTop = 0;
  }, [location.pathname]);

  return null;
}

const App = () => {
  return (
    <SoundSettingsProvider>
      <BrowserRouter>
       <BootSplashKiller />
       <ScrollToTopOnRouteChange /> 
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
              path="/share"
              element={
                <ProtectedRoute>
                  <Share />
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
            <Route
              path="/ranking"
              element={
                <ProtectedRoute>
                  <Ranking />
                </ProtectedRoute>
              }
            />

            <Route
              path="/gugudan"
              element={
                <ProtectedRoute>
                  <GugudanGame />
                </ProtectedRoute>
              }
            />

            <Route
              path="/omok"
              element={
                <ProtectedRoute>
                  <OmokGame />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <Admin />
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
