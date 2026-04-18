import React from 'react';
import type { SoftModeAssessment } from './softMode';

export interface SoftModeHintProps {
  assessment: SoftModeAssessment;
  actionLabel?: string;
  busy?: boolean;
  onAction?: () => void;
  onDismiss: () => void;
}

const MODE_TONE: Record<SoftModeAssessment['inferredMode'], string> = {
  explore: 'border-teal-200 bg-teal-50/95 text-teal-900',
  structure: 'border-sky-200 bg-sky-50/95 text-sky-900',
  stress: 'border-rose-200 bg-rose-50/95 text-rose-900',
  converge: 'border-amber-200 bg-amber-50/95 text-amber-900',
};

export function SoftModeHint({
  assessment,
  actionLabel,
  busy = false,
  onAction,
  onDismiss,
}: SoftModeHintProps): React.ReactElement {
  return (
    <section
      className={`pointer-events-auto w-full max-w-[360px] rounded-2xl border shadow-lg backdrop-blur transition-all duration-300 ${MODE_TONE[assessment.inferredMode]}`}
      aria-label="Soft mode suggestion"
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]">
            {assessment.inferredMode}
          </p>
          <p className="mt-1 text-sm font-medium leading-snug">
            {assessment.reason}
          </p>
          <p className="mt-1 text-[11px] opacity-70">
            confidence {Math.round(assessment.confidence * 100)}%
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded px-1.5 py-0.5 text-xs hover:bg-white/60 focus:outline-none focus:ring-2 focus:ring-current"
          aria-label="Dismiss suggestion"
        >
          x
        </button>
      </div>

      {(actionLabel && onAction) && (
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={onAction}
            disabled={busy}
            className="w-full rounded-full border border-current/20 bg-white/80 px-3 py-2 text-sm font-semibold hover:bg-white disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-current"
          >
            {busy ? 'Working...' : actionLabel}
          </button>
        </div>
      )}
    </section>
  );
}
