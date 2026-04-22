import React from 'react';
import { deriveIdeaBeadState, type DerivedBeadStatus } from '../orchestrator/beadState';
import type { Idea } from '../types';

interface BeadStateReadSurfaceProps {
  idea: Idea;
}

const STATUS_STYLES: Record<DerivedBeadStatus, string> = {
  locked: 'border-slate-200 bg-slate-50 text-slate-500',
  active: 'border-sky-200 bg-sky-50 text-sky-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  needs_attention: 'border-rose-200 bg-rose-50 text-rose-700',
  soft_nudge: 'border-amber-200 bg-amber-50 text-amber-700',
};

export function BeadStateReadSurface({ idea }: BeadStateReadSurfaceProps): React.ReactElement {
  const beadState = deriveIdeaBeadState(idea);

  return (
    <section className="shrink-0 border-b border-sky-100 bg-sky-50/50 px-5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700">
            Bead coordination
          </p>
          <p className="mt-1 text-sm leading-snug text-sky-900">
            The runtime stays derived from the current phase. Review flags and nudges layer on top without moving the idea.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]">
          {renderLegend('active')}
          {renderLegend('completed')}
          {renderLegend('needs_attention')}
          {renderLegend('soft_nudge')}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {beadState.beads.map(bead => (
          <article key={bead.id} className={`rounded-2xl border px-3 py-2 ${STATUS_STYLES[bead.status]}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]">
                  {bead.phaseNumber} · {bead.shortLabel}
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold">
                  {bead.label}
                </p>
              </div>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]">
                {bead.status.replace('_', ' ')}
              </span>
            </div>
            <p className="mt-2 text-xs leading-snug text-slate-700">
              {bead.summary}
            </p>
            {bead.reviewFlag && (
              <p className="mt-2 rounded-xl bg-white/80 px-2 py-1 text-xs leading-snug text-rose-700">
                Review flag: {bead.reviewFlag.reason}
              </p>
            )}
            {bead.suggestion && (
              <p className="mt-2 rounded-xl bg-white/80 px-2 py-1 text-xs leading-snug text-amber-800">
                Nudge: {bead.suggestion.reason}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function renderLegend(status: DerivedBeadStatus): React.ReactElement {
  return (
    <span className={`rounded-full px-2 py-0.5 ${STATUS_STYLES[status]}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
