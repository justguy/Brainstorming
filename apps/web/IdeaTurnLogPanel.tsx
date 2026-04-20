import React, { useEffect, useMemo, useState } from 'react';
import type { Idea, LlmMessage } from '../../src/types';
import {
  getIdeaPhaseHistory,
  type IdeaPhaseHistoryEvent,
} from '../../src/storage/phaseHistory';
import { getTurnLogPage } from '../../src/storage/ideas';

type TurnLogFilter = 'all' | 'ai' | 'user' | 'critique' | 'edit';
type TurnOrigin = 'ai' | 'user' | 'critique' | 'edit';

const TURN_LOG_PAGE_SIZE = 20;
const FILTER_LABEL: Record<TurnLogFilter, string> = {
  all: 'All',
  ai: 'AI',
  user: 'User',
  critique: 'Critique',
  edit: 'Edit',
};

interface IdeaTurnLogPanelProps {
  idea: Idea | null;
  open: boolean;
  onClose: () => void;
  onOpenInspector?: () => void;
  onTransfer?: (entry: LlmMessage) => void;
  onPin?: (entry: LlmMessage, turnIndex: number) => void;
  onDismiss?: (entry: LlmMessage, turnIndex: number) => void;
}

interface TurnLogState {
  entries: LlmMessage[];
  nextCursor: string | null;
  totalTurns: number;
}

interface WorkflowState {
  events: IdeaPhaseHistoryEvent[];
  nextCursor: string | null;
  totalEvents: number;
}

