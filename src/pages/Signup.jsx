// src/pages/Signup.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Signup.css";



const Signup = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [birthY, setBirthY] = useState(""); 
  const [birthM, setBirthM] = useState(""); 
  const [birthD, setBirthD] = useState(""); 
  const [nickname, setNickname] = useState("");
  const [isMale, setIsMale] = useState(true);
  // const [gradeCode, setGradeCode] = useState(""); // 문자열로 들고 있다가 저장할 때 숫자로 바꿀 거예요

  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // 생년월일 입력칸 ref (자동 포커스 이동용)
  const refBirthY = useRef(null);
  const refBirthM = useRef(null);
  const refBirthD = useRef(null);

  // 숫자만 남기고, 최대 길이까지 자르기
  const onlyDigitsMax = (v, maxLen) => String(v ?? "").replace(/\D/g, "").slice(0, maxLen);

  // YYYY-MM-DD 조립 (검증은 submit에서)
  const buildBirthdate = () => {
    if (birthY.length !== 4 || birthM.length !== 2 || birthD.length !== 2) return "";
    return `${birthY}-${birthM}-${birthD}`;
  };

  useEffect(() => {
    setBirthD("");
  }, [birthM, birthY]);

  useEffect(() => {
  const canPickDay = birthY.length === 4 && birthM.length === 2;
  if (!canPickDay) return;

  // iOS에서 select 포커스는 타이밍이 민감해서 한 박자 늦춰주는 게 안전함
  const t = setTimeout(() => {
    refBirthD.current?.focus();
  }, 50);

  return () => clearTimeout(t);
}, [birthY, birthM]);

  const monthOptions = Array.from({ length: 12 }, (_, i) =>
    String(i + 1).padStart(2, "0")
  );
  
  const GRADE_OPTIONS = [
    { label: "5세 이하", value: -2 },
    { label: "6세", value: -1 },
    { label: "7세", value: 0 },
    { label: "1학년", value: 1 },
    { label: "2학년", value: 2 },
    { label: "3학년", value: 3 },
    { label: "4학년", value: 4 },
    { label: "5학년", value: 5 },
    { label: "6학년", value: 6 },
    { label: "중학생 이상", value: 99 },
  ];

  const getDayOptions = (year, month) => {
    if (!year || !month) return [];
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    return Array.from({ length: lastDay }, (_, i) =>
      String(i + 1).padStart(2, "0")
    );
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
      return;}

    if (password.length < 8) {
    alert("비밀번호는 8자 이상 입력해 주세요.");
    return;
    }

    const safeEmail = email.trim();
    const safeNickname = nickname.trim();
    const safeBirthdate = buildBirthdate();

    // const safeGradeCode = Number(gradeCode);
    // if (!Number.isFinite(safeGradeCode)) {
    //   alert("학년을 선택해 주세요.");
    //   setLoading(false);
    //   return;
    // }


    // 생년월일 검증: YYYY-MM-DD 형태로 만들어졌는지
    if (!safeBirthdate) {
      alert("생년월일을 YYYY / MM / DD 형식으로 모두 입력해 주세요.");
      setLoading(false);
      return;
    }

    // 간단 날짜 유효성 검사(월/일 범위)
    const mm = Number(safeBirthdate.slice(5, 7));
    const dd = Number(safeBirthdate.slice(8, 10));
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
      alert("생년월일의 월/일을 올바르게 입력해 주세요.");
      setLoading(false);
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
            // grade_code: safeGradeCode, 
            grade_manual: true,        
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

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            nickname: safeNickname,
            birthdate: safeBirthdate, 
            is_male: isMale,
            // grade_code: safeGradeCode,
            grade_manual: true,       
          },
          { onConflict: "id" }
        );

      if (profileError) throw profileError;

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

        {!isPasswordMatch && (
          <p className="pw-hint">비밀번호가 서로 달라요.</p>
        )}

        <input
          type="text"
          placeholder="이름"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          required
          maxLength={6}
        />

        {/* 생년월일: YYYY / MM / DD (년도는 입력, 월/일은 셀렉트) */}
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
              if (v.length === 4) refBirthM.current?.focus(); // 4자리면 월로
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
            disabled={birthY.length !== 4 || birthM.length !== 2}  // 년/월 없으면 비활성
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
            <input
              type="radio"
              name="gender"
              checked={isMale === true}
              onChange={() => setIsMale(true)}
            />
            <span>남자</span>
          </label>

          <label>
            <input
              type="radio"
              name="gender"
              checked={isMale === false}
              onChange={() => setIsMale(false)}
            />
            <span>여자</span>
          </label>
        </div>

         <button
          className="auth-submit"
          type="submit"
          disabled={loading || !isPasswordMatch}
        >
          {loading ? "가입 중..." : "가입하기"}
        </button>

        {/* <div className="grade-wrap">
          <select
            value={gradeCode}
            onChange={(e) => setGradeCode(e.target.value)}
            required
            aria-label="학년 선택"
          >
            <option value="">학년 선택</option>
            {GRADE_OPTIONS.map((x) => (
              <option key={x.value} value={String(x.value)}>
                {x.label}
              </option>
            ))}
          </select>
        </div> */}

      </form>

      <p className="auth-foot">
        이미 계정이 있나요? <Link to="/login">로그인</Link>
      </p>

    </div>
  );
};

export default Signup;
