// src/components/ProtectedRoute.jsx
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import supabase from "../supabaseClient";

const ProtectedRoute = ({ children }) => {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        setAuthed(!!data?.session);
      } catch (err) {
        console.error("ProtectedRoute auth check error:", err);
        setAuthed(false);
      } finally {
        setChecking(false);
      }
    };

    checkAuth();
  }, []);

  if (checking) return <div style={{ padding: 24, textAlign: "center" }}>로딩중...</div>;

  if (!authed) return <Navigate to="/login" replace />;

  return children;
};

export default ProtectedRoute;
