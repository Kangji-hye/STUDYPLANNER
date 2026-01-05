// src/pages/MyPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./MyPage.css";

const PROFILE_CACHE_KEY = "planner_profile_cache_v1";

const MyPage = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [profile, setProfile] = useState(null);

  const [form, setForm] = useState({
    nickname: "",
    birthdate: "",
    is_male: true,
  });

  const ageText = useMemo(() => {
    const birthdate = profile?.birthdate;
    if (!birthdate) return "";

    const today = new Date();
    const birth = new Date(birthdate);

    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();

    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return `${age}살`;
  }, [profile?.birthdate]);

  const loadMyProfile = async () => {
    setLoading(true);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      alert("로그인이 필요합니다.");
      navigate("/login");
      setLoading(false);
      return;
    }

    const user = userData.user;
    setUserEmail(user.email ?? "");

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, nickname, birthdate, is_male")
      .eq("id", user.id)
      .single();

    const nextProfile = profileError
      ? {
          id: user.id,
          nickname: user.user_metadata?.nickname ?? "닉네임",
          birthdate: user.user_metadata?.birthdate ?? "",
          is_male: user.user_metadata?.is_male ?? true,
        }
      : profileData;

    setProfile(nextProfile);

    // ✅ 폼 초기값 세팅
    setForm({
      nickname: nextProfile.nickname ?? "",
      birthdate: nextProfile.birthdate ?? "",
      is_male: Boolean(nextProfile.is_male),
    });

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
      return;
    }

    // 캐시도 지우면 다음 로그인 때 깔끔합니다.
    try {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    } catch {}

    navigate("/login");
  };

  const onSave = async () => {
    if (!profile?.id) return;

    const nickname = form.nickname.trim();
    if (!nickname) {
      alert("닉네임을 입력해 주세요.");
      return;
    }

    setSaving(true);

    const payload = {
      id: profile.id,
      nickname,
      birthdate: form.birthdate || null,
      is_male: Boolean(form.is_male),
    };

    // ✅ 있으면 업데이트, 없으면 생성(upsert)
    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" })
      .select("id, nickname, birthdate, is_male")
      .single();

    setSaving(false);

    if (error) {
      console.error("프로필 저장 오류:", error);
      alert("저장 중 오류가 발생했습니다.");
      return;
    }

    setProfile(data);

    // 플래너가 즉시 반영되도록 캐시도 업데이트
    try {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
    } catch {}

    alert("저장되었습니다.");
  };

  // const profileLabel = form.is_male ? "남아" : "여아";
  // const profileImgSrc = form.is_male ? "/icon_boy.png" : "/icon_girl.png";

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

        {/* 닉네임 수정 */}
        <div className="row">
          <span className="label">닉네임</span>
          <span className="value">
            <input
              value={form.nickname}
              onChange={(e) => setForm((p) => ({ ...p, nickname: e.target.value }))}
              placeholder="닉네임 입력"
            />
          </span>
        </div>

        {/* 생년월일 수정 */}
        <div className="row">
          <span className="label">생년월일</span>
          <span className="value">
            <input
              type="date"
              value={form.birthdate || ""}
              onChange={(e) => setForm((p) => ({ ...p, birthdate: e.target.value }))}
            />
          </span>
        </div>

        <div className="row">
          <span className="label">나이(만)</span>
          <span className="value">{ageText || "-"}</span>
        </div>

        {/* 성별 수정 */}
        <div className="row gender">
          <span className="label">프로필</span>

          <span className="value gender">
            {/* 남자 선택 */}
            <label className="gender">
              <input
                type="radio"
                name="is_male"
                checked={form.is_male === true}
                onChange={() => setForm((p) => ({ ...p, is_male: true }))}
              />

              <img
                src="/icon_boy.png"
                alt="남자"
                className="gender-icon"
              />

              <span className="gendertext">남자</span>
            </label>

            {/* 여자 선택 */}
            <label className="gender">
              <input
                type="radio"
                name="is_male"
                checked={form.is_male === false}
                onChange={() => setForm((p) => ({ ...p, is_male: false }))}
              />

              <img
                src="/icon_girl.png"
                alt="여자"
                className="gender-icon"
              />

              <span className="gendertext">여자</span>
            </label>
          </span>
        </div>

      </div>

      <div className="mypage-actions">
        <button onClick={() => navigate("/planner")}>플래너로</button>
        <button onClick={onSave} disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </button>
        <button onClick={logout}>로그아웃</button>
      </div>
    </div>
  );
};

export default MyPage;
