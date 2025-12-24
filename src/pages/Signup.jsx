// src/pages/Signup.jsx
import { Link, useNavigate } from "react-router-dom";
import "./Signup.css";

const Signup = () => {
  const navigate = useNavigate();

  const onSubmit = (e) => {
    e.preventDefault();
    // TODO: 회원가입 처리
    navigate("/login");
  };

  return (
    <div className="signup auth-page">
      <h2 className="auth-title">회원가입</h2>

      <form onSubmit={onSubmit} className="auth-form">
        <label className="auth-label">
          닉네임(이름)
          <input placeholder="예: 제영이" />
        </label>

        <label className="auth-label">
          아이디
          <input placeholder="아이디 입력" />
        </label>

        <label className="auth-label">
          비밀번호
          <input type="password" placeholder="비밀번호 입력" />
        </label>

        <button className="auth-submit" type="submit">가입하기</button>
      </form>

      <p className="auth-foot">
        이미 계정이 있나요? <Link to="/login">로그인</Link>
      </p>
    </div>
  );
};

export default Signup;
