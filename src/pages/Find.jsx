// src/pages/Find.jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Login.css"; 

const Find = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const sendReset = async (e) => {
    e.preventDefault();
    if (loading) return;

    try {
      setLoading(true);

      const safeEmail = email.trim();

      const base =
        import.meta.env.VITE_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
        window.location.origin;

      const { error } = await supabase.auth.resetPasswordForEmail(safeEmail, {
        redirectTo: `${base}/reset`,
      });

      if (error) throw error;

      alert("비밀번호 재설정 메일을 보냈습니다. 메일함을 확인해 주세요.");
    } catch (err) {
      alert(err?.message ?? "메일 전송 중 오류가 발생했습니다.");
      console.error("resetPasswordForEmail error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <h2 className="auth-title">비밀번호 재설정</h2>

        <form onSubmit={sendReset} className="auth-form">
          <label className="auth-label">
            이메일
            <input
              type="email"
              placeholder="가입한 이메일 입력"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "보내는 중..." : "재설정 메일 보내기"}
          </button>
        </form>

        <div className="auth-links">
          <Link to="/login">로그인으로</Link>
          <Link to="/signup">회원가입</Link>
        </div>
      </div>
    </div>
  );
};

export default Find;
