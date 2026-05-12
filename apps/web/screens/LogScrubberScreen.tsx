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
  BoardRecord,
  ChangeSetRecord,
} from '../../../src/board/types';
import { forkBoardAtSeq as forkBoardAtSeqStorage } from '../../../src/storage/forkBoardAtSeq';
import { useRoute } from '../routing/useRoute';

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
 * Wiring: registered in `App.tsx` for `route.kind === 'log'` via a thin
 * `LogScreenHost` that pulls `boardId` + `changeSets` from `useBoardSync`.
 * Tests / Storybook can still mount the screen directly with the data
 * overrides below.
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
  /**
   * bo-157: injection seam for the fork-from-here mutation. Defaults to the
   * production `forkBoardAtSeq` storage helper. Tests / Storybook supply a
   * stub so the screen can be exercised without an IDB roundtrip.
   */
  forkImpl?: (boardId: string, seq: number) => Promise<BoardRecord>;
  /**
   * bo-157: optional callback fired once the fork completes successfully.
   * In production we navigate to the new board via `useRoute`; this hook
   * exists so consumers (tests, an embedding screen) can observe the
   * mutation without taking over routing.
   */
  onForkComplete?: (forkedBoard: BoardRecord) => void;
}

// Hand-drawn paper aesthetic. The whole screen sits on `paper-grid` (the
// canvas-like surface) so the peek render reads as a real board. Header,
// scrubber bar, and event panel are inlined paper cards layered on top.
const ROOT_CLASS =
  'bo-log-scrubber-screen paper-grid relative flex min-h-screen max-h-screen overflow-y-auto flex-col';
const ROOT_STYLE: React.CSSProperties = { color: 'var(--ink)' };

const HEADER_CLASS =
  'bo-log-scrubber-header flex flex-col gap-1 px-8 py-5';
const HEADER_STYLE: React.CSSProperties = {
  borderBottom: '1.5px dashed var(--ink)',
  background: 'transparent',
};
const TITLE_CLASS = 'bo-log-scrubber-title';
const TITLE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand)',
  fontSize: 38,
  fontWeight: 700,
  lineHeight: 1.05,
  color: 'var(--ink)',
  letterSpacing: 0.4,
};
const SUBTITLE_CLASS = 'bo-log-scrubber-subtitle';
const SUBTITLE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 16,
  color: 'var(--ink-soft)',
};

const BOARD_CHIP_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
  color: 'var(--ink)',
  background: 'var(--paper)',
  border: '1.5px solid var(--ink)',
  boxShadow: '2px 2px 0 var(--ink)',
  borderRadius: 999,
  padding: '4px 10px',
};

const PEEK_CONTAINER_CLASS = 'bo-log-scrubber-peek relative flex-1 overflow-hidden';
const PEEK_INNER_CLASS =
  'paper-grid relative mx-auto my-4 h-[calc(100%-2rem)] w-[calc(100%-3rem)] max-w-[1200px] overflow-auto px-6 py-6';
const PEEK_INNER_STYLE: React.CSSProperties = {
  border: '2px solid var(--ink)',
  borderRadius: 14,
  boxShadow: '3px 4px 0 var(--ink)',
};
const PEEK_EMPTY_CLASS =
  'bo-log-scrubber-empty flex h-full w-full items-center justify-center text-center';
const PEEK_EMPTY_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand)',
  fontSize: 22,
  color: 'var(--ink-soft)',
};

const SCRUBBER_BAR_CLASS =
  'bo-log-scrubber-bar flex flex-col gap-3 px-8 py-4';
const SCRUBBER_BAR_STYLE: React.CSSProperties = {
  borderTop: '1.5px dashed var(--ink)',
  borderBottom: '1.5px dashed var(--ink)',
  background: 'var(--paper)',
};
// The slider itself uses inline CSS (ink track + paper-filled knob with the
// design's stamped-shadow). See `<style>` block injected once below.
const SCRUBBER_RANGE_CLASS = 'bo-log-scrubber-range';

const TIMELINE_CLASS =
  'bo-log-scrubber-timeline flex max-h-[34vh] flex-col gap-3 overflow-y-auto px-8 py-4';
