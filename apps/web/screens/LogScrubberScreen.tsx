import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { LogEventList } from '../LogEventList';
import { Sticky } from '../primitives/Sticky';
import {
  projectLogEvents,
  type LogEvent,
} from '../../../src/board/projection/logEvents';
import { computePeekState } from '../../../src/board/projection/peekState';
import type {
  BeatRunRecord,
  ChangeSetRecord,
} from '../../../src/board/types';

/**
 * Screen 06 · Log scrubber + peek render (bo-156).
 *
 * Spec: Design/IMPLEMENTATION_PLAN.md §5 (Screen 06) + §6 M4 — "scrubber +
 * fork-from-here". This task lands the scrubber and the read-only peek; the
 * fork mutation is tracked separately.
 *
 * v0 scope:
 *   - LogEventList renders the projected timeline along the bottom.
 *   - A range slider lets the user pick a `seq`. The slider's domain is the
 *     set of `changeSet`-sourced events (beatRuns are visible in the list but
 *     are not seq-indexed; they sit at the periphery of the timeline).
 *   - The peek panel reconstructs the canvas state at the chosen seq via
 *     `computePeekState` (a pure reducer that replays `forward` patches up to
 *     the target seq) and renders each idea as a `<Sticky thumbnail>` in
 *     panel-coordinate space.
 *   - Mutations are disabled across the surface — the screen accepts no
 *     handlers that could write to the board. The Sticky elements are
 *     rendered without click handlers so they're inert.
 *
 * Wiring: this component is a *self-contained named + default export* and is
 * intentionally not registered in `App.tsx`. Route dispatch (`route.kind ===
 * 'log'`) is bo-130's responsibility per the IMPLEMENTATION_PLAN. Tests /
 * Storybook can mount the screen directly with the data overrides below.
 */

export interface LogScrubberScreenProps {
  /** Board id this scrubber operates on. Used purely for display + aria. */
  boardId: string;
  /** Append-only changeSet feed for the board. Must include at least the seqs the user can scrub through. */
  changeSets: readonly ChangeSetRecord[];
  /** Append-only beatRun feed. May be empty. */
  beatRuns?: readonly BeatRunRecord[];
  /**
   * Optional initial seq cursor. Defaults to the latest seq present in
   * `changeSets`. When the changeSet feed is empty, the scrubber is disabled
   * and the peek render shows an empty board.
   */
  initialSeq?: number;
  /**
   * Optional callback fired when the user changes the cursor. Useful for
   * test instrumentation / future fork-from-here flow. Never receives a
   * value the consumer didn't already supply (no implicit clamping by the
   * caller required).
   */
  onSeqChange?: (seq: number | null) => void;
  /**
   * Optional escape hatch for tests — if supplied the screen will not
   * recompute the events array on each render. The events must already be
   * sorted in ascending order (matches `projectLogEvents` output).
   */
  eventsOverride?: readonly LogEvent[];
}

const ROOT_CLASS =
  'bo-log-scrubber-screen relative flex min-h-screen flex-col bg-slate-50 text-slate-900';
const HEADER_CLASS =
  'flex flex-col gap-1 border-b border-slate-200 bg-white/70 px-8 py-5';
const TITLE_CLASS = 'text-2xl font-semibold tracking-tight';
const SUBTITLE_CLASS = 'text-sm text-slate-500';

const PEEK_CONTAINER_CLASS =
  'relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.18),rgba(248,250,252,0)_70%)]';
const PEEK_INNER_CLASS =
  'relative mx-auto h-full w-full max-w-[1200px] overflow-auto px-6 py-6';
const PEEK_EMPTY_CLASS =
  'flex h-full w-full items-center justify-center text-sm text-slate-500';

const SCRUBBER_BAR_CLASS =
  'flex flex-col gap-3 border-y border-slate-200 bg-white px-8 py-4';
const SCRUBBER_RANGE_CLASS =
  'h-2 w-full appearance-none rounded-full bg-slate-200 accent-violet-600 disabled:cursor-not-allowed disabled:opacity-50';

