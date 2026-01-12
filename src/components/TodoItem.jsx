//components/Todoitem.jsx

import React, { useEffect, useRef } from "react";
const TodoItem = ({ t, onToggle, onDelete, sfxEnabled }) => {
  const doneAudioRef = useRef(null);

    useEffect(() => {
      doneAudioRef.current = new Audio("/done.mp3");
      doneAudioRef.current.preload = "auto";

      // 컴포넌트 언마운트 때 정리(선택)
      return () => {
        if (doneAudioRef.current) {
          doneAudioRef.current.pause();
          doneAudioRef.current = null;
        }
      };
    }, []);

  const playDoneSound = () => {
    if (!sfxEnabled) return;
    const audio = doneAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {
    });
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
            style={{
              textDecoration: t.completed ? "line-through" : "none",
              color: t.completed ? "#9ca3af" : "#2b2b2b",
            }}
          >
            {t.title}
            <span className="delele" onClick={(e) => {
              e.stopPropagation();
              const ok = window.confirm("정말 삭제하시겠습니까?");
              if (ok) onDelete(t.id);
            }} title="삭제">x</span>
          </span>
        </div>

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
          완료
        </button>

        {/* <button
          onClick={() => {
            playDoneSound();
            onToggle(t);
          }}
        >
          완료
        </button> */}

      </li>
    </div>
  )
}

export default TodoItem
