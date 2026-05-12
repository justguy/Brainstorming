import React, { useId } from 'react';
import type { BeatReviewItemRecord, BeatReviewSessionRecord } from '../../src/board/types';
import { BeatReviewPanelCard } from './BeatReviewPanelCard';
import { useOverlaySurface } from './useOverlaySurface';

interface BeatReviewPanelProps {
  session: BeatReviewSessionRecord;
  items: BeatReviewItemRecord[];
  busyByItem?: Record<string, 'keep' | 'scratch' | null>;
  batchBusy?: 'keep' | 'scratch' | null;
  onKeep: (itemId: string) => void;
  onScratch: (itemId: string) => void;
  onKeepAll: () => void;
  onScratchAll: () => void;
  onClose: () => void;
}

/*
 * Beat review overlay — paper/sketch restyle.
 *
 * - Root: cream paper with 2px ink border + hand-shadow.
 * - Header pills are inline mono-caps; the pending-count pill rides on
 *   sticky-peach to match the "needs your eyes" beat in the design system.
 * - Action buttons use `.btn.sm.primary` for "Keep pending" and `.btn.sm`
 *   for "Scratch pending"; both have ink chrome from the .btn class.
 * - Close uses `.icon-btn` to keep its own border/background despite the
 *   global `button {}` reset.
 * - Empty state is a dashed-ink card on paper.
 */
const PANEL_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: 24,
  top: 24,
  zIndex: 20,
  width: 'min(720px, calc(100% - 7rem))',
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
  padding: '16px 20px 14px',
};

const TITLE_STYLE: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--f-hand)',
  fontSize: 28,
  lineHeight: 1.05,
  color: 'var(--ink)',
};

const SUMMARY_STYLE: React.CSSProperties = {
  margin: '6px 0 0',
  maxWidth: '40rem',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 14,
  lineHeight: 1.45,
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

const PILL_PENDING: React.CSSProperties = {
  ...PILL_BASE,
  background: 'var(--sticky-peach)',
  borderColor: 'var(--sticky-peach-edge)',
};

const BODY_STYLE: React.CSSProperties = {
  maxHeight: '60vh',
  overflowY: 'auto',
  padding: '14px 18px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const EMPTY_STYLE: React.CSSProperties = {
  borderRadius: 12,
  border: '1.5px dashed var(--ink)',
  background: 'var(--paper)',
  padding: '14px 16px',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 14,
  lineHeight: 1.5,
  color: 'var(--ink-soft)',
};

export function BeatReviewPanel({
  session,
  items,
  busyByItem = {},
  batchBusy = null,
  onKeep,
  onScratch,
  onKeepAll,
  onScratchAll,
  onClose,
}: BeatReviewPanelProps): React.ReactElement {
  const pendingCount = items.filter(item => item.status === 'pending').length;
  const headingId = useId();
  const summaryId = useId();
  const { closeButtonRef, surfaceRef } = useOverlaySurface<HTMLElement>(onClose);

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
              <span style={PILL_INK}>{session.beat} role review</span>
              <span style={PILL_BASE}>{formatRunAt(session.finishedAt)}</span>
              <span style={PILL_PENDING}>{pendingCount} pending</span>
            </div>
            <h2 id={headingId} style={TITLE_STYLE}>{session.title}</h2>
            <p id={summaryId} style={SUMMARY_STYLE}>{session.summary}</p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="icon-btn"
            aria-label="Close role review"
            style={{ flex: '0 0 auto', fontFamily: 'var(--f-mono)', fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={onKeepAll}
            disabled={pendingCount === 0 || batchBusy !== null}
            className="btn sm primary"
            style={{ opacity: pendingCount === 0 || batchBusy !== null ? 0.55 : 1 }}
          >
            {batchBusy === 'keep' ? 'Keeping…' : 'Keep pending'}
          </button>
          <button
            type="button"
            onClick={onScratchAll}
            disabled={pendingCount === 0 || batchBusy !== null}
            className="btn sm"
            style={{ opacity: pendingCount === 0 || batchBusy !== null ? 0.55 : 1 }}
          >
            {batchBusy === 'scratch' ? 'Scratching…' : 'Scratch pending'}
          </button>
        </div>
      </div>

      <div style={BODY_STYLE}>
        {items.map(item => (
          <BeatReviewPanelCard
            key={item.id}
            item={item}
            busy={busyByItem[item.id] ?? null}
            onKeep={onKeep}
            onScratch={onScratch}
          />
        ))}

        {pendingCount === 0 && (
          <div style={EMPTY_STYLE}>
            This review is settled. Kept changes stay on the board; scratched candidates remain reversible through history.
          </div>
        )}
      </div>
    </section>
  );
}

function formatRunAt(timestamp: number): string {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return formatter.format(new Date(timestamp));
}
