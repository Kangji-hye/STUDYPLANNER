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

  // 구글 로그인
  const getRedirectTo = () => {
    const base = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;
    return `${base}/planner`;
  };

  const googleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getRedirectTo(),
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });

    if (error) {
      console.error("google oauth error:", error);
      alert(error.message);
    }
  };

  // 카카오 로그인
  const getBaseUrl = () => {
    return import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;
  };

  // OAuth는 콜백 라우트로 보내는 걸 추천
  const getOAuthRedirectTo = () => {
    const base = getBaseUrl();
    return `${base}/auth/callback?next=/planner`;
  };

  const kakaoLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo: getOAuthRedirectTo(),
      },
    });

    if (error) {
      console.error("kakao oauth error:", error);
      alert(error.message);
    }
  };

  // 처음 들어올 때 저장된 이메일이 있으면 자동 채우기
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch (err) {
    console.warn("이메일 로컬스토리지 읽기 실패", err);
    }
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    const safeEmail = email.trim();

    // 아이디 저장 체크돼 있으면 저장, 아니면 삭제
    try {
      if (rememberEmail) localStorage.setItem(REMEMBER_EMAIL_KEY, safeEmail);
      else localStorage.removeItem(REMEMBER_EMAIL_KEY);
    } catch(err) {
      console.warn("이메일 로컬스토리지 저장 실패", err);
    }     

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
      <h1 className="service-title">초등 스터디 플래너</h1>
      <p className="service-desc">
        매일의 학습을 스스로 계획하고 기록해요
      </p>

      {/* <h2 className="auth-title">로그인</h2> */}
      <img src="/logo.png" alt="로고" className="auth-logo" />

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

        <div className="oauth-buttons">
          <button type="button" className="google-login-btn" onClick={googleLogin}>
            <img src="/google-icon.svg" alt="Google" />
            <span>구글로 로그인</span>
          </button>

          <button type="button" className="kakao-login-btn" onClick={kakaoLogin}>
            <img src="/kakao-icon.svg" alt="Kakao" />
            <span>카카오 로그인</span>
          </button>
        </div>
      </form>

      <div className="auth-foot-row">
        <Link to="/signup" className="auth-foot-link">
          회원가입
        </Link>

        <Link to="/find" className="auth-foot-link">
          비밀번호찾기
        </Link>
      </div>

    </div>
  );
};

export default Login;
