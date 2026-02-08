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
import GameGuard from "./components/GameGuard";
import GugudanGame from "./pages/GugudanGame";
import OmokGame from "./pages/OmokGame";
import BadukGame from "./pages/BadukGame";
import EnglishWordGame from "./pages/EnglishWordGame";
import WordChain from './pages/WordChain';
import WordChainRanking from './pages/WordChainRanking';
import HanjaGame from "./pages/HanjaGame";
import HanjaRanking from "./pages/HanjaRanking";
import BadukRanking from "./pages/BadukRanking";
import OmokRanking from "./pages/OmokRanking";
import BibleQuiz from "./pages/BibleQuiz";
import BibleRanking from "./pages/BibleRanking";
import TypingPractice from "./pages/TypingPractice";
import TypingRanking from "./pages/TypingRanking";
import GugudanRanking from "./pages/GugudanRanking";
import EnglishRanking from "./pages/EnglishRanking";

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

function ScrollToTopOnRouteChange() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);

    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

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

            <Route path="/wordchain" element={<ProtectedRoute><GameGuard><WordChain /></GameGuard></ProtectedRoute>} />
            <Route path="/wordchain-ranking" element={<ProtectedRoute><GameGuard><WordChainRanking /></GameGuard></ProtectedRoute>} />
            <Route path="/english-word-game" element={<ProtectedRoute><GameGuard><EnglishWordGame /></GameGuard></ProtectedRoute>} />
            <Route path="/english-word-ranking" element={<ProtectedRoute><EnglishRanking /></ProtectedRoute>} />
            <Route path="/gugudan" element={<ProtectedRoute><GameGuard><GugudanGame /></GameGuard></ProtectedRoute>} />
            <Route path="/gugudan-ranking" element={<ProtectedRoute><GugudanRanking /></ProtectedRoute>} />
            <Route path="/hanja" element={<ProtectedRoute><GameGuard><HanjaGame /></GameGuard></ProtectedRoute>} />
            <Route path="/omok" element={<ProtectedRoute><GameGuard><OmokGame /></GameGuard></ProtectedRoute>} />
            <Route path="/baduk" element={<ProtectedRoute><GameGuard><BadukGame /></GameGuard></ProtectedRoute>} />
            <Route
              path="/hanja-ranking"
              element={
                <ProtectedRoute>
                  <HanjaRanking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/baduk-ranking"
              element={
                <ProtectedRoute>
                  <BadukRanking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/omok-ranking"
              element={
                <ProtectedRoute>
                  <OmokRanking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bible-quiz"
              element={
                <ProtectedRoute>
                  <BibleQuiz />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bible-ranking"
              element={
                <ProtectedRoute>
                  <BibleRanking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/typing"
              element={
                <ProtectedRoute>
                  <TypingPractice />
                </ProtectedRoute>
              }
            />

            <Route
              path="/typing-ranking"
              element={
                <ProtectedRoute>
                  <TypingRanking />
                </ProtectedRoute>
              }
            />

            {/* <Route path="/baduk-ranking" element={<BadukRanking />} /> */}
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
          </Route>

          <Route path="/" element={<Navigate to="/planner" replace />} />

        </Routes>
      </BrowserRouter>
    </SoundSettingsProvider>
  );
};

export default App;
