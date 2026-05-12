import React from 'react';
import type { Idea, IdeaState, StickyColor } from '../../../src/types';

/**
 * Sticky — canonical Idea sticky primitive (Build Spec §02). Replaces the
 * piecemeal sticky look that lives in `src/canvas/reactflow/IdeaNoteNode.tsx`
 * and `apps/web/IdeaFocusSlot.tsx`.
 *
 * Three modes:
 *  - `card` — full sticky look (paper background, colored sticky fill, torn
 *    edge, hand-drawn title + body). Used inside the canvas at default zoom.
 *  - `chip` — single-line compact chip with a sticky-color swatch. Used
 *    inside log rows, thread headers, or anywhere a sticky needs to be
 *    referenced inline.
 *  - `thumbnail` — tiny square preview suited to grid layouts and cluster
 *    halos. Title only, truncated.
 *
 * Style follows the hand-drawn paper design system from
 * `Design/src/cards.jsx` / `Design/brainstorm.css` — Caveat title, Kalam
 * body, deterministic per-id rotation, sticky-color fills via the
 * `--sticky-*` CSS tokens.
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
 * Maps `StickyColor` to a sticky design palette name (one of the six tokens
 * defined in `brainstorm.css`: yellow / pink / blue / green / peach / lilac).
 *
 * `StickyColor` carries some legacy values (`purple`, `orange`, `gray`) that
 * predate the design system. Rather than break the prop surface for other
 * agents, we fold them into the closest design palette entry. This keeps
 * the type stable and the visuals on-brand.
 */
type StickyPaletteName = 'yellow' | 'pink' | 'blue' | 'green' | 'peach' | 'lilac';

const COLOR_TO_PALETTE: Record<StickyColor, StickyPaletteName> = {
  yellow: 'yellow',
  pink: 'pink',
  blue: 'blue',
  green: 'green',
  // Legacy values fold into the closest paper palette entry.
  purple: 'lilac',
  orange: 'peach',
  gray: 'lilac',
};

interface StickyPalette {
  /** Fill var, e.g. `var(--sticky-yellow)`. */
  fill: string;
  /** Edge var used for borders / chip swatches. */
  edge: string;
}

const STICKY_PALETTES: Record<StickyPaletteName, StickyPalette> = {
  yellow: { fill: 'var(--sticky-yellow)', edge: 'var(--sticky-yellow-edge)' },
  pink: { fill: 'var(--sticky-pink)', edge: 'var(--sticky-pink-edge)' },
  blue: { fill: 'var(--sticky-blue)', edge: 'var(--sticky-blue-edge)' },
  green: { fill: 'var(--sticky-green)', edge: 'var(--sticky-green-edge)' },
  peach: { fill: 'var(--sticky-peach)', edge: 'var(--sticky-peach-edge)' },
  lilac: { fill: 'var(--sticky-lilac)', edge: 'var(--sticky-lilac-edge)' },
};

const DEFAULT_COLOR: StickyColor = 'yellow';
const DEFAULT_STATE: IdeaState = 'live';

const STATE_OPACITY: Record<IdeaState, number> = {
  draft: 0.85,
  live: 1,
  settled: 0.95,
  muted: 0.55,
};

const STATE_FILTER: Record<IdeaState, string | undefined> = {
  draft: undefined,
  live: undefined,
  settled: 'saturate(0.85)',
  muted: 'saturate(0.55)',
};

const STATE_LABEL: Record<IdeaState, string> = {
  draft: 'Draft',
  live: 'Live',
  settled: 'Settled',
  muted: 'Muted',
};

/**
 * Deterministic per-id rotation, ±1.8° — mirrors `stickyRotation` in
 * `Design/src/cards.jsx`. Keeps each sticky on its own slight tilt.
 */
