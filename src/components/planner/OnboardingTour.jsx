// src/components/planner/OnboardingTour.jsx
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export default function OnboardingTour({
  open,
  stepIndex,
  steps,
  onClose,
  onChangeStep,
}) {
  const step = steps?.[stepIndex];

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

   rafId = requestAnimationFrame(() => {
    update();
    timeoutId = setTimeout(update, 120);
  });

  window.addEventListener("resize", update);
  window.addEventListener("scroll", update, true);

  const targetEl = step?.targetRef?.current;

  let ro;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      update();
    });

    if (targetEl) ro.observe(targetEl);

    ro.observe(document.body);
  }

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

    if (ro) ro.disconnect();
  };

  
}, [open, stepIndex, step]);
useEffect(() => {
  if (!open) return;

  const el = step?.targetRef?.current;
  if (!el) return;

  const r = el.getBoundingClientRect();
  const margin = 80; 
  const inView =
    r.top >= margin && r.bottom <= window.innerHeight - margin;

  if (inView) return;

  el.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest",
  });
}, [open, stepIndex, step]);


  const bubbleStyle = useMemo(() => {
    if (!rect) return { top: 120, left: 16, right: 16 };

    const padding = 12;
    const bubbleWidth = 280;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const preferBelow = rect.bottom + 160 < viewportH;
    const top = preferBelow ? rect.bottom + padding : rect.top - padding;
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

if (!open || !step) return null;

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

return createPortal(layer, document.body);

}
