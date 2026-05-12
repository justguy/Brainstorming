import React from 'react';
import type { LogEvent, LogAuthorKind } from '../../src/board/projection/logEvents';

interface LogEventListProps {
  events: LogEvent[];
  /**
   * The current history cursor. Events whose `source.kind === 'changeSet'`
   * with seq matching this value receive the "current" tone.
   */
  currentSeq?: number;
  /** Optional empty-state copy override. */
  emptyMessage?: string;
  /**
   * Optional hover-action callback for the Screen 06 scrubber's
   * "↶ rewind to here" affordance. When supplied, each `changeSet`-sourced
   * row renders a small button that calls back with the row's seq.
   */
  onJumpToSeq?: (seq: number) => void;
}

/**
 * bo-132 — LogEventList renders the projected `LogEvent[]` from
 * `projectLogEvents()`. Each variant has its own row treatment:
 *   - idea-created / idea-edited: idea-edit chip
 *   - connection-drawn: connection chip
 *   - cluster-proposed: cluster chip
 *   - ai-nudge: surface badge (suggestion / critique / review-session)
 *   - nudge-resolved: resolution badge (accept / dismiss / edit)
 *   - board-meta: surface badge (tweaks / doc / ai-undo)
 *   - role-run: beat tag + ok/fallback indicators
 *
 * Styling reuses the elevated panel aesthetic from BoardHistoryPanel.
 */
export function LogEventList({
  events,
  currentSeq,
  emptyMessage = 'No durable change sets yet. The first edit or AI action will appear here as a readable patch set.',
  onJumpToSeq,
}: LogEventListProps): React.ReactElement {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-sm text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map(event => (
        <LogEventRow
          key={event.id}
          event={event}
          currentSeq={currentSeq}
          onJumpToSeq={onJumpToSeq}
        />
      ))}
    </div>
  );
}

interface LogEventRowProps {
  event: LogEvent;
  currentSeq?: number;
  onJumpToSeq?: (seq: number) => void;
}