function stickyRotation(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h % 7) - 3) * 0.6;
}

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
  const paletteName = COLOR_TO_PALETTE[color] ?? COLOR_TO_PALETTE[DEFAULT_COLOR];
  const palette = STICKY_PALETTES[paletteName];

  // `onClick` wins for activation; `onSelect` is exposed for callers that
  // wire a separate "select / scroll-into-view" affordance — the latter
  // mirrors `BoardThumbnail` and `PersonaChip`'s split between primary
  // activation and meta actions.
  const activateHandler = onClick ?? onSelect;
  const handleClick = activateHandler ? () => activateHandler(id) : undefined;

  const Root = handleClick ? 'button' : 'div';
  const rootProps = handleClick ? ({ type: 'button' as const, onClick: handleClick }) : {};

  const computedAriaLabel = ariaLabel ?? buildAriaLabel(mode, stickyTitle, state, selected);

  // Inline button reset so `<button class="sticky">` reads exactly like the
  // `<div class="sticky">` from the design.
  const buttonReset: React.CSSProperties = handleClick
    ? { font: 'inherit', textAlign: 'left', appearance: 'none', WebkitAppearance: 'none' }
    : {};

  if (mode === 'thumbnail') {
    const thumbClassName = ['sticky-thumb', `c-${paletteName}`, selected ? 'is-selected' : '', state === 'muted' ? 'is-muted' : '', className ?? '']
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
          ...buttonReset,
          display: 'inline-flex',
          width: 48,
          height: 48,
          alignItems: 'center',
          justifyContent: 'center',
          background: palette.fill,
          border: `1.5px solid var(--ink)`,
          borderRadius: 6,
          boxShadow: selected ? '2px 2px 0 var(--ink)' : '1.5px 1.5px 0 var(--ink)',
          color: 'var(--ink)',
          fontFamily: 'var(--f-hand)',
          fontWeight: 700,
          fontSize: 11,
          lineHeight: 1.05,
          padding: 4,
          textAlign: 'center',
          opacity: STATE_OPACITY[state],
          filter: STATE_FILTER[state],
          cursor: handleClick ? 'pointer' : 'default',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {stickyTitle}
        </span>
      </Root>
    );
  }

  if (mode === 'chip') {
    const chipClassName = ['sticky-chip', `c-${paletteName}`, selected ? 'is-selected' : '', className ?? '']
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
          ...buttonReset,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          maxWidth: '100%',
          padding: '3px 10px',
          background: palette.fill,
          border: `1.5px solid var(--ink)`,
          borderRadius: 999,
          boxShadow: selected ? '2px 2px 0 var(--ink)' : '1px 1px 0 var(--ink)',
          color: 'var(--ink)',
          fontFamily: 'var(--f-hand-body)',
          fontSize: 13,
          lineHeight: 1.2,
          opacity: STATE_OPACITY[state],
          filter: STATE_FILTER[state],
          cursor: handleClick ? 'pointer' : 'default',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            flexShrink: 0,
            borderRadius: '50%',
            background: palette.edge,
            border: '1px solid var(--ink)',
          }}
        />
        <span
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 600,
          }}
        >
          {stickyTitle}
        </span>
      </Root>
    );
  }

  // mode === 'card'
  const rotation = stickyRotation(id);
  const cardClassName = [
    'sticky',
    'torn',
    `c-${paletteName}`,
    selected ? 'selected' : '',
    state === 'muted' ? 'killed' : '',
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
        ...buttonReset,
        // The base `.sticky` class is position:absolute in the design. The
        // primitive's contract is layout-agnostic, so we neutralise that
        // here and let the parent layout decide.
        position: 'relative',
        transform: `rotate(${rotation}deg)`,
        // Custom prop consumed by `.pop-in` keyframes in `brainstorm.css`.
        ['--r' as string]: `${rotation}deg`,
        width: '100%',
        maxWidth: 260,
        display: 'block',
        padding: '14px 16px 16px',
        cursor: handleClick ? 'pointer' : 'default',
        opacity: STATE_OPACITY[state],
        filter: STATE_FILTER[state],
      }}
    >
      <div className="sticky-title">{stickyTitle}</div>
      {body && <div className="sticky-body">{body}</div>}
      {state !== 'live' && (
        <div className="sticky-meta">
          <span className="tag">{STATE_LABEL[state].toLowerCase()}</span>
        </div>
      )}
    </Root>
  );
}
