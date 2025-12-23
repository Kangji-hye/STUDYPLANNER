// src/layouts/AppLayout.jsx
import { Outlet } from "react-router-dom";
import "./AppLayout.css";

const AppLayout = () => {
  return (
    <div className="app-shell">
      <Outlet />
    </div>
  );
};

export default AppLayout;