function LogEventRow({ event, currentSeq, onJumpToSeq }: LogEventRowProps): React.ReactElement {
  const isCurrent =
    typeof currentSeq === 'number' &&
    event.source.kind === 'changeSet' &&
    event.source.seq === currentSeq;

  const reversed = event.reversed;

  const containerClass = isCurrent
    ? 'border-violet-300 bg-violet-50/70'
    : reversed
      ? 'border-slate-200 bg-slate-50/90'
      : event.source.kind === 'changeSet' && event.source.status === 'superseded'
        ? 'border-amber-200 bg-amber-50/80'
        : 'border-slate-200 bg-white/95';

  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm ${containerClass}`}
      data-log-kind={event.kind}
      data-log-event-id={event.id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 rounded-full ${authorDotClass(event.authorRef.kind)}`}
            />
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] ${authorToneClass(event.authorRef.kind)}`}>
              {authorLabel(event)}
            </span>
            {event.authorRef.beat && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                {roleTitle(event.authorRef.beat)}
              </span>
            )}
            <KindBadge event={event} />
            <VariantBadge event={event} />
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusClass(event, isCurrent)}`}>
              {statusLabel(event, isCurrent)}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-slate-900">{eventHeadline(event)}</h3>
          {eventSubline(event) && (
            <p className="text-[12px] leading-snug text-slate-600">{eventSubline(event)}</p>
          )}
        </div>

        <div className="text-right text-[11px] text-slate-500">
          {event.source.kind === 'changeSet' && <div>#{event.source.seq}</div>}
          <div>{formatTimestamp(event.ts)}</div>
          {onJumpToSeq && event.source.kind === 'changeSet' && (
            <button
              type="button"
              onClick={() => onJumpToSeq(event.source.kind === 'changeSet' ? event.source.seq : 0)}
              className="bo-log-event-rewind mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{
                fontFamily: 'var(--f-mono)',
                color: 'var(--ink)',
                borderColor: 'var(--ink)',
                background: 'var(--paper)',
              }}
              title={`Rewind scrubber to seq #${event.source.seq}`}
              aria-label={`Rewind scrubber to seq ${event.source.seq}`}
            >
              ↶ rewind to here
            </button>
          )}
        </div>
      </div>

      {affectedIds(event).length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Affected entities</p>
          <div className="flex flex-wrap gap-1.5">
            {affectedIds(event).map(id => (
              <span
                key={id}
                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600"
                title={id}
              >
                {id}
              </span>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

// -- Sub-components -----------------------------------------------------------

function KindBadge({ event }: { event: LogEvent }): React.ReactElement {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
      {kindLabel(event.kind)}
    </span>
  );
}

function VariantBadge({ event }: { event: LogEvent }): React.ReactElement | null {
  switch (event.kind) {
    case 'idea-edited':
      return badge(operationToneClass(event.payload.operation), event.payload.operation);
    case 'cluster-proposed':
      return badge('bg-indigo-50 text-indigo-700', event.payload.operation);
    case 'ai-nudge':
      return badge(surfaceToneClass(event.payload.surface), event.payload.surface);
    case 'nudge-resolved':
      return badge(resolutionToneClass(event.payload.resolution), event.payload.resolution);
    case 'board-meta':
      return badge('bg-slate-100 text-slate-600', event.payload.surface);
    case 'role-run': {
      const tone = event.payload.ok
        ? event.payload.usedFallback
          ? 'bg-amber-50 text-amber-700'
          : 'bg-emerald-50 text-emerald-700'
        : 'bg-rose-50 text-rose-700';
      const label = event.payload.ok
        ? event.payload.usedFallback
          ? 'fallback'
          : 'ok'
        : 'failed';
      return badge(tone, `${event.payload.trigger} · ${label}`);
    }
    default:
      return null;
  }
}

function badge(toneClass: string, label: string): React.ReactElement {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${toneClass}`}>
      {label}
    </span>
  );
}

// -- Headline / subline derivation -------------------------------------------

function eventHeadline(event: LogEvent): string {
  switch (event.kind) {
    case 'idea-created':
      return event.payload.summary || 'Idea created';
    case 'idea-edited':
      return event.payload.summary || `Idea ${event.payload.operation}`;
    case 'connection-drawn':
      return event.payload.summary || 'Connection drawn';
    case 'cluster-proposed':
      return event.payload.summary || `Cluster ${event.payload.operation}`;
    case 'ai-nudge':
      return event.payload.summary || `AI ${event.payload.surface}`;
    case 'nudge-resolved':
      return event.payload.summary || `Nudge ${event.payload.resolution}`;
    case 'board-meta':
      return event.payload.summary || `Board ${event.payload.surface}`;
    case 'role-run':
      return `${roleTitle(event.payload.beat)} run`;
    default:
      return '';
  }
}

function eventSubline(event: LogEvent): string | null {
  if (event.kind !== 'role-run') return null;
  const { roleId, focusIdeaId, reason } = event.payload;
  const parts: string[] = [`role: ${roleId}`];
  if (focusIdeaId) parts.push(`focus: ${focusIdeaId}`);
  if (reason) parts.push(reason);
  return parts.join(' · ');
}

function affectedIds(event: LogEvent): string[] {
  switch (event.kind) {
    case 'idea-created':
    case 'idea-edited':
      return event.payload.affectedIdeaIds;
    case 'connection-drawn':
      return event.payload.affectedConnectionIds;
    case 'cluster-proposed':
      return [...event.payload.affectedGroupIds, ...event.payload.affectedIdeaIds];
    case 'ai-nudge':
    case 'nudge-resolved':
    case 'board-meta':
      return event.payload.affectedIds;
    case 'role-run':
      return event.payload.focusIdeaId ? [event.payload.focusIdeaId] : [];
    default:
      return [];
  }
}

// -- Author + status styling --------------------------------------------------

function authorLabel(event: LogEvent): string {
  if (event.authorRef.label) return event.authorRef.label;
  switch (event.authorRef.kind) {
    case 'user':
      return 'User';
    case 'ai':
      return event.authorRef.beat ? `${roleTitle(event.authorRef.beat)} role` : 'AI';
    case 'tool':
      return 'Tool';
    default:
      return 'System';
  }
}

function authorToneClass(kind: LogAuthorKind): string {
  switch (kind) {
    case 'user':
      return 'bg-emerald-50 text-emerald-700';
    case 'ai':
      return 'bg-sky-50 text-sky-700';
    case 'tool':
      return 'bg-amber-50 text-amber-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function authorDotClass(kind: LogAuthorKind): string {
  switch (kind) {
    case 'user':
      return 'bg-emerald-500';
    case 'ai':
      return 'bg-sky-500';
    case 'tool':
      return 'bg-amber-500';
    default:
      return 'bg-slate-400';
  }
}

function statusLabel(event: LogEvent, isCurrent: boolean): string {
  if (isCurrent) return 'current';
  if (event.reversed) return 'undone';
  if (event.source.kind === 'changeSet' && event.source.status === 'superseded') return 'superseded';
  if (event.kind === 'role-run' && !event.payload.ok) return 'failed';
  return 'committed';
}

function statusClass(event: LogEvent, isCurrent: boolean): string {
  if (isCurrent) return 'bg-violet-100 text-violet-700';
  if (event.reversed) return 'bg-slate-200 text-slate-600';
  if (event.source.kind === 'changeSet' && event.source.status === 'superseded') {
    return 'bg-amber-100 text-amber-700';
  }
  if (event.kind === 'role-run' && !event.payload.ok) return 'bg-rose-100 text-rose-700';
  return 'bg-emerald-100 text-emerald-700';
}

function operationToneClass(operation: string): string {
  switch (operation) {
    case 'discard':
      return 'bg-rose-50 text-rose-700';
    case 'restore':
      return 'bg-emerald-50 text-emerald-700';
    case 'merge':
      return 'bg-violet-50 text-violet-700';
    case 'move':
      return 'bg-cyan-50 text-cyan-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function surfaceToneClass(surface: string): string {
  switch (surface) {
    case 'suggestion':
      return 'bg-sky-50 text-sky-700';
    case 'critique':
      return 'bg-rose-50 text-rose-700';
    case 'review-session':
      return 'bg-violet-50 text-violet-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function resolutionToneClass(resolution: string): string {
  switch (resolution) {
    case 'accept':
      return 'bg-emerald-50 text-emerald-700';
    case 'dismiss':
      return 'bg-slate-200 text-slate-600';
    case 'edit':
      return 'bg-cyan-50 text-cyan-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function kindLabel(kind: LogEvent['kind']): string {
  switch (kind) {
    case 'idea-created':
      return 'idea created';
    case 'idea-edited':
      return 'idea edited';
    case 'connection-drawn':
      return 'connection';
    case 'cluster-proposed':
      return 'cluster';
    case 'ai-nudge':
      return 'ai nudge';
    case 'nudge-resolved':
      return 'nudge resolved';
    case 'board-meta':
      return 'board';
    case 'role-run':
      return 'role run';
    default:
      return kind;
  }
}

function roleTitle(value: string): string {
  switch (value) {
    case 'scout':
      return 'Scout';
    case 'connect':
      return 'Connector';
    case 'critique':
      return 'Challenger';
    case 'summarise':
      return 'Synthesiser';
    case 'cluster':
      return 'Cluster';
    default:
      return titleCase(value);
  }
}

function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}
