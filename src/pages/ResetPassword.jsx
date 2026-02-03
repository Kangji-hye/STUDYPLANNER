// src/pages/ResetPassword.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Login.css";

async function waitForRecoverySession({ timeoutMs = 5000 } = {}) {
  const { data: s1 } = await supabase.auth.getSession();
  if (s1?.session) return s1.session;

  return await new Promise((resolve) => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        data.subscription.unsubscribe();
        resolve(session);
      }
    });

    setTimeout(() => {
      data.subscription.unsubscribe();
      resolve(null);
    }, timeoutMs);
  });
}

const ResetPassword = () => {
  const navigate = useNavigate();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
     let mounted = true;

  const check = async () => {
      const session = await waitForRecoverySession({ timeoutMs: 6000 });

      if (!mounted) return;

      if (!session) {
        alert("재설정 링크가 만료되었거나 유효하지 않습니다. 다시 시도해 주세요.");
        navigate("/find", { replace: true });
        return;
      }
    };

    check();
    return () => {
      mounted = false;
    };
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
      await supabase.auth.signOut();
      navigate("/login", { replace: true });

    } catch (err) {
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
