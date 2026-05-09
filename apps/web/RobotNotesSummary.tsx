import React from 'react';
import { NudgeCard } from './primitives/NudgeCard';

export interface RobotNotesItem {
  id: string;
  intent: string;
  title: string;
  detail?: string;
  primaryLabel?: string;
}

export interface RobotNotesSummaryProps {
  title?: string;
  stagedCount: number;
  items?: RobotNotesItem[];
  maxVisibleItems?: number;
  onPrimaryAction?: (id: string) => void;
  onDismiss?: (id: string) => void;
}

const DEFAULT_MAX_VISIBLE_ITEMS = 3;

export function RobotNotesSummary({
  title = 'Robot\'s Notes',
  stagedCount,
  items = [],
  maxVisibleItems = DEFAULT_MAX_VISIBLE_ITEMS,
  onPrimaryAction,
  onDismiss,
}: RobotNotesSummaryProps): React.ReactElement {
  const previewItems = items.slice(0, Math.max(1, maxVisibleItems));
  const overflowCount = Math.max(0, stagedCount - previewItems.length);

  return (
    <details className="bo-card-surface w-full rounded-[24px] p-4 text-sm" aria-label="Robot notes summary">
      <summary className="cursor-pointer list-none select-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {title}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Staged insight queue</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-700">
            {stagedCount} staged
          </span>
        </div>
      </summary>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
            No staged insights yet. When Shadow mode is active, generated ideas will arrive here before mutation.
          </p>
        ) : (
          previewItems.map(item => {
            const handleAccept = item.primaryLabel && onPrimaryAction
              ? () => onPrimaryAction(item.id)
              : undefined;
            const handleDismiss = onDismiss
              ? () => onDismiss(item.id)
              : undefined;
            return (
              <NudgeCard
                key={item.id}
                eyebrow={item.intent}
                title={item.title}
                body={item.detail}
                acceptLabel={item.primaryLabel}
                onAccept={handleAccept}
                onDismiss={handleDismiss}
              />
            );
          })
        )}
        {overflowCount > 0 && (
          <p className="px-2 text-xs text-slate-500">+{overflowCount} more insight{overflowCount === 1 ? '' : 's'} in queue</p>
        )}
      </div>
    </details>
  );
}
