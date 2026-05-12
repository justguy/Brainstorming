import React from 'react';
import type { BoardRecord } from '../../../src/board/types';

/**
 * BoardThumbnail — small card preview suited to the multi-board home
 * (Screen 01). Renders a compact tile with the board title plus optional
 * idea-count and last-touched-at metadata.
 *
 * Accepts either a full `BoardRecord` or the minimal subset listed in
 * `BoardThumbnailFields` so the primitive is reusable for derived views
 * (e.g. cross-board map planets) that don't carry the entire record.
 *
 * Visual style follows the hand-drawn paper design system from
 * `Design/src/dashboard.jsx` — the `.board-card` surface with a stickies+ink
 * SVG preview, a Caveat title, and JetBrains Mono stats line. The "+"
 * new-board variant from the design lives on the home screen, not here.
 */

export interface BoardThumbnailFields {
  id: string;
  title: string;
  ideaCount?: number;
  lastTouchedAt?: number;
}

export interface BoardThumbnailProps {
  board: BoardRecord | BoardThumbnailFields;
  /** Optional click handler. Receives the board id for routing convenience. */
  onSelect?: (boardId: string) => void;
  /** Marks the thumbnail as the currently active board. */
  active?: boolean;
  /** Additional class names appended to the root container. */
  className?: string;
  /** Aria-label override; auto-derived when omitted. */
  ariaLabel?: string;
}

function formatRelative(timestamp: number, now: number = Date.now()): string {
  const deltaMs = Math.max(0, now - timestamp);
  const seconds = Math.round(deltaMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(days / 365);
  return `${years}y ago`;
}

function readIdeaCount(board: BoardRecord | BoardThumbnailFields): number | undefined {
  const candidate = (board as BoardThumbnailFields).ideaCount;
  return typeof candidate === 'number' ? candidate : undefined;
}

function readLastTouchedAt(board: BoardRecord | BoardThumbnailFields): number | undefined {
  const explicit = (board as BoardThumbnailFields).lastTouchedAt;
  if (typeof explicit === 'number') return explicit;
  const updated = (board as BoardRecord).updatedAt;
  return typeof updated === 'number' ? updated : undefined;
}

/**
 * Mini sticky-collage preview shown in the body of each `.board-card`.
 * Mirrors `BoardPreview` in `Design/src/dashboard.jsx` — five rotated sticky
 * rectangles plus a few hand-drawn connection paths. Seeded deterministically
 * by the board id so each card has a stable visual identity.
 */
function BoardPreviewSvg({ seed }: { seed: string }): React.ReactElement {
  // deterministic 0..n hash from the board id
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const fills = ['#f7e58a', '#f4b9c6', '#b8dbe8', '#c5e0a8', '#f5ccac', '#d7c8e8'];
  const fill = fills[Math.abs(h) % fills.length];
  return (
    <svg
      viewBox="0 0 240 120"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g stroke="var(--ink, #1a1814)" strokeWidth="1.2">
        <rect x="14" y="18" width="58" height="34" fill={fill} transform="rotate(-2 43 35)" />
        <rect x="95" y="10" width="58" height="34" fill="#f7e58a" transform="rotate(1 124 27)" />
        <rect x="176" y="22" width="54" height="34" fill="#b8dbe8" transform="rotate(-3 203 39)" />
        <rect x="40" y="72" width="58" height="34" fill="#c5e0a8" transform="rotate(2 69 89)" />
        <rect x="140" y="66" width="62" height="34" fill="#f4b9c6" transform="rotate(-1 171 83)" />
        <path d="M60 50 C90 40 110 40 124 44" fill="none" />
        <path
          d="M153 27 C168 32 180 34 195 30"
          fill="none"
          strokeDasharray="3 2"
          stroke="var(--accent-contradicts, #c94a3a)"
        />
        <path d="M120 44 C120 60 100 70 95 82" fill="none" strokeDasharray="1 3" />
        <path d="M170 60 C160 75 140 80 130 80" fill="none" />
      </g>
    </svg>
  );
}

export function BoardThumbnail({
  board,
  onSelect,
  active = false,
  className,
  ariaLabel,
}: BoardThumbnailProps): React.ReactElement {
  const ideaCount = readIdeaCount(board);
  const lastTouchedAt = readLastTouchedAt(board);

  const handleClick = onSelect ? () => onSelect(board.id) : undefined;

  const Root = handleClick ? 'button' : 'div';
  const rootProps = handleClick ? { type: 'button' as const, onClick: handleClick } : {};

  const rootClassName = ['board-card', active ? 'is-active' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  const computedAriaLabel =
    ariaLabel ?? `Open board ${board.title}${ideaCount !== undefined ? `, ${ideaCount} ideas` : ''}`;

  // The `.board-card` class is built for plain divs in the design; when we
  // render as a <button> we strip the default button chrome inline so it
  // reads exactly like its div counterpart.
  const buttonReset: React.CSSProperties | undefined = handleClick
    ? {
        textAlign: 'left',
        font: 'inherit',
        appearance: 'none',
        WebkitAppearance: 'none',
      }
    : undefined;

  const activeStyle: React.CSSProperties | undefined = active
    ? {
        outline: '2px dashed var(--ink)',
        outlineOffset: '3px',
      }
    : undefined;

  // Belt-and-braces aspect/size so button-rendered cards and div-rendered
  // new-board tiles size identically across the grid.
  const sizingStyle: React.CSSProperties = {
    width: '100%',
    aspectRatio: '4 / 3',
  };

  const style: React.CSSProperties = {
    ...sizingStyle,
    ...(buttonReset ?? {}),
    ...(activeStyle ?? {}),
  };

  // Render the preview FIRST so it stacks behind the title/sub in default
  // document order (later siblings paint on top — without this the SVG would
  // overlap the title text). The preview is `position: absolute` per the
  // design CSS, so order-in-JSX doesn't affect layout, only paint order.
  return (
    <Root
      {...rootProps}
      className={rootClassName}
      aria-label={computedAriaLabel}
      aria-current={active ? 'page' : undefined}
      style={style}
    >
      <div className="bc-preview">
        <BoardPreviewSvg seed={board.id} />
      </div>
      <div className="bc-title" style={{ position: 'relative', zIndex: 1 }}>
        {board.title}
      </div>
      {ideaCount !== undefined && (
        <div className="bc-sub" style={{ position: 'relative', zIndex: 1 }}>
          {ideaCount} idea{ideaCount === 1 ? '' : 's'}
        </div>
      )}
      <div className="bc-stats" style={{ zIndex: 1 }}>
        <span>
          {ideaCount !== undefined ? `${ideaCount} idea${ideaCount === 1 ? '' : 's'}` : ''}
        </span>
        <span>{lastTouchedAt !== undefined ? formatRelative(lastTouchedAt) : ''}</span>
      </div>
    </Root>
  );
}
