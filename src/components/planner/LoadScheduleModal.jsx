// src/components/planner/MyListSaveModal.jsx
//일정 불러오기 모달
import React from "react";

export default function MyListSaveModal({
  open,
  onClose,
  busyMyList,
  onSaveMyList,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">내 목록 저장</div>
          <button className="modal-close" onClick={onClose} disabled={busyMyList}>✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-help">
            지금 화면의 할 일 목록을 “내 목록”으로 저장합니다. 저장하면 이전 내 목록은 덮어씁니다.
          </div>

          <button className="modal-primary" onClick={onSaveMyList} disabled={busyMyList}>
            {busyMyList ? "저장 중..." : "내 목록으로 저장하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
