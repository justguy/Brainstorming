import React from 'react';
import type { Idea, IdeaState, StickyColor } from '../../../src/types';

/**
 * Sticky — canonical Idea sticky primitive (Build Spec §02). Replaces the
 * piecemeal sticky look that lives in `src/canvas/reactflow/IdeaNoteNode.tsx`
 * and `apps/web/IdeaFocusSlot.tsx`.
 *
 * Three modes:
 *  - `card` — full sticky look (paper background, colored border, shadow,
 *    title + body). Used inside the canvas at default zoom.
 *  - `chip` — single-line compact chip. Used inside log rows, thread headers,
 *    or anywhere a sticky needs to be referenced inline.
 *  - `thumbnail` — tiny square preview suited to grid layouts and cluster
 *    halos. Title only, truncated to one line.
 *
 * The primitive accepts either a full `Idea` record or the minimal
 * `StickyFields` subset so callers (cluster halos, log projections, brief
 * margin notes) can render the sticky without round-tripping through IDB.
 *
 * Style mirrors the other M1 primitives: rounded surface, slate text on a
 * soft tinted background, focus-visible ring, hover lift on interactive
 * variants. Migration of `IdeaNoteNode` call sites to use this primitive
 * is tracked separately.
 */

export interface StickyFields {
  id: string;
  /** Single-line title shown across all modes. */
  title: string;
  /** Optional body text. Used by `card` mode only. */
  body?: string;
  /** Sticky color. Defaults to `yellow` when omitted. */
  color?: StickyColor;
  /** Lifecycle facet. Defaults to `live` when omitted. */
  state?: IdeaState;
}

export type StickyMode = 'card' | 'chip' | 'thumbnail';

export interface StickyProps {
  /**
   * Full `Idea` record or the minimal `{id, title, body?, color?, state?}`
   * subset. When an `Idea` is supplied, `title` and `body` are derived from
   * `rawText` (first line / remaining lines).
   */
  idea: Idea | StickyFields;
  /** Visual mode. Defaults to `card`. */
  mode?: StickyMode;
  /** Primary click handler. Receives the idea id for routing convenience. */
  onClick?: (ideaId: string) => void;
  /**
   * Optional secondary "select" handler — separate from `onClick` so callers
   * can route between "open" and "select" affordances (e.g. cluster grid
   * thumbnails that should scroll-into-view rather than open).
   */
  onSelect?: (ideaId: string) => void;
  /** Marks the sticky as the currently selected idea. */
  selected?: boolean;
  /** Additional class names appended to the root container. */
  className?: string;
  /** Aria-label override; auto-derived when omitted. */
  ariaLabel?: string;
  /** Optional tooltip applied to the host element. */
  title?: string;
}

/**
 * Visual palette for each {@link StickyColor} value.
 *
 * Mirrors the design intent baked into `IdeaNoteNode.tsx` (the "sketch"
 * palette, since the canonical sticky look in screens-v2 follows the
 * paper-and-pen Build Spec rather than the older translucent whiteboard
 * variant). When `src/styles.css` later exposes the canonical
 * `--y --p --b --pe --g --l` tokens, this map can be replaced with
 * `var(--sticky-<color>-bg)` references without touching consumers.
 */
interface StickyPalette {
  /** Card background fill. */
  background: string;
  /** Border color used in `card` mode. */
  border: string;
  /** Title ink. */
  ink: string;
  /** Body ink (slightly muted relative to ink). */
  body: string;
  /** Chip / thumbnail surface fill (lighter tint). */
  chipBackground: string;
  /** Chip / thumbnail border. */
  chipBorder: string;
}

