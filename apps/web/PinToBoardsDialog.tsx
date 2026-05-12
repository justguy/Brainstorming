/**
 * PinToBoardsDialog
 *
 * Paper-styled modal that lets a user pin a single idea to one or more
 * additional boards in the current project. The idea's home board is always
 * the implicit first pin (handled in storage), so the picker only lists OTHER
 * boards. Once committed, `Idea.pinnedToBoardIds` is populated and the planet
 * map (`apps/web/screens/MapScreen.tsx`) will start drawing solid purple
 * cross-board edges for any idea whose pin list spans more than one board.
 *
 * a11y notes:
 *   - role="dialog" + aria-modal + aria-labelledby on the cream card.
 *   - Escape and overlay click both close (matches the rest of the workspace).
 *   - On open, focus moves to the first interactive control (Cancel button)
 *     so keyboard users land inside the dialog rather than wherever the
 *     trigger button left focus. The list is plain checkboxes so native
 *     focus/tab semantics handle the rest — no custom focus trap required at
 *     this scope.
 *
 * The component is self-contained: pass the current pin list and the list
 * of candidate boards in, get a `BoardId[]` of NEWLY-selected boards out via
 * `onCommit`. The caller is responsible for calling the storage helper.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BoardRecord } from '../../src/board/types';
import type { BoardId } from '../../src/types';

export interface PinToBoardsDialogProps {
  /** Whether the dialog is mounted. When false this renders nothing. */
  open: boolean;
  /** The idea being pinned. Only used for the aria-label / sanity guard. */
  ideaId: string;
  /** The idea's home board — excluded from the picker. */
  ideaBoardId: BoardId;
  /** Current pin list on the idea (may include `ideaBoardId`). */
  currentPinned: ReadonlyArray<BoardId>;
  /** All boards in the project (home board is filtered out internally). */
  boards: ReadonlyArray<BoardRecord>;
  /** Per-board idea counts shown next to each row. Missing => "0 ideas". */
  boardIdeaCounts?: Readonly<Record<string, number>>;
  /**
   * Called when the user confirms the picker. Receives the next pin list of
   * OTHER boards (i.e. NOT including the home board). Storage layer prepends
   * the home board on write. Async so the dialog can show a busy state.
   */
  onCommit: (nextPinnedOtherBoardIds: BoardId[]) => Promise<void>;
  onClose: () => void;
}

