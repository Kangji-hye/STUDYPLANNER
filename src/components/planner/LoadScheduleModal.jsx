// src/components/planner/LoadScheduleModal.jsx
// 일정불러오기
import React, { useCallback, useEffect, useMemo, useState } from "react";
import supabase from "../../supabaseClient";

export default function LoadScheduleModal({
  open,
  onClose,
  loadChoice,
  setLoadChoice,
  hasMyList,
  sampleModeReplace,
  setSampleModeReplace,
  loadReplace,
  setLoadReplace,
  importingSample,
  busyMyList,
  importMySingleList,
  importSampleTodos,

  userId,
}) {
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState([]); 

  const SAMPLE_TABLE_BY_KEY = useMemo(
    () => ({
      vacation: "todo_templates_vacation",
      weekday: "todo_templates_weekday",
      weekend: "todo_templates_weekend",
    }),
    []
  );

  const disabledAll = importingSample || busyMyList;

  const isReplaceChecked = loadChoice === "my" ? loadReplace : sampleModeReplace;

  const setReplaceChecked = (v) => {
    setSampleModeReplace(v);
    setLoadReplace(v);
  };

  const fetchPreview = useCallback(async () => {
    if (!open) return;

    if (loadChoice === "my") {
      if (!userId || !hasMyList) {
        setPreviewItems([]);
        return;
      }

      setPreviewLoading(true);
      try {
        const { data: setRow, error: setErr } = await supabase
          .from("todo_sets")
          .select("id")
          .eq("user_id", userId)
          .eq("kind", "single")
          .maybeSingle();

        if (setErr) throw setErr;

        if (!setRow?.id) {
          setPreviewItems([]);
          return;
        }

        const { data: items, error: itemsErr } = await supabase
          .from("todo_set_items")
          .select("title, sort_order")
          .eq("set_id", setRow.id)
          .order("sort_order", { ascending: true });

        if (itemsErr) throw itemsErr;

        const titles = (items ?? [])
          .map((x) => String(x.title ?? "").trim())
          .filter(Boolean);

        setPreviewItems(titles);
      } catch (e) {
        console.error("preview(my) error:", e);
        setPreviewItems([]);
      } finally {
        setPreviewLoading(false);
      }

      return;
    }

    const tableName = SAMPLE_TABLE_BY_KEY[loadChoice];
    if (!tableName) {
      setPreviewItems([]);
      return;
    }

    setPreviewLoading(true);
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select("title, sort_order")
        .order("sort_order", { ascending: true });

      if (error) throw error;

      const titles = (data ?? [])
        .map((x) => String(x.title ?? "").trim())
        .filter(Boolean);

      setPreviewItems(titles);
    } catch (e) {
      console.error("preview(sample) error:", e);
      setPreviewItems([]);
    } finally {
      setPreviewLoading(false);
    }
  }, [open, loadChoice, userId, hasMyList, SAMPLE_TABLE_BY_KEY]);

  useEffect(() => {
    if (!open) return;
    fetchPreview();
  }, [open, fetchPreview]);

  if (!open) return null;

  const actionLabel =
    disabledAll
      ? "불러오는 중..."
      : loadChoice === "my"
        ? "내 일정 불러오기"
        : "샘플 추가하기";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">일정 불러오기</div>
          <button className="modal-close" onClick={onClose} disabled={disabledAll}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="load-divider" />

          <div className="load-list" role="radiogroup" aria-label="불러올 일정 선택">
            <label className="load-item">
              <input
                type="radio"
                name="load_choice"
                value="my"
                checked={loadChoice === "my"}
                onChange={() => setLoadChoice("my")}
                disabled={disabledAll}
              />
              <span className="load-item-text">내가 만든 목록</span>
              {!hasMyList && <span className="load-item-badge">없음</span>}
            </label>

            <div className="load-divider thin" />

            <label className="load-item">
              <input
                type="radio"
                name="load_choice"
                value="vacation"
                checked={loadChoice === "vacation"}
                onChange={() => setLoadChoice("vacation")}
                disabled={disabledAll}
              />
              <span className="load-item-text">방학 숙제 샘플</span>
            </label>

            <label className="load-item">
              <input
                type="radio"
                name="load_choice"
                value="weekday"
                checked={loadChoice === "weekday"}
                onChange={() => setLoadChoice("weekday")}
                disabled={disabledAll}
              />
              <span className="load-item-text">평일 숙제 샘플</span>
            </label>

            <label className="load-item">
              <input
                type="radio"
                name="load_choice"
                value="weekend"
                checked={loadChoice === "weekend"}
                onChange={() => setLoadChoice("weekend")}
                disabled={disabledAll}
              />
              <span className="load-item-text">주말 숙제 샘플</span>
            </label>
          </div>

          <div className="load-divider" />

          <div
            className="load-preview"
            style={{
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 12,
              padding: 10,
              background: "#fff",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>미리보기</div>

            {previewLoading ? (
              <div style={{ color: "var(--muted)" }}>불러오는 중...</div>
            ) : previewItems.length === 0 ? (
              <div style={{ color: "var(--muted)" }}>
                {loadChoice === "my"
                  ? "저장된 내가 만든 목록이 없어요."
                  : "샘플 목록이 비어있어요."}
              </div>
            ) : (
              <div style={{ maxHeight: 140, overflow: "auto", paddingRight: 4 }}>
                {previewItems.slice(0, 12).map((t, i) => (
                  <div
                    key={`${t}-${i}`}
                    style={{
                      fontSize: 14,
                      lineHeight: 1.35,
                      padding: "4px 0",
                      borderBottom: "1px dashed rgba(0,0,0,0.06)",
                      wordBreak: "break-word",
                    }}
                  >
                    {t}
                  </div>
                ))}

                {previewItems.length > 12 && (
                  <div style={{ color: "var(--muted)", marginTop: 6 }}>
                    …그 외 {previewItems.length - 12}개 더 있어요
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="load-divider" />

          <label className="modal-check">
            <input
              type="checkbox"
              checked={isReplaceChecked}
              onChange={(e) => setReplaceChecked(e.target.checked)}
              disabled={disabledAll}
            />
            기존목록을 비우고 불러오기 (교체)
          </label>

          <div className="load-divider" />

          <button
            className="modal-primary"
            disabled={disabledAll || (loadChoice === "my" && !hasMyList)}
            onClick={async () => {
              if (loadChoice === "my") {
                await importMySingleList();
                return;
              }
              await importSampleTodos(loadChoice);
            }}
          >
            {actionLabel}
          </button>

          {loadChoice === "my" && !hasMyList && (
            <div className="load-help">
              저장된 “내가 만든 목록”이 없어요. 먼저 상단의 “내 목록 저장”을 해주세요.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
