// src/pages/Signup.jsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Signup.css";

const Signup = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [nickname, setNickname] = useState("");
  const [birthdate, setBirthdate] = useState(""); // ✅ age → birthdate
  const [isMale, setIsMale] = useState(true);

  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    if (loading) return;

    const safeEmail = email.trim();
    const safeNickname = nickname.trim();
    const safeBirthdate = birthdate.trim(); // ✅

    try {
      setLoading(true);

      // 1) Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: safeEmail,
        password,
        options: {
          data: {
            nickname: safeNickname,
            birthdate: safeBirthdate, // ✅
            is_male: isMale,
          },
        },
      });

      if (error) throw error;

      const user = data?.user;

      // 이메일 인증이 켜져 있으면 user가 바로 없을 수 있음
      if (!user) {
        alert("회원가입 요청이 완료되었습니다. 이메일 인증 후 로그인해 주세요.");
        navigate("/login");
        return;
      }

      // 2) profiles 테이블 저장
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            nickname: safeNickname,
            birthdate: safeBirthdate, // ✅
            is_male: isMale,
          },
          { onConflict: "id" }
        );

      if (profileError) throw profileError;

      alert("회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.");
      navigate("/login");
    } catch (err) {
      alert(err?.message ?? "회원가입 중 오류가 발생했습니다.");
      console.error("회원가입 오류:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup auth-page">
      <h2 className="auth-title">회원가입</h2>

      <form onSubmit={handleSignup} className="auth-form">
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
          autoComplete="new-password"
          required
        />

        <input
          type="text"
          placeholder="닉네임"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          required
        />

        <input
          type="date"
          value={birthdate}
          onChange={(e) => setBirthdate(e.target.value)}
          required
        />

        <div className="gender-wrap">
          <label>
            <input
              type="radio"
              name="gender"
              checked={isMale === true}
              onChange={() => setIsMale(true)}
            />
            <span>남자</span>
          </label>

          <label>
            <input
              type="radio"
              name="gender"
              checked={isMale === false}
              onChange={() => setIsMale(false)}
            />
            <span>여자</span>
          </label>
        </div>

        <button className="auth-submit" type="submit" disabled={loading}>
          {loading ? "가입 중..." : "가입하기"}
        </button>
      </form>

      <p className="auth-foot">
        이미 계정이 있나요? <Link to="/login">로그인</Link>
      </p>
    </div>
  );
};

export default Signup;