const TIMELINE_STYLE: React.CSSProperties = {
  background: 'var(--paper)',
  borderTop: '1.5px dashed var(--ink)',
  fontFamily: 'var(--f-hand-body)',
  color: 'var(--ink)',
};

const PEEK_BANNER_CLASS =
  'bo-log-scrubber-banner pointer-events-none absolute left-1/2 top-6 z-10 -translate-x-1/2';
const PEEK_BANNER_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand)',
  fontSize: 14,
  letterSpacing: 0.2,
  color: 'var(--ink)',
  background: 'var(--paper)',
  border: '1.5px solid var(--ink)',
  boxShadow: '2px 2px 0 var(--ink)',
  borderRadius: 999,
  padding: '4px 12px',
};

const FORK_ERROR_CLASS = 'bo-log-scrubber-fork-error';
const FORK_ERROR_STYLE: React.CSSProperties = {
  marginTop: 4,
  fontFamily: 'var(--f-hand-body)',
  fontSize: 13,
  color: 'var(--ink)',
  textDecoration: 'underline wavy',
};

const SCRUBBER_LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 13,
  color: 'var(--ink-soft)',
};
const SCRUBBER_LABEL_MONO_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.16em',
  color: 'var(--ink-faint)',
};

const FILTER_ROW_CLASS =
  'bo-log-scrubber-filter-row flex flex-wrap items-center gap-1.5 px-8 pt-3';
const FILTER_PILL_BASE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  padding: '3px 10px',
  border: '1px solid var(--ink)',
  borderRadius: 12,
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--ink)',
};
const FILTER_PILL_ACTIVE_STYLE: React.CSSProperties = {
  ...FILTER_PILL_BASE_STYLE,
  background: 'var(--ink)',
  color: 'var(--paper)',
};

const PLAY_BUTTON_STYLE: React.CSSProperties = {
  width: 32,
  height: 32,
  flexShrink: 0,
  borderRadius: '50%',
  border: '1.5px solid var(--ink)',
  background: 'var(--ink)',
  color: 'var(--paper)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  boxShadow: '2px 2px 0 var(--ink)',
  fontFamily: 'var(--f-mono)',
  fontSize: 12,
  lineHeight: 1,
  padding: 0,
};
const PLAY_BUTTON_DISABLED_STYLE: React.CSSProperties = {
  ...PLAY_BUTTON_STYLE,
  cursor: 'not-allowed',
  opacity: 0.5,
  boxShadow: 'none',
};

/** Step interval (ms) for the play loop. */
const PLAY_STEP_MS = 500;

type LogFilterKey = 'all' | 'ai' | 'edits' | 'connections' | 'contradictions';

interface FilterOption {
  key: LogFilterKey;
  label: string;
}

const FILTER_OPTIONS: readonly FilterOption[] = [
  { key: 'all', label: 'all' },
  { key: 'ai', label: 'AI only' },
  { key: 'edits', label: 'my edits' },
  { key: 'connections', label: 'connections' },
  { key: 'contradictions', label: 'contradictions' },
];

function eventMatchesFilter(event: LogEvent, filter: LogFilterKey): boolean {
  if (filter === 'all') return true;
  const authorKind = event.authorRef.kind;
  if (filter === 'ai') {
    // AI-authored or role-driven events. `cluster-proposed` + `ai-nudge` +
    // `role-run` are intrinsically AI; otherwise rely on authorRef.
    if (authorKind === 'ai') return true;
    if (event.kind === 'role-run') return true;
    if (event.kind === 'ai-nudge') return true;
    if (event.kind === 'cluster-proposed') return true;
    return false;
  }
  if (filter === 'edits') {
    if (authorKind === 'user') return true;
    if (event.kind === 'idea-created') return true;
    if (event.kind === 'idea-edited') return true;
    return false;
  }
  if (filter === 'connections') {
    return event.kind === 'connection-drawn';
  }
  if (filter === 'contradictions') {
    // Contradictions surface today as critique nudges; future "contradicts"
    // connection kinds slot in here without a code change once the payload
    // adds a `connectionKind` field.
    if (event.kind === 'ai-nudge' && event.payload.surface === 'critique') {
      return true;
    }
    return false;
  }
  return true;
}