const TIMELINE_CLASS =
  'flex max-h-[34vh] flex-col gap-3 overflow-y-auto border-t border-slate-200 bg-white px-8 py-4';

const PEEK_BANNER_CLASS =
  'pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-violet-200 bg-violet-50/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700 shadow-sm';

interface SeqDomain {
  min: number;
  max: number;
  hasAny: boolean;
}

function computeSeqDomain(changeSets: readonly ChangeSetRecord[]): SeqDomain {
  if (changeSets.length === 0) return { min: 0, max: 0, hasAny: false };
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const record of changeSets) {
    if (record.seq < min) min = record.seq;
    if (record.seq > max) max = record.seq;
  }
  return { min, max, hasAny: true };
}

function clampSeq(seq: number, domain: SeqDomain): number {
  if (!domain.hasAny) return 0;
  if (seq < domain.min) return domain.min;
  if (seq > domain.max) return domain.max;
  return seq;
}

interface PeekViewportSize {
  /** Width of the bounding box around all peeked ideas. */
  width: number;
  /** Height of the bounding box around all peeked ideas. */
  height: number;
  /** X offset to apply so the leftmost idea sits at x=0. */
  offsetX: number;
  /** Y offset to apply so the topmost idea sits at y=0. */
  offsetY: number;
}

function computePeekViewport(ideas: ReturnType<typeof computePeekState>['ideas']): PeekViewportSize {
  if (ideas.length === 0) {
    return { width: 0, height: 0, offsetX: 0, offsetY: 0 };
  }
  const PADDING = 24;
  const DEFAULT_TILE = 96;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const idea of ideas) {
    const panel = idea.panel;
    const x = panel?.x ?? 0;
    const y = panel?.y ?? 0;
    const w = panel?.width ?? DEFAULT_TILE;
    const h = panel?.height ?? DEFAULT_TILE;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }
  return {
    width: Math.max(maxX - minX + PADDING * 2, 320),
    height: Math.max(maxY - minY + PADDING * 2, 240),
    offsetX: PADDING - minX,
    offsetY: PADDING - minY,
  };
}

