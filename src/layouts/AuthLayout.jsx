// src/layouts/AuthLayout.jsx
import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import "./AuthLayout.css";

const AuthLayout = () => {
  useEffect(() => {
    document.body.classList.add("auth-mode");
    return () => document.body.classList.remove("auth-mode");
  }, []);

  return (
    <div className="auth-wrap">
      {/* <div className="auth-card"> */}
        <Outlet />
      {/* </div> */}
    </div>
  );
};

export default AuthLayout;
