import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  Connection,
  ConnectionKind,
  ConnectionStrength,
  Idea,
  IdeaAuthorRef,
} from '../../src/types';
import {
  connectionKindLabel,
  connectionKindMeaning,
  isSpecKind,
} from '../../src/connections/kindMapping';
import { expandConnectionReasoning } from './connectionReasoningExpander';
import {
  flipConnectionType as flipConnectionTypeStorage,
  softDeleteConnection as softDeleteConnectionStorage,
  unsoftDeleteConnection as unsoftDeleteConnectionStorage,
} from '../../src/storage/connections';

/**
 * Screen 05 · Connection inspector popover.
 *
 * Spec: Design/IMPLEMENTATION_PLAN.md §5 Screen 05 — opens on click of a
 * connection edge, lets the user edit the connection's `kind`, `strength`,
 * and `rationale` inline. Persistence flows through the existing
 * `replaceConnections` board mutation so the change picks up the same
 * changeSet / undo / autonomy plumbing as everything else on the board.
 *
 * The popover is intentionally thin — no role-history or supersession
 * tracking yet (the M2 build position is "validate the line model early";
 * `supersededBy` is on the data-model roadmap but not the UX surface). The
 * three editable fields cover the connection grammar:
 *
 *   - `kind`     — full 6-kind dropdown sourced from `kindMapping`
 *                  (`connectionKindLabel` for the option text, the
 *                  `connectionKindMeaning` verb for the helper subtitle).
 *   - `strength` — three-stop slider (`weak`/`medium`/`strong`).
 *   - `rationale` — short textarea, persisted on save.
 *
 * Positioning mirrors `CaptureIdeaPopover`: portal to `document.body`,
 * fixed-positioned anchor near the click coordinates, clamped to the
 * viewport. Closes on Esc or click-outside (via the backdrop). The
 * primitive does **not** own its own backdrop; the host renders one when
 * it wants the click-outside semantic.
 */

const KIND_OPTIONS: ConnectionKind[] = [
  'builds_on',
  'shared_theme',
  'contradicts',
  'depends_on',
  'evidence_for',
  // `revives_killed` retained as the legacy 6th kind so an existing
  // connection with that kind can still round-trip through the dropdown.
  'revives_killed',
];

const STRENGTH_OPTIONS: ConnectionStrength[] = ['weak', 'medium', 'strong'];

const POPOVER_WIDTH = 320;
const POPOVER_MARGIN = 16;
const POPOVER_GAP = 12;
const ESTIMATED_HEIGHT = 360;

export interface ConnectionInspectorAnchor {
  /** Viewport-relative click X. */
  x: number;
  /** Viewport-relative click Y. */
  y: number;
}

export interface ConnectionInspectorPopoverProps {
  /** True when the popover should be visible. Pure controlled. */
  open: boolean;
  /** The connection currently being edited. */
  connection: Connection | null;
  /** All ideas on the board — used to render the from/to endpoint titles. */
  ideas: Idea[];
  /** Click coordinates the popover should anchor near. */
  anchor: ConnectionInspectorAnchor | null;
  /**
   * Called with the next field values when the user commits a change. The
   * host is expected to persist via `boardController.replaceConnections`.
   * Returns void; errors should surface as the host's existing error UX.
   */
  onSave: (input: {
    connectionId: string;
    kind: ConnectionKind;
    strength: ConnectionStrength;
    rationale: string;
  }) => void | Promise<void>;
  /** Close handler. Triggered by Esc, the backdrop, or the close button. */
  onClose: () => void;
  /** When true, disables all controls (typically while a save is in flight). */
  busy?: boolean;
  /** Optional error message to render at the top of the popover. */
  error?: string | null;
  /**
   * Optional host-supplied "flip type" handler. When omitted (today's case)
   * the popover falls back to the direct-storage helper so the action still
   * lands a real changeSet without the screen layer needing to wire a
   * callback. The host receives the new kind so it can layer additional UX
   * (counter-nudge, toast) if it wants.
   *
   * Resolution semantics: resolve = success (popover closes); reject =
   * surfaces as an inline error inside the popover.
   */
  onFlipType?: (input: { connectionId: string; newKind: ConnectionKind }) => void | Promise<void>;
  /**
   * Optional host-supplied "soft delete" handler. When omitted, the popover
   * falls back to the direct-storage helper. The host is given the
   * connectionId so it can render its own toast / undo affordance; when it
   * wants the popover's built-in toast, leave this undefined.
   */
  onSoftDelete?: (input: { connectionId: string }) => void | Promise<void>;
  /**
   * Optional host-supplied "undo delete" handler. Used by the popover's
   * in-built undo toast when present. When omitted, the popover falls back to
   * the direct-storage helper.
   */
  onUndoSoftDelete?: (input: { connectionId: string }) => void | Promise<void>;
}

