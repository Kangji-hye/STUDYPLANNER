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

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        let { data } = await supabase.auth.getSession();
        let session = data?.session ?? null;

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

        if (!session?.user) {
          if (!alive) return;
          navigate("/login", { replace: true });
          return;
        }

        const user = session.user;

        const { data: profileRow, error: profileErr } = await supabase
          .from("profiles")
          .select("id, nickname")
          .eq("id", user.id)
          .maybeSingle();

        if (!profileRow || profileErr) {
          await supabase
            .from("profiles")
            .upsert({ id: user.id }, { onConflict: "id" });
        }

        const currentName = String(profileRow?.nickname ?? "").trim();
        const compact = currentName.replace(/\s+/g, "");

        if (!currentName || compact === "익명" || compact === "닉네임") {
          alert("처음 1회만 이름을 설정해야 해요. 마이페이지에서 이름을 저장해 주세요.");
          if (!alive) return;
          navigate("/mypage", { replace: true });
          return;
        }

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
