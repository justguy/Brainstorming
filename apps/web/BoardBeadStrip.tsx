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
    return <></>;
  }

  const beadState = deriveIdeaBeadState(idea);

  return (
    <div className="rounded-xl border border-slate-200 bg-white/70 px-2 py-2 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Beads</p>
          <p className="mt-1 text-xs font-medium leading-snug text-slate-700">
            {beadState.summary}
          </p>
        </div>
        {onOpenInspector && (
          <button
            type="button"
            onClick={onOpenInspector}
            className="rounded-full border border-slate-200 px-2 py-1 text-[10px] text-slate-600"
          >
            Open
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {beadState.beads.map(bead => (
          <button
            key={bead.id}
            type="button"
            onClick={onOpenInspector}
            className={`min-w-0 max-w-[9.5rem] rounded-lg border px-2 py-1.5 text-left text-[11px] transition hover:brightness-95 ${STATUS_CLASS[bead.status]}`}
            title={bead.summary}
          >
            <p className="font-semibold tracking-[0.12em] text-[10px]">
              {bead.phaseNumber}
            </p>
            <p className="mt-0.5 text-xs font-semibold">
              {bead.shortLabel}
            </p>
            <p className="mt-0.5 text-[11px] leading-4 opacity-80 line-clamp-2">
              {bead.reviewFlag?.reason ?? bead.suggestion?.reason}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
