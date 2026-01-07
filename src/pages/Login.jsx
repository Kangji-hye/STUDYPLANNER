// src/pages/Login.jsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Login.css";

const Login = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");      // 아이디를 이메일로 쓰는 구조
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // 에러 메시지 화면에 보여주기용
  const [errorMsg, setErrorMsg] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    setErrorMsg("");

    try {
      setLoading(true);

      const safeEmail = email.trim();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: safeEmail,
        password,
      });

      if (error) throw error;

      if (!data?.user) {
        setErrorMsg("로그인 정보를 확인할 수 없습니다. 다시 시도해 주세요.");
        return;
      }

      navigate("/planner");
    } catch (err) {
      const msg = err?.message ?? "로그인 중 오류가 발생했습니다.";
      setErrorMsg(msg);
      console.error("로그인 오류:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <h2 className="auth-title">로그인</h2>

        <form onSubmit={onSubmit} className="auth-form">
          <label className="auth-label">
            아이디(이메일)
            <input
              type="email"
              placeholder="이메일 입력"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="auth-label">
            비밀번호
            <input
              type="password"
              placeholder="비밀번호 입력"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {/* ✅ 에러 표시 */}
          {errorMsg && (
            <div className="auth-error">
              {errorMsg}
              {/* 유출 비번 관련이면 재설정으로 유도 */}
              {errorMsg.includes("노출") || errorMsg.toLowerCase().includes("pwn") ? (
                <div className="auth-error-actions">
                  <button
                    type="button"
                    className="auth-link-btn"
                    onClick={() => navigate("/find")}
                  >
                    비밀번호 재설정 하러가기
                  </button>
                </div>
              ) : null}
            </div>
          )}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div className="auth-links">
          <Link to="/signup">회원가입</Link>
          <Link to="/find">아이디/비번 찾기</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
