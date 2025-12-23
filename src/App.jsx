// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AuthLayout from "./layouts/AuthLayout";
import AppLayout from "./layouts/AppLayout";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import MyPage from "./pages/MyPage";
import Planner from "./pages/Planner";

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

        <Route path="/" element={<Navigate to="/planner" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
