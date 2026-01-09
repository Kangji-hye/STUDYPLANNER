// src/pages/Login.jsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Login.css";

const REMEMBER_EMAIL_KEY = "remember_email_v1";

const Login = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(true);
  const [loading, setLoading] = useState(false);

  // 카카오 로그인
  const loginWithKakao = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo: `${window.location.origin}/planner`,
         scopes: "profile_nickname profile_image",
      },
    });

    if (error) {
      alert(error.message);
      console.error(error);
    }
  };

  // 처음 들어올 때 저장된 이메일이 있으면 자동 채우기
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch {}
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    const safeEmail = email.trim();

    // 아이디 저장 체크돼 있으면 저장, 아니면 삭제
    try {
      if (rememberEmail) localStorage.setItem(REMEMBER_EMAIL_KEY, safeEmail);
      else localStorage.removeItem(REMEMBER_EMAIL_KEY);
    } catch {}

    try {
      setLoading(true);

      const { error } = await supabase.auth.signInWithPassword({
        email: safeEmail,
        password,
      });

      if (error) throw error;

      navigate("/planner");
    } catch (err) {
      alert(err?.message ?? "로그인 중 오류가 발생했습니다.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <h2 className="auth-title">로그인</h2>

      <form onSubmit={onSubmit} className="auth-form">
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />

        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        <label className="remember-row">
          <input
            type="checkbox"
            checked={rememberEmail}
            onChange={(e) => setRememberEmail(e.target.checked)}
          />
          <span>아이디 저장</span>
        </label>

        <button className="auth-submit" type="submit" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </button>

        {/* <button type="button" className="auth-submit" onClick={loginWithKakao}>
          카카오로 로그인
        </button> */}

      </form>

      <p className="auth-foot">
        계정이 없나요? <Link to="/signup">회원가입</Link>
      </p>
    </div>
  );
};

export default Login;
