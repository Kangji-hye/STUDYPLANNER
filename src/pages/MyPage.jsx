// src/pages/MyPage.jsx
import { useEffect, useRef, useState } from "react"; 
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./MyPage.css";
// import { useSoundSettings } from "../context/SoundSettingsContext";
const PROFILE_CACHE_KEY = "planner_profile_cache_v1";

// 음악 리스트
const FINISH_SOUNDS = [
  { label: "요란한 축하", value: "/finish1.mp3" },
  { label: "환호성과 박수", value: "/finish2.mp3" },
  { label: "웅장한 빵빠레", value: "/finish3.mp3" },
  { label: "띵띵 스웨덴 리믹스", value: "/finish4.mp3" },
];

const MyPage = () => {
  const navigate = useNavigate();

  // const { sfxEnabled, setSfxEnabled, finishEnabled, setFinishEnabled } = useSoundSettings();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [profile, setProfile] = useState(null);

  const previewAudioRef = useRef(null); 

  const [form, setForm] = useState({
    nickname: "",
    birthdate: "",
    is_male: true,
    finish_sound: "/finish.mp3", 
  });

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
      .select("id, nickname, birthdate, is_male, finish_sound")
      .eq("id", user.id)
      .single();

    const nextProfile = profileError
      ? {
          id: user.id,
          nickname: user.user_metadata?.nickname ?? "닉네임",
          birthdate: user.user_metadata?.birthdate ?? "",
          is_male: user.user_metadata?.is_male ?? true,
          finish_sound: "/finish.mp3",
        }
      : profileData;

    setProfile(nextProfile);

    setForm({
      nickname: nextProfile.nickname ?? "",
      birthdate: nextProfile.birthdate ?? "",
      is_male: Boolean(nextProfile.is_male),
      finish_sound: nextProfile.finish_sound ?? "/finish.mp3",
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

    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      alert("로그아웃 중 오류가 발생했습니다.");
      return;
    }

    try {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    } catch (err) {
      console.warn("프로필 캐시 삭제 실패", err);
  }

    navigate("/login");
  };

 const previewSound = async () => {
  try {
    const src = form.finish_sound || "/finish.mp3";

    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio(src);
    } else {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      previewAudioRef.current.src = src;
    }

    previewAudioRef.current.volume = 0.9;
    await previewAudioRef.current.play();
  } catch (err) {
    console.warn("미리듣기 재생 실패", err);
    alert(
      "브라우저 정책으로 인해 소리가 바로 재생되지 않을 수 있어요.\n" +
      "효과음을 선택한 뒤 ▶ 미리듣기 버튼을 다시 눌러주세요."
    );
  }
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
      finish_sound: form.finish_sound || "/finish.mp3",
    };

    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" })
      .select("id, nickname, birthdate, is_male, finish_sound")
      .single();

    setSaving(false);

    if (error) {
      console.error("프로필 저장 오류:", error);
      alert("저장 중 오류가 발생했습니다.");
      return;
    }

    setProfile(data);

    try {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
    } catch (err) {
     console.warn("프로필 캐시 저장 실패", err);
    }

    alert("저장되었습니다.");
  };

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
      <div className="mypage-header">
        <div className="mypage-brand">
          <img
            src="/logo.png"
            alt="스터디 플래너 로고"
            className="mypage-logo"
          />

          <div className="mypage-title-wrap">
            <h2 className="mypage-title">마이페이지</h2>
            <span className="mypage-subtitle">초등학생을 위한 스터디 플래너</span>
          </div>
        </div>

        <div className="mypage-qr-box">
          <img
            src="/qr.png"
            alt="플래너 QR 코드"
            className="mypage-qr"
          />
          <span className="mypage-qr-caption">Study Planner</span>
        </div>
      </div>

      <div className="mypage-card">
        <div className="row">
          <span className="label">이메일</span>
          <span className="value">{userEmail || "-"}</span>
        </div>

        <div className="row">
          <span className="label">닉네임</span>
          <span className="value">
            <input
              value={form.nickname}
              onChange={(e) => setForm((p) => ({ ...p, nickname: e.target.value }))}
              placeholder="닉네임(플래너 상단에 표시)"
              maxLength={8}
            />
          </span>
        </div>

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

        {/* 완료 음악 선택 */}
        <div className="row">
          <span className="label">모두 완료 효과음</span>
          <span className="value mypage-sound">
            <select
              value={form.finish_sound || "/finish.mp3"}
              onChange={(e) => setForm((p) => ({ ...p, finish_sound: e.target.value }))}
            >
              {FINISH_SOUNDS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="ghost-btn"
              onClick={previewSound}
              title="선택한 음악을 미리 들어볼 수 있어요"
            >
              ▶ 미리듣기
            </button>
          </span>
        </div>

        {/* 성별 */}
        <div className="row gender">
          <span className="label">프로필</span>
          <span className="value gender">
            <label className="gender">
              <input
                type="radio"
                name="is_male"
                checked={form.is_male === true}
                onChange={() => setForm((p) => ({ ...p, is_male: true }))}
              />
              <img src="/icon_boy.png" alt="남자" className="gender-icon" />
              <span className="gendertext">남자</span>
            </label>

            <label className="gender">
              <input
                type="radio"
                name="is_male"
                checked={form.is_male === false}
                onChange={() => setForm((p) => ({ ...p, is_male: false }))}
              />
              <img src="/icon_girl.png" alt="여자" className="gender-icon" />
              <span className="gendertext">여자</span>
            </label>
          </span>
        </div>
      </div>

      <div className="mypage-actions">
        <button className="primary-btn" onClick={() => navigate("/planner")}>
          플래너로
        </button>
        <button onClick={onSave} disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </button>
        <button onClick={logout}>로그아웃</button>
      </div>
    </div>
  );
};

export default MyPage;
