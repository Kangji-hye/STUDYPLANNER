// src/pages/ResetPassword.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Login.css";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        alert("재설정 링크가 만료되었거나 유효하지 않습니다. 다시 시도해 주세요.");
        navigate("/find");
      }
    };
    check();
  }, [navigate]);

  const changePassword = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (pw1.length < 8) {
      alert("비밀번호는 8자 이상으로 설정해 주세요.");
      return;
    }
    if (pw1 !== pw2) {
      alert("비밀번호가 서로 다릅니다.");
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;

      alert("비밀번호가 변경되었습니다. 로그인해 주세요.");
      // 세션 정리 후 로그인 화면으로 보내면 깔끔
      await supabase.auth.signOut();
      navigate("/login");
    } catch (err) {
      // 여기서도 "노출된 비밀번호"면 다시 차단될 수 있음 → 다른 비번으로
      alert(err?.message ?? "비밀번호 변경 중 오류가 발생했습니다.");
      console.error("updateUser error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <h2 className="auth-title">새 비밀번호 설정</h2>

        <form onSubmit={changePassword} className="auth-form">
          <label className="auth-label">
            새 비밀번호
            <input
              type="password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              autoComplete="new-password"
              placeholder="8자 이상, 새 비밀번호"
              required
            />
          </label>

          <label className="auth-label">
            새 비밀번호 확인
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              autoComplete="new-password"
              placeholder="한 번 더 입력"
              required
            />
          </label>

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "변경 중..." : "비밀번호 변경"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
