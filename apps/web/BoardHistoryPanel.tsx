import React, { useId, useMemo } from 'react';
import { projectLogEvents } from '../../src/board/projection/logEvents';
import type { BeatRunRecord, ChangeSetRecord } from '../../src/board/types';
import { LogEventList } from './LogEventList';
import { useOverlaySurface } from './useOverlaySurface';

interface BoardHistoryPanelProps {
  /**
   * Append-only change-set feed. Projected to LogEvents internally via
   * `projectLogEvents`.
   */
  changeSets: readonly ChangeSetRecord[];
  /**
   * Append-only beat-run feed. Empty until beatRuns are wired through
   * `useBoardSync` (Screen 06 v0 = feed only).
   */
  beatRuns?: readonly BeatRunRecord[];
  cursor: number;
  totalChanges: number;
  canUndo: boolean;
  canRedo: boolean;
  onClose: () => void;
}

/**
 * bo-132 — v0 of LogEventList host. The panel keeps its existing shell
 * (open / close / scroll) and now derives its rows from the canonical
 * `projectLogEvents()` projection rather than the bespoke
 * `createBoardHistoryEntries()` adapter.
 */
export function BoardHistoryPanel({
  changeSets,
  beatRuns,
  cursor,
  totalChanges,
  canUndo,
  canRedo,
  onClose,
}: BoardHistoryPanelProps): React.ReactElement {
  const headingId = useId();
  const summaryId = useId();
  const { closeButtonRef, surfaceRef } = useOverlaySurface<HTMLElement>(onClose);

  const events = useMemo(
    () => projectLogEvents(changeSets, beatRuns ?? []),
    [changeSets, beatRuns],
  );

  // The log feed reads newest-first to match Screen 06 spec ("vertical
  // timeline, newest first"). projectLogEvents emits ascending order, so we
  // reverse on display.
  const orderedEvents = useMemo(() => [...events].reverse(), [events]);

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
              Every patch set stays readable here, including actor, role context, and affected board entities.
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
        <LogEventList events={orderedEvents} currentSeq={cursor} />
      </div>
    </section>
  );
}
