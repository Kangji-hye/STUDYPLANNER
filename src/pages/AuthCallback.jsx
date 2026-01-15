// src/pages/AuthCallback.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        // ✅ code가 있으면 세션 교환
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // ✅ 세션이 실제로 생겼는지 확인 (PC에서 특히 중요)
        // 1) 즉시 확인
        let { data } = await supabase.auth.getSession();
        let session = data?.session ?? null;

        // 2) 없으면 auth 이벤트를 잠깐 기다림
        if (!session) {
          session = await new Promise((resolve) => {
            const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
              if (s) {
                sub.subscription.unsubscribe();
                resolve(s);
              }
            });

            setTimeout(() => {
              sub.subscription.unsubscribe();
              resolve(null);
            }, 5000);
          });
        }

        // ✅ 세션이 끝까지 없으면 로그인으로
        if (!session?.user) {
          if (!alive) return;
          navigate("/login", { replace: true });
          return;
        }

        // ✅ 여기까지 왔으면 “로그인 성공 확정”
        if (!alive) return;
        navigate("/planner", { replace: true });
      } catch (err) {
        console.error("AuthCallback error:", err);
        if (!alive) return;
        navigate("/login", { replace: true });
      }
    };

    run();

    return () => {
      alive = false;
    };
  }, [navigate]);

  return null;
};

export default AuthCallback;
