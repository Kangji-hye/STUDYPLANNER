//components/Todoitem.jsx

import React from 'react'

const TodoItem = ({ t, onToggle, onDelete }) => {
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
          {/* ⭐🏆👑 */}
          {t.completed && <span>⭐</span>}

          <span
            style={{
              textDecoration: t.completed ? "line-through" : "none",
              color: t.completed ? "#9ca3af" : "#2b2b2b",
            }}
          >
            {t.title}
            <span class="delele" onClick={(e) => {
              e.stopPropagation();
              const ok = window.confirm("정말 삭제하시겠습니까?");
              if (ok) onDelete(t.id);
            }}>x</span>
          </span>
        </div>
        <button onClick={() => onToggle(t)}>완료</button>
      </li>
    </div>
  )
}

export default TodoItem
