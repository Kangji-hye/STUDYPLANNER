// src/pages/AuthCallback.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";

// ✅ 랜덤 닉네임 만들기(너무 길지 않게 4자리 숫자)
const makeGuestNickname = () => {
  const n = Math.floor(1000 + Math.random() * 9000); // 1000~9999
  return `친구${n}`;
};

// ✅ OAuth로 들어온 유저의 닉네임 후보를 최대한 "사람이 넣은 값"에서 뽑아보기
const pickNicknameCandidate = (user) => {
  // user_metadata는 공급자(카카오/구글)마다 키가 조금씩 달라요.
  const meta = user?.user_metadata ?? {};

  // 흔히 들어오는 키들(없으면 다음으로 넘어감)
  const candidates = [
    meta.nickname,
    meta.name,
    meta.full_name,
    meta.user_name,
  ];

  // 문자열로 바꿔서 trim 하고, 6글자까지만
  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (s) return Array.from(s).slice(0, 6).join("");
  }

  // 전부 없으면 null
  return null;
};

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        // ✅ code가 있으면 세션 교환
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // ✅ 세션이 실제로 생겼는지 확인 (PC에서 특히 중요)
        let { data } = await supabase.auth.getSession();
        let session = data?.session ?? null;

        if (!session) {
          session = await new Promise((resolve) => {
            const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
              if (s) {
                sub.subscription.unsubscribe();
                resolve(s);
              }
            });

            setTimeout(() => {
              sub.subscription.unsubscribe();
              resolve(null);
            }, 5000);
          });
        }

        // ✅ 세션이 끝까지 없으면 로그인으로
        if (!session?.user) {
          if (!alive) return;
          navigate("/login", { replace: true });
          return;
        }

        // ============================
        // ✅ 여기부터가 "카카오 익명 방지" 핵심
        // - profiles에 닉네임이 비어있으면 자동 생성해서 저장
        // - 이후 랭킹에서도 익명이 거의 사라집니다
        // ============================
        const user = session.user;

        try {
          // 1) 기존 프로필 확인
          const { data: profileRow, error: profileErr } = await supabase
            .from("profiles")
            .select("id, nickname")
            .eq("id", user.id)
            .maybeSingle();

          // DB 조회 에러는 치명적이진 않으니, 여기서는 throw 하지 않고 보수적으로 진행
          const currentNickname = String(profileRow?.nickname ?? "").trim();

          // 2) 닉네임이 없거나 "익명" 계열이면 새로 만든다
          const compact = currentNickname.replace(/\s+/g, "");
          const needNickname =
            !currentNickname || compact === "익명" || compact.startsWith("익명") || profileErr;

          if (needNickname) {
            // 가능한 한 공급자가 준 이름/닉네임을 먼저 쓰고
            // 없으면 친구1234 같은 랜덤 닉네임을 사용
            const candidate = pickNicknameCandidate(user);
            const finalNickname = candidate || makeGuestNickname();

            // 3) profiles에 저장(없으면 생성, 있으면 업데이트)
            const { error: upErr } = await supabase
              .from("profiles")
              .upsert(
                {
                  id: user.id,
                  nickname: finalNickname,
                },
                { onConflict: "id" }
              );

            if (upErr) {
              // 저장이 실패해도 로그인 자체는 진행되게 한다
              console.warn("profiles nickname upsert failed:", upErr);
            }
          }
        } catch (e) {
          // 여기도 실패해도 로그인 진행은 되게(아이들 앱은 끊김이 더 싫음)
          console.warn("profile normalize failed:", e);
        }

        // ✅ 여기까지 왔으면 “로그인 성공 확정”
        if (!alive) return;
        navigate("/planner", { replace: true });
      } catch (err) {
        console.error("AuthCallback error:", err);
        if (!alive) return;
        navigate("/login", { replace: true });
      }
    };

    run();

    return () => {
      alive = false;
    };
  }, [navigate]);

  return null;
};

export default AuthCallback;