// Slider style — applied once via a static <style> tag so the inputs pick up
// ink track + paper-filled knob with the design's signature drop-shadow.
const SCRUBBER_RANGE_CSS = `
.bo-log-scrubber-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 22px;
  background: transparent;
  cursor: pointer;
}
.bo-log-scrubber-range:disabled { cursor: not-allowed; opacity: 0.5; }
.bo-log-scrubber-range::-webkit-slider-runnable-track {
  height: 4px;
  background: var(--ink);
  border-radius: 2px;
}
.bo-log-scrubber-range::-moz-range-track {
  height: 4px;
  background: var(--ink);
  border-radius: 2px;
}
.bo-log-scrubber-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  margin-top: -8px;
  background: var(--paper);
  border: 2px solid var(--ink);
  border-radius: 50%;
  box-shadow: 2px 2px 0 var(--ink);
  cursor: grab;
}
.bo-log-scrubber-range::-moz-range-thumb {
  width: 20px;
  height: 20px;
  background: var(--paper);
  border: 2px solid var(--ink);
  border-radius: 50%;
  box-shadow: 2px 2px 0 var(--ink);
  cursor: grab;
}
.bo-log-scrubber-range:active::-webkit-slider-thumb { cursor: grabbing; transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--ink); }
.bo-log-scrubber-range:active::-moz-range-thumb { cursor: grabbing; box-shadow: 1px 1px 0 var(--ink); }
`;

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
  forkImpl,
  onForkComplete,
}: LogScrubberScreenProps): React.ReactElement {
  const domain = useMemo(() => computeSeqDomain(changeSets), [changeSets]);
  // bo-157: navigation hook for the fork action. We always invoke `useRoute`
  // (hooks must run unconditionally), but only call `navigate` from the fork
  // handler when no caller-supplied `onForkComplete` overrides it.
  const [, navigate] = useRoute();
  const [forkInFlight, setForkInFlight] = useState(false);
  const [forkError, setForkError] = useState<string | null>(null);

  const [cursorSeq, setCursorSeq] = useState<number | null>(() => {
    if (!domain.hasAny) return null;
    if (typeof initialSeq === 'number') return clampSeq(initialSeq, domain);
    return domain.max;
  });

  // Filter chip selection — drives which events the LogEventList renders.
  const [activeFilter, setActiveFilter] = useState<LogFilterKey>('all');

  // Play/pause state for the scrubber. The play loop is a `setInterval` that
  // advances the cursor by one seq every `PLAY_STEP_MS` and auto-pauses on
  // reaching the latest seq. Any user interaction (slider drag, jump, fork)
  // pauses playback to avoid surprising the user.
  const [playing, setPlaying] = useState<boolean>(false);

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
      // User dragging the slider pauses playback.
      setPlaying(false);
      setCursorSeq(next);
      onSeqChange?.(next);
    },
    [domain, onSeqChange],
  );

  const handleJumpLatest = useCallback(() => {
    if (!domain.hasAny) return;
    setPlaying(false);
    setCursorSeq(domain.max);
    onSeqChange?.(domain.max);
  }, [domain, onSeqChange]);

  const handleJumpEarliest = useCallback(() => {
    if (!domain.hasAny) return;
    setPlaying(false);
    setCursorSeq(domain.min);
    onSeqChange?.(domain.min);
  }, [domain, onSeqChange]);

  const handleJumpToSeq = useCallback(
    (seq: number) => {
      if (!domain.hasAny) return;
      const next = clampSeq(Math.round(seq), domain);
      setPlaying(false);
      setCursorSeq(next);
      onSeqChange?.(next);
    },
    [domain, onSeqChange],
  );

  const handleTogglePlay = useCallback(() => {
    if (!domain.hasAny) return;
    setPlaying(prev => {
      // If we're at the latest seq and the user hits play, restart from the
      // earliest seq so playback is meaningful.
      if (!prev && cursorSeq !== null && cursorSeq >= domain.max) {
        setCursorSeq(domain.min);
        onSeqChange?.(domain.min);
      }
      return !prev;
    });
  }, [cursorSeq, domain, onSeqChange]);

  // Play loop — setInterval advances the cursor every PLAY_STEP_MS until we
  // hit the latest seq, at which point we auto-pause. We use the functional
  // state setter so the interval body doesn't capture a stale cursorSeq.
  useEffect(() => {
    if (!playing) return undefined;
    if (!domain.hasAny) {
      setPlaying(false);
      return undefined;
    }
    const id = window.setInterval(() => {
      setCursorSeq(prev => {
        if (prev === null) return prev;
        if (prev >= domain.max) {
          setPlaying(false);
          return prev;
        }
        const next = prev + 1;
        onSeqChange?.(next);
        return next;
      });
    }, PLAY_STEP_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [playing, domain, onSeqChange]);

  // bo-157 — Fork-from-here. Visible only when the cursor sits below the
  // latest seq (i.e. the user is genuinely peeking history). Wires through
  // `forkBoardAtSeq` and then either invokes the supplied `onForkComplete`
  // hook or navigates to the new board via the route hook.
  const handleFork = useCallback(async () => {
    if (!domain.hasAny || cursorSeq === null) return;
    if (cursorSeq >= domain.max) return;
    if (forkInFlight) return;
    setPlaying(false);
    setForkInFlight(true);
    setForkError(null);
    try {
      const fn = forkImpl ?? forkBoardAtSeqStorage;
      const newBoard = await fn(boardId, cursorSeq);
      if (onForkComplete) {
        onForkComplete(newBoard);
      } else {
        navigate({ kind: 'board', boardId: newBoard.id, ideaId: null });
      }
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : String(cause ?? 'unknown error');
      setForkError(message);
    } finally {
      setForkInFlight(false);
    }
  }, [boardId, cursorSeq, domain, forkImpl, forkInFlight, navigate, onForkComplete]);

  const events = useMemo<readonly LogEvent[]>(
    () =>
      eventsOverride !== undefined
        ? eventsOverride
        : projectLogEvents(changeSets, beatRuns ?? []),
    [eventsOverride, changeSets, beatRuns],
  );

  // Newest-first when displayed (matches BoardHistoryPanel + Screen 06 spec).
  const orderedEvents = useMemo(() => [...events].reverse(), [events]);

  // Filter the displayed events down to the active chip selection. Filter is
  // applied AFTER ordering so the chip set is consistent with the timeline
  // shown above.
  const filteredEvents = useMemo(
    () => orderedEvents.filter(event => eventMatchesFilter(event, activeFilter)),
    [orderedEvents, activeFilter],
  );

  const peek = useMemo(
    () => computePeekState(changeSets, cursorSeq),
    [changeSets, cursorSeq],
  );

  const viewport = useMemo(() => computePeekViewport(peek.ideas), [peek.ideas]);

  const isLatest = domain.hasAny && cursorSeq === domain.max;
  const isEarliest = domain.hasAny && cursorSeq === domain.min;

  const cursorReadout =
    domain.hasAny && cursorSeq !== null
      ? `at seq #${cursorSeq} of ${domain.max}`
      : 'no history yet';

  return (
    <div
      className={ROOT_CLASS}
      style={ROOT_STYLE}
      aria-label="Project log scrubber"
    >
      <style>{SCRUBBER_RANGE_CSS}</style>
      <header className={HEADER_CLASS} style={HEADER_STYLE}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className={TITLE_CLASS} style={TITLE_STYLE}>
              Timeline
            </h1>
            <p className={SUBTITLE_CLASS} style={SUBTITLE_STYLE}>
              Drag the scrubber to peek at the board {cursorReadout} — read-only.
            </p>
          </div>
          <span style={BOARD_CHIP_STYLE}>Board · {boardId}</span>
        </div>
      </header>

      <section className={PEEK_CONTAINER_CLASS} aria-label="Peek render">
        {domain.hasAny && cursorSeq !== null && (
          <div className={PEEK_BANNER_CLASS} style={PEEK_BANNER_STYLE} role="status">
            Peek · seq #{cursorSeq}
            {!isLatest && ' · read-only'}
          </div>
        )}
        <div className={PEEK_INNER_CLASS} style={PEEK_INNER_STYLE}>
          {peek.ideas.length === 0 ? (
            <div className={PEEK_EMPTY_CLASS} style={PEEK_EMPTY_STYLE}>
              {domain.hasAny
                ? 'No ideas existed at this point in history.'
                : 'No history yet — nothing to peek at.'}
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

      <section
        className={SCRUBBER_BAR_CLASS}
        style={SCRUBBER_BAR_STYLE}
        aria-label="Timeline scrubber"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleJumpEarliest}
            disabled={!domain.hasAny || isEarliest}
            className="btn sm"
            title="Jump to earliest seq"
          >
            ⏮ earliest
          </button>
          <button
            type="button"
            onClick={handleTogglePlay}
            disabled={!domain.hasAny}
            className="bo-log-scrubber-play"
            style={!domain.hasAny ? PLAY_BUTTON_DISABLED_STYLE : PLAY_BUTTON_STYLE}
            aria-label={playing ? 'Pause scrubber playback' : 'Play scrubber playback'}
            aria-pressed={playing}
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? '▮▮' : '▶'}
          </button>
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex items-center justify-between">
              <span style={SCRUBBER_LABEL_STYLE}>
                {domain.hasAny && cursorSeq !== null
                  ? `peeking seq #${cursorSeq}`
                  : 'no seqs to scrub'}
              </span>
              <span style={SCRUBBER_LABEL_STYLE}>
                {domain.hasAny ? `${domain.max - domain.min + 1} steps` : ''}
              </span>
            </div>
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
          </div>
          <button
            type="button"
            onClick={handleJumpLatest}
            disabled={!domain.hasAny || isLatest}
            className="btn sm"
            title="Jump to latest seq"
          >
            latest ⏭
          </button>
          {/* bo-157 — Fork-from-here. Hidden when no history exists or the
              cursor is at the latest seq (no point forking the present). */}
          {domain.hasAny && cursorSeq !== null && !isLatest && (
            <button
              type="button"
              onClick={() => {
                void handleFork();
              }}
              disabled={forkInFlight}
              className="btn primary sm"
              aria-label={`Fork board at sequence ${cursorSeq}`}
              title="Fork the board into a new copy starting from this point"
            >
              {forkInFlight ? 'forking…' : 'fork from here'}
            </button>
          )}
        </div>
        {forkError !== null && (
          <p className={FORK_ERROR_CLASS} style={FORK_ERROR_STYLE} role="alert">
            Fork failed: {forkError}
          </p>
        )}
        <div className="flex items-center justify-between" style={SCRUBBER_LABEL_MONO_STYLE}>
          <span>seq #{domain.hasAny ? domain.min : '—'}</span>
          <span>
            {domain.hasAny && cursorSeq !== null
              ? `cursor #${cursorSeq} of ${domain.max}`
              : 'no history'}
          </span>
          <span>seq #{domain.hasAny ? domain.max : '—'}</span>
        </div>
      </section>

      <section
        className={TIMELINE_CLASS}
        style={TIMELINE_STYLE}
        aria-label="Log event timeline"
      >
        <div
          className={FILTER_ROW_CLASS}
          role="group"
          aria-label="Filter log events"
        >
          {FILTER_OPTIONS.map(option => {
            const isActive = option.key === activeFilter;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setActiveFilter(option.key)}
                aria-pressed={isActive}
                style={isActive ? FILTER_PILL_ACTIVE_STYLE : FILTER_PILL_BASE_STYLE}
                className="bo-log-scrubber-filter-pill"
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <LogEventList
          events={filteredEvents}
          currentSeq={cursorSeq ?? undefined}
          emptyMessage={
            activeFilter === 'all'
              ? 'No history yet — the first edit or AI action will land here.'
              : `No ${activeFilter === 'ai' ? 'AI' : activeFilter} events match this filter.`
          }
          onJumpToSeq={handleJumpToSeq}
        />
      </section>
    </div>
  );
}

export default LogScrubberScreen;
