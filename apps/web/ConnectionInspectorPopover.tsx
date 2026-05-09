import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  Connection,
  ConnectionKind,
  ConnectionStrength,
  Idea,
} from '../../src/types';
import {
  connectionKindLabel,
  connectionKindMeaning,
} from '../../src/connections/kindMapping';

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

export function ConnectionInspectorPopover({
  open,
  connection,
  ideas,
  anchor,
  onSave,
  onClose,
  busy = false,
  error = null,
}: ConnectionInspectorPopoverProps): React.ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const [draftKind, setDraftKind] = useState<ConnectionKind>('builds_on');
  const [draftStrength, setDraftStrength] = useState<ConnectionStrength>('medium');
  const [draftRationale, setDraftRationale] = useState('');
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>(() =>
    computePopoverStyle(null, ESTIMATED_HEIGHT),
  );

  // Resync the local draft when a different connection opens. We only
  // re-seed on `connection.id` flips so in-flight typing isn't blown away
  // by an unrelated re-render of the parent.
  useEffect(() => {
    if (!connection) return;
    setDraftKind(connection.kind);
    setDraftStrength(connection.strength);
    setDraftRationale(connection.rationale ?? '');
  }, [connection?.id, connection?.kind, connection?.strength, connection?.rationale, connection]);

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

  if (typeof document === 'undefined' || !open || !connection) return null;

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
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
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
    </>,
    document.body,
  );
}

export default ConnectionInspectorPopover;
