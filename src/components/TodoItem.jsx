// src/components/TodoItem.jsx
import React, { useEffect, useRef } from "react";

const TodoItem = ({
  t,
  onToggle,
  onDelete,
  reorderMode = false,
  onMoveUp,
  onMoveDown,
  isFirst = false,
  isLast = false,
}) => {
  const doneAudioRef = useRef(null);

  useEffect(() => {
    doneAudioRef.current = new Audio("/done.mp3");
    doneAudioRef.current.preload = "auto";

    return () => {
      if (doneAudioRef.current) {
        doneAudioRef.current.pause();
        doneAudioRef.current = null;
      }
    };
  }, []);

  const playDoneSound = () => {
    const audio = doneAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  };

  return (
    <div>
      <li>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {t.completed && <span>⭐</span>}

          <span
            className="todo-text"
            style={{
              textDecoration: t.completed ? "line-through" : "none",
              color: t.completed ? "#9ca3af" : "#2b2b2b",
            }}
          >
            {t.title}

            {/* 순서 모드에서는 삭제도 막고 싶으면 아래 주석 해제하지 말고 그대로 두세요 */}
            {!reorderMode && (
              <span
                className="delele"
                onClick={(e) => {
                  e.stopPropagation();
                  const ok = window.confirm("정말 삭제하시겠습니까?");
                  if (ok) onDelete(t.id);
                }}
                title="삭제"
              >
                x
              </span>
            )}
          </span>
        </div>

        {/* ✅ 순서 모드일 때는 완료 버튼 숨기고 ▲▼만 보여주기 */}
        {reorderMode ? (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp?.(t);
              }}
              disabled={isFirst}
              title="위로"
              style={{ padding: "8px 10px", borderRadius: "12px" }}
            >
              ▲
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown?.(t);
              }}
              disabled={isLast}
              title="아래로"
              style={{ padding: "8px 10px", borderRadius: "12px" }}
            >
              ▼
            </button>
          </div>
        ) : (
          <button
            className={`todo-done-btn ${t.completed ? "done" : ""}`}
            onClick={(e) => {
              e.stopPropagation();

              if (!t.completed) {
                playDoneSound();
              }

              onToggle(t);
            }}
          >
            {t.completed ? "취소" : "완료"}
          </button>
        )}
      </li>
    </div>
  );
};

export default TodoItem;
