// src/pages/MyPage.jsx
import { useNavigate } from "react-router-dom";
import "./MyPage.css";

const MyPage = () => {
  const navigate = useNavigate();

  const logout = () => {
    // TODO: 로그아웃 처리
    navigate("/login");
  };

  return (
    <div className="mypage">
      <h2 className="mypage-title">마이페이지</h2>

      <div className="mypage-card">
        <div className="row">
          <span className="label">이름</span>
          <span className="value">제영이</span>
        </div>
        <div className="row">
          <span className="label">프로필</span>
          <span className="value">남아 아이콘</span>
        </div>
      </div>

      <div className="mypage-actions">
        <button onClick={() => navigate("/planner")}>플래너로</button>
        <button onClick={logout}>로그아웃</button>
      </div>
    </div>
  );
};

export default MyPage;
