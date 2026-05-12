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
    <details
      className="bo-card-surface w-full"
      aria-label="Robot notes summary"
      style={{
        borderRadius: 14,
        border: '2px solid var(--ink)',
        background: 'var(--paper)',
        boxShadow: '3px 3px 0 var(--ink)',
        padding: 14,
        fontFamily: 'var(--f-hand-body)',
        fontSize: 14,
        color: 'var(--ink)',
      }}
    >
      <summary
        className="cursor-pointer list-none select-none"
        style={{ outline: 'none' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--f-mono)',
                fontSize: 10,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
                fontWeight: 700,
              }}
            >
              {title}
            </p>
            <p
              style={{
                marginTop: 4,
                marginBottom: 0,
                fontFamily: 'var(--f-hand)',
                fontSize: 22,
                fontWeight: 700,
                lineHeight: 1.1,
                color: 'var(--ink)',
              }}
            >
              Staged insight queue
            </p>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 10px',
              borderRadius: 999,
              border: '1.5px solid var(--ink)',
              background: 'var(--sticky-yellow)',
              fontFamily: 'var(--f-mono)',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 700,
              color: 'var(--ink)',
            }}
          >
            {stagedCount} staged
          </span>
        </div>
      </summary>
      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1.4px dashed var(--hairline)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {items.length === 0 ? (
          <p
            style={{
              margin: 0,
              borderRadius: 10,
              border: '1.4px dashed var(--hairline)',
              background: 'var(--paper-dark)',
              padding: '8px 12px',
              fontSize: 13,
              lineHeight: 1.4,
              color: 'var(--ink-soft)',
              fontFamily: 'var(--f-hand-body)',
            }}
          >
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
          <p
            style={{
              margin: 0,
              paddingLeft: 4,
              fontFamily: 'var(--f-mono)',
              fontSize: 11,
              letterSpacing: '0.08em',
              color: 'var(--ink-faint)',
              textTransform: 'uppercase',
            }}
          >
            +{overflowCount} more insight{overflowCount === 1 ? '' : 's'} in queue
          </p>
        )}
      </div>
    </details>
  );
}
