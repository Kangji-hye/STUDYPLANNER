// src/components/planner/HelpModal.jsx
// 도움말 모달
import React from "react";

export default function HelpModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card help-bottom-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">도움말</div>

          {/* 닫기 버튼 */}
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-help">
            🙂초등학생을 위한 스터디 플래너 입니다. <br />
            이 플래너는 “오늘 할 일”을 적고, 끝나면 “완료”를 눌러 성취감을 느끼는 앱이에요.
          </div>

          <div className="modal-help">
            1) 위 입력칸에 할 일을 적고 “입력”을 눌러요.<br />
            2) 끝냈으면 “완료”를 눌러요.<br />
            3) 모두 완료하면 축하 효과가 나와요 🎉<br />
            4) 날짜는 “달력”에서 바꿀 수 있어요.<br />
            5) 자주 하는 목록은 “내 목록 저장/불러오기”를 활용해요.<br />
            6) 메모는 자동으로 "저장" 됩니다. <br />
            7) "마이페이지"에서 완료 음악을 변경해요.<br />
            8) 스탑워치는 수학 풀기 숙제에서 사용해요. <br /> 
            9) 타이머는 무음으로도 사용하실 수 있어요. <br />
            10) "하가다" 읊조리는 암기에 유용해요.<br />
            11) 2학년은 카라 "오늘의 암송 말씀"이 나와요. <br />
            12) "마이페이지"에서 비밀번호 수정 가능해요.<br />
            13) 리딩레이스와 그레이프시드는 외부링크에요. <br />
            14) 회원탈퇴 문의는 joyloop7@gmail.com으로 메일주세요.
          </div>

          <button className="modal-primary" onClick={onClose}>
            알겠어요!
          </button>
        </div>
      </div>
    </div>
  );
}
