import React from "react";

export default function ConfirmModal({
  open,
  title = "확인",
  message,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
        </div>

        <div className="modal-body">
          <p>{message}</p>
        </div>

        <div className="modal-actions">
          <button className="outline-btn" onClick={onCancel}>
            취소
          </button>
          <button className="danger-btn" onClick={onConfirm}>
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
