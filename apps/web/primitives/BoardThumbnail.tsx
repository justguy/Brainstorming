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

const ROOT_CLASS =
  'bo-card-surface group relative flex w-full flex-col items-stretch gap-2 rounded-2xl px-3 py-2.5 text-left text-xs leading-5 text-slate-700 transition hover:-translate-y-[1px] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300';

const ROOT_ACTIVE = 'ring-2 ring-emerald-300';

const TITLE_CLASS = 'truncate text-sm font-semibold text-slate-900';
const META_CLASS = 'flex items-center gap-2 text-[11px] text-slate-500';

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

export function BoardThumbnail({
  board,
  onSelect,
  active = false,
  className,
  ariaLabel,
}: BoardThumbnailProps): React.ReactElement {
  const ideaCount = readIdeaCount(board);
  const lastTouchedAt = readLastTouchedAt(board);

  const handleClick = onSelect
    ? () => onSelect(board.id)
    : undefined;

  const Root = handleClick ? 'button' : 'div';
  const rootProps = handleClick ? { type: 'button' as const, onClick: handleClick } : {};

  const rootClassName = [
    ROOT_CLASS,
    active ? ROOT_ACTIVE : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const computedAriaLabel =
    ariaLabel ?? `Open board ${board.title}${ideaCount !== undefined ? `, ${ideaCount} ideas` : ''}`;

  return (
    <Root
      {...rootProps}
      className={rootClassName}
      aria-label={computedAriaLabel}
      aria-current={active ? 'page' : undefined}
    >
      <span className={TITLE_CLASS}>{board.title}</span>
      <div className={META_CLASS}>
        {ideaCount !== undefined && (
          <span className="rounded-full border border-slate-200 bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
            {ideaCount} idea{ideaCount === 1 ? '' : 's'}
          </span>
        )}
        {lastTouchedAt !== undefined && (
          <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
            {formatRelative(lastTouchedAt)}
          </span>
        )}
      </div>
    </Root>
  );
}
