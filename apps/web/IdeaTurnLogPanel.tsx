import React, { useEffect, useMemo, useState } from 'react';
import type { Idea, LlmMessage } from '../../src/types';
import {
  getIdeaPhaseHistory,
  type IdeaPhaseHistoryEvent,
} from '../../src/storage/phaseHistory';
import { getTurnLogPage } from '../../src/storage/ideas';
import { formatTurnEntryContent, summarizeToolUsage } from '../../src/workspace/phaseRunTrace';

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
  const [pinnedTurnKeys, setPinnedTurnKeys] = useState<Set<string>>(new Set());
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
        setPinnedTurnKeys(new Set());
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
    const key = `${entry.role}-${turnIndex}-${entry.content.slice(0, 40)}`;
    setPinnedTurnKeys(current => {
      const next = new Set(current);
      next.add(key);
      return next;
    });
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
    setPinnedTurnKeys(current => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    onDismiss?.(entry, turnIndex);
  }

  if (!open || !idea) return null;

  const currentIdea = idea;
  const aiTurnCount = visibleTurnRows.filter(row => row.origin === 'ai' || row.origin === 'critique').length;
  const userTurnCount = visibleTurnRows.filter(row => row.origin === 'user').length;
  const pinnedCount = pinnedTurnKeys.size;
  const footerCursorLabel = turnLog.totalTurns > 0 ? `${Math.min(turnLog.entries.length, turnLog.totalTurns)}/${turnLog.totalTurns}` : '0/0';

  return (
    <aside className="bo-turn-log-panel bo-elevated-panel" aria-label="Turn log">
      <div className="bo-turn-log-panel__header">
        <div className="min-w-0">
          <p className="bo-shell-eyebrow">Turn log · idea</p>
          <h2 className="bo-turn-log-panel__title">
            {currentIdea.rawText.slice(0, 64)}{currentIdea.rawText.length > 64 ? '…' : ''}
          </h2>
          <p className="bo-turn-log-panel__meta">
            {aiTurnCount} AI · {userTurnCount} you · {pinnedCount} pinned
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="bo-turn-log-panel__close" aria-label="Close turn log">
            ×
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
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="bo-shell-eyebrow">Workflow memory</p>
              <span className="bo-turn-log-panel__section-meta">
                {visibleWorkflow.length} / {workflow.totalEvents}
              </span>
            </div>
            {visibleWorkflow.map(event => (
              <article key={`${event.source}-${event.sourceId ?? event.sourceSeq ?? event.at}`} className="bo-turn-entry">
                <div className="flex items-center justify-between gap-2">
                  <span className="bo-turn-entry__tag">{event.changeKinds.join(' + ')}</span>
                  <span className="bo-turn-entry__time">{formatWhen(event.at)}</span>
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
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="bo-shell-eyebrow">Conversation trail</p>
              <span className="bo-turn-log-panel__section-meta">
                {activeTurnRows.length} / {visibleTurnsWithMeta.length}
              </span>
            </div>
            {activeTurnRows.map(({ entry, index, origin, rationale, key }) => (
              <article key={key} className="bo-turn-entry">
                <div className="flex items-center justify-between gap-2">
                  <span className="bo-turn-entry__tag">{turnOriginLabel(origin)}</span>
                  <span className="bo-turn-entry__time">{formatRelativeTurn(index, turnLog.totalTurns)}</span>
                </div>
                <p className="bo-turn-entry__origin">
                  {origin === 'user' ? 'You' : origin === 'critique' ? 'Dev · critique' : origin === 'ai' ? 'Dev · facilitator' : 'System'} · {turnOriginLabel(origin)}
                </p>
                {(entry.meta?.phaseLabel || entry.meta?.roleId || entry.meta?.provider || entry.meta?.model) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {entry.meta?.phaseLabel && (
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                        {entry.meta.phaseLabel}
                      </span>
                    )}
                    {entry.meta?.roleId && (
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">
                        {entry.meta.roleId}
                      </span>
                    )}
                    {(entry.meta?.provider || entry.meta?.model) && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                        {[entry.meta?.provider, entry.meta?.model].filter(Boolean).join('/')}
                      </span>
                    )}
                  </div>
                )}
                {entry.meta?.source === 'phase_run' && (
                  <p className="mt-2 text-xs text-slate-500">
                    {summarizeToolUsage(entry)}
                  </p>
                )}
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                  {formatTurnEntryContent(entry)}
                </p>
                {rationale && (
                  <div className="bo-turn-entry__rationale">
                    <p className="bo-turn-entry__rationale-label">Why</p>
                    <p>{rationale}</p>
                  </div>
                )}
                <div className="bo-turn-entry__actions">
                  <button type="button" onClick={() => { handlePin(entry, index); }} className="bo-shell-action">
                    {pinnedTurnKeys.has(key) ? '★ pinned' : '☆ pin'}
                  </button>
                  {onTransfer && (
                    <button type="button" onClick={() => { handleTransfer(entry); }} className="bo-shell-action">
                      Transfer →
                    </button>
                  )}
                  <button type="button" onClick={() => { handleDismiss(entry, key, index); }} className="bo-shell-action">
                    Dismiss
                  </button>
                  {onOpenInspector && (
                    <span className="bo-turn-entry__board-hint">Open note workspace</span>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}

        {!loading && visibleWorkflow.length === 0 && visibleTurnsWithMeta.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-5 text-sm text-slate-500">
            No entries match the current filter yet.
          </div>
        )}
      </div>

      <div className="bo-turn-log-panel__footer">
        <p className="bo-turn-log-panel__footer-meta">
          Paginated · cursor {footerCursorLabel}
        </p>
        <div className="flex items-center gap-2">
          {onOpenInspector && (
            <button type="button" onClick={onOpenInspector} className="bo-shell-action">
              Open note
            </button>
          )}
          {(workflow.nextCursor || turnLog.nextCursor) && (
            <button
              type="button"
              onClick={() => {
                if (turnLog.nextCursor) {
                  void loadMoreTurns();
                  return;
                }
                if (workflow.nextCursor) {
                  void loadMoreWorkflow();
                }
              }}
              className="bo-shell-action"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
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

function formatRelativeTurn(index: number, totalTurns: number): string {
  if (totalTurns <= 0) return 'now';
  const remaining = Math.max(0, totalTurns - index - 1);
  if (remaining <= 0) return 'now';
  if (remaining === 1) return '1 turn ago';
  return `${remaining} turns ago`;
}
