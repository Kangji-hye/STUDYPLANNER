// src/pages/Signup.jsx
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Signup.css";

const Signup = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [nickname, setNickname] = useState("");
  const [birthdate, setBirthdate] = useState(""); 
  const [isMale, setIsMale] = useState(true);

  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const isPasswordMatch = useMemo(() => {
    if (!password || !passwordConfirm) return true;
    return password === passwordConfirm;
  }, [password, passwordConfirm]);

  const handleSignup = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (password !== passwordConfirm) {
      alert("비밀번호가 서로 다릅니다. 다시 확인해 주세요.");
      return;}

    if (password.length < 8) {
    alert("비밀번호는 8자 이상 입력해 주세요.");
    return;
    }

    const safeEmail = email.trim();
    const safeNickname = nickname.trim();
    const safeBirthdate = birthdate.trim(); 

    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signUp({
        email: safeEmail,
        password,
        options: {
          data: {
            nickname: safeNickname,
            birthdate: safeBirthdate, 
            is_male: isMale,
          },
        },
      });

      if (error) throw error;

      const user = data?.user;

      if (!user) {
        alert("회원가입 요청이 완료되었습니다. 이메일 인증 후 로그인해 주세요.");
        navigate("/login");
        return;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            nickname: safeNickname,
            birthdate: safeBirthdate, 
            is_male: isMale,
          },
          { onConflict: "id" }
        );

      if (profileError) throw profileError;

      alert("회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.");
      navigate("/login");
    } catch (err) {
      if (err?.message?.includes("already")) {
        alert("이미 가입된 이메일입니다. 로그인 페이지로 이동해 주세요.");
      } else {
        alert("회원가입 중 오류가 발생했습니다.");
      }
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
          placeholder="비밀번호 (8자 이상)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        <input
          type="password"
          placeholder="비밀번호 확인"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />

        {!isPasswordMatch && (
          <p className="pw-hint">비밀번호가 서로 달라요.</p>
        )}

        <input
          type="text"
          placeholder="닉네임 (플래너 표시)"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          required
          maxLength={8}
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

         <button
          className="auth-submit"
          type="submit"
          disabled={loading || !isPasswordMatch}
        >
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
