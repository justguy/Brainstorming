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
  const ideaRefs = (candidate.affectedRefs ?? []).filter(ref => ref.kind === 'idea');
  const groupRefs = (candidate.affectedRefs ?? []).filter(ref => ref.kind === 'group');
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
              {candidate.kind === 'idea_insight'
                ? 'idea insight'
                : candidate.kind === 'idea_spawn'
                  ? 'takeaway idea'
                  : candidate.kind.replace(/_/g, ' ')}
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
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Shared question
              </p>
              <p className="mt-1 text-sm leading-snug text-slate-700">{candidate.summary}</p>
            </div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Theme: {candidate.label}
            </p>
          </>
        ) : candidate.kind === 'idea_spawn' ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50/70 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">
              New takeaway idea
            </p>
            <p className="mt-1 text-sm leading-snug text-slate-700">{candidate.summary}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
              Linked insight
            </p>
            <p className="mt-1 text-sm leading-snug text-slate-700">{candidate.summary}</p>
          </div>
        )}

        {candidate.detail && <p className="text-xs leading-snug text-slate-500">{candidate.detail}</p>}

        {ideaRefs.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Affected ideas</p>
            <div className="flex flex-wrap gap-1.5">
              {ideaRefs.map(ref => (
                <span
                  key={`${ref.kind}-${ref.id}`}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                >
                  {ref.label ?? ref.id}
                </span>
              ))}
            </div>
          </div>
        )}

        {groupRefs.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Affected groups</p>
            <div className="flex flex-wrap gap-1.5">
              {groupRefs.map(ref => (
                <span
                  key={`${ref.kind}-${ref.id}`}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                >
                  {ref.label ?? ref.id}
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
                  {source.kind}: {source.label ?? source.id}
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