const STICKY_PALETTES: Record<StickyColor, StickyPalette> = {
  yellow: {
    background: '#f7e58a',
    border: '#e5cf5c',
    ink: '#1a1814',
    body: '#4a4740',
    chipBackground: '#fff7d1',
    chipBorder: '#e5cf5c',
  },
  pink: {
    background: '#f4b9c6',
    border: '#df8fa4',
    ink: '#1a1814',
    body: '#4a4740',
    chipBackground: '#fde6ec',
    chipBorder: '#df8fa4',
  },
  blue: {
    background: '#b8dbe8',
    border: '#8abfd0',
    ink: '#1a1814',
    body: '#4a4740',
    chipBackground: '#e6f1f7',
    chipBorder: '#8abfd0',
  },
  green: {
    background: '#c5e0a8',
    border: '#9cc279',
    ink: '#1a1814',
    body: '#4a4740',
    chipBackground: '#ecf6dd',
    chipBorder: '#9cc279',
  },
  purple: {
    background: '#d7c8e8',
    border: '#b19fcd',
    ink: '#1a1814',
    body: '#4a4740',
    chipBackground: '#efe8f7',
    chipBorder: '#b19fcd',
  },
  orange: {
    background: '#f5ccac',
    border: '#e0a77d',
    ink: '#1a1814',
    body: '#4a4740',
    chipBackground: '#fde9d6',
    chipBorder: '#e0a77d',
  },
  gray: {
    background: '#dfe3e8',
    border: '#b1b8c0',
    ink: '#1a1814',
    body: '#4a4740',
    chipBackground: '#eef1f4',
    chipBorder: '#b1b8c0',
  },
};

const DEFAULT_COLOR: StickyColor = 'yellow';
const DEFAULT_STATE: IdeaState = 'live';

const CARD_SHADOW =
  '2px 3px 0 rgba(26, 24, 20, 0.25), 4px 6px 14px rgba(26, 24, 20, 0.15)';
const CARD_SHADOW_SELECTED =
  '3px 4px 0 rgba(26, 24, 20, 0.32), 5px 8px 18px rgba(26, 24, 20, 0.18)';

const ROOT_BASE_CLASS =
  'transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300';

const ROOT_INTERACTIVE_CLASS =
  'cursor-pointer hover:-translate-y-[1px] hover:shadow-md';

const STATE_OPACITY: Record<IdeaState, number> = {
  draft: 0.85,
  live: 1,
  settled: 0.95,
  muted: 0.55,
};

const STATE_FILTER: Record<IdeaState, string | undefined> = {
  draft: undefined,
  live: undefined,
  // Slight desaturation so settled threads recede without losing legibility.
  settled: 'saturate(0.85)',
  muted: 'saturate(0.55)',
};

const STATE_LABEL: Record<IdeaState, string> = {
  draft: 'Draft',
  live: 'Live',
  settled: 'Settled',
  muted: 'Muted',
};

function isFullIdea(value: Idea | StickyFields): value is Idea {
  return typeof (value as Idea).rawText === 'string';
}

function splitRawText(rawText: string): { title: string; body: string } {
  const lines = rawText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { title: 'Idea', body: '' };
  }
  return { title: lines[0], body: lines.slice(1).join(' ') };
}

function readStickyContent(idea: Idea | StickyFields): {
  id: string;
  title: string;
  body: string;
  color: StickyColor;
  state: IdeaState;
} {
  if (isFullIdea(idea)) {
    const { title, body } = splitRawText(idea.rawText);
    return {
      id: idea.id,
      title,
      body,
      color: idea.color ?? DEFAULT_COLOR,
      state: idea.state ?? DEFAULT_STATE,
    };
  }
  return {
    id: idea.id,
    title: idea.title,
    body: idea.body ?? '',
    color: idea.color ?? DEFAULT_COLOR,
    state: idea.state ?? DEFAULT_STATE,
  };
}

function buildAriaLabel(
  mode: StickyMode,
  title: string,
  state: IdeaState,
  selected: boolean,
): string {
  const stateSuffix = state === 'live' ? '' : `, ${STATE_LABEL[state].toLowerCase()}`;
  const selectedSuffix = selected ? ', selected' : '';
  if (mode === 'chip') return `Idea chip: ${title}${stateSuffix}${selectedSuffix}`;
  if (mode === 'thumbnail') return `Idea thumbnail: ${title}${stateSuffix}${selectedSuffix}`;
  return `Idea: ${title}${stateSuffix}${selectedSuffix}`;
}

