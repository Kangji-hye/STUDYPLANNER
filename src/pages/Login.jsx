// src/pages/Login.jsx
import { Link, useNavigate } from "react-router-dom";
import "./Login.css";

const Login = () => {
  const navigate = useNavigate();

  const onSubmit = (e) => {
    e.preventDefault();
    navigate("/planner");
  };

  return (
    <div className="auth-page">
      {/* 로고 */}
      <img className="auth-logo" src="/logo.png" alt="로고" />

      <h2 className="auth-title">로그인</h2>

      <form onSubmit={onSubmit} className="auth-form">
        <label className="auth-label">
          아이디
          <input placeholder="아이디 입력" />
        </label>

        <label className="auth-label">
          비밀번호
          <input type="password" placeholder="비밀번호 입력" />
        </label>

        <button className="auth-submit" type="submit">로그인</button>
      </form>

      {/* 하단 링크: 좌-회원가입 / 우-아이디·비번 찾기 */}
      <div className="auth-links">
        <Link to="/signup">회원가입</Link>
        <Link to="/find">아이디 · 비밀번호 찾기</Link>
      </div>
    </div>
  );
};

export default Login;
