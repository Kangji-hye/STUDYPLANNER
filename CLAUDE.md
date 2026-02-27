# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

이 파일은 이 저장소에서 작업할 때 Claude Code(claude.ai/code)에게 제공되는 가이드입니다.

## 명령어

```bash
npm run dev       # Vite 개발 서버 시작
npm run build     # 프로덕션 빌드
npm run lint      # ESLint 검사
npm run preview   # 프로덕션 빌드 로컬 미리보기
```

이 프로젝트에는 테스트 러너가 설정되어 있지 않습니다.

## 환경 변수

`.env` 파일에 아래 항목이 필요합니다:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_PUBLIC_SITE_URL=...   # og:url에 사용 (선택)
```

## 아키텍처

**"초등 스터디 플래너"** — 초등학생을 위한 React 19 PWA(Vite + vite-plugin-pwa). 백엔드는 Supabase(인증 + PostgreSQL)로만 구성됩니다.

### 진입점 & 라우팅

- `src/main.jsx` → PWA 서비스워커 등록 후 `<App />` 렌더링
- `src/App.jsx` → `BrowserRouter`, `SoundSettingsProvider`(전역 컨텍스트), 전체 라우트 구성
- 루트 `/`는 `/planner`로 리다이렉트
- 레이아웃 셸 두 개: `AuthLayout`(로그인/회원가입/찾기/비밀번호 재설정), `AppLayout`(인증된 모든 페이지)
- `ProtectedRoute`는 `supabase.auth.getSession()`을 확인하고 미인증 사용자를 `/login`으로 리다이렉트

### 핵심 데이터 흐름

모든 날짜는 `day_key`라는 KST 기준 `"YYYY-MM-DD"` 문자열로 저장됩니다. `Date` 객체를 day key로 변환할 때는 반드시 `src/utils/dateKst.js`의 `toKstDayKey()`를 사용하세요. `normalizeNoon()`도 같은 파일에 있습니다.

핵심 페이지는 `/planner`(`src/pages/Planner.jsx`)이며, 다음 순서로 동작합니다:
1. Supabase 인증 세션 대기 (`waitForAuthSession`)
2. 사용자 `profile` 행 로드
3. 선택된 `day_key`의 `todos` 조회
4. 오늘 할일이 비어 있으면 사용자의 저장된 `todo_sets`에서 자동 불러오기
5. 부가 데이터(명예의 전당, 도장 수, 학년별 콘텐츠)는 `requestIdleCallback`으로 지연 로드
6. 모달/무거운 컴포넌트는 `React.lazy()` + `Suspense`로 코드 스플리팅

### Supabase 테이블

| 테이블 | 용도 |
|---|---|
| `todos` | 사용자 할일 항목 (`user_id`, `day_key`, `title`, `completed`, `sort_order`, `template_item_key`, `source_set_item_key`) |
| `profiles` | 사용자 프로필 (`nickname`, `birthdate`, `is_male`, `finish_sound`, `grade_code`, `grade_manual`, `is_admin`, `alarm_enabled`) |
| `hall_of_fame` | 하루 할일을 모두 완료한 기록 (`day_key`, `user_id`). 게임 잠금 해제 조건으로도 사용됨 |
| `todo_sets` | 사용자가 저장한 할일 목록 (`user_id`, `kind="single"`) |
| `todo_set_items` | todo_sets의 항목들 |
| `todo_templates_vacation/weekday/weekend` | 관리자가 관리하는 샘플 일정 |
| `alarm_settings` | 푸시 알림 설정 (`kind`, `time_hhmm`, `start_day`, `end_day`, `message`) |
| `daily_verses` | 2학년 사용자에게 표시되는 오늘의 말씀 (`day_key`, `grade_code`) |
| `daily_homeworks` | 2학년 사용자의 숙제 항목 (`day_key`, `grade_code`, `items` JSONB) |
| `weekly_homework_images` | 학년별 주간 숙제 이미지 (`week_start_day`, `grade_code`) |
| `game_scores` | 게임 점수 (`user_id`, `nickname`, `game_key`, `level`, `score`, `created_at`) |

### 게임 시스템

게임 페이지(`/gugudan`, `/omok`, `/baduk`, `/wordchain`, `/hanja`, `/english-word-game`, `/bible-quiz`, `/typing`)는 모두 `GameGuard`로 감싸져 있습니다. 이 컴포넌트는 오늘 날짜의 `hall_of_fame` 기록이 있는지 확인하며, 플래너의 모든 할일을 완료해야만 게임이 열립니다.

점수 저장은 `src/utils/saveBestScore.js`의 `saveBestScore()`를 사용합니다. 이전 최고 점수를 초과할 때만 저장하며, `updated` / `lower_than_best` / `refreshed_same_score` 등 상세 상태를 반환합니다. 랭킹 집계는 `src/utils/rankingBest.js`의 `bestByNickname()` / `bestByUserId()`를 사용하고, 복잡한 쿼리는 `supabase.rpc("get_stamp_ranking")` 형태의 RPC를 씁니다.

### 레벨 시스템

`src/utils/leveling.js` — `calcLevelFromStamps(stampCount)`로 `hall_of_fame`의 완료 일수를 기반으로 레벨 1~99를 계산합니다. 하루 할일을 모두 완료하면 도장 1개가 쌓입니다. 반환값에는 `level`, `stampsTotal`, `stampsIntoThisLevel`, `stampsToNext`, `needForNext`, `progress`(0~1)가 포함됩니다.

### 학년 시스템

`src/utils/grade.js` — 생년월일에서 학년 코드를 계산합니다: `gradeCode = 현재연도 - 출생연도 - 6` (범위: -1=유치원 ~ 6=6학년). `profiles.grade_manual`로 수동 오버라이드 가능합니다.

### 사운드 시스템

`SoundSettingsContext`(`localStorage`에 유지)에 `sfxEnabled`와 `finishEnabled_v2`(버전 suffix로 키 충돌 방지)가 저장됩니다. `src/hooks/useAppSounds.js`의 `useAppSounds` 훅이 세 가지 사운드(할일 완료음 `/done.mp3`, 타이머 종료음 `/time1.mp3`, 전체 완료음 `/finish1.mp3`)의 `Audio` 객체를 관리합니다. 모바일에서 재생하려면 사용자 상호작용 후 오디오 잠금을 해제해야 하며, `src/hooks/useAudioUnlock.js`가 이를 담당합니다.

### 커스텀 훅

| 훅 | 역할 |
|---|---|
| `useBootSplash` | 앱 준비 완료 시 로딩 스플래시 제거 |
| `useRestoreToToday` | PWA 재포커스 시 플래너를 오늘 날짜로 복원 |
| `useDoneDaysForMonth` | 달력 시각화를 위한 월별 `hall_of_fame` 조회 |
| `useWeatherYongin` | Open-Meteo API(키 불필요, 용인 좌표 고정)에서 날씨 조회 |
| `useAppSounds` | 3개 Audio ref 프리로드·언락·재생 관리 |
| `useAudioUnlock` | 모바일용 단순 오디오 언락 (한 번만 실행) |

### CSS 구성

`Planner.jsx`는 `src/pages/planner/` 아래의 여러 CSS 파일을 분리 import합니다:
`planner.header.css`, `planner.todobar.css`, `planner.calendar.css`, `planner.hof.css`, `planner.tools.css`, `planner.modals.css`, `planner.memo.css`, `planner.footer.css`, `planner.responsive.css`

### 정적 게임 데이터

단어/퀴즈 데이터는 `src/data/`에 JS 배열 파일로 존재합니다: `easyWords.js`, `normalWords.js`, `hardWords.js`, `englishWords.js`, `bibleWords.js`, `anchors.js`, `wordBank.js`

### 관리자 접근

관리자 페이지(`/admin`)는 `me.email === "kara@kara.com"` 이거나 `profile.is_admin === true`일 때만 표시됩니다.

## 주요 코딩 패턴

- **비동기 cleanup**: 비마운트 후 setState 방지를 위해 `alive`/`cancelled` 플래그 패턴 사용
- **localStorage 키 버전 관리**: `finishEnabled_v2`처럼 suffix를 붙여 이전 값과 충돌 방지
- **안전한 문자열 파싱**: `String(x ?? "").trim()` 패턴을 코드 전반에서 사용
- **날짜 변환**: 서버 연동 시 반드시 `toKstDayKey()` 사용 — 브라우저 로컬 시간 직접 사용 금지

## 주요 의존성

| 패키지 | 버전 | 용도 |
|---|---|---|
| `react` | 19.x | 프레임워크 |
| `react-router-dom` | v7 | 클라이언트 라우팅 |
| `@supabase/supabase-js` | v2 | 백엔드/인증/DB |
| `vite-plugin-pwa` | v1 | PWA 매니페스트·서비스워커 |
| `canvas-confetti` | v1.9 | 완료 축하 애니메이션 |
| `react-calendar` | v6 | 달력 UI 컴포넌트 |
| `react-icons` | v5 | 아이콘 |
| `qrcode.react` | v4 | QR 코드 생성 |