export function PinToBoardsDialog({
  open,
  ideaId,
  ideaBoardId,
  currentPinned,
  boards,
  boardIdeaCounts,
  onCommit,
  onClose,
}: PinToBoardsDialogProps): React.ReactElement | null {
  // Initial set of "other-board" pins derived from the idea row. The home
  // board is filtered so the picker only ever round-trips OTHER boards.
  const initialOtherPins = useMemo<ReadonlySet<BoardId>>(() => {
    const next = new Set<BoardId>();
    for (const id of currentPinned) {
      if (id && id !== ideaBoardId) next.add(id);
    }
    return next;
  }, [currentPinned, ideaBoardId]);

  const [selected, setSelected] = useState<Set<BoardId>>(() => new Set(initialOtherPins));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  // Re-seed selection whenever we re-open or the idea row changes underneath
  // us. Without this a second open would still show the previous draft.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(initialOtherPins));
    setError(null);
    setSubmitting(false);
  }, [open, initialOtherPins, ideaId]);

  // Esc closes. Window-level listener so the checkbox focus doesn't matter.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus management — move focus into the dialog on open so keyboard users
  // can immediately Tab through the checkbox list / dismiss with Enter on
  // Cancel. A single rAF defers the call past the open transition.
  useEffect(() => {
    if (!open) return undefined;
    const raf = typeof window !== 'undefined'
      ? window.requestAnimationFrame(() => cancelBtnRef.current?.focus())
      : 0;
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [open]);

  if (!open) return null;

  // Boards to offer: everything in the project except the idea's home board.
  // Sort by lastActivityAt / updatedAt so the most-recent boards float to the
  // top — matches Home screen sort.
  const otherBoards = boards
    .filter(board => board.id !== ideaBoardId)
    .slice()
    .sort((a, b) => (b.lastActivityAt ?? b.updatedAt) - (a.lastActivityAt ?? a.updatedAt));

  const initialKey = [...initialOtherPins].sort().join(',');
  const currentKey = [...selected].sort().join(',');
  const unchanged = initialKey === currentKey;
  const empty = selected.size === 0;
  const canCommit = !submitting && !unchanged;

  function toggleBoard(boardId: BoardId): void {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(boardId)) next.delete(boardId);
      else next.add(boardId);
      return next;
    });
  }

  async function handleCommit(): Promise<void> {
    if (!canCommit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCommit([...selected]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not pin idea.');
      setSubmitting(false);
    }
  }

  const titleId = `pin-to-boards-title-${ideaId}`;
  const helperId = `pin-to-boards-helper-${ideaId}`;
  const totalPins = selected.size; // OTHER-board pins; home board is implicit.

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(20, 20, 20, 0.32)',
        backdropFilter: 'blur(1.5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={helperId}
        onClick={event => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--paper)',
          border: '2px solid var(--ink)',
          borderRadius: 12,
          boxShadow: '4px 4px 0 var(--ink)',
          color: 'var(--ink)',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            padding: '14px 18px 10px',
            borderBottom: '1.5px solid var(--hairline, rgba(0,0,0,0.15))',
          }}
        >
          <h2
            id={titleId}
            style={{
              margin: 0,
              fontFamily: 'var(--f-hand)',
              fontSize: 26,
              lineHeight: 1.1,
              color: 'var(--ink)',
            }}
          >
            Pin idea to boards
          </h2>
          <p
            id={helperId}
            style={{
              margin: '6px 0 0',
              fontFamily: 'var(--f-hand-body)',
              fontSize: 14,
              lineHeight: 1.4,
              color: 'var(--ink-soft, rgba(0,0,0,0.65))',
            }}
          >
            This idea will appear on the planet map as a shared thread between
            selected boards.
          </p>
        </header>

        <div
          style={{
            padding: '12px 18px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {otherBoards.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: '14px 12px',
                fontFamily: 'var(--f-hand-body)',
                fontSize: 14,
                color: 'var(--ink-soft, rgba(0,0,0,0.65))',
                border: '1.5px dashed var(--ink)',
                borderRadius: 8,
                textAlign: 'center',
              }}
            >
              No other boards in this project yet. Create another board to start
              cross-pinning ideas.
            </p>
          ) : (
            otherBoards.map(board => {
              const checked = selected.has(board.id);
              const count = boardIdeaCounts?.[board.id] ?? 0;
              const inputId = `pin-to-boards-${ideaId}-${board.id}`;
              return (
                <label
                  key={board.id}
                  htmlFor={inputId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    border: '1.5px solid var(--ink)',
                    borderRadius: 8,
                    background: checked
                      ? 'var(--accent-ai-soft, rgba(120, 80, 200, 0.12))'
                      : 'var(--paper)',
                    cursor: 'pointer',
                    boxShadow: checked ? '2px 2px 0 var(--ink)' : 'none',
                    transition: 'box-shadow 120ms ease, background 120ms ease',
                  }}
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBoard(board.id)}
                    style={{
                      width: 18,
                      height: 18,
                      accentColor: 'var(--accent-ai, #6b46c1)',
                      cursor: 'pointer',
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontFamily: 'var(--f-hand)',
                        fontSize: 18,
                        lineHeight: 1.15,
                        color: 'var(--ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={board.title}
                    >
                      {board.title}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        marginTop: 2,
                        fontFamily: 'var(--f-mono)',
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: 'var(--ink-soft, rgba(0,0,0,0.55))',
                      }}
                    >
                      {count} idea{count === 1 ? '' : 's'}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>

        {error && (
          <p
            role="alert"
            style={{
              margin: '0 18px 8px',
              padding: '8px 10px',
              fontFamily: 'var(--f-hand-body)',
              fontSize: 13,
              color: '#7a1d1d',
              background: 'rgba(220, 80, 80, 0.12)',
              border: '1.5px solid #7a1d1d',
              borderRadius: 6,
            }}
          >
            {error}
          </p>
        )}

        <footer
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '10px 18px 14px',
            borderTop: '1.5px solid var(--hairline, rgba(0,0,0,0.15))',
          }}
        >
          <button
            type="button"
            ref={cancelBtnRef}
            onClick={onClose}
            className="btn sm"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { void handleCommit(); }}
            className="btn sm primary"
            disabled={!canCommit}
            aria-disabled={!canCommit}
          >
            {submitting
              ? 'Pinning…'
              : empty
                ? 'Unpin from all'
                : `Pin to ${totalPins} board${totalPins === 1 ? '' : 's'}`}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default PinToBoardsDialog;
