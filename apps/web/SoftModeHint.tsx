import React from 'react';
import type { SoftModeAssessment } from './softMode';

export interface SoftModeHintProps {
  assessment: SoftModeAssessment;
  actionLabel?: string;
  busy?: boolean;
  onAction?: () => void;
  onDismiss: () => void;
}

interface ModeTone {
  background: string;
  border: string;
  accent: string;
}

const MODE_TONE: Record<SoftModeAssessment['inferredMode'], ModeTone> = {
  explore: {
    background: 'var(--sticky-green)',
    border: 'var(--accent-revives)',
    accent: 'var(--accent-revives)',
  },
  structure: {
    background: 'var(--sticky-blue)',
    border: 'var(--ink)',
    accent: 'var(--ink)',
  },
  stress: {
    background: 'var(--sticky-pink)',
    border: 'var(--accent-contradicts)',
    accent: 'var(--accent-contradicts)',
  },
  converge: {
    background: 'var(--sticky-yellow)',
    border: 'var(--ink)',
    accent: 'var(--ink)',
  },
};

export function SoftModeHint({
  assessment,
  actionLabel,
  busy = false,
  onAction,
  onDismiss,
}: SoftModeHintProps): React.ReactElement {
  const tone = MODE_TONE[assessment.inferredMode];

  return (
    <section
      className="pointer-events-auto w-full max-w-[360px]"
      aria-label="Soft mode suggestion"
      style={{
        borderRadius: 14,
        border: `2px solid ${tone.border}`,
        background: tone.background,
        boxShadow: '3px 3px 0 var(--ink)',
        fontFamily: 'var(--f-hand-body)',
        color: 'var(--ink)',
        transition: 'transform 80ms ease, box-shadow 80ms ease',
      }}
    >
      <div className="flex items-start justify-between gap-3" style={{ padding: '12px 14px' }}>
        <div>
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--f-mono)',
              fontSize: 10,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              fontWeight: 700,
              color: tone.accent,
            }}
          >
            {assessment.inferredMode}
          </p>
          <p
            style={{
              marginTop: 6,
              marginBottom: 0,
              fontFamily: 'var(--f-hand-body)',
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.35,
              color: 'var(--ink)',
            }}
          >
            {assessment.reason}
          </p>
          <p
            style={{
              marginTop: 6,
              marginBottom: 0,
              fontFamily: 'var(--f-mono)',
              fontSize: 10.5,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--ink-soft)',
            }}
          >
            confidence {Math.round(assessment.confidence * 100)}%
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="icon-btn"
          aria-label="Dismiss suggestion"
          style={{
            width: 26,
            height: 26,
            fontSize: 14,
            lineHeight: 1,
            color: 'var(--ink)',
          }}
        >
          ×
        </button>
      </div>

      {(actionLabel && onAction) && (
        <div style={{ padding: '0 14px 14px' }}>
          <button
            type="button"
            onClick={onAction}
            disabled={busy}
            className="btn sm primary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {busy ? 'Working...' : actionLabel}
          </button>
        </div>
      )}
    </section>
  );
}
