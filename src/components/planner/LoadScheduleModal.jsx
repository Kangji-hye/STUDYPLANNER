// src/components/planner/LoadScheduleModal.jsx
// 일정불러오기
import React, { useEffect, useMemo, useState } from "react";
import supabase from "../../supabaseClient";

export default function LoadScheduleModal({
  open,
  onClose,

  // 선택
  loadChoice,
  setLoadChoice,
  hasMyList,

  // 교체(체크박스)
  sampleModeReplace,
  setSampleModeReplace,
  loadReplace,
  setLoadReplace,

  // 로딩 상태
  importingSample,
  busyMyList,

  // 실행 함수
  importMySingleList,
  importSampleTodos,

  userId,
}) {
  if (!open) return null;

  const disabledAll = importingSample || busyMyList;

  // ✅ 미리보기: 선택한 옵션의 목록을 미리 보여주기
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState([]); // string[] (title만)

  // 샘플 테이블 매핑(Planner.jsx와 동일)
  const SAMPLE_TABLE_BY_KEY = useMemo(
    () => ({
      vacation: "todo_templates_vacation",
      weekday: "todo_templates_weekday",
      weekend: "todo_templates_weekend",
    }),
    []
  );

  const fetchPreview = async () => {
    if (!open) return;

    // 1) 내가 만든 목록 미리보기
    if (loadChoice === "my") {
      if (!userId || !hasMyList) {
        setPreviewItems([]);
        return;
      }

      setPreviewLoading(true);
      try {
        // 내 목록 set_id 찾기
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

        // 내 목록 아이템 읽기
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

    // 2) 샘플(방학/평일/주말) 미리보기
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
  };

  // ✅ 모달 열릴 때 + 라디오 선택 바뀔 때 미리보기 새로고침
  useEffect(() => {
    fetchPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loadChoice, userId, hasMyList]);


  // 버튼 문구 자동 변경
  const actionLabel =
    disabledAll
      ? "불러오는 중..."
      : loadChoice === "my"
        ? "내 일정 불러오기"
        : "샘플 추가하기";

  const isReplaceChecked = loadChoice === "my" ? loadReplace : sampleModeReplace;

  const setReplaceChecked = (v) => {
    // UI는 하나지만 로직은 둘 다 씀 → 동기화
    setSampleModeReplace(v);
    setLoadReplace(v);
  };

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

          {/* ✅ 미리보기 */}
          <div
            className="load-preview"
            style={{
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 12,
              padding: 10,
              background: "#fff",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              미리보기
            </div>

            {previewLoading ? (
              <div style={{ color: "var(--muted)" }}>불러오는 중...</div>
            ) : previewItems.length === 0 ? (
              <div style={{ color: "var(--muted)" }}>
                {loadChoice === "my"
                  ? "저장된 내가 만든 목록이 없어요."
                  : "샘플 목록이 비어있어요."}
              </div>
            ) : (
              <div
                style={{
                  maxHeight: 140,
                  overflow: "auto",
                  paddingRight: 4,
                }}
              >
                {previewItems.slice(0, 12).map((t, i) => (
                  <div
                    key={i}
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
              // vacation/weekday/weekend
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