export function IdeaTurnLogPanel({
  idea,
  open,
  onClose,
  onOpenInspector,
  onTransfer,
  onPin,
  onDismiss,
}: IdeaTurnLogPanelProps): React.ReactElement | null {
  const [filter, setFilter] = useState<TurnLogFilter>('all');
  const [workflow, setWorkflow] = useState<WorkflowState>({ events: [], nextCursor: null, totalEvents: 0 });
  const [turnLog, setTurnLog] = useState<TurnLogState>({ entries: [], nextCursor: null, totalTurns: 0 });
  const [dismissedTurnKeys, setDismissedTurnKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState<'workflow' | 'turns' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ideaId = idea?.id ?? null;
  const filters: TurnLogFilter[] = ['all', 'ai', 'user', 'critique', 'edit'];

  useEffect(() => {
    const currentIdeaId = ideaId;
    if (!open || !currentIdeaId) return;
    const stableIdeaId: string = currentIdeaId;
    let active = true;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const [historyPage, turnPage] = await Promise.all([
          getIdeaPhaseHistory({ ideaId: stableIdeaId, limit: TURN_LOG_PAGE_SIZE }),
          getTurnLogPage(stableIdeaId, { limit: TURN_LOG_PAGE_SIZE }),
        ]);
        if (!active) return;
        setWorkflow({
          events: historyPage.events,
          nextCursor: historyPage.nextCursor,
          totalEvents: historyPage.totalEvents,
        });
        setTurnLog(turnPage);
        setDismissedTurnKeys(new Set());
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load turn log.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [ideaId, open]);

  const visibleWorkflow = workflow.events;

  const visibleTurnRows = useMemo(
    () => turnLog.entries.map((entry, index) => {
      const origin = turnOriginFromEntry(entry);
      return {
        entry,
        index,
        origin,
        rationale: extractRationale(entry.content),
        key: `${entry.role}-${index}-${entry.content.slice(0, 40)}`,
      };
    }),
    [turnLog.entries],
  );

  const visibleTurnsWithMeta = useMemo(
    () => visibleTurnRows.filter(row => filter === 'all' || row.origin === filter),
    [filter, visibleTurnRows],
  );

  const activeTurnRows = useMemo(() => visibleTurnsWithMeta.filter(row => !dismissedTurnKeys.has(row.key)), [visibleTurnsWithMeta, dismissedTurnKeys]);

  async function loadMoreWorkflow(): Promise<void> {
    if (!ideaId || !workflow.nextCursor || loadingMore) return;
    setLoadingMore('workflow');
    try {
      const nextPage = await getIdeaPhaseHistory({
        ideaId,
        cursor: workflow.nextCursor,
        limit: TURN_LOG_PAGE_SIZE,
      });
      setWorkflow(current => ({
        events: [...current.events, ...nextPage.events],
        nextCursor: nextPage.nextCursor,
        totalEvents: nextPage.totalEvents,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more workflow history.');
    } finally {
      setLoadingMore(null);
    }
  }

  async function loadMoreTurns(): Promise<void> {
    if (!ideaId || !turnLog.nextCursor || loadingMore) return;
    setLoadingMore('turns');
    try {
      const nextPage = await getTurnLogPage(ideaId, {
        cursor: turnLog.nextCursor,
        limit: TURN_LOG_PAGE_SIZE,
      });
      setTurnLog(current => ({
        entries: [...current.entries, ...nextPage.entries],
        nextCursor: nextPage.nextCursor,
        totalTurns: nextPage.totalTurns,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more turns.');
    } finally {
      setLoadingMore(null);
    }
  }

  function turnOriginLabel(origin: TurnOrigin): string {
    return origin === 'ai' ? 'AI' : origin === 'user' ? 'User' : origin === 'critique' ? 'Critique' : 'Edit';
  }

  function handleTransfer(entry: LlmMessage): void {
    if (!onTransfer) return;
    onTransfer(entry);
  }

  function handlePin(entry: LlmMessage, turnIndex: number): void {
    if (onPin) {
      onPin(entry, turnIndex);
      return;
    }
    onOpenInspector?.();
  }

  function handleDismiss(entry: LlmMessage, key: string, turnIndex: number): void {
    setDismissedTurnKeys(current => {
      const next = new Set(current);
      next.add(key);
      return next;
    });
    onDismiss?.(entry, turnIndex);
  }

  if (!open || !idea) return null;

  const currentIdea = idea;

  return (
    <aside className="bo-turn-log-panel bo-elevated-panel" aria-label="Turn log">
      <div className="bo-turn-log-panel__header">
        <div className="min-w-0">
          <p className="bo-shell-eyebrow">Turn log</p>
          <h2 className="mt-1 text-sm font-semibold text-slate-900">
            {currentIdea.rawText.slice(0, 64)}{currentIdea.rawText.length > 64 ? '…' : ''}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {onOpenInspector && (
            <button type="button" onClick={onOpenInspector} className="bo-shell-action">
              Pin
            </button>
          )}
          <button type="button" onClick={onClose} className="bo-shell-action">
            Dismiss
          </button>
        </div>
      </div>

      <div className="bo-turn-log-panel__filters">
        {filters.map(key => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`bo-filter-chip ${filter === key ? 'is-active' : ''}`}
          >
            {FILTER_LABEL[key]}
          </button>
        ))}
      </div>

      <div className="bo-turn-log-panel__body">
        {loading && (
          <p className="text-sm text-slate-500">Loading workflow memory…</p>
        )}
        {error && (
          <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
            {error}
          </p>
        )}

        {!loading && visibleWorkflow.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="bo-shell-eyebrow">Workflow memory</p>
              <span className="text-[11px] text-slate-500">
                {visibleWorkflow.length} / {workflow.totalEvents}
              </span>
            </div>
            {visibleWorkflow.map(event => (
              <article key={`${event.source}-${event.sourceId ?? event.sourceSeq ?? event.at}`} className="bo-turn-entry">
                <div className="flex items-center justify-between gap-2">
                  <span className="bo-turn-entry__tag">{event.changeKinds.join(' + ')}</span>
                  <span className="text-[11px] text-slate-500">{formatWhen(event.at)}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-900">{event.summary}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {event.actor.label ?? actorLabel(event)}
                </p>
              </article>
            ))}
            {workflow.nextCursor && (
              <button type="button" onClick={() => { void loadMoreWorkflow(); }} className="bo-shell-action">
                {loadingMore === 'workflow' ? 'Loading…' : 'Load earlier'}
              </button>
            )}
          </section>
        )}

        {!loading && activeTurnRows.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="bo-shell-eyebrow">Conversation trail</p>
              <span className="text-[11px] text-slate-500">
                {activeTurnRows.length} / {visibleTurnsWithMeta.length}
              </span>
            </div>
            {activeTurnRows.map(({ entry, index, origin, rationale, key }) => (
              <article key={key} className="bo-turn-entry">
                <div className="flex items-center justify-between gap-2">
                  <span className="bo-turn-entry__tag">{turnOriginLabel(origin)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">Turn {index + 1}</span>
                    <span className="text-[11px] text-slate-500">Origin: {turnOriginLabel(origin)}</span>
                    <span className="text-[11px] text-slate-500">Rationale: {rationale ?? 'Not stored'}</span>
                    {onTransfer && (
                      <button type="button" onClick={() => { handleTransfer(entry); }} className="bo-shell-action">
                        Transfer
                      </button>
                    )}
                    <button type="button" onClick={() => { handlePin(entry, index); }} className="bo-shell-action">
                      Pin
                    </button>
                    <button type="button" onClick={() => { handleDismiss(entry, key, index); }} className="bo-shell-action">
                      Dismiss
                    </button>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                  {entry.content}
                </p>
              </article>
            ))}
            {turnLog.nextCursor && (
              <button type="button" onClick={() => { void loadMoreTurns(); }} className="bo-shell-action">
                {loadingMore === 'turns' ? 'Loading…' : 'Load earlier'}
              </button>
            )}
          </section>
        )}

        {!loading && visibleWorkflow.length === 0 && visibleTurnsWithMeta.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-5 text-sm text-slate-500">
            No entries match the current filter yet.
          </div>
        )}
      </div>
    </aside>
  );
}

function actorLabel(event: IdeaPhaseHistoryEvent): string {
  if (event.actor.type === 'ai') return `${roleTitle(event.actor.beat)} role`;
  if (event.actor.type === 'tool') return 'Lifecycle tool';
  if (event.actor.type === 'user') return 'User edit';
  return 'System';
}

function roleTitle(value?: string): string {
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
      return 'AI';
  }
}

function formatWhen(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function turnOriginFromEntry(entry: LlmMessage): TurnOrigin {
  if (entry.role === 'user') return 'user';
  if (entry.role === 'assistant') {
    if (/\bcritique\b|\bchallenger\b|\bcounter\w*\b/.test(entry.content.toLowerCase())) return 'critique';
    return 'ai';
  }
  if (entry.role === 'system' && /\bedit|revision|refine|rewrite|revise/.test(entry.content.toLowerCase())) return 'edit';
  if (/\bcritique\b/.test(entry.content.toLowerCase())) return 'critique';
  return 'edit';
}

function extractRationale(content: string): string | null {
  const rationaleLine = content.match(/rationale\s*[:\-]\s*(.+)$/im);
  if (rationaleLine && rationaleLine[1].trim()) {
    return rationaleLine[1].trim();
  }
  const becauseClause = content.match(/\bbecause\b[:\s]+(.+)$/im);
  if (becauseClause && becauseClause[1].trim()) {
    return becauseClause[1].trim();
  }
  return null;
}
