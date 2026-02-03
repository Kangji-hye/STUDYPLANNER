// src/pages/Login.jsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Login.css";

const REMEMBER_EMAIL_KEY = "remember_email_v1";

function toKoreanAuthError(err) {
  const raw = String(err?.message ?? "").trim();
  const msg = raw.toLowerCase();

  if (msg.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }
  if (msg.includes("invalid email")) {
    return "이메일 형식이 올바르지 않습니다.";
  }
  if (msg.includes("password") && msg.includes("should be")) {
    return "비밀번호 형식이 올바르지 않습니다.";
  }
  if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed")) {
    return "이메일 인증이 필요합니다. 메일함에서 인증을 완료해 주세요.";
  }
  if (msg.includes("too many requests")) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (msg.includes("failed to fetch") || msg.includes("network")) {
    return "네트워크 연결이 불안정합니다. 인터넷 상태를 확인한 뒤 다시 시도해 주세요.";
  }

  return "로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.";
}

const Login = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [rememberEmail, setRememberEmail] = useState(true);

  const [loading, setLoading] = useState(false);

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
      alert(toKoreanAuthError(error));
    }
  };

  const getBaseUrl = () => {
    return import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;
  };

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
      alert(toKoreanAuthError(error));
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);

      if (saved) {
        setEmail(saved);
        setRememberEmail(true); 
      } else {
        setRememberEmail(true);
      }
    } catch (err) {
      console.warn("이메일 로컬스토리지 읽기 실패", err);
      setRememberEmail(true);
    }
  }, []);

  const onToggleRemember = (checked) => {
    setRememberEmail(checked);

    if (!checked) {
      try {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
      } catch (err) {
        console.warn("이메일 로컬스토리지 삭제 실패", err);
      }
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    const safeEmail = email.trim();

    try {
      if (rememberEmail) localStorage.setItem(REMEMBER_EMAIL_KEY, safeEmail);
      else localStorage.removeItem(REMEMBER_EMAIL_KEY);
    } catch (err) {
      console.warn("이메일 로컬스토리지 저장 실패", err);
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.signInWithPassword({
        email: safeEmail,
        password,
      });

      if (error) {
        alert(toKoreanAuthError(error));
        return;
      }

      navigate("/planner");
    } catch (err) {
      console.error("login error:", err);
      alert(toKoreanAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <h1 className="service-title">초등 스터디 플래너</h1>
      <p className="service-desc">매일의 학습을 스스로 계획하고 기록해요</p>

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
            onChange={(e) => onToggleRemember(e.target.checked)} 
          />
          <span>아이디 저장</span>
        </label>

        <button className="auth-submit" type="submit" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </button>

        <div className="oauth-buttons">
          <button type="button" className="kakao-login-btn" onClick={kakaoLogin}>
            <img src="/kakao-icon.svg" alt="Kakao" />
            <span>카카오 로그인</span>
          </button>

          <button type="button" className="google-login-btn" onClick={googleLogin}>
            <img src="/google-icon.svg" alt="Google" />
            <span>구글로 로그인</span>
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
