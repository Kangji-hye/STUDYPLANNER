// src/utils/googleAuth.js
import supabase from "../supabaseClient";

export const getRedirectTo = () => {
  const base = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;
  return `${base}/planner`;
};

export const googleLogin = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getRedirectTo(),
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) {
    console.error("google oauth error:", error);
    alert(error.message);
  }
};
