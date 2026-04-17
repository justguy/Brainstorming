import React from 'react';

interface BadgeProps {
  color?: 'red' | 'yellow' | 'green' | 'gray';
  children: React.ReactNode;
}

const READINESS_EMOJI: Record<string, string> = {
  red: '🔴',
  yellow: '🟡',
  green: '🟢',
};

export default function Badge({ color = 'gray', children }: BadgeProps): React.ReactElement {
  const colors: Record<string, string> = {
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    green: 'bg-green-100 text-green-700',
    gray: 'bg-gray-100 text-gray-600',
  };
  const emoji = READINESS_EMOJI[color] ?? '';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}
      aria-label={`readiness: ${children}`}
    >
      {emoji && <span aria-hidden="true">{emoji}</span>}
      {children}
    </span>
  );
}
