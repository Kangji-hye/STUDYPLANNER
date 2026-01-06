// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import AuthLayout from "./layouts/AuthLayout";
import AppLayout from "./layouts/AppLayout";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import MyPage from "./pages/MyPage";
import Planner from "./pages/Planner";

import supabase from "./supabaseClient";

const HomeRedirect = () => {
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      setHasSession(!!data?.session);
      setLoading(false);
    };
    run();
  }, []);

  if (loading) return null;
  return <Navigate to={hasSession ? "/planner" : "/login"} replace />;
};

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Route>

        <Route element={<AppLayout />}>
          <Route path="/planner" element={<Planner />} />
          <Route path="/mypage" element={<MyPage />} />
        </Route>

        <Route path="/" element={<HomeRedirect />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