/**
 * Compute a fixed-position anchor near `anchor`, clamped to the viewport.
 * Mirrors `CaptureIdeaPopover.reposition` but anchored to a click point
 * rather than a DOM rect.
 */
function computePopoverStyle(
  anchor: ConnectionInspectorAnchor | null,
  panelHeight: number,
): React.CSSProperties {
  if (typeof window === 'undefined' || !anchor) {
    return {
      position: 'fixed',
      right: POPOVER_MARGIN,
      top: 96,
      width: POPOVER_WIDTH,
      maxHeight: `calc(100vh - ${POPOVER_MARGIN * 2}px)`,
      overflowY: 'auto',
    };
  }

  const width = Math.min(POPOVER_WIDTH, window.innerWidth - POPOVER_MARGIN * 2);
  const height = Math.min(panelHeight, window.innerHeight - POPOVER_MARGIN * 2);

  // Prefer placing the popover below-right of the click. If it would
  // overflow the bottom edge, flip it above. Same for the right edge.
  let left = anchor.x + POPOVER_GAP;
  let top = anchor.y + POPOVER_GAP;
  if (left + width > window.innerWidth - POPOVER_MARGIN) {
    left = anchor.x - width - POPOVER_GAP;
  }
  if (top + height > window.innerHeight - POPOVER_MARGIN) {
    top = anchor.y - height - POPOVER_GAP;
  }

  left = Math.max(POPOVER_MARGIN, Math.min(left, window.innerWidth - POPOVER_MARGIN - width));
  top = Math.max(POPOVER_MARGIN, Math.min(top, window.innerHeight - POPOVER_MARGIN - height));

  return {
    position: 'fixed',
    left: Math.round(left),
    top: Math.round(top),
    width,
    maxHeight: `calc(100vh - ${POPOVER_MARGIN * 2}px)`,
    overflowY: 'auto',
  };
}

function endpointLabelFor(idea: Idea | undefined): string {
  if (!idea) return 'unknown note';
  const trimmed = idea.rawText.trim();
  if (!trimmed) return idea.id;
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? trimmed;
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine;
}

// Default author for inspector-driven mutations when the host doesn't
// provide a richer attribution. The inspector is always user-driven (it's a
// mouse / keyboard surface), so `{kind:'user', id:'self'}` matches what the
// spec asks for.
const DEFAULT_USER_AUTHOR_REF: IdeaAuthorRef = { kind: 'user', id: 'self' };

// Build Spec §s05 — toast auto-dismiss window. 5 seconds matches the spec
// flow ("5s undo toast"). Long enough to read + click, short enough not to
// linger on screen if ignored.
const UNDO_TOAST_DURATION_MS = 5000;

