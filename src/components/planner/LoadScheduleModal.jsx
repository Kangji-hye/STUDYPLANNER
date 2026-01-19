// src/components/planner/LoadScheduleModal.jsx
import React from "react";

export default function LoadScheduleModal({
  open,
  onClose,

  // 선택
  loadChoice,
  setLoadChoice,
  hasMyList,

  // 교체(체크박스)
  sampleModeReplace,
  setSampleModeReplace,
  loadReplace,
  setLoadReplace,

  // 로딩 상태
  importingSample,
  busyMyList,

  // 실행 함수
  importMySingleList,
  importSampleTodos,
}) {
  if (!open) return null;

  const disabledAll = importingSample || busyMyList;

  // ✅ 버튼 문구 자동 변경
  const actionLabel =
    disabledAll
      ? "불러오는 중..."
      : loadChoice === "my"
        ? "내 일정 불러오기"
        : "샘플 추가하기";

  const isReplaceChecked = loadChoice === "my" ? loadReplace : sampleModeReplace;

  const setReplaceChecked = (v) => {
    // UI는 하나지만 로직은 둘 다 씀 → 동기화
    setSampleModeReplace(v);
    setLoadReplace(v);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">일정 불러오기</div>
          <button className="modal-close" onClick={onClose} disabled={disabledAll}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="load-divider" />

          <div className="load-list" role="radiogroup" aria-label="불러올 일정 선택">
            <label className="load-item">
              <input
                type="radio"
                name="load_choice"
                value="my"
                checked={loadChoice === "my"}
                onChange={() => setLoadChoice("my")}
                disabled={disabledAll}
              />
              <span className="load-item-text">내가 만든 목록</span>
              {!hasMyList && <span className="load-item-badge">없음</span>}
            </label>

            <div className="load-divider thin" />

            <label className="load-item">
              <input
                type="radio"
                name="load_choice"
                value="vacation"
                checked={loadChoice === "vacation"}
                onChange={() => setLoadChoice("vacation")}
                disabled={disabledAll}
              />
              <span className="load-item-text">방학 숙제 샘플</span>
            </label>

            <label className="load-item">
              <input
                type="radio"
                name="load_choice"
                value="weekday"
                checked={loadChoice === "weekday"}
                onChange={() => setLoadChoice("weekday")}
                disabled={disabledAll}
              />
              <span className="load-item-text">평일 숙제 샘플</span>
            </label>

            <label className="load-item">
              <input
                type="radio"
                name="load_choice"
                value="weekend"
                checked={loadChoice === "weekend"}
                onChange={() => setLoadChoice("weekend")}
                disabled={disabledAll}
              />
              <span className="load-item-text">주말 숙제 샘플</span>
            </label>
          </div>

          <div className="load-divider" />

          <label className="modal-check">
            <input
              type="checkbox"
              checked={isReplaceChecked}
              onChange={(e) => setReplaceChecked(e.target.checked)}
              disabled={disabledAll}
            />
            기존목록을 비우고 불러오기 (교체)
          </label>

          <div className="load-divider" />

          <button
            className="modal-primary"
            disabled={disabledAll || (loadChoice === "my" && !hasMyList)}
            onClick={async () => {
              if (loadChoice === "my") {
                await importMySingleList();
                return;
              }
              // vacation/weekday/weekend
              await importSampleTodos(loadChoice);
            }}
          >
            {actionLabel}
          </button>

          {loadChoice === "my" && !hasMyList && (
            <div className="load-help">
              저장된 “내가 만든 목록”이 없어요. 먼저 상단의 “내 목록 저장”을 해주세요.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
