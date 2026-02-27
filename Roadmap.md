# 바둑대전 (온라인 2인 실시간 대국) — 구현 로드맵

## 개요

`/baduk`의 AI 1인용 바둑 게임에 더해, 사용자 2명이 실시간으로 대국하는 **바둑대전** 기능을 추가합니다.
Supabase Realtime(postgres_changes)으로 수를 동기화하고, 기존 GameGuard를 적용해
오늘의 플래너를 완료한 사용자만 입장할 수 있습니다.

---

## 구현 단계

### Phase 1 — DB 스키마 (Supabase 콘솔에서 수동 실행) ✅

```sql
CREATE TABLE baduk_rooms (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code      TEXT UNIQUE NOT NULL,
  host_id        UUID,
  guest_id       UUID,
  host_nickname  TEXT,
  guest_nickname TEXT,
  board_size     INT DEFAULT 9,
  board          JSONB DEFAULT '[]',
  turn           TEXT DEFAULT 'host',     -- 'host' | 'guest'
  status         TEXT DEFAULT 'waiting',  -- 'waiting' | 'playing' | 'finished'
  winner         TEXT,                    -- 'host' | 'guest' | 'draw' | null
  cap_host       INT DEFAULT 0,
  cap_guest      INT DEFAULT 0,
  pass_streak    INT DEFAULT 0,
  last_move      JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE baduk_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "누구나 읽기"   ON baduk_rooms FOR SELECT USING (true);
CREATE POLICY "인증 사용자 삽입" ON baduk_rooms FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "참여자만 수정" ON baduk_rooms FOR UPDATE USING (
  auth.uid() = host_id OR auth.uid() = guest_id
);
```

### Phase 2 — 공통 로직 추출 ✅

- `src/utils/badukLogic.js` 신규 생성
  - `makeEmptyBoard`, `floodGroup`, `tryPlaceAndCapture` export
- `src/pages/BadukGame.jsx` — 위 함수 import로 교체 (중복 제거)

### Phase 3 — BadukBattle 페이지 구현 ✅

- `src/pages/BadukBattle.jsx` 신규 생성
  - `lobby` → `waiting` → `playing` → `result` 화면 흐름
  - Supabase Realtime(`postgres_changes`) 구독으로 실시간 동기화
  - 방 만들기 / 방 코드로 참가 / 착수 / 패스 / 기권 기능
  - 연결 끊김 감지: 2분간 `updated_at` 미갱신 시 게임 강제 종료
  - 오래된 방 처리: `created_at` 기준 1시간 초과 방은 만료 안내
  - 컴포넌트 언마운트 시 채널 구독 해제 + 타이머 정리

### Phase 4 — CSS ✅

- `src/pages/BadukBattle.css` 신규 생성
  - `BadukGame.css` 보드·돌·버튼 스타일 공유
  - 대기 화면: `.room-code` 박스 (방 코드 크게 표시)
  - 대국 화면: `.battle-players-banner` (플레이어 닉네임 + 잡은 돌 수 + 현재 차례 강조)

### Phase 5 — 라우트 및 메뉴 등록 ✅

- `src/App.jsx`: `/baduk-battle` 라우트 추가 (`ProtectedRoute` + `GameGuard`)
- `src/components/common/HamburgerMenu.jsx`: ⚔️ 바둑대전 버튼 추가

---

## 검증 체크리스트

- [ ] Supabase 콘솔에서 `baduk_rooms` 테이블 + RLS 정책 생성
- [ ] `npm run dev` 실행 후 브라우저 두 탭(또는 다른 브라우저)에서 각각 로그인
- [ ] 한쪽에서 `/baduk-battle` → "방 만들기" → 방 코드 확인
- [ ] 다른 쪽에서 같은 코드 입력 → 입장 및 게임 시작 확인
- [ ] 양쪽에서 번갈아 돌을 놓아 실시간 동기화 확인
- [ ] 패스 2회 연속 → 승패 결과 화면 전환 확인
- [ ] 기권 → 상대방 승리 처리 확인
- [ ] GameGuard: 오늘 플래너 미완료 시 `/planner` 리다이렉트 확인

---

## 향후 개선 사항

- 바둑대전 전용 랭킹 (현재 미구현)
- 영역 점수(집 계산) 기반 승패 판정 (현재는 잡은 돌 수 기준)
- 방 목록 화면 (현재는 코드 공유 방식)
- 관전 기능