export function LogScrubberScreen({
  boardId,
  changeSets,
  beatRuns,
  initialSeq,
  onSeqChange,
  eventsOverride,
}: LogScrubberScreenProps): React.ReactElement {
  const domain = useMemo(() => computeSeqDomain(changeSets), [changeSets]);

  const [cursorSeq, setCursorSeq] = useState<number | null>(() => {
    if (!domain.hasAny) return null;
    if (typeof initialSeq === 'number') return clampSeq(initialSeq, domain);
    return domain.max;
  });

  // If the underlying changeSet feed grows / shrinks under us, keep the
  // cursor in-bounds. We deliberately do not chase the new max — that would
  // pull the user off whatever historical seq they were inspecting.
  useEffect(() => {
    if (!domain.hasAny) {
      if (cursorSeq !== null) {
        setCursorSeq(null);
        onSeqChange?.(null);
      }
      return;
    }
    if (cursorSeq === null) {
      const next = domain.max;
      setCursorSeq(next);
      onSeqChange?.(next);
      return;
    }
    if (cursorSeq < domain.min || cursorSeq > domain.max) {
      const next = clampSeq(cursorSeq, domain);
      setCursorSeq(next);
      onSeqChange?.(next);
    }
  }, [domain, cursorSeq, onSeqChange]);

  const handleSliderChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!domain.hasAny) return;
      const raw = Number(event.target.value);
      if (!Number.isFinite(raw)) return;
      const next = clampSeq(Math.round(raw), domain);
      setCursorSeq(next);
      onSeqChange?.(next);
    },
    [domain, onSeqChange],
  );

  const handleJumpLatest = useCallback(() => {
    if (!domain.hasAny) return;
    setCursorSeq(domain.max);
    onSeqChange?.(domain.max);
  }, [domain, onSeqChange]);

  const handleJumpEarliest = useCallback(() => {
    if (!domain.hasAny) return;
    setCursorSeq(domain.min);
    onSeqChange?.(domain.min);
  }, [domain, onSeqChange]);

  const events = useMemo<readonly LogEvent[]>(
    () =>
      eventsOverride !== undefined
        ? eventsOverride
        : projectLogEvents(changeSets, beatRuns ?? []),
    [eventsOverride, changeSets, beatRuns],
  );

  // Newest-first when displayed (matches BoardHistoryPanel + Screen 06 spec).
  const orderedEvents = useMemo(() => [...events].reverse(), [events]);

  const peek = useMemo(
    () => computePeekState(changeSets, cursorSeq),
    [changeSets, cursorSeq],
  );

  const viewport = useMemo(() => computePeekViewport(peek.ideas), [peek.ideas]);

  const isLatest = domain.hasAny && cursorSeq === domain.max;
  const isEarliest = domain.hasAny && cursorSeq === domain.min;

  return (
    <div className={ROOT_CLASS} aria-label="Project log scrubber">
      <header className={HEADER_CLASS}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className={TITLE_CLASS}>Project log</h1>
            <p className={SUBTITLE_CLASS}>
              Drag the scrubber to peek at the board as it was at any point in its history. Read-only.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Board {boardId}
          </span>
        </div>
      </header>

      <section className={PEEK_CONTAINER_CLASS} aria-label="Peek render">
        {domain.hasAny && cursorSeq !== null && (
          <div className={PEEK_BANNER_CLASS} role="status">
            Peek · seq #{cursorSeq}
            {!isLatest && ' · read-only'}
          </div>
        )}
        <div className={PEEK_INNER_CLASS}>
          {peek.ideas.length === 0 ? (
            <div className={PEEK_EMPTY_CLASS}>
              {domain.hasAny
                ? 'No ideas existed at this point in history.'
                : 'No durable change sets yet — nothing to peek at.'}
            </div>
          ) : (
            <div
              className="relative"
              style={{
                width: `${viewport.width}px`,
                height: `${viewport.height}px`,
              }}
              aria-hidden={false}
            >
              {peek.ideas.map((idea) => {
                const panel = idea.panel;
                const left = (panel?.x ?? 0) + viewport.offsetX;
                const top = (panel?.y ?? 0) + viewport.offsetY;
                return (
                  <div
                    key={idea.id}
                    className="absolute"
                    style={{ left: `${left}px`, top: `${top}px` }}
                  >
                    {/* No onClick — the peek is intentionally inert. */}
                    <Sticky idea={idea} mode="thumbnail" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className={SCRUBBER_BAR_CLASS} aria-label="Timeline scrubber">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleJumpEarliest}
            disabled={!domain.hasAny || isEarliest}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ⏮ Earliest
          </button>
          <input
            type="range"
            min={domain.hasAny ? domain.min : 0}
            max={domain.hasAny ? domain.max : 0}
            step={1}
            value={cursorSeq ?? 0}
            disabled={!domain.hasAny}
            onChange={handleSliderChange}
            aria-label="Log scrubber position"
            aria-valuemin={domain.hasAny ? domain.min : 0}
            aria-valuemax={domain.hasAny ? domain.max : 0}
            aria-valuenow={cursorSeq ?? 0}
            aria-valuetext={
              domain.hasAny && cursorSeq !== null
                ? `Sequence ${cursorSeq} of ${domain.max}`
                : 'No history yet'
            }
            className={SCRUBBER_RANGE_CLASS}
          />
          <button
            type="button"
            onClick={handleJumpLatest}
            disabled={!domain.hasAny || isLatest}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Latest ⏭
          </button>
        </div>
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-slate-500">
          <span>seq #{domain.hasAny ? domain.min : '—'}</span>
          <span>
            {domain.hasAny && cursorSeq !== null
              ? `Cursor #${cursorSeq} of ${domain.max}`
              : 'No history'}
          </span>
          <span>seq #{domain.hasAny ? domain.max : '—'}</span>
        </div>
      </section>

      <section className={TIMELINE_CLASS} aria-label="Log event timeline">
        <LogEventList
          events={orderedEvents}
          currentSeq={cursorSeq ?? undefined}
          emptyMessage="No durable change sets yet — the first edit or AI action will appear here."
        />
      </section>
    </div>
  );
}

export default LogScrubberScreen;
