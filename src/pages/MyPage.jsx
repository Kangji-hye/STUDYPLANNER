// src/pages/MyPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./MyPage.css";
import { calcLevelFromStamps, levelToRatio, MAX_LEVEL } from "../utils/leveling";

const PROFILE_CACHE_KEY = "planner_profile_cache_v1";

/* 모두 완료 기본 효과음 */
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

// 생년월일로 학년 코드 자동 계산
// -1: 6세, 0: 7세, 1~6: 1~6학년
function calcGradeCodeFromBirthdate(birthdateStr) {
  const s = String(birthdateStr ?? "").trim();
  if (!s) return null;

  const y = Number(s.slice(0, 4));
  if (!Number.isFinite(y)) return null;

  const currentYear = new Date().getFullYear();
  const code = currentYear - y - 6;

  if (code < -1) return -1;
  if (code > 6) return 6;
  return code;
}

// 학년 코드 → 표시 라벨
function gradeLabel(code) {
  if (code === -1) return "6세";
  if (code === 0) return "7세";
  if (code >= 1 && code <= 6) return `${code}학년`;
  return "자동(생년월일 기준)";
}

const MyPage = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [profile, setProfile] = useState(null);

  const previewAudioRef = useRef(null);

  // ✅ 내 도장(참 잘했어요) 총 개수 (훅은 컴포넌트 안!)
  const [stampCount, setStampCount] = useState(0);

  // ✅ 레벨 계산도 컴포넌트 안에서 useMemo로!
  const levelInfo = useMemo(() => calcLevelFromStamps(stampCount), [stampCount]);
  const levelRatio = useMemo(() => levelToRatio(levelInfo.level), [levelInfo.level]);

  // 실제로 저장/적용되는 값
  const [form, setForm] = useState({
    nickname: "",
    birthdate: "",
    is_male: true,
    finish_sound: DEFAULT_FINISH_SOUND,
    grade_code: null,
    grade_manual: false, // false면 자동, true면 사용자가 직접 선택
  });

  // 효과음 셀렉트 UI 전용 상태
  const [soundPickerValue, setSoundPickerValue] = useState("");

  // =========================
  // 프로필 로딩
  // =========================
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

    // ✅ 내 도장 개수 불러오기 (여기서는 setState만 하고, 훅(useMemo)은 절대 쓰지 않기)
    try {
      const { count, error } = await supabase
        .from("hall_of_fame")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (!error) setStampCount(count ?? 0);
    } catch (e) {
      console.warn("mypage stamp count load fail:", e);
      setStampCount(0);
    }

    setUserEmail(user.email ?? "");

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, nickname, birthdate, is_male, finish_sound, grade_code, grade_manual")
      .eq("id", user.id)
      .single();

    // 프로필이 없거나 오류면 기본값
    const baseProfile = profileError
      ? {
          id: user.id,
          nickname: user.user_metadata?.nickname ?? "닉네임",
          birthdate: user.user_metadata?.birthdate ?? "",
          is_male: user.user_metadata?.is_male ?? true,
          finish_sound: DEFAULT_FINISH_SOUND,
          grade_code: null,
          grade_manual: false,
        }
      : {
          ...profileData,
          finish_sound: profileData?.finish_sound || DEFAULT_FINISH_SOUND,
          grade_manual: Boolean(profileData?.grade_manual),
        };

    // 자동 학년 계산(단, 수동이면 존중)
    const autoCode = calcGradeCodeFromBirthdate(baseProfile.birthdate);
    const finalGradeCode = baseProfile.grade_manual ? baseProfile.grade_code : autoCode;

    const nextProfile = {
      ...baseProfile,
      grade_code: finalGradeCode,
      grade_manual: Boolean(baseProfile.grade_manual),
    };

    setProfile(nextProfile);

    setForm({
      nickname: nextProfile.nickname ?? "",
      birthdate: nextProfile.birthdate ?? "",
      is_male: Boolean(nextProfile.is_male),
      finish_sound: nextProfile.finish_sound || DEFAULT_FINISH_SOUND,
      grade_code: nextProfile.grade_code ?? null,
      grade_manual: Boolean(nextProfile.grade_manual),
    });

    // 효과음 셀렉트는 플레이스홀더부터
    setSoundPickerValue("");

    setLoading(false);
  };

  useEffect(() => {
    loadMyProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 생년월일이 바뀌면 자동 학년 업데이트 (수동 모드면 건드리지 않음)
  useEffect(() => {
    if (loading) return;

    setForm((prev) => {
      if (prev.grade_manual) return prev;

      const auto = calcGradeCodeFromBirthdate(prev.birthdate);
      if ((prev.grade_code ?? null) === (auto ?? null)) return prev;

      return { ...prev, grade_code: auto };
    });
  }, [form.birthdate, form.grade_manual, loading]);

  // =========================
  // 로그아웃
  // =========================
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

  // =========================
  // 효과음 미리듣기
  // =========================
  const previewSound = async () => {
    try {
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

  // =========================
  // 저장
  // =========================
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
      .select("id, nickname, birthdate, is_male, finish_sound, grade_code, grade_manual")
      .single();

    setSaving(false);

    if (error) {
      console.error("프로필 저장 오류:", error);
      alert("저장 중 오류가 발생했습니다.");
      return;
    }

    const normalized = {
      ...data,
      finish_sound: data?.finish_sound || DEFAULT_FINISH_SOUND,
      grade_manual: Boolean(data?.grade_manual),
    };

    setProfile(normalized);
    setForm((p) => ({
      ...p,
      finish_sound: normalized.finish_sound,
      grade_code: normalized.grade_code ?? null,
      grade_manual: Boolean(normalized.grade_manual),
    }));

    try {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(normalized));
    } catch (err) {
      console.warn("프로필 캐시 저장 실패", err);
    }

    alert("저장되었습니다.");
  };

  // =========================
  // 비밀번호 변경
  // =========================
  const changePassword = async () => {
    const newPassword = prompt("새 비밀번호를 입력해 주세요 (8자 이상)");
    if (!newPassword) return;

    if (newPassword.length < 8) {
      alert("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      alert("비밀번호 변경 중 오류가 발생했습니다.");
      return;
    }

    alert("비밀번호가 변경되었습니다. 다음 로그인부터 적용됩니다.");
  };

  // 여기서는 훅을 더 쓰지 말고, 그냥 계산만!
  const currentSoundLabel = getSoundLabelByValue(form.finish_sound);
  const gradeText = gradeLabel(form.grade_code);

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

      {/* 레벨 진행 막대(알록달록) */}
      <div className="level-panel">
        <div className="level-head">
          <span className="level-title">
            내 레벨
            <span className="level-badge-pink">
              Lev.{levelInfo.level}
            </span>
          </span>

          <span className="level-max">
            / {MAX_LEVEL}
          </span>
        </div>

        <div className="level-bar-wrap" aria-label="레벨 진행 막대">
          <div className="level-bar" />

          {/* 내 위치 표시(화살표) */}
          <div
            className="level-marker"
            style={{ left: `calc(${(levelRatio * 100).toFixed(2)}% )` }}
            title={`내 위치: Lev.${levelInfo.level}`}
          >
            <div className="level-marker-arrow" />
            <div className="level-marker-text">Lev.{levelInfo.level}</div>
          </div>
        </div>

        <div className="level-sub">
          도장 {stampCount}개 · 다음 레벨까지 {levelInfo.stampsToNext}개 남았어요
        </div>

        {/* 랭킹 페이지로 이동 */}
        <button
          type="button"
          className="ranking-btn"
          onClick={() => navigate("/ranking")}
        >
          🏆 랭킹 보기
        </button>

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
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  birthdate: e.target.value,
                  // 생년월일 바꾸면 자동 모드로 돌아오게
                  grade_manual: false,
                }))
              }
            />
          </span>
        </div>

        {/* 학년 */}
        <div className="row">
          <span className="label">학년</span>
          <span className="value">
            <div className="select-wrap">
              <select
                className="sound-select"
                value={form.grade_code ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;

                  if (raw === "") {
                    const auto = calcGradeCodeFromBirthdate(form.birthdate);
                    setForm((p) => ({
                      ...p,
                      grade_code: auto,
                      grade_manual: false,
                    }));
                    return;
                  }

                  const v = Number(raw);
                  setForm((p) => ({
                    ...p,
                    grade_code: Number.isFinite(v) ? v : null,
                    grade_manual: true,
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
                  <div className="select-wrap">
                    <select
                      className="sound-select"
                      value={soundPickerValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((p) => ({ ...p, finish_sound: v || DEFAULT_FINISH_SOUND }));
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
                  </div>

                  <button type="button" className="sound-preview-btn" onClick={previewSound}>
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
