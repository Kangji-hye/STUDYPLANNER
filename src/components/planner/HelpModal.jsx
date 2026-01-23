// src/components/planner/HelpModal.jsx
import React from "react";

/**
 * ✅ 도움말 모달
 * open이 false면 아예 그리지 않아서(=return null)
 * 화면/성능/버그가 안정적입니다.
 */
export default function HelpModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">도움말</div>

          {/* 닫기 버튼 */}
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-help">
            처음 오신 걸 환영해요 🙂<br />
            이 플래너는 “오늘 할 일”을 적고, 끝나면 “완료”를 눌러 성취감을 느끼는 앱이에요.
          </div>

          <div className="modal-help">
            1) 위 입력칸에 할 일을 적고 “입력”을 눌러요.<br />
            2) 끝냈으면 “완료”를 눌러요.<br />
            3) 모두 완료하면 축하 효과가 나와요 🎉<br />
            4) 날짜는 “달력”에서 바꿀 수 있어요.<br />
            5) 자주 하는 목록은 “내 목록 저장/불러오기”로 편하게 써요.
          </div>

          <button className="modal-primary" onClick={onClose}>
            알겠어요!
          </button>
        </div>
      </div>
    </div>
  );
}
