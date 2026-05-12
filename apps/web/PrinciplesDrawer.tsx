/**
 * bo-162 — PrinciplesDrawer
 *
 * Right-side slide-in drawer that lists the active project's `principles`
 * with edit-in-place + remove affordances per entry. Reads/writes via
 * `useProjectSync()` so any change persists through the same path that
 * `usePromoteToPrinciple` uses to append.
 *
 * Spec: Design/IMPLEMENTATION_PLAN.md §5 Screen 03 — "Right-rail principles
 * drawer + promote-to-principle flow → bo-162".
 *
 * Scope (v0):
 *   - Open/close controlled by parent (`open`, `onClose`). Closing clears any
 *     local edit-in-progress so the next open starts clean.
 *   - Edit: click a principle to enter inline edit; Enter saves, Escape
 *     cancels, blur with non-empty content saves. Empty saves are ignored
 *     (they become a remove via the dedicated button).
 *   - Remove: per-row trash button. No confirm dialog — undo for IDB writes is
 *     a project-wide story we do not own here. The list is short and a remove
 *     is a one-write recovery via the promote action.
 *   - Backdrop click + Escape both call `onClose`. Drawer is rendered into
 *     the normal DOM (no portal) — `position: fixed` is enough at this scope.
 *
 * Out of scope:
 *   - Reordering / drag-handles. The list ships in promotion order.
 *   - Multi-line principles or rich text. `<input>` is intentional.
 *   - Per-board scoping. Principles live on the Project (per bo-101 schema).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectSync } from './useProjectSync';
import { principleMatches } from './usePromoteToPrinciple';

export interface PrinciplesDrawerProps {
  open: boolean;
  onClose: () => void;
}

const DRAWER_CLASS =
  'bo-principles-drawer fixed inset-y-0 right-0 z-[60] flex w-[min(380px,90vw)] flex-col gap-3 border-l border-slate-200 bg-white p-5 shadow-2xl';
const BACKDROP_CLASS = 'fixed inset-0 z-[59] bg-slate-900/30 backdrop-blur-[1px]';
const HEADER_CLASS = 'flex items-start justify-between gap-3';
const TITLE_CLASS = 'text-base font-semibold text-slate-900';
const SUBTITLE_CLASS = 'text-xs text-slate-500';
const CLOSE_CLASS =
  'inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600';
const LIST_CLASS = 'flex flex-col gap-2 overflow-y-auto';
const EMPTY_CLASS =
  'rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500';
const ROW_CLASS =
  'group flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm';
const ROW_TEXT_CLASS = 'flex-1 cursor-text break-words leading-snug';
const ROW_INPUT_CLASS =
  'flex-1 rounded-md border border-sky-300 bg-white px-2 py-1 text-sm text-slate-900 outline-none ring-2 ring-sky-100';
const ROW_REMOVE_CLASS =
  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-200';

interface EditState {
  index: number;
  value: string;
}

export function PrinciplesDrawer({ open, onClose }: PrinciplesDrawerProps): React.ReactElement | null {
  const { project, updateProject, isLoading } = useProjectSync();
  const principles = project?.principles ?? [];
  const [edit, setEdit] = useState<EditState | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Esc closes the drawer; clearing local edit state on close keeps the next
  // open trivial. Listen only while open so we don't intercept Esc elsewhere.
  useEffect(() => {
    if (!open) {
      setEdit(null);
      return;
    }
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Auto-focus the active edit input. Layout-effect would risk a flash on
  // mount; useEffect is fine since the input is freshly rendered.
  useEffect(() => {
    if (edit && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [edit]);

  const writeNext = useCallback(
    async (next: string[]): Promise<void> => {
      await updateProject({ principles: next });
    },
    [updateProject],
  );

  const handleStartEdit = useCallback((index: number, value: string) => {
    setEdit({ index, value });
  }, []);

  const handleEditChange = useCallback((value: string) => {
    setEdit((current) => (current ? { ...current, value } : current));
  }, []);

  const handleEditCommit = useCallback(async () => {
    if (!edit) return;
    const trimmed = edit.value.trim();
    const current = principles;
    // Empty commit cancels (use the trash button to remove).
    if (trimmed.length === 0) {
      setEdit(null);
      return;
    }
    // Same value? Just exit.
    if (trimmed === current[edit.index]) {
      setEdit(null);
      return;
    }
    // Dedupe: drop the edit if it collides with another row.
    const collision = current.some((entry, idx) => idx !== edit.index && principleMatches(trimmed, entry));
    if (collision) {
      setEdit(null);
      return;
    }
    const next = current.map((entry, idx) => (idx === edit.index ? trimmed : entry));
    setEdit(null);
    await writeNext(next);
  }, [edit, principles, writeNext]);

  const handleEditCancel = useCallback(() => {
    setEdit(null);
  }, []);

  const handleEditKey = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void handleEditCommit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        handleEditCancel();
      }
    },
    [handleEditCommit, handleEditCancel],
  );

  const handleRemove = useCallback(
    async (index: number) => {
      const next = principles.filter((_, idx) => idx !== index);
      // If we were editing the row being removed, drop the edit state too.
      if (edit?.index === index) setEdit(null);
      await writeNext(next);
    },
    [principles, edit?.index, writeNext],
  );

  if (!open) return null;

  return (
    <>
      <div
        className={BACKDROP_CLASS}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        className={DRAWER_CLASS}
        role="dialog"
        aria-modal="true"
        aria-label="Project principles"
      >
        <header className={HEADER_CLASS}>
          <div className="flex flex-col gap-0.5">
            <h2 className={TITLE_CLASS}>Principles</h2>
            <p className={SUBTITLE_CLASS}>
              {isLoading
                ? 'Loading…'
                : principles.length === 0
                  ? 'No principles yet.'
                  : `${principles.length} principle${principles.length === 1 ? '' : 's'} on this project.`}
            </p>
          </div>
          <button
            type="button"
            className={CLOSE_CLASS}
            onClick={onClose}
            aria-label="Close principles drawer"
            title="Close (Esc)"
          >
            ×
          </button>
        </header>

        <div className={LIST_CLASS}>
          {principles.length === 0 ? (
            <div className={EMPTY_CLASS}>
              Promote an idea or brief to add a principle. Principles travel
              with the project and surface on every board.
            </div>
          ) : (
            principles.map((principle, index) => {
              const isEditing = edit?.index === index;
              return (
                <div key={`${index}-${principle}`} className={ROW_CLASS}>
                  {isEditing ? (
                    <input
                      ref={inputRef}
                      type="text"
                      className={ROW_INPUT_CLASS}
                      value={edit?.value ?? ''}
                      onChange={(e) => handleEditChange(e.target.value)}
                      onBlur={() => {
                        void handleEditCommit();
                      }}
                      onKeyDown={handleEditKey}
                      aria-label={`Edit principle ${index + 1}`}
                    />
                  ) : (
                    <button
                      type="button"
                      className={`${ROW_TEXT_CLASS} text-left`}
                      onClick={() => handleStartEdit(index, principle)}
                      title="Click to edit"
                    >
                      {principle}
                    </button>
                  )}
                  <button
                    type="button"
                    className={ROW_REMOVE_CLASS}
                    onClick={() => {
                      void handleRemove(index);
                    }}
                    aria-label={`Remove principle: ${principle}`}
                    title="Remove principle"
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}

export default PrinciplesDrawer;
