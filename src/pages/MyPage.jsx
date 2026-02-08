// src/pages/MyPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./MyPage.css";
import { calcLevelFromStamps, levelToRatio, MAX_LEVEL } from "../utils/leveling";
import HamburgerMenu from "../components/common/HamburgerMenu";
import { GRADE_OTHER } from "../utils/grade";
import { useAppSounds } from "../hooks/useAppSounds";

const PROFILE_CACHE_KEY = "planner_profile_cache_v1";

const DEFAULT_FINISH_SOUND = "/finish1.mp3";

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

function getSoundLabelByValue(value) {
  const v = String(value || "").trim();
  const found = FINISH_SOUNDS.find((s) => s.value === v);
  return found?.label ?? "요란한 축하";
}

function calcGradeCodeFromBirthdate(birthdateStr) {
  const s = String(birthdateStr ?? "").trim();
  if (!s) return null;

  const y = Number(s.slice(0, 4));
  if (!Number.isFinite(y)) return null;

  const currentYear = new Date().getFullYear();
  const code = currentYear - y - 6;

  if (code >= -1 && code <= 6) return code;

  return GRADE_OTHER; // 99
}

const MyPage = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [profile, setProfile] = useState(null);

  const [stampCount, setStampCount] = useState(0);

  const levelInfo = useMemo(() => calcLevelFromStamps(stampCount), [stampCount]);
  const levelRatio = useMemo(() => levelToRatio(levelInfo.level), [levelInfo.level]);

  const [form, setForm] = useState({
    nickname: "",
    birthdate: "",
    is_male: true,
    finish_sound: DEFAULT_FINISH_SOUND,
    grade_code: GRADE_OTHER,
    grade_manual: false,
  });

  const [soundPickerValue, setSoundPickerValue] = useState("");

  // ✅ 알림: 이제 로컬만이 아니라 DB(profiles.alarm_enabled)에도 저장합니다.
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [alarmPermission, setAlarmPermission] = useState("default"); // "default" | "granted" | "denied"

  // 로컬 저장(앱 반응 빠르게 + 이전 사용자 데이터 마이그레이션용)
  const persistAlarmEnabledLocal = (userId, on) => {
    try {
      localStorage.setItem(`planner_alarm_enabled_v1:${userId}`, on ? "1" : "0");
    } catch {
      //
    }
  };

  const readAlarmEnabledLocal = (userId) => {
    try {
      const saved = localStorage.getItem(`planner_alarm_enabled_v1:${userId}`);
      return saved === "1";
    } catch {
      return false;
    }
  };

  // DB 저장(관리자가 누가 ON인지 보려면 이게 필요)
  const persistAlarmEnabledDb = async (userId, on) => {
    if (!userId) return;

    // profiles 테이블에 alarm_enabled(boolean), alarm_enabled_at(timestamptz) 컬럼이 있어야 합니다.
    const payload = {
      alarm_enabled: Boolean(on),
      alarm_enabled_at: on ? new Date().toISOString() : null,
    };

    const { error } = await supabase.from("profiles").update(payload).eq("id", userId);
    if (error) {
      console.error("persistAlarmEnabledDb error:", error);
      // 여기서 alert를 크게 띄우면 UX가 답답해질 수 있어서,
      // 일단 콘솔만 찍고 화면 토글은 유지합니다.
    }
  };

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

    // 브라우저 알림 권한 상태
    try {
      if ("Notification" in window) setAlarmPermission(Notification.permission);
    } catch {
      setAlarmPermission("default");
    }

    // 도장 개수
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

    // ✅ profiles에서 alarm_enabled까지 같이 가져옵니다.
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, nickname, birthdate, is_male, finish_sound, grade_code, grade_manual, nickname_locked, alarm_enabled, alarm_enabled_at"
      )
      .eq("id", user.id)
      .single();

    const baseProfile = profileError
      ? {
          id: user.id,
          nickname: user.user_metadata?.nickname ?? "닉네임",
          birthdate: user.user_metadata?.birthdate ?? "",
          is_male: user.user_metadata?.is_male ?? true,
          finish_sound: DEFAULT_FINISH_SOUND,
          grade_code: user.user_metadata?.grade_code ?? GRADE_OTHER,
          grade_manual: user.user_metadata?.grade_manual ?? false,
          nickname_locked: false,

          // profiles가 없을 때 대비(기본값은 false로 두고, 가입 시에는 Signup에서 true로 넣습니다)
          alarm_enabled: false,
        }
      : {
          ...profileData,
          finish_sound: profileData?.finish_sound || DEFAULT_FINISH_SOUND,
          grade_code: Number.isFinite(Number(profileData?.grade_code)) ? Number(profileData.grade_code) : GRADE_OTHER,
          grade_manual: Boolean(profileData?.grade_manual),
          alarm_enabled: typeof profileData?.alarm_enabled === "boolean" ? Boolean(profileData.alarm_enabled) : null,
        };

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
      grade_code: Number.isFinite(Number(nextProfile.grade_code)) ? Number(nextProfile.grade_code) : GRADE_OTHER,
      grade_manual: Boolean(nextProfile.grade_manual),
    });

    setSoundPickerValue("");

    // ✅ 알림 ON/OFF 결정 로직
    // 1) DB에 값이 있으면 DB를 믿고
    // 2) DB 값이 없으면(옛 데이터) 로컬을 보고
    // 3) 로컬이 켜져 있으면 DB에도 한 번 저장해 줍니다(마이그레이션)
    const localOn = readAlarmEnabledLocal(user.id);

    if (typeof nextProfile.alarm_enabled === "boolean") {
      setAlarmEnabled(nextProfile.alarm_enabled);
      persistAlarmEnabledLocal(user.id, nextProfile.alarm_enabled);
    } else {
      // 옛 데이터(컬럼은 생겼지만 값이 null이거나, 예전부터 쓰던 사용자)
      setAlarmEnabled(localOn);
      if (localOn) {
        // 켜져 있던 사람은 DB에도 켜짐을 기록해줌
        await persistAlarmEnabledDb(user.id, true);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    loadMyProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;

    setForm((prev) => {
      if (prev.grade_manual) return prev;

      const auto = calcGradeCodeFromBirthdate(prev.birthdate);
      if ((prev.grade_code ?? null) === (auto ?? null)) return prev;

      return { ...prev, grade_code: auto };
    });
  }, [form.birthdate, form.grade_manual, loading]);

  const turnAlarmOn = async () => {
    if (!profile?.id) return;

    if (!("Notification" in window)) {
      alert(
        "아이패드에서는 사파리 웹에서는 알림이 지원되지 않습니다.\n\n" +
        "홈 화면에 추가한 뒤 앱처럼 실행하면 알림을 사용할 수 있어요."
      );
      return;
    }
    
    if (Notification.permission === "granted") {
      setAlarmEnabled(true);
      persistAlarmEnabledLocal(profile.id, true);
      await persistAlarmEnabledDb(profile.id, true);
      setAlarmPermission("granted");
      return;
    }

    const p = await Notification.requestPermission();
    setAlarmPermission(p);

    if (p === "granted") {
      setAlarmEnabled(true);
      persistAlarmEnabledLocal(profile.id, true);
      await persistAlarmEnabledDb(profile.id, true);
      alert("알림이 켜졌어요!");
    } else {
      // 거부/차단이면 다시 OFF로
      setAlarmEnabled(false);
      persistAlarmEnabledLocal(profile.id, false);
      await persistAlarmEnabledDb(profile.id, false);
      alert("알림이 차단되어 있어요. 브라우저/기기 설정에서 알림을 허용해 주세요.");
    }
  };

  const turnAlarmOff = async () => {
    if (!profile?.id) return;
    setAlarmEnabled(false);
    persistAlarmEnabledLocal(profile.id, false);
    await persistAlarmEnabledDb(profile.id, false);
  };

  // 로그아웃
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

  const { previewAllDone } = useAppSounds({
    allDoneDefaultSrc: DEFAULT_FINISH_SOUND,
  });

  const previewSound = async () => {
    try {
      const src = form.finish_sound || DEFAULT_FINISH_SOUND;
      await previewAllDone(src);
    } catch (err) {
      console.warn("미리듣기 재생 실패", err);
      alert("효과음을 선택한 뒤 ▶ 미리듣기 버튼을 다시 눌러주세요.");
    }
  };

  // 저장
  const onSave = async () => {
    if (!profile?.id) return;

    const nickname = form.nickname.trim();

    const nicknameLocked = Boolean(profile?.nickname_locked);
    if (nicknameLocked && nickname !== String(profile?.nickname ?? "").trim()) {
      alert("이름이 잠겨 있어서 변경할 수 없어요.");
      return;
    }

    if (!nickname) {
      alert("이름을 입력해 주세요.");
      return;
    }

    if (nickname === "닉네임" || nickname === "익명") {
      alert("이름을 직접 입력해 주세요.");
      return;
    }

    setSaving(true);

    const nicknameToSave = nicknameLocked ? profile?.nickname ?? nickname : nickname;

    // ✅ profiles upsert 시 alarm_enabled도 같이 넣어두면,
    // 혹시 profiles가 없는 사용자(예외 케이스)에도 상태가 맞게 들어갑니다.
    const payload = {
      id: profile.id,
      nickname: nicknameToSave,
      birthdate: form.birthdate || null,
      is_male: Boolean(form.is_male),
      finish_sound: form.finish_sound || DEFAULT_FINISH_SOUND,
      grade_code: Number(form.grade_code),
      grade_manual: Boolean(form.grade_manual),

      alarm_enabled: Boolean(alarmEnabled),
      alarm_enabled_at: alarmEnabled ? new Date().toISOString() : null,
    };

    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" })
      .select(
        "id, nickname, birthdate, is_male, finish_sound, grade_code, grade_manual, nickname_locked, alarm_enabled, alarm_enabled_at"
      )
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

    // 로컬도 동기화
    persistAlarmEnabledLocal(profile.id, Boolean(normalized?.alarm_enabled));

    try {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(normalized));
    } catch (err) {
      console.warn("프로필 캐시 저장 실패", err);
    }

    alert("저장되었습니다.");
  };

  // 비밀번호 변경
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

  const savedSoundLabel = getSoundLabelByValue(profile?.finish_sound || DEFAULT_FINISH_SOUND);

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

  const nicknameLocked = Boolean(profile?.nickname_locked);

  return (
    <div className="mypage">
      <header className="top-header">
        <div className="top-row">
          <h1 className="app-title app-title-link" onClick={() => navigate("/planner")} title="플래너로 이동">
            마이페이지
          </h1>

          <div className="header-right">
            <HamburgerMenu />
          </div>
        </div>
      </header>

      <div className="level-panel">
        <div className="level-head">
          <span className="level-title">
            내 레벨
            <span className="level-badge-pink">Lev.{levelInfo.level}</span>
          </span>

          <span className="level-max">/ {MAX_LEVEL}</span>
        </div>

        <div className="level-body">
          <div className="level-bar-wrap" aria-label="레벨 진행 막대">
            <div className="level-bar" />
            <div className="level-marker" style={{ left: `calc(${(levelRatio * 100).toFixed(2)}% )` }} title={`내 위치: Lev.${levelInfo.level}`}>
              <div className="level-marker-arrow" />
              <div className="level-marker-text">Lev.{levelInfo.level}</div>
            </div>
          </div>
        </div>

        <div className="level-sub">
          달력에 "참 잘했어요!" 도장이 현재 {stampCount}개, 다음 레벨까지 {levelInfo.stampsToNext}개 남았어요
        </div>

        <button type="button" className="ranking-btn" onClick={() => navigate("/ranking")}>
          🏆 랭킹 목록 보기
        </button>
      </div>

      <div className="mypage-card">
        <div className="row">
          <span className="label">이메일</span>
          <span className="value">{userEmail || "-"}</span>
        </div>

        <div className="row">
          <span className="label">이름</span>
          <span className="value">
            <input
              type="text"
              value={form.nickname}
              maxLength={6}
              disabled={nicknameLocked}
              onChange={(e) => {
                if (nicknameLocked) return;
                setForm({ ...form, nickname: e.target.value });
              }}
              placeholder={nicknameLocked ? "이름이 잠겨 있어요" : "이름을 입력해 주세요"}
              style={nicknameLocked ? { opacity: 0.65, cursor: "not-allowed" } : undefined}
            />
            {nicknameLocked && <div style={{ marginTop: 6, fontSize: "0.86rem", opacity: 0.85 }} />}
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
                  grade_manual: false,
                }))
              }
            />
          </span>
        </div>

        {/* 학년 */}
        <div className="row">
          <span className="label">내 학년</span>

          <span className="value">
            <select
              className="grade-select"
              value={form.grade_code}
              onChange={(e) => {
                const v = Number(e.target.value);

                setForm((p) => ({
                  ...p,
                  grade_code: v,
                  grade_manual: true,
                }));
              }}
            >
              <option value={-1}>6세</option>
              <option value={0}>7세</option>

              <option value={1}>1학년</option>
              <option value={2}>2학년</option>
              <option value={3}>3학년</option>
              <option value={4}>4학년</option>
              <option value={5}>5학년</option>
              <option value={6}>6학년</option>

              <option value={GRADE_OTHER}>기타</option>
            </select>
          </span>
        </div>

        <div className="row gender">
          <span className="label">성별</span>
          <span className="value gender">
            <label className="gender">
              <input type="radio" name="is_male" checked={form.is_male === true} onChange={() => setForm((p) => ({ ...p, is_male: true }))} />
              <img src="/icon_boy.png" alt="남자" className="gender-icon" />
              <span className="gendertext">남자</span>
            </label>

            <label className="gender">
              <input type="radio" name="is_male" checked={form.is_male === false} onChange={() => setForm((p) => ({ ...p, is_male: false }))} />
              <img src="/icon_girl.png" alt="여자" className="gender-icon" />
              <span className="gendertext">여자</span>
            </label>
          </span>
        </div>

        {/* 알림 (라디오) */}
        <div className="row">
          <span className="label">알림</span>

          <span className="value">
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginRight: 14 }}>
              <input type="radio" name="alarm" checked={alarmEnabled === true} onChange={turnAlarmOn} />
              <span>켜짐</span>
            </label>

            <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <input type="radio" name="alarm" checked={alarmEnabled === false} onChange={turnAlarmOff} />
              <span>꺼짐</span>
            </label>

            {alarmPermission === "denied" && (
              <div style={{ marginTop: 6, fontSize: "0.86rem", opacity: 0.85 }}>
                현재 알림이 차단되어 있어요. (설정에서 허용해 주세요)
              </div>
            )}
          </span>
        </div>

        {/* 완료 음악 선택 */}
        <div className="row">
          <span className="label">모두 완료시</span>

          <span className="value mypage-sound">
            <div className="sound-card">
              <div className="sound-card-head">
                <span className="sound-card-title">🎵 효과음 선택</span>
                <span className="sound-hint">마지막 “완료”를 눌렀을 때 이 소리가 나와요 🙂</span>
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
                  설정되어 있는 효과음: <b>{savedSoundLabel}</b>
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