export function Sticky({
  idea,
  mode = 'card',
  onClick,
  onSelect,
  selected = false,
  className,
  ariaLabel,
  title,
}: StickyProps): React.ReactElement {
  const { id, title: stickyTitle, body, color, state } = readStickyContent(idea);
  const palette = STICKY_PALETTES[color] ?? STICKY_PALETTES[DEFAULT_COLOR];

  // `onClick` wins for activation; `onSelect` is exposed for callers that
  // wire a separate "select / scroll-into-view" affordance — the latter
  // mirrors `BoardThumbnail` and `PersonaChip`'s split between primary
  // activation and meta actions.
  const activateHandler = onClick ?? onSelect;
  const handleClick = activateHandler
    ? () => activateHandler(id)
    : undefined;

  const Root = handleClick ? 'button' : 'div';
  const rootProps = handleClick
    ? ({ type: 'button' as const, onClick: handleClick })
    : {};

  const computedAriaLabel =
    ariaLabel ?? buildAriaLabel(mode, stickyTitle, state, selected);

  if (mode === 'thumbnail') {
    const thumbClassName = [
      ROOT_BASE_CLASS,
      'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md border text-[10px] font-semibold leading-tight',
      handleClick ? ROOT_INTERACTIVE_CLASS : '',
      selected ? 'ring-2 ring-emerald-300' : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <Root
        {...rootProps}
        className={thumbClassName}
        aria-label={computedAriaLabel}
        aria-pressed={handleClick ? selected : undefined}
        title={title ?? stickyTitle}
        data-sticky-mode="thumbnail"
        data-sticky-state={state}
        data-sticky-color={color}
        style={{
          backgroundColor: palette.background,
          borderColor: palette.border,
          color: palette.ink,
          opacity: STATE_OPACITY[state],
          filter: STATE_FILTER[state],
        }}
      >
        <span className="line-clamp-2 px-1 text-center" aria-hidden="true">
          {stickyTitle}
        </span>
      </Root>
    );
  }

  if (mode === 'chip') {
    const chipClassName = [
      ROOT_BASE_CLASS,
      'inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-xs leading-5',
      handleClick ? ROOT_INTERACTIVE_CLASS : '',
      selected ? 'ring-2 ring-emerald-300' : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <Root
        {...rootProps}
        className={chipClassName}
        aria-label={computedAriaLabel}
        aria-pressed={handleClick ? selected : undefined}
        title={title ?? stickyTitle}
        data-sticky-mode="chip"
        data-sticky-state={state}
        data-sticky-color={color}
        style={{
          backgroundColor: palette.chipBackground,
          borderColor: palette.chipBorder,
          color: palette.ink,
          opacity: STATE_OPACITY[state],
          filter: STATE_FILTER[state],
        }}
      >
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: palette.border }}
        />
        <span className="min-w-0 truncate font-semibold">{stickyTitle}</span>
      </Root>
    );
  }

  // mode === 'card'
  const cardClassName = [
    ROOT_BASE_CLASS,
    'relative flex w-full max-w-[260px] flex-col items-stretch gap-1.5 rounded-lg border-2 px-3 py-2.5 text-left text-xs leading-5',
    handleClick ? ROOT_INTERACTIVE_CLASS : '',
    selected ? 'ring-2 ring-emerald-300' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Root
      {...rootProps}
      className={cardClassName}
      aria-label={computedAriaLabel}
      aria-pressed={handleClick ? selected : undefined}
      title={title}
      data-sticky-mode="card"
      data-sticky-state={state}
      data-sticky-color={color}
      style={{
        backgroundColor: palette.background,
        borderColor: palette.border,
        color: palette.ink,
        opacity: STATE_OPACITY[state],
        filter: STATE_FILTER[state],
        boxShadow: selected ? CARD_SHADOW_SELECTED : CARD_SHADOW,
      }}
    >
      <span
        className="line-clamp-2 text-sm font-semibold"
        style={{ color: palette.ink }}
      >
        {stickyTitle}
      </span>
      {body && (
        <span
          className="line-clamp-4 text-[11px] font-normal"
          style={{ color: palette.body }}
        >
          {body}
        </span>
      )}
      {state !== 'live' && (
        <span
          aria-hidden="true"
          className="mt-1 inline-flex w-fit items-center rounded-full border px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-[0.18em]"
          style={{
            borderColor: palette.chipBorder,
            backgroundColor: palette.chipBackground,
            color: palette.body,
          }}
        >
          {STATE_LABEL[state]}
        </span>
      )}
    </Root>
  );
}
