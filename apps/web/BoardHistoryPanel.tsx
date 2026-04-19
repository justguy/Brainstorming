import React, { useId } from 'react';
import type { BoardHistoryEntry } from './historyTimeline';
import { useOverlaySurface } from './useOverlaySurface';

interface BoardHistoryPanelProps {
  entries: BoardHistoryEntry[];
  cursor: number;
  totalChanges: number;
  canUndo: boolean;
  canRedo: boolean;
  onClose: () => void;
}

export function BoardHistoryPanel({
  entries,
  cursor,
  totalChanges,
  canUndo,
  canRedo,
  onClose,
}: BoardHistoryPanelProps): React.ReactElement {
  const headingId = useId();
  const summaryId = useId();
  const { closeButtonRef, surfaceRef } = useOverlaySurface<HTMLElement>(onClose);

  return (
    <section
      ref={surfaceRef}
      className="bo-elevated-panel pointer-events-auto absolute right-6 top-6 z-20 w-[min(420px,calc(100%-3rem))] max-w-full rounded-[26px] backdrop-blur"
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      aria-describedby={summaryId}
      tabIndex={-1}
    >
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                Change history
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                {cursor} / {totalChanges}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${canUndo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                {canUndo ? 'Undo ready' : 'Oldest state'}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${canRedo ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-400'}`}>
                {canRedo ? 'Redo ready' : 'Latest state'}
              </span>
            </div>
            <h2 id={headingId} className="text-sm font-semibold text-slate-900">
              Change history
            </h2>
            <p id={summaryId} className="text-sm leading-snug text-slate-600">
              Every patch set stays readable here, including actor, beat context, and affected board entities.
            </p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-full px-2.5 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close history"
          >
            Close
          </button>
        </div>
      </div>

      <div className="max-h-[68vh] overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          {entries.map(entry => (
            <article
              key={entry.id}
              className={`rounded-2xl border p-4 shadow-sm ${
                entry.isCurrent
                  ? 'border-violet-300 bg-violet-50/70'
                  : entry.status === 'undone'
                    ? 'border-slate-200 bg-slate-50/90'
                    : entry.status === 'superseded'
                      ? 'border-amber-200 bg-amber-50/80'
                      : 'border-slate-200 bg-white/95'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] ${actorToneClass(entry.actorTone)}`}>
                      {entry.actorLabel}
                    </span>
                    {entry.beatLabel && (
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                        {entry.beatLabel}
                      </span>
                    )}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      patch {entry.patchCount}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusClass(entry.status, entry.isCurrent)}`}>
                      {entry.isCurrent ? 'current' : entry.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">{entry.summary}</h3>
                </div>

                <div className="text-right text-[11px] text-slate-500">
                  <div>#{entry.seq}</div>
                  <div>{formatTimestamp(entry.committedAt)}</div>
                </div>
              </div>

              {entry.affected.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Affected entities</p>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.affected.map(target => (
                      <span
                        key={`${target.store}-${target.id}`}
                        className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600"
                        title={`${target.store}:${target.id}`}
                      >
                        {target.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))}

          {entries.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-sm text-slate-500">
              No durable change sets yet. The first edit or AI action will appear here as a readable patch set.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function actorToneClass(tone: BoardHistoryEntry['actorTone']): string {
  switch (tone) {
    case 'user':
      return 'bg-emerald-50 text-emerald-700';
    case 'ai':
      return 'bg-sky-50 text-sky-700';
    case 'tool':
      return 'bg-amber-50 text-amber-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function statusClass(status: BoardHistoryEntry['status'], isCurrent: boolean): string {
  if (isCurrent) return 'bg-violet-100 text-violet-700';
  if (status === 'undone') return 'bg-slate-200 text-slate-600';
  if (status === 'superseded') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}
