import React from 'react';
import type { BeatName, BeatRunState } from '../../src/beats/types';
import type { BeatReviewItemRecord, BeatReviewSessionRecord } from '../../src/board/types';

interface BoardBeatsCardProps {
  activeBeatRun: BeatRunState | null;
  boardBeatReviewSession: BeatReviewSessionRecord | null;
  boardBeatReviewItems: BeatReviewItemRecord[];
  onOpenBoardBeatReview?: () => void;
  onRunClusterBeat: () => void | Promise<void>;
  onRunSummariseBeat: () => void | Promise<void>;
}

export function BoardBeatsCard({
  activeBeatRun,
  boardBeatReviewSession,
  boardBeatReviewItems,
  onOpenBoardBeatReview,
  onRunClusterBeat,
  onRunSummariseBeat,
}: BoardBeatsCardProps): React.ReactElement {
  const activeBeat = activeBeatRun?.beat ?? null;
  const isClusterRunning = activeBeat === 'cluster';
  const isSummariseRunning = activeBeat === 'summarise';

  return (
    <section className="bo-card-surface w-full rounded-[18px] border border-slate-200/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Role passes
          </p>
          <h3 className="mt-2 text-sm font-semibold text-slate-900">
            Pull a role pass into the canvas flow
          </h3>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            Run a role pass for clusters or synthesis without leaving the board.
          </p>
        </div>
        {activeBeat && (
          <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
            {beatLabel(activeBeat)} in progress
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            void onRunClusterBeat();
          }}
          disabled={activeBeatRun !== null}
          className="rounded-[16px] border border-slate-300 bg-white/95 px-3 py-2.5 text-left text-sm shadow-sm transition hover:border-slate-400 hover:shadow-md disabled:opacity-60"
          aria-label={isClusterRunning ? 'Cluster role in progress' : 'Run board clustering role'}
        >
          <div className="font-semibold text-slate-900">
            {isClusterRunning ? 'Clustering…' : 'Clustering role'}
          </div>
          <div className="mt-1 text-xs leading-5 text-slate-500">
            Surface related ideas and review the cluster candidates inline.
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            void onRunSummariseBeat();
          }}
          disabled={activeBeatRun !== null}
          className="rounded-[16px] border border-slate-300 bg-white/95 px-3 py-2.5 text-left text-sm shadow-sm transition hover:border-slate-400 hover:shadow-md disabled:opacity-60"
          aria-label={isSummariseRunning ? 'Summarise role in progress' : 'Run board synthesis role'}
        >
          <div className="font-semibold text-slate-900">
            {isSummariseRunning ? 'Synthesising…' : 'Synthesis role'}
          </div>
          <div className="mt-1 text-xs leading-5 text-slate-500">
            Produce a one-line synthesis for current board structure.
          </div>
        </button>
      </div>

      {boardBeatReviewSession && (
        <article className="mt-3 rounded-[16px] border border-slate-200 bg-white/90 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                  {boardBeatReviewSession.beat} role review
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  {formatRunAt(boardBeatReviewSession.finishedAt)}
                </span>
              </div>
              <h4 className="text-sm font-semibold text-slate-900">
                {boardBeatReviewSession.title}
              </h4>
              <p className="text-sm leading-5 text-slate-600">
                {boardBeatReviewSession.summary}
              </p>
            </div>
            {onOpenBoardBeatReview && (
              <button
                type="button"
                onClick={onOpenBoardBeatReview}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Open review
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-slate-600">
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
              {countByStatus(boardBeatReviewItems, 'pending')} pending
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
              {countByStatus(boardBeatReviewItems, 'kept')} kept
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              {countByStatus(boardBeatReviewItems, 'scratched')} scratched
            </span>
          </div>

          {boardBeatReviewItems.length > 0 && (
            <div className="mt-3 space-y-2">
              {boardBeatReviewItems.slice(0, 2).map(item => (
                <div key={item.id} className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                  {item.candidate.kind === 'cluster_hint' ? (
                    <>
                      <span className="font-semibold text-slate-800">Theme: </span>
                      {item.candidate.label}
                      <span className="mt-1 block text-slate-500">
                        Shared question: {item.candidate.summary}
                      </span>
                    </>
                  ) : item.candidate.kind === 'idea_spawn' ? (
                    <>
                      <span className="font-semibold text-slate-800">New idea: </span>
                      {item.candidate.summary}
                      {item.candidate.affectedRefs?.length ? (
                        <span className="mt-1 block text-[10px] uppercase tracking-[0.16em] text-slate-500">
                          Linked to {item.candidate.affectedRefs.length} source
                          {item.candidate.affectedRefs.length === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-slate-800">Insight: </span>
                      {item.candidate.label}
                      <span className="mt-1 block text-slate-500">
                        {item.candidate.summary}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </article>
      )}
    </section>
  );
}

function countByStatus(
  items: BeatReviewItemRecord[],
  status: BeatReviewItemRecord['status'],
): number {
  return items.filter(item => item.status === status).length;
}

function beatLabel(beat: BeatName): string {
  switch (beat) {
    case 'scout':
      return 'Scout';
    case 'connect':
      return 'Connector';
    case 'critique':
      return 'Challenger';
    case 'cluster':
      return 'Cluster';
    case 'summarise':
      return 'Synthesiser';
  }
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
