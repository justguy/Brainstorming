import React, { useId, useMemo } from 'react';
import { projectLogEvents } from '../../src/board/projection/logEvents';
import type { BeatRunRecord, ChangeSetRecord } from '../../src/board/types';
import { LogEventList } from './LogEventList';
import { useOverlaySurface } from './useOverlaySurface';

interface BoardHistoryPanelProps {
  /**
   * Append-only change-set feed. Projected to LogEvents internally via
   * `projectLogEvents`.
   */
  changeSets: readonly ChangeSetRecord[];
  /**
   * Append-only beat-run feed. Empty until beatRuns are wired through
   * `useBoardSync` (Screen 06 v0 = feed only).
   */
  beatRuns?: readonly BeatRunRecord[];
  cursor: number;
  totalChanges: number;
  canUndo: boolean;
  canRedo: boolean;
  onClose: () => void;
}

/*
 * Board history overlay — paper/sketch restyle.
 *
 * - Root: cream paper with 2px ink border, hand-shadow.
 * - Headers: Caveat title, Kalam body, JetBrains-Mono uppercase pills.
 * - Status pills are inline mono-caps; Undo/Redo readiness uses sticky
 *   accents (yellow for undo, blue for redo). Disabled tone uses paper-dark
 *   on faint ink.
 * - Close button uses `.icon-btn` so it owns its own border + chrome,
 *   bypassing the global `button {}` reset.
 */
const PANEL_STYLE: React.CSSProperties = {
  position: 'absolute',
  right: 24,
  top: 24,
  zIndex: 20,
  width: 'min(420px, calc(100% - 3rem))',
  maxWidth: '100%',
  background: 'var(--paper)',
  border: '2px solid var(--ink)',
  borderRadius: 14,
  boxShadow: '3px 3px 0 var(--ink)',
  pointerEvents: 'auto',
  color: 'var(--ink)',
};

const HEADER_STYLE: React.CSSProperties = {
  borderBottom: '1.5px solid var(--ink)',
  padding: '16px 18px 14px',
};

const TITLE_STYLE: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--f-hand)',
  fontSize: 26,
  lineHeight: 1.05,
  color: 'var(--ink)',
};

const SUMMARY_STYLE: React.CSSProperties = {
  margin: '6px 0 0',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 14,
  lineHeight: 1.4,
  color: 'var(--ink-soft)',
};

const PILL_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 6,
};

const PILL_BASE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 999,
  border: '1.2px solid var(--ink)',
  background: 'var(--paper)',
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--ink)',
};

const PILL_INK: React.CSSProperties = {
  ...PILL_BASE,
  background: 'var(--ink)',
  color: 'var(--paper)',
};

const PILL_READY_UNDO: React.CSSProperties = {
  ...PILL_BASE,
  background: 'var(--sticky-yellow)',
  borderColor: 'var(--sticky-yellow-edge)',
};

const PILL_READY_REDO: React.CSSProperties = {
  ...PILL_BASE,
  background: 'var(--sticky-blue)',
  borderColor: 'var(--sticky-blue-edge)',
};

const PILL_DISABLED: React.CSSProperties = {
  ...PILL_BASE,
  background: 'var(--paper-dark)',
  borderColor: 'var(--hairline)',
  color: 'var(--ink-faint)',
};

const BODY_STYLE: React.CSSProperties = {
  maxHeight: '68vh',
  overflowY: 'auto',
  padding: '14px 16px 18px',
};

/**
 * bo-132 — v0 of LogEventList host. The panel keeps its existing shell
 * (open / close / scroll) and now derives its rows from the canonical
 * `projectLogEvents()` projection rather than the bespoke
 * `createBoardHistoryEntries()` adapter.
 */
export function BoardHistoryPanel({
  changeSets,
  beatRuns,
  cursor,
  totalChanges,
  canUndo,
  canRedo,
  onClose,
}: BoardHistoryPanelProps): React.ReactElement {
  const headingId = useId();
  const summaryId = useId();
  const { closeButtonRef, surfaceRef } = useOverlaySurface<HTMLElement>(onClose);

  const events = useMemo(
    () => projectLogEvents(changeSets, beatRuns ?? []),
    [changeSets, beatRuns],
  );

  // The log feed reads newest-first to match Screen 06 spec ("vertical
  // timeline, newest first"). projectLogEvents emits ascending order, so we
  // reverse on display.
  const orderedEvents = useMemo(() => [...events].reverse(), [events]);

  return (
    <section
      ref={surfaceRef}
      className="bo-elevated-panel"
      style={PANEL_STYLE}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      aria-describedby={summaryId}
      tabIndex={-1}
    >
      <div style={HEADER_STYLE}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <div style={PILL_ROW_STYLE}>
              <span style={PILL_INK}>Change history</span>
              <span style={PILL_BASE}>{cursor} / {totalChanges}</span>
              <span style={canUndo ? PILL_READY_UNDO : PILL_DISABLED}>
                {canUndo ? 'Undo ready' : 'Oldest state'}
              </span>
              <span style={canRedo ? PILL_READY_REDO : PILL_DISABLED}>
                {canRedo ? 'Redo ready' : 'Latest state'}
              </span>
            </div>
            <h2 id={headingId} style={TITLE_STYLE}>
              Change history
            </h2>
            <p id={summaryId} style={SUMMARY_STYLE}>
              Every patch set stays readable here, including actor, role context, and affected board entities.
            </p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="icon-btn"
            aria-label="Close history"
            style={{ flex: '0 0 auto', fontFamily: 'var(--f-mono)', fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      </div>

      <div style={BODY_STYLE}>
        <LogEventList events={orderedEvents} currentSeq={cursor} />
      </div>
    </section>
  );
}