export function ConnectionInspectorPopover({
  open,
  connection,
  ideas,
  anchor,
  onSave,
  onClose,
  busy = false,
  error = null,
  onFlipType,
  onSoftDelete,
  onUndoSoftDelete,
}: ConnectionInspectorPopoverProps): React.ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const [draftKind, setDraftKind] = useState<ConnectionKind>('builds_on');
  const [draftStrength, setDraftStrength] = useState<ConnectionStrength>('medium');
  const [draftRationale, setDraftRationale] = useState('');
  // Build Spec §s05 — "flip type" dropdown visibility. Anchored inline below
  // the action row so the popover keeps its single-card footprint.
  const [flipMenuOpen, setFlipMenuOpen] = useState<boolean>(false);
  // Inline error specific to flip/delete actions (separate channel from the
  // host-supplied `error` prop which is reserved for save failures).
  const [actionError, setActionError] = useState<string | null>(null);
  // In-flight gate for flip/delete so the user can't double-click.
  const [actionBusy, setActionBusy] = useState<boolean>(false);
  // Undo toast — when set, a paper-styled card is rendered at the
  // bottom-center of the viewport. `expiresAt` is the deadline used by the
  // setTimeout cleanup. Single-shot timer; cleared on unmount and on
  // user-triggered undo.
  const [undoToast, setUndoToast] = useState<{ connectionId: string; expiresAt: number } | null>(
    null,
  );
  const undoToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>(() =>
    computePopoverStyle(null, ESTIMATED_HEIGHT),
  );
  // Screen 05 "show reasoning" expander — chain-of-thought elaboration of why
  // the AI drew this line. In-memory only; resets when the popover opens on
  // a different connection. `expanding` is the spinner gate; `expanded`
  // carries the LLM prose; `expandError` surfaces failures inline.
  const [expanding, setExpanding] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandError, setExpandError] = useState<string | null>(null);

  // Resync the local draft when a different connection opens. We only
  // re-seed on `connection.id` flips so in-flight typing isn't blown away
  // by an unrelated re-render of the parent.
  useEffect(() => {
    if (!connection) return;
    setDraftKind(connection.kind);
    setDraftStrength(connection.strength);
    setDraftRationale(connection.rationale ?? '');
    // Reset the "show reasoning" expansion whenever the inspector opens on a
    // different connection. The expansion is per-connection, in-memory only.
    setExpanded(null);
    setExpandError(null);
    setExpanding(false);
    // Reset flip / delete UI state whenever the inspector retargets so we
    // don't carry a stale dropdown / error across connections.
    setFlipMenuOpen(false);
    setActionError(null);
    setActionBusy(false);
  }, [connection?.id, connection?.kind, connection?.strength, connection?.rationale, connection]);

  // Clear the undo-toast timer if the component unmounts mid-window. The
  // toast itself can outlive the popover (it's rendered into the same portal)
  // but the timer must not fire against a stale React state setter.
  useEffect(() => {
    return () => {
      if (undoToastTimerRef.current !== null) {
        clearTimeout(undoToastTimerRef.current);
        undoToastTimerRef.current = null;
      }
    };
  }, []);

  // Esc closes the popover. Bound at window level so the focus state of the
  // textarea / select doesn't matter.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Reposition relative to the latest anchor whenever the popover opens or
  // the viewport changes. We measure the panel height after mount so the
  // clamp matches the actual content height (textarea may grow).
  useLayoutEffect(() => {
    if (!open) return undefined;

    const reposition = () => {
      const panel = panelRef.current;
      const panelHeight = panel?.getBoundingClientRect().height || ESTIMATED_HEIGHT;
      setPanelStyle(computePopoverStyle(anchor, panelHeight));
    };

    const raf = window.requestAnimationFrame(reposition);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && panelRef.current) {
      observer = new ResizeObserver(() => reposition());
      observer.observe(panelRef.current);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      observer?.disconnect();
    };
  }, [open, anchor]);

  const ideaById = useMemo(() => {
    const map = new Map<string, Idea>();
    for (const idea of ideas) map.set(idea.id, idea);
    return map;
  }, [ideas]);

  // "Show reasoning" gate. The connection-finder role authors most
  // connections we render, but some are user-drawn from the Connect tool.
  // We check the optional `authorRef` (added by screens-v2; absent on
  // legacy connections) — `user` means user-authored, anything else
  // (`ai`/`persona`/`role`/`system`) counts as AI-authored. When the
  // marker is missing entirely we conservatively treat the line as
  // AI-authored because the connection-finder is the dominant producer.
  const connectionAuthorRef = connection
    ? (connection as Connection & { authorRef?: IdeaAuthorRef }).authorRef
    : undefined;
  const isAiAuthored = connectionAuthorRef
    ? connectionAuthorRef.kind !== 'user'
    : true;

  const handleShowReasoning = useCallback(async (): Promise<void> => {
    if (!connection || !isAiAuthored || expanding) return;
    setExpanding(true);
    setExpandError(null);
    try {
      const [a, b] = connection.ideaIds;
      const prose = await expandConnectionReasoning({
        connection,
        fromIdea: a ? ideaById.get(a) : undefined,
        toIdea: b ? ideaById.get(b) : undefined,
      });
      setExpanded(prose);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      // The spec calls for a fixed user-facing line; preserve the underlying
      // provider message after the dash so power-users can still self-serve.
      setExpandError(`Couldn't expand reasoning — check provider key (${message})`);
    } finally {
      setExpanding(false);
    }
  }, [connection, isAiAuthored, expanding, ideaById]);

  /**
   * Build Spec §s05 — "flip type". Routes through the host callback when
   * provided, otherwise falls back to the direct storage helper. Closes the
   * popover on success; surfaces errors inline (`actionError`).
   */
  const handleFlipType = useCallback(
    async (nextKind: ConnectionKind): Promise<void> => {
      if (!connection || actionBusy) return;
      if (nextKind === connection.kind) {
        // No-op: user picked the current kind. Just close the dropdown.
        setFlipMenuOpen(false);
        return;
      }
      setActionBusy(true);
      setActionError(null);
      try {
        if (onFlipType) {
          await Promise.resolve(onFlipType({ connectionId: connection.id, newKind: nextKind }));
        } else {
          await flipConnectionTypeStorage(connection.id, nextKind, DEFAULT_USER_AUTHOR_REF);
        }
        setFlipMenuOpen(false);
        onClose();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setActionError(`Couldn't flip type — ${message}`);
      } finally {
        setActionBusy(false);
      }
    },
    [connection, actionBusy, onFlipType, onClose],
  );

  /**
   * Build Spec §s05 — "↶ delete". Soft-deletes via storage (or host
   * callback), closes the popover, and arms a 5-second undo toast. The toast
   * lives in the same portal so it survives the popover closing.
   */
  const handleSoftDelete = useCallback(async (): Promise<void> => {
    if (!connection || actionBusy) return;
    const targetId = connection.id;
    setActionBusy(true);
    setActionError(null);
    try {
      if (onSoftDelete) {
        await Promise.resolve(onSoftDelete({ connectionId: targetId }));
      } else {
        await softDeleteConnectionStorage(targetId, DEFAULT_USER_AUTHOR_REF);
      }
      // Arm the undo toast. Cancel any prior timer so back-to-back deletes
      // don't leave a dangling setTimeout pointing at a stale id.
      if (undoToastTimerRef.current !== null) {
        clearTimeout(undoToastTimerRef.current);
      }
      const expiresAt = Date.now() + UNDO_TOAST_DURATION_MS;
      setUndoToast({ connectionId: targetId, expiresAt });
      undoToastTimerRef.current = setTimeout(() => {
        setUndoToast(prev => (prev?.connectionId === targetId ? null : prev));
        undoToastTimerRef.current = null;
      }, UNDO_TOAST_DURATION_MS);
      onClose();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setActionError(`Couldn't delete — ${message}`);
    } finally {
      setActionBusy(false);
    }
  }, [connection, actionBusy, onSoftDelete, onClose]);

  /**
   * Undo the most recent soft-delete. Triggered by the toast's "undo" link.
   * Clears the toast + timer regardless of outcome so the user isn't stuck
   * staring at it if storage fails.
   */
  const handleUndoSoftDelete = useCallback(async (): Promise<void> => {
    if (!undoToast) return;
    const targetId = undoToast.connectionId;
    if (undoToastTimerRef.current !== null) {
      clearTimeout(undoToastTimerRef.current);
      undoToastTimerRef.current = null;
    }
    setUndoToast(null);
    try {
      if (onUndoSoftDelete) {
        await Promise.resolve(onUndoSoftDelete({ connectionId: targetId }));
      } else {
        await unsoftDeleteConnectionStorage(targetId, DEFAULT_USER_AUTHOR_REF);
      }
    } catch (cause) {
      // Best-effort: the popover is closed by this point, so log to the
      // console rather than re-opening it. The host's facilitator-sync layer
      // will re-render the row in its prior state on the next reload.
      console.error('[ConnectionInspectorPopover] undo failed', cause);
    }
  }, [undoToast, onUndoSoftDelete]);

  // The toast is rendered even when the popover itself is closed (the user
  // closes the popover as part of the delete action). We render it in the
  // same portal as the popover so positioning + z-index stay consistent.
  const toastPortal =
    typeof document !== 'undefined' && undoToast
      ? createPortal(
          <div
            role="status"
            aria-live="polite"
            data-testid="connection-inspector-undo-toast"
            style={{
              position: 'fixed',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 115,
              background: 'var(--paper, #fbf7ee)',
              border: '1.5px solid var(--ink, #1a1814)',
              borderRadius: 10,
              padding: '10px 16px',
              boxShadow: 'var(--shadow-lift, 2px 3px 0 rgba(26,24,20,0.12), 5px 8px 20px rgba(26,24,20,0.08))',
              fontFamily: '"Caveat", "Patrick Hand", "Segoe Print", cursive',
              fontSize: 16,
              color: 'var(--ink, #1a1814)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span>Connection deleted · </span>
            <button
              type="button"
              onClick={() => { void handleUndoSoftDelete(); }}
              aria-label="Undo connection deletion"
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--ink, #1a1814)',
                fontFamily: 'inherit',
                fontSize: 'inherit',
                textDecoration: 'underline',
              }}
            >
              undo
            </button>
          </div>,
          document.body,
        )
      : null;

  if (typeof document === 'undefined' || !open || !connection) {
    // The toast is allowed to render even when the popover is closed (5s
    // grace window after a soft-delete). Returning the toast portal alone
    // keeps it visible until the timer fires.
    return toastPortal;
  }

  const [fromIdeaId, toIdeaId] = connection.ideaIds;
  const fromLabel = endpointLabelFor(fromIdeaId ? ideaById.get(fromIdeaId) : undefined);
  const toLabel = endpointLabelFor(toIdeaId ? ideaById.get(toIdeaId) : undefined);
  const meaningCopy = connectionKindMeaning(draftKind);
  const trimmedRationale = draftRationale.trim();
  const dirty =
    draftKind !== connection.kind ||
    draftStrength !== connection.strength ||
    trimmedRationale !== (connection.rationale ?? '').trim();
  const canSave = dirty && trimmedRationale.length > 0 && !busy;
  const expansionVisible = expanding || expanded !== null || expandError !== null;

  function commitSave(): void {
    if (!canSave || !connection) return;
    void Promise.resolve(
      onSave({
        connectionId: connection.id,
        kind: draftKind,
        strength: draftStrength,
        rationale: trimmedRationale,
      }),
    );
  }

  return createPortal(
    <>
      {/*
        Click-outside backdrop. Transparent so the connection edge
        underneath stays visible; `onClick` closes the popover so the user
        can dismiss by tapping anywhere outside.
      */}
      <div
        className="fixed inset-0 z-[105]"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        style={panelStyle}
        className="bo-capture-surface z-[110]"
        onPointerDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-label="Edit connection"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className="text-[10px] uppercase tracking-[0.18em] text-slate-500"
              data-testid="connection-inspector-eyebrow"
            >
              Connection · {connectionKindLabel(connection.kind)}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900" title={fromLabel}>
              {fromLabel}
            </p>
            <p className="text-[11px] italic text-slate-500">{meaningCopy}</p>
            <p className="truncate text-sm font-semibold text-slate-900" title={toLabel}>
              {toLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-black/20 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-black/20"
            aria-label="Close connection inspector"
          >
            Close
          </button>
        </div>

        {error && (
          <div
            className="mt-3 rounded-md border border-rose-300 bg-rose-50/65 px-3 py-2 text-xs text-rose-800"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="mt-3 space-y-3">
          <label className="block text-xs">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Kind
            </span>
            <select
              value={draftKind}
              disabled={busy}
              onChange={event => setDraftKind(event.target.value as ConnectionKind)}
              className="bo-capture-input mt-1 w-full"
              aria-label="Connection kind"
            >
              {KIND_OPTIONS.map(kind => (
                <option key={kind} value={kind}>
                  {connectionKindLabel(kind)} — {connectionKindMeaning(kind)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Strength
            </span>
            <div className="mt-1 flex items-center gap-3" role="radiogroup" aria-label="Connection strength">
              {STRENGTH_OPTIONS.map(strength => {
                const selected = draftStrength === strength;
                return (
                  <button
                    key={strength}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={busy}
                    onClick={() => setDraftStrength(strength)}
                    className={
                      selected
                        ? 'rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700'
                        : 'rounded-full border border-black/20 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-600 hover:border-black/40'
                    }
                  >
                    {strength}
                  </button>
                );
              })}
            </div>
          </label>

          <label className="block text-xs">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Rationale
            </span>
            <textarea
              value={draftRationale}
              disabled={busy}
              onChange={event => setDraftRationale(event.target.value)}
              rows={3}
              placeholder="Why are these notes connected?"
              className="bo-capture-input mt-1 w-full"
              aria-label="Connection rationale"
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  onClose();
                  return;
                }
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  commitSave();
                }
              }}
            />
            {!trimmedRationale && (
              <span className="mt-1 block text-[10px] text-slate-500">
                A short rationale is required.
              </span>
            )}
          </label>

          {/*
            "Show reasoning" expansion area (Screen 05 spec). Rendered below
            the rationale field so the existing short rationale stays
            prominent. Paper-styled with a left ink border, hand-body font,
            soft-ink color. aria-live so the result is announced once the
            LLM resolves.
          */}
          {expansionVisible && (
            <div
              id="conn-inspector-expansion"
              aria-live="polite"
              data-testid="connection-inspector-expansion"
              className="rounded-md border-l-2 border-stone-700 bg-stone-50 px-3 py-2"
              style={{
                fontFamily:
                  '"Caveat", "Patrick Hand", "Segoe Print", cursive',
                fontSize: '13px',
                lineHeight: 1.45,
                color: 'var(--ink-soft, #4a443a)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {expanding && (
                <span className="italic opacity-70">Thinking…</span>
              )}
              {!expanding && expandError && (
                <span
                  role="alert"
                  style={{ color: 'var(--accent-contradicts, #b3261e)' }}
                >
                  {expandError}
                </span>
              )}
              {!expanding && !expandError && expanded && <span>{expanded}</span>}
            </div>
          )}

          {/*
            Build Spec §s05 inline error channel for flip / delete failures.
            Separate from the save-flow `error` prop so a save error doesn't
            shadow a delete error and vice versa. Uses `--accent-contradicts`
            per spec.
          */}
          {actionError && (
            <div
              role="alert"
              data-testid="connection-inspector-action-error"
              className="rounded-md border px-3 py-2 text-[11px]"
              style={{
                borderColor: 'var(--accent-contradicts, #c94a3a)',
                color: 'var(--accent-contradicts, #c94a3a)',
                background: 'rgba(201,74,58,0.06)',
              }}
            >
              {actionError}
            </div>
          )}
        </div>

        {/*
          Build Spec §s05 spec-action row: `flip type` · `show reasoning` ·
          `↶ delete`. Lives above the Cancel/Save row so the destructive
          delete button isn't adjacent to the primary Save action by accident.
          The flip-type dropdown is rendered inline (below this row) when the
          user clicks the flip-type button.
        */}
        <div className="mt-4 flex items-center gap-2 flex-wrap" data-testid="connection-inspector-actions">
          {/*
            Screen 05 "show reasoning" action. Visible for every connection so
            users learn the affordance; disabled with a tooltip for
            user-authored lines (no AI reasoning to expand). aria-expanded
            tracks the expansion-area visibility so AT users can hear when
            content is appearing.
          */}
          <button
            type="button"
            onClick={() => { void handleShowReasoning(); }}
            disabled={!isAiAuthored || expanding || busy || actionBusy}
            aria-expanded={expansionVisible}
            aria-controls="conn-inspector-expansion"
            title={
              isAiAuthored
                ? 'Expand the AI chain-of-thought for this connection'
                : 'Available for AI-drawn lines only'
            }
            data-testid="connection-inspector-show-reasoning"
            className="rounded-full border border-black/20 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-600 hover:border-black/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {expanding ? 'Thinking…' : 'Show reasoning'}
          </button>
          {/*
            Build Spec §s05 — "flip type". Opens an inline role="menu" with
            the five spec kinds (plus the legacy 6th, tagged "(legacy)").
            Selecting an item commits a new Connection row with the new kind
            and `supersededBy` pointing at the current row. Closes the popover
            on success.
          */}
          <button
            type="button"
            onClick={() => setFlipMenuOpen(prev => !prev)}
            disabled={busy || actionBusy}
            aria-haspopup="menu"
            aria-expanded={flipMenuOpen}
            aria-controls="conn-inspector-flip-menu"
            aria-label="Flip connection type"
            title="Replace this line with a new kind"
            data-testid="connection-inspector-flip-type"
            className="rounded-full border border-black/20 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-600 hover:border-black/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actionBusy ? 'Working…' : 'Flip type'}
          </button>
          {/*
            Build Spec §s05 — "↶ delete". Soft-delete with a 5-second undo
            toast. Coloured with `--accent-contradicts` per spec.
          */}
          <button
            type="button"
            onClick={() => { void handleSoftDelete(); }}
            disabled={busy || actionBusy}
            aria-label="Delete connection"
            title="Soft-delete this connection (5 seconds to undo)"
            data-testid="connection-inspector-delete"
            className="ml-auto rounded-full border bg-white px-3 py-1 text-[11px] uppercase tracking-[0.14em] hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              borderColor: 'var(--accent-contradicts, #c94a3a)',
              color: 'var(--accent-contradicts, #c94a3a)',
            }}
          >
            ↶ delete
          </button>
        </div>

        {/*
          Inline "flip type" menu. Rendered below the action row when open so
          the popover stays a single card. role="menu" + role="menuitem"
          per WAI-ARIA so screen readers announce it as a menu, not a generic
          list.
        */}
        {flipMenuOpen && (
          <div
            id="conn-inspector-flip-menu"
            role="menu"
            aria-label="Choose new connection kind"
            data-testid="connection-inspector-flip-menu"
            className="mt-2 rounded-md border border-black/20 bg-white p-1"
            style={{ boxShadow: 'var(--shadow-lift, 2px 3px 0 rgba(26,24,20,0.12))' }}
          >
            {KIND_OPTIONS.map(kind => {
              const isCurrent = kind === connection.kind;
              const isLegacy = !isSpecKind(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  role="menuitem"
                  disabled={actionBusy || isCurrent}
                  onClick={() => { void handleFlipType(kind); }}
                  data-testid={`connection-inspector-flip-option-${kind}`}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[12px] text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>
                    <span className="font-medium">{connectionKindLabel(kind)}</span>
                    <span className="ml-1 text-[10px] italic text-slate-500">
                      {connectionKindMeaning(kind)}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {isCurrent ? 'current' : isLegacy ? '(legacy)' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-black/20 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-600 hover:border-black/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={commitSave}
            disabled={!canSave}
            className="bo-topbar-primary-action px-4 py-1 text-[11px] uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      {/*
        Undo toast (Build Spec §s05). Rendered in the same portal so it
        layers over the canvas at z-index 115 even if the popover itself is
        already closed. The toast is also yielded above when the popover is
        not open (see early-return), keeping the 5-second window alive after
        the user dismisses.
      */}
      {toastPortal}
    </>,
    document.body,
  );
}

export default ConnectionInspectorPopover;
