import React from 'react';
import { deriveIdeaBeadState, type DerivedBeadStatus } from '../../src/orchestrator/beadState';
import type { Idea } from '../../src/types';

interface BoardBeadStripProps {
  idea: Idea | null;
  onOpenInspector?: () => void;
}

const STATUS_CLASS: Record<DerivedBeadStatus, string> = {
  locked: 'border-[color:var(--bo-paper-border)] bg-white/70 text-[color:var(--bo-paper-ink-soft)]',
  active: 'border-sky-300 bg-sky-50 text-sky-800',
  completed: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  needs_attention: 'border-rose-300 bg-rose-50 text-rose-800',
  soft_nudge: 'border-amber-300 bg-amber-50 text-amber-800',
};

export function BoardBeadStrip({
  idea,
  onOpenInspector,
}: BoardBeadStripProps): React.ReactElement {
  if (!idea) {
    return (
      <div className="bo-shell-inline-card">
        <p className="bo-shell-eyebrow">Bead strip</p>
        <p className="mt-1 text-sm text-[color:var(--bo-paper-ink-soft)]">
          Select a note to see the derived bead state, review flags, and next nudge.
        </p>
      </div>
    );
  }

  const beadState = deriveIdeaBeadState(idea);

  return (
    <div className="bo-shell-inline-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="bo-shell-eyebrow">Bead strip</p>
          <p className="mt-1 text-sm font-semibold text-[color:var(--bo-paper-ink)]">
            {beadState.summary}
          </p>
        </div>
        {onOpenInspector && (
          <button
            type="button"
            onClick={onOpenInspector}
            className="bo-shell-action"
          >
            Inspect
          </button>
        )}
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {beadState.beads.map(bead => (
          <button
            key={bead.id}
            type="button"
            onClick={onOpenInspector}
            className={`min-w-[5.7rem] rounded-[18px] border px-3 py-2 text-left transition hover:-translate-y-[1px] ${STATUS_CLASS[bead.status]}`}
            title={bead.summary}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">
              {bead.phaseNumber}
            </p>
            <p className="mt-1 text-xs font-semibold">
              {bead.shortLabel}
            </p>
            <p className="mt-1 text-[11px] leading-4 opacity-80 line-clamp-2">
              {bead.reviewFlag?.reason ?? bead.suggestion?.reason ?? bead.summary}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
