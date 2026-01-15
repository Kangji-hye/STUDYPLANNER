// src/pages/AuthCallback.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const next = url.searchParams.get("next") || "/planner";

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        navigate(next, { replace: true });
      } catch (err) {
        console.error(err);
        navigate("/login", { replace: true });
      }
    };

    run();
  }, [navigate]);

  return null; 
};

export default AuthCallback;
