import React from 'react';
import type { BeatReviewItemRecord } from '../../src/board/types';

interface BeatReviewPanelCardProps {
  item: BeatReviewItemRecord;
  busy?: 'keep' | 'scratch' | null;
  onKeep: (itemId: string) => void;
  onScratch: (itemId: string) => void;
}

export function BeatReviewPanelCard({
  item,
  busy = null,
  onKeep,
  onScratch,
}: BeatReviewPanelCardProps): React.ReactElement {
  const { candidate } = item;
  const statusTone = item.status === 'kept'
    ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700'
    : item.status === 'scratched'
      ? 'border-slate-200 bg-slate-100 text-slate-500'
      : 'border-amber-200 bg-amber-50 text-amber-700';

  return (
    <article className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] ${statusTone}`}>
              {item.status}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
              {candidate.kind.replace(/_/g, ' ')}
            </span>
            {candidate.confidence && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                {candidate.confidence} confidence
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-slate-900">{candidate.label}</h3>
        </div>
        {busy && <span className="text-[11px] italic text-slate-500">{busy === 'keep' ? 'Keeping…' : 'Scratching…'}</span>}
      </div>

      <div className="mt-3 space-y-3">
        {candidate.kind === 'cluster_hint' ? (
          <>
            <p className="text-sm leading-snug text-slate-700">{candidate.summary}</p>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              {candidate.affectedIdeaIds.length} linked idea{candidate.affectedIdeaIds.length === 1 ? '' : 's'}
            </p>
          </>
        ) : (
          <p className="text-sm leading-snug text-slate-700">{candidate.summary}</p>
        )}

        {candidate.detail && <p className="text-xs leading-snug text-slate-500">{candidate.detail}</p>}

        {candidate.affectedIdeaIds.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Affected ideas</p>
            <div className="flex flex-wrap gap-1.5">
              {candidate.affectedIdeaIds.map(ideaId => (
                <span
                  key={ideaId}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                >
                  {ideaId}
                </span>
              ))}
            </div>
          </div>
        )}

        {(candidate.affectedStructureIds?.length ?? 0) > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Affected structures</p>
            <div className="flex flex-wrap gap-1.5">
              {candidate.affectedStructureIds?.map(structureId => (
                <span
                  key={structureId}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                >
                  {structureId}
                </span>
              ))}
            </div>
          </div>
        )}

        {candidate.sources.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Provenance</p>
            <div className="flex flex-wrap gap-1.5">
              {candidate.sources.map(source => (
                <span
                  key={`${source.kind}-${source.id}`}
                  className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-500 ring-1 ring-slate-200"
                >
                  {source.kind}: {source.id}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => onScratch(item.id)}
          disabled={!!busy || item.status === 'scratched'}
          className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-300 transition hover:bg-slate-100 disabled:opacity-60"
        >
          Scratch
        </button>
        <button
          type="button"
          onClick={() => onKeep(item.id)}
          disabled={!!busy || item.status === 'kept'}
          className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          Keep
        </button>
      </div>
    </article>
  );
}
