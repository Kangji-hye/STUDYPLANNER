// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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


const App = () => {
  return (
    <SoundSettingsProvider>
      <BrowserRouter>
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
            <Route
              path="/ranking"
              element={
                <ProtectedRoute>
                  <Ranking />
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
