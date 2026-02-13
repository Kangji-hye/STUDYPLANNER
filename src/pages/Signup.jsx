// src/pages/Signup.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Signup.css";

// 학년 자동 계산 규칙
// - 사용자가 원한 기준: 2018년생이 2026년에 2학년이 되도록 설정
// - 계산식: grade = (현재연도 - 출생연도 - 6)
//   예) 2026 - 2018 - 6 = 2
function calcGradeCodeFromBirthYear(birthYear) {
  const y = Number(birthYear);
  if (!Number.isFinite(y) || String(birthYear).length !== 4) return null;

  const currentYear = new Date().getFullYear();
  const g = currentYear - y - 6;

  // 유치부/학년/중학생 이상 매핑
  // g가 1~6이면 초등 1~6학년
  if (g >= 1 && g <= 6) return g;

  // 유치부는 -2(5세 이하), -1(6세), 0(7세)
  if (g === 0) return 0; // 7세
  if (g === -1) return -1; // 6세
  if (g <= -2) return -2; // 5세 이하

  // 초등을 넘으면 중학생 이상으로 처리
  if (g >= 7) return 99;

  return null;
}

const Signup = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [birthY, setBirthY] = useState("");
  const [birthM, setBirthM] = useState("");
  const [birthD, setBirthD] = useState("");
  const [nickname, setNickname] = useState("");
  const [isMale, setIsMale] = useState(true);

  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // 생년월일 입력칸 ref (자동 포커스 이동용)
  const refBirthY = useRef(null);
  const refBirthM = useRef(null);
  const refBirthD = useRef(null);

  // 숫자만 남기고 최대 길이까지 자르기
  const onlyDigitsMax = (v, maxLen) =>
    String(v ?? "").replace(/\D/g, "").slice(0, maxLen);

  // YYYY-MM-DD 조립
  const buildBirthdate = () => {
    if (birthY.length !== 4 || birthM.length !== 2 || birthD.length !== 2) return "";
    return `${birthY}-${birthM}-${birthD}`;
  };

  useEffect(() => {
    setBirthD("");
  }, [birthM, birthY]);

  const monthOptions = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

  const getDayOptions = (year, month) => {
    if (!year || !month) return [];
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    return Array.from({ length: lastDay }, (_, i) => String(i + 1).padStart(2, "0"));
  };

  const isPasswordMatch = useMemo(() => {
    if (!password || !passwordConfirm) return true;
    return password === passwordConfirm;
  }, [password, passwordConfirm]);

  const handleSignup = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (password !== passwordConfirm) {
      alert("비밀번호가 서로 다릅니다. 다시 확인해 주세요.");
      return;
    }

    if (password.length < 8) {
      alert("비밀번호는 8자 이상 입력해 주세요.");
      return;
    }

    const safeEmail = email.trim();
    const safeNickname = nickname.trim();
    const safeBirthdate = buildBirthdate();

    // 생년월일 검증: YYYY-MM-DD 형태로 만들어졌는지
    if (!safeBirthdate) {
      alert("생년월일을 YYYY / MM / DD 형식으로 모두 입력해 주세요.");
      return;
    }

    // 간단 날짜 유효성 검사(월/일 범위)
    const mm = Number(safeBirthdate.slice(5, 7));
    const dd = Number(safeBirthdate.slice(8, 10));
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
      alert("생년월일의 월/일을 올바르게 입력해 주세요.");
      return;
    }

    // 학년 자동 계산 (학년 선택 없음)
    const autoGradeCode = calcGradeCodeFromBirthYear(birthY);
    if (autoGradeCode === null) {
      alert("출생 연도를 확인해 주세요.");
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signUp({
        email: safeEmail,
        password,
        options: {
          data: {
            nickname: safeNickname,
            birthdate: safeBirthdate,
            is_male: isMale,

            // 학년은 자동 계산으로 저장
            grade_code: autoGradeCode,
            grade_manual: false,

            // 알림 기본값
            alarm_enabled: true,
          },
        },
      });

      if (error) throw error;

      const user = data?.user;

      if (!user) {
        alert("회원가입 요청이 완료되었습니다. 이메일 인증 후 로그인해 주세요.");
        navigate("/login");
        return;
      }

      // profiles에도 동일하게 저장
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          nickname: safeNickname,
          birthdate: safeBirthdate,
          is_male: isMale,
          grade_code: autoGradeCode,
          grade_manual: false,
          alarm_enabled: true,
          alarm_enabled_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      if (profileError) throw profileError;

      try {
        localStorage.setItem(`planner_alarm_enabled_v1:${user.id}`, "1");
      } catch {
        //
      }

      alert("회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.");
      navigate("/login");
    } catch (err) {
      if (err?.message?.includes("already")) {
        alert("이미 가입된 이메일입니다. 로그인 페이지로 이동해 주세요.");
      } else {
        alert("회원가입 중 오류가 발생했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup auth-page">
      <h2 className="auth-title">회원가입</h2>

      <form onSubmit={handleSignup} className="auth-form">
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />

        <div className="email-id-hint" role="note" aria-label="이메일 안내">
          이메일은 아이디이므로 반드시 기억해 주세요. 비밀번호 재설정도 지금 설정하는 이메일로 진행됩니다.
        </div>

        <input
          type="password"
          placeholder="비밀번호 (8자 이상)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        <input
          type="password"
          placeholder="비밀번호 확인"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />

        {!isPasswordMatch && <p className="pw-hint">비밀번호가 서로 달라요.</p>}

        <input
          type="text"
          placeholder="이름"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          required
          maxLength={6}
        />

        {/* 생년월일: YYYY / MM / DD */}
        <div className="birth-split">
          <input
            ref={refBirthY}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="YYYY"
            value={birthY}
            onChange={(e) => {
              const v = onlyDigitsMax(e.target.value, 4);
              setBirthY(v);
              if (v.length === 4) refBirthM.current?.focus();
            }}
            maxLength={4}
            required
          />

          <span className="birth-sep">-</span>

          <select
            ref={refBirthM}
            value={birthM}
            onChange={(e) => {
              setBirthM(e.target.value);
              refBirthD.current?.focus();
            }}
            required
          >
            <option value="">MM</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <span className="birth-sep">-</span>

          <select
            ref={refBirthD}
            value={birthD}
            onChange={(e) => setBirthD(e.target.value)}
            required
            disabled={birthY.length !== 4 || birthM.length !== 2}
          >
            <option value="">DD</option>
            {getDayOptions(birthY, birthM).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="gender-wrap">
          <label>
            <input type="radio" name="gender" checked={isMale === true} onChange={() => setIsMale(true)} />
            <span>남자</span>
          </label>

          <label>
            <input type="radio" name="gender" checked={isMale === false} onChange={() => setIsMale(false)} />
            <span>여자</span>
          </label>
        </div>

        <button className="auth-submit" type="submit" disabled={loading || !isPasswordMatch}>
          {loading ? "가입 중..." : "가입하기"}
        </button>
      </form>

      <p className="auth-foot">
        이미 계정이 있나요? <Link to="/login">로그인</Link>
      </p>
    </div>
  );
};

export default Signup;
