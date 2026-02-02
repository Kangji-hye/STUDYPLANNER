// src/pages/AuthCallback.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";

const makeGuestNickname = () => {
  const n = Math.floor(1000 + Math.random() * 9000); // 1000~9999
  return `친구${n}`;
};

const pickNicknameCandidate = (user) => {
  const meta = user?.user_metadata ?? {};

  const candidates = [
    meta.nickname,
    meta.name,
    meta.full_name,
    meta.user_name,
  ];

  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (s) return Array.from(s).slice(0, 6).join("");
  }

  // 전부 없으면 null
  return null;
};

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

        // ============================
        // - profiles에 닉네임이 비어있으면 자동 생성해서 저장
        // ============================
        const user = session.user;

        try {
          // 1) 기존 프로필 확인
          const { data: profileRow, error: profileErr } = await supabase
            .from("profiles")
            .select("id, nickname")
            .eq("id", user.id)
            .maybeSingle();

          const currentNickname = String(profileRow?.nickname ?? "").trim();

          const compact = currentNickname.replace(/\s+/g, "");
          const needNickname =
            !currentNickname || compact === "익명" || compact.startsWith("익명") || profileErr;

          if (needNickname) {
            const candidate = pickNicknameCandidate(user);
            const finalNickname = candidate || makeGuestNickname();

            const { error: upErr } = await supabase
              .from("profiles")
              .upsert(
                {
                  id: user.id,
                  nickname: finalNickname,
                },
                { onConflict: "id" }
              );

            if (upErr) {
              console.warn("profiles nickname upsert failed:", upErr);
            }
          }
        } catch (e) {
          console.warn("profile normalize failed:", e);
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
