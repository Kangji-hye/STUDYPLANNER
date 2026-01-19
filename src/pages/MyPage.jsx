// src/pages/MyPage.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./MyPage.css";

const PROFILE_CACHE_KEY = "planner_profile_cache_v1";

/**
 * ✅ 모두 완료 기본 효과음
 * - "요란한 축하"를 기본값으로 고정
 * - Planner(완료 시 재생) 쪽 기본값도 같은 값으로 맞추는 걸 추천
 */
const DEFAULT_FINISH_SOUND = "/finish1.mp3";

// 음악 리스트(옵션)
const FINISH_SOUNDS = [
  { label: "요란한 축하", value: "/finish1.mp3" },
  { label: "환호성과 박수", value: "/finish2.mp3" },
  { label: "웅장한 빵빠레", value: "/finish3.mp3" },
  { label: "띵띵 스웨덴 리믹스", value: "/finish4.mp3" },
];

// value로 label 찾기(현재 선택 표시용)
function getSoundLabelByValue(value) {
  const v = String(value || "").trim();
  const found = FINISH_SOUNDS.find((s) => s.value === v);
  return found?.label ?? "요란한 축하";
}

const MyPage = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [profile, setProfile] = useState(null);

  const previewAudioRef = useRef(null);

  // ✅ 실제로 저장/적용되는 값은 form.finish_sound가 들고 있음
  const [form, setForm] = useState({
    nickname: "",
    birthdate: "",
    is_male: true,
    finish_sound: DEFAULT_FINISH_SOUND,
  });

  /**
   * ✅ 셀렉트 박스 UI 전용 상태
   * - 처음 화면에서는 항상 "효과음을 선택해보세요"가 보이도록 value를 ""로 유지
   * - 사용자가 실제로 선택하면 그때 value가 바뀜
   */
  const [soundPickerValue, setSoundPickerValue] = useState("");

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

    // ✅ 프로필이 없거나 오류면 기본값으로 세팅(기본 효과음도 finish1로)
    const nextProfile = profileError
      ? {
          id: user.id,
          nickname: user.user_metadata?.nickname ?? "닉네임",
          birthdate: user.user_metadata?.birthdate ?? "",
          is_male: user.user_metadata?.is_male ?? true,
          finish_sound: DEFAULT_FINISH_SOUND,
        }
      : {
          ...profileData,
          // DB에 값이 없거나 비어있으면 기본값으로 보정
          finish_sound: profileData?.finish_sound || DEFAULT_FINISH_SOUND,
        };

    setProfile(nextProfile);

    setForm({
      nickname: nextProfile.nickname ?? "",
      birthdate: nextProfile.birthdate ?? "",
      is_male: Boolean(nextProfile.is_male),
      finish_sound: nextProfile.finish_sound || DEFAULT_FINISH_SOUND,
    });

    // ✅ 셀렉트는 항상 플레이스홀더가 보이게 초기화
    setSoundPickerValue("");

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
      // ✅ 실제 적용 값 기준으로 미리듣기
      const src = form.finish_sound || DEFAULT_FINISH_SOUND;

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
      alert("효과음을 선택한 뒤 ▶ 미리듣기 버튼을 다시 눌러주세요.");
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
      // ✅ 비어있으면 기본값으로 저장
      finish_sound: form.finish_sound || DEFAULT_FINISH_SOUND,
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

    // ✅ 저장 결과도 기본값 보정
    const normalized = {
      ...data,
      finish_sound: data?.finish_sound || DEFAULT_FINISH_SOUND,
    };

    setProfile(normalized);
    setForm((p) => ({ ...p, finish_sound: normalized.finish_sound }));

    try {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(normalized));
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

  // ✅ 현재 적용 중인 효과음 라벨(아래 표시용)
  const currentSoundLabel = getSoundLabelByValue(form.finish_sound);

  return (
    <div className="mypage">
      <div className="mypage-header">
        <div className="mypage-brand">
          <img src="/logo.png" alt="스터디 플래너 로고" className="mypage-logo" />

          <div className="mypage-title-wrap">
            <h2 className="mypage-title">마이페이지</h2>
            <span className="mypage-subtitle">초등학생을 위한 스터디 플래너</span>
          </div>
        </div>

        <div className="mypage-qr-box">
          <img src="/qr.png" alt="플래너 QR 코드" className="mypage-qr" />
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
            {/* ✅ 셀렉트 박스에는 항상 "효과음을 선택해보세요"가 보이도록 placeholder 옵션을 둠 */}
            <select
              value={soundPickerValue}
              onChange={(e) => {
                const v = e.target.value;

                // 사용자가 선택하면 실제 값(form.finish_sound)에 반영
                setForm((p) => ({ ...p, finish_sound: v || DEFAULT_FINISH_SOUND }));

                // 셀렉트 UI도 선택값으로 변경(이후에는 선택값이 보임)
                setSoundPickerValue(v);
              }}
            >
              <option value="" disabled>
                효과음을 선택해보세요
              </option>

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
              title="현재 적용된 효과음을 미리 들어볼 수 있어요"
            >
              ▶ 미리듣기
            </button>

            {/* ✅ 현재 적용 중인 효과음은 아래에 따로 표시 */}
            <div
              style={{
                marginTop: "6px",
                fontSize: "0.92rem",
                opacity: 0.75,
                lineHeight: 1.3,
              }}
            >
              <b>{currentSoundLabel}</b>(현재 효과음)
            </div>
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
        <button className="primary-btn" onClick={onSave} disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </button>
        <button className="outline-btn" onClick={() => navigate("/planner")}>
          플래너로
        </button>
        <button onClick={logout}>로그아웃</button>
      </div>
                    
    </div>
  );
};

export default MyPage;
