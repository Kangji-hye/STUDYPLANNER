// src/pages/MyPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./MyPage.css";

const MyPage = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [profile, setProfile] = useState(null);

  // 생년월일 -> 만 나이
  const ageText = useMemo(() => {
    const birthdate = profile?.birthdate;
    if (!birthdate) return "";

    const today = new Date();
    const birth = new Date(birthdate);

    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();

    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return `${age}살`;
  }, [profile?.birthdate]);

  const loadMyProfile = async () => {
    setLoading(true);

    // 1) 로그인 사용자 확인
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error("유저 확인 오류:", userError);
      alert("로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.");
      navigate("/login");
      setLoading(false);
      return;
    }

    const user = userData?.user;
    if (!user) {
      alert("로그인이 필요합니다.");
      navigate("/login");
      setLoading(false);
      return;
    }

    setUserEmail(user.email ?? "");

    // 2) profiles 테이블에서 내 프로필 가져오기
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, nickname, birthdate, is_male")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("프로필 조회 오류:", profileError);

      setProfile({
        id: user.id,
        nickname: user.user_metadata?.nickname ?? "닉네임 없음",
        birthdate: user.user_metadata?.birthdate ?? null,
        is_male: user.user_metadata?.is_male ?? true,
      });

      setLoading(false);
      return;
    }

    setProfile(profileData);
    setLoading(false);
  };

  useEffect(() => {
    loadMyProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = async () => {
    const ok = window.confirm("로그아웃 하시겠습니까?");
    if (!ok) return;

    const { error } = await supabase.auth.signOut();
    if (error) {
      alert("로그아웃 중 오류가 발생했습니다.");
      console.error("로그아웃 오류:", error);
      return;
    }

    navigate("/login");
  };

  const profileLabel = profile?.is_male ? "남아" : "여아";
  const profileImgSrc = profile?.is_male ? "/icon_boy.png" : "/icon_girl.png";

  if (loading) {
    return (
      <div className="mypage">
        <h2 className="mypage-title">마이페이지</h2>
        <div className="mypage-card">
          <div className="row">
            <span className="label">불러오는 중</span>
            <span className="value">잠시만요...</span>
          </div>
        </div>

        <div className="mypage-actions">
          <button onClick={() => navigate("/planner")}>플래너로</button>
          <button onClick={() => navigate("/login")}>로그인으로</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mypage">
      <h2 className="mypage-title">마이페이지</h2>

      <div className="mypage-card">
        <div className="row">
          <span className="label">이메일</span>
          <span className="value">{userEmail || "-"}</span>
        </div>

        <div className="row">
          <span className="label">닉네임</span>
          <span className="value">{profile?.nickname || "-"}</span>
        </div>

        <div className="row">
          <span className="label">생년월일</span>
          <span className="value">{profile?.birthdate || "-"}</span>
        </div>

        <div className="row">
          <span className="label">나이(만)</span>
          <span className="value">{ageText || "-"}</span>
        </div>

        <div className="row">
          <span className="label">프로필</span>
          <span className="value" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src={profileImgSrc}
              alt={profileLabel}
              style={{ width: 34, height: 34, objectFit: "contain" }}
            />
            {profileLabel}
          </span>
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
