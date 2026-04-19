import React from 'react';
import type { BeatReviewItemRecord, BeatReviewSessionRecord } from '../../src/board/types';
import { BeatReviewPanelCard } from './BeatReviewPanelCard';

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

  return (
    <section className="pointer-events-auto absolute left-6 top-6 z-20 w-[min(720px,calc(100%-7rem))] max-w-full rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,250,252,0.96))] shadow-[0_28px_80px_rgba(15,23,42,0.18)] backdrop-blur">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                {session.beat} beat review
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                {formatRunAt(session.finishedAt)}
              </span>
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                {pendingCount} pending
              </span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">{session.title}</h2>
            <p className="max-w-2xl text-sm leading-snug text-slate-600">{session.summary}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2.5 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close beat review"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onKeepAll}
            disabled={pendingCount === 0 || batchBusy !== null}
            className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {batchBusy === 'keep' ? 'Keeping…' : 'Keep pending'}
          </button>
          <button
            type="button"
            onClick={onScratchAll}
            disabled={pendingCount === 0 || batchBusy !== null}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 transition hover:bg-slate-100 disabled:opacity-60"
          >
            {batchBusy === 'scratch' ? 'Scratching…' : 'Scratch pending'}
          </button>
        </div>
      </div>

      <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4">
        {items.map(item => (
          <BeatReviewPanelCard
            key={item.id}
            item={item}
            busy={busyByItem[item.id] ?? null}
            onKeep={onKeep}
            onScratch={onScratch}
          />
        ))}
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
