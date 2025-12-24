// src/pages/Login.jsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Login.css";

const Login = () => {
  const [email, setEmail] = useState("");        // ✅ 아이디 → 이메일
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (loading) return;

    const safeEmail = email.trim();

    try {
      setLoading(true);

      // ✅ Supabase 로그인 (이메일/비밀번호)
      const { data, error } = await supabase.auth.signInWithPassword({
        email: safeEmail,
        password,
      });

      if (error) throw error;

      // 로그인 성공 시 세션이 생김
      const user = data?.user;
      if (!user) {
        alert("로그인에 실패했습니다. 이메일/비밀번호를 확인해 주세요.");
        return;
      }

      // (선택) 프로필도 같이 가져오고 싶으면 아래 주석 해제
      // const { data: profile, error: profileError } = await supabase
      //   .from("profiles")
      //   .select("nickname, age, is_mail")
      //   .eq("id", user.id)
      //   .single();
      // if (profileError) throw profileError;
      // localStorage.setItem("profile", JSON.stringify(profile));

      alert("로그인 완료!");
      navigate("/planner");
    } catch (err) {
      const message =
        typeof err?.message === "string" ? err.message : "로그인 중 오류가 발생했습니다.";
      alert(message);
      console.error("로그인 오류:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <h2 className="auth-title">로그인</h2>

      <form onSubmit={handleLogin} className="auth-form">
        <label className="auth-label">
          이메일
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

        <button className="auth-submit" type="submit" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>

      <p className="auth-foot">
        계정이 없나요? <Link to="/signup">회원가입</Link>
      </p>
    </div>
  );
};

export default Login;
