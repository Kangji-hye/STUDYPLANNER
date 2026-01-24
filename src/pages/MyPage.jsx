// src/pages/MyPage.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./MyPage.css";

const PROFILE_CACHE_KEY = "planner_profile_cache_v1";

/*모두 완료 기본 효과음*/
const DEFAULT_FINISH_SOUND = "/finish1.mp3";

// 음악 리스트(옵션)
const FINISH_SOUNDS = [
  { label: "🎺웅장한 빵빠레", value: "/finish1.mp3" },
  { label: "👏환호성과 박수", value: "/finish2.mp3" },
  { label: "🎈셀러브레이션", value: "/finish3.mp3" },
  { label: "🐵요란한 축하", value: "/finish4.mp3" },
  { label: "🦕쥬라기 공원 버전", value: "/finish5.mp3" },
  { label: "✨빰빰빰빰빠라", value: "/finish6.mp3" },
  { label: "🥳1초 축하", value: "/finish7.mp3" },
  { label: "🌟미션 완료", value: "/finish8.mp3" },
  { label: "🏆웅장한 축하", value: "/finish9.mp3" },
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

  //  실제로 저장/적용되는 값은 form.finish_sound가 들고 있음
  const [form, setForm] = useState({
    nickname: "",
    birthdate: "",
    is_male: true,
    finish_sound: DEFAULT_FINISH_SOUND,
    grade_code: null,
    grade_manual: false,
  });

  // 셀렉트 박스 UI 전용 상태
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
      .select("id, nickname, birthdate, is_male, finish_sound, grade_code, grade_manual")
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

    // src/pages/MyPage.jsx (loadMyProfile 내부, nextProfile 만든 다음쯤)
    const autoCode = calcGradeCodeFromBirthdate(nextProfile.birthdate);

    // grade_manual이 true면 사용자가 고른 값을 존중
    // grade_manual이 false면 자동 계산값을 사용
    const finalGradeCode =
      nextProfile?.grade_manual ? nextProfile?.grade_code : autoCode;

    // nextProfile에도 반영(화면/저장 일치)
    nextProfile.grade_code = finalGradeCode;
    nextProfile.grade_manual = Boolean(nextProfile?.grade_manual);

    setProfile(nextProfile);

    setForm({
      nickname: nextProfile.nickname ?? "",
      birthdate: nextProfile.birthdate ?? "",
      is_male: Boolean(nextProfile.is_male),
      finish_sound: nextProfile.finish_sound || DEFAULT_FINISH_SOUND,

      grade_code: nextProfile.grade_code ?? null,
      grade_manual: Boolean(nextProfile.grade_manual),
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
      finish_sound: form.finish_sound || DEFAULT_FINISH_SOUND,
      grade_code: form.grade_code,
      grade_manual: Boolean(form.grade_manual),
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

    // 저장 결과도 기본값 보정
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

  
  //관리자
  function calcGradeCodeFromBirthdate(birthdateStr) {
  // birthdateStr: "2018-03-10" 이런 형태
  const s = String(birthdateStr ?? "").trim();
  if (!s) return null;

  const y = Number(s.slice(0, 4));
  if (!Number.isFinite(y)) return null;

  const currentYear = new Date().getFullYear(); // 2026년이면 2026
  const code = currentYear - y - 6;

  // 허용 범위(-1~6)로만 제한
  if (code < -1) return -1;
  if (code > 6) return 6;
  return code;
}



  // 비밀번호 바꾸기
  const changePassword = async () => {
    const newPassword = prompt("새 비밀번호를 입력해 주세요 (8자 이상)");

    if (!newPassword) return;

    if (newPassword.length < 8) {
      alert("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      alert("비밀번호 변경 중 오류가 발생했습니다.");
      return;
    }

    alert("비밀번호가 변경되었습니다. 다음 로그인부터 적용됩니다.");
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

  //  현재 적용 중인 효과음 라벨(아래 표시용)
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
              type="text"
              value={form.nickname}
              maxLength={6}  
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
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

        {/* 학년 */}
        <div className="row">
          <span className="label">학년</span>
          <span className="value">
            <select
              value={form.grade_code ?? ""}
              onChange={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                setForm((p) => ({
                  ...p,
                  grade_code: v,
                  grade_manual: true, // ✅ 사용자가 만진 순간 "수동"으로 전환
                }));
              }}
            >
              <option value="">자동(생년월일 기준)</option>
              <option value={-1}>6세</option>
              <option value={0}>7세</option>
              <option value={1}>1학년</option>
              <option value={2}>2학년</option>
              <option value={3}>3학년</option>
              <option value={4}>4학년</option>
              <option value={5}>5학년</option>
              <option value={6}>6학년</option>
            </select>

            <button
              type="button"
              className="grade-auto-btn"
              onClick={() => {
                const auto = calcGradeCodeFromBirthdate(form.birthdate);
                setForm((p) => ({
                  ...p,
                  grade_code: auto,
                  grade_manual: false, // ✅ 다시 자동 모드로
                }));
              }}
              title="생년월일로 자동 설정"
            >
              자동으로 맞추기
            </button>

            <div className="grade-hint">
              예) 2018년생은 2026년에 2학년이에요.
            </div>
          </span>
        </div>


        {/* 성별 */}
        <div className="row gender">
          <span className="label">성별</span>
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

        {/* 완료 음악 선택 */}
        <div className="row">
          <span className="label">모두 완료시</span>

          <span className="value mypage-sound">
            <div className="sound-card">
              <div className="sound-card-head">
                <span className="sound-card-title">🎵 효과음 선택</span>
                  <span className="sound-hint">
                    마지막 “완료”를 눌렀을 때 이 소리가 나와요 🙂
                  </span>
              </div>

              <div className="sound-card-body">
                <div className="sound-control-row">
                  <select
                    className="sound-select"
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
                      효과음 선택
                    </option>

                    {FINISH_SOUNDS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="sound-preview-btn"
                    onClick={previewSound}
                    title="현재 적용된 효과음을 미리 들어볼 수 있어요"
                  >
                    ▶ 미리듣기
                  </button>
                </div>
                    
                <span className="sound-card-current">
                  현재: <b>{currentSoundLabel}</b>
                </span>
              </div>
            </div>
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
        <button onClick={changePassword}>비밀번호 변경</button>
        <button onClick={logout}>로그아웃</button>
      </div>
                    
    </div>
  );
};

export default MyPage;
