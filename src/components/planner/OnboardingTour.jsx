// src/components/planner/OnboardingTour.jsx
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

/**
 * ✅ 첫 방문 말풍선 단계 안내(온보딩 투어)
 * - 특정 버튼/입력창 근처에 말풍선을 띄워서 "어디를 눌러야 하는지"를 순서대로 안내합니다.
 * - steps 배열에 { title, body, targetRef } 형태로 넣어주면 됩니다.
 */
export default function OnboardingTour({
  open,
  stepIndex,
  steps,
  onClose,
  onChangeStep,
}) {
  const step = steps?.[stepIndex];

  // 가리킬 대상 DOM 위치(사각형)
  const [rect, setRect] = useState(null);

  const total = steps?.length ?? 0;
  const isFirst = stepIndex <= 0;
  const isLast = total > 0 && stepIndex >= total - 1;

  useEffect(() => {
  if (!open) return;

  let rafId;
  let timeoutId;

  const update = () => {
    const el = step?.targetRef?.current;
    if (!el) {
      setRect(null);
      return;
    }










    

    const r = el.getBoundingClientRect();
    setRect({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
      right: r.right,
      bottom: r.bottom,
    });
  };

  // ✅ 1프레임 뒤에 실행 (DOM 확정 대기)
   rafId = requestAnimationFrame(() => {
    update();
    timeoutId = setTimeout(update, 120);
  });

  window.addEventListener("resize", update);
  window.addEventListener("scroll", update, true);

// =========================
  // ✅ 추가 1) 레이아웃이 "조용히" 변해도(날씨 로딩 등) 좌표 다시 계산
  // - 날씨 API가 들어오면서 본문 높이가 바뀌는 케이스를 여기서 잡습니다.
  // =========================
  const targetEl = step?.targetRef?.current;

  // 브라우저 호환성: ResizeObserver 없으면 그냥 넘어가도 됩니다.
  let ro;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      // 레이아웃이 변하면 update
      update();
    });

    // 1) 현재 단계의 타겟 자체 변화 감지
    if (targetEl) ro.observe(targetEl);

    // 2) 본문 전체 변화 감지 (가장 확실)
    //    document.body를 감지하면 날씨/리스트 등 어떤 높이 변화든 잡힙니다.
    ro.observe(document.body);
  }

  // ✅ 추가 2) 열고 난 직후 1~2초 동안은 짧게 따라붙기(마지막 안전장치)
  // - 네트워크 느린 폰에서 날씨가 늦게 들어와도 10px 밀림 방지
  const start = Date.now();
  const tick = () => {
    if (!open) return;
    update();
    if (Date.now() - start < 2000) {
      requestAnimationFrame(tick);
    }
  };
  const rafFollow = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(rafId);
    cancelAnimationFrame(rafFollow);
    clearTimeout(timeoutId);
    window.removeEventListener("resize", update);
    window.removeEventListener("scroll", update, true);

    // ✅ observer 정리
    if (ro) ro.disconnect();
  };

  
}, [open, stepIndex, step]);

// src/components/planner/OnboardingTour.jsx

useEffect(() => {
  if (!open) return;

  const el = step?.targetRef?.current;
  if (!el) return;

  // ✅ 화면 안에 충분히 들어와 있으면 스크롤 안 함(불필요한 흔들림 방지)
  const r = el.getBoundingClientRect();
  const margin = 80; // 위아래 여백(말풍선 자리까지 고려)
  const inView =
    r.top >= margin && r.bottom <= window.innerHeight - margin;

  if (inView) return;

  // ✅ 화면 밖이면 해당 요소로 부드럽게 이동
  // block: "center"는 요소가 화면 가운데 근처로 오게 해서 말풍선/스포트라이트가 보기 좋아집니다.
  el.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest",
  });
}, [open, stepIndex, step]);


  // 말풍선 배치(대상 위/아래 중 화면에서 더 안전한 쪽)
  const bubbleStyle = useMemo(() => {
    if (!rect) return { top: 120, left: 16, right: 16 };

    const padding = 12;
    const bubbleWidth = 280;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    // 기본은 대상 아래에 띄우기
    const preferBelow = rect.bottom + 160 < viewportH;
    const top = preferBelow ? rect.bottom + padding : rect.top - padding;

    // 가운데 정렬 + 화면 밖으로 나가지 않게 조절
    const centerX = rect.left + rect.width / 2;
    let left = centerX - bubbleWidth / 2;
    left = Math.max(12, Math.min(left, viewportW - bubbleWidth - 12));

    return {
      top,
      left,
      width: bubbleWidth,
      transform: preferBelow ? "translateY(0)" : "translateY(-100%)",
    };
  }, [rect, stepIndex]);

  // ✅ 기존: if (!open || !step) return null; 아래의 return(...) 부분을 교체
if (!open || !step) return null;

// 1) 레이어를 변수로 만들고
const layer = (
  <div className="tour-layer" role="dialog" aria-modal="true">
    <div className="tour-dim" onClick={onClose} />

    {rect && (
      <div
        className="tour-spotlight"
        style={{
          top: rect.top - 6,
          left: rect.left - 6,
          width: rect.width + 12,
          height: rect.height + 12,
        }}
      />
    )}

    <div className="tour-bubble" style={bubbleStyle}>
      <div className="tour-head">
        <div className="tour-title">{step.title}</div>
        <button className="tour-close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>

      <div className="tour-body">{step.body}</div>

      <div className="tour-foot">
        <div className="tour-progress">
          {stepIndex + 1} / {steps?.length ?? 0}
        </div>

        <div className="tour-actions">
          {stepIndex > 0 && (
            <button
              type="button"
              className="tour-btn tour-btn-ghost"
              onClick={() => onChangeStep(stepIndex - 1)}
            >
              이전
            </button>
          )}

          {stepIndex < (steps?.length ?? 1) - 1 ? (
            <button
              type="button"
              className="tour-btn tour-btn-primary"
              onClick={() => onChangeStep(stepIndex + 1)}
            >
              다음
            </button>
          ) : (
            <button
              type="button"
              className="tour-btn tour-btn-primary"
              onClick={onClose}
            >
              시작해요!
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
);

// 2) ✅ Portal로 body에 붙이기 (이게 오른쪽 밀림 해결의 핵심)
return createPortal(layer, document.body);

}
