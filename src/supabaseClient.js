// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// Supabase 프로젝트 설정 정보
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// SUPABASE_ANON_KEY는 외부에 접근을 하면 안되는 키다. 

// 디버깅용 (개발 중에만 잠깐 사용)
console.log("SUPABASE_URL:", SUPABASE_URL);
console.log("SUPABASE_ANON_KEY 앞부분:", SUPABASE_ANON_KEY?.slice(0, 2));

// 클라이언트 생성
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default supabase;