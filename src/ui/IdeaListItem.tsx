import React from 'react';
import type { Idea } from '../types';
import Badge from './Badge';

interface IdeaListItemProps {
  idea: Idea;
  selected?: boolean;
  onClick?: () => void;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function IdeaListItem({
  idea,
  selected = false,
  onClick,
}: IdeaListItemProps): React.ReactElement {
  const title = idea.rawText.slice(0, 40) + (idea.rawText.length > 40 ? '…' : '');

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full text-left px-3 py-2.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400 ${
        selected
          ? 'bg-violet-50 border-l-2 border-violet-500'
          : 'hover:bg-gray-50 border-l-2 border-transparent'
      }`}
    >
      <p className="text-sm font-medium text-gray-800 truncate leading-snug">{title}</p>
      <div className="flex items-center gap-2 mt-1">
        <Badge color={idea.readiness}>{idea.readiness}</Badge>
        <span className="text-xs text-gray-400">Phase {idea.phase}/8</span>
        <span className="text-xs text-gray-400 ml-auto">{formatRelativeTime(idea.updatedAt)}</span>
      </div>
    </button>
  );
}
