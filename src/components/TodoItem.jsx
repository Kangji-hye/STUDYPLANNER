// src/components/TodoItem.jsx
import React, { useEffect } from "react";

let DONE_AUDIO = null;

const getDoneAudio = () => {
  if (!DONE_AUDIO) {
    DONE_AUDIO = new Audio("/done.mp3");
    DONE_AUDIO.preload = "auto";
    DONE_AUDIO.volume = 0.9;
  }
  return DONE_AUDIO;
};

const TodoItem = ({
  t,
  onToggle,
  reorderMode = false,
  onMoveUp,
  onMoveDown,
  isFirst = false,
  isLast = false,
  deleteMode = false,
  deleteChecked = false,
  onToggleDeleteCheck,
}) => {
  useEffect(() => {
    getDoneAudio();
  }, []);

  const playDoneSound = () => {
    try {
      const audio = getDoneAudio();
      audio.currentTime = 0;
      audio.play().catch(() => {
      });
    } catch (e) {
      console.warn("done sound error:", e);
    }
  };

  return (
    <li>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {deleteMode && !reorderMode && (
          <input
            type="checkbox"
            className="todo-delete-check"
            checked={deleteChecked}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              onToggleDeleteCheck?.();
            }}
            aria-label="삭제 선택"
            title="삭제할 항목 선택"
          />
        )}

        {/* 텍스트 */}
        <span
          className="todo-text"
          style={{
            textDecoration: t.completed ? "line-through" : "none",
            color: t.completed ? "#9ca3af" : "#2b2b2b",
          }}
        >
          {t.title}
        </span>

        {t.completed && <span style={{ marginLeft: 4 }}>⭐</span>}
      </div>

      {/* 순서 모드면 ▲▼, 아니면 완료/취소 버튼 */}
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
  );
};

export default TodoItem;
