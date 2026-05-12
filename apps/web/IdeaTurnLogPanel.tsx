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

/*
 * Idea turn-log overlay — paper/sketch restyle.
 *
 * - Root is a paper-backed aside fixed to the right rail, with 2px ink
 *   border + hand-shadow.
 * - Header pins a hand-written title with a JetBrains-Mono eyebrow + meta.
 * - Filter chips are inline mono-caps that flip to ink-on-paper when
 *   selected. They get explicit `style` chrome so they don't get nuked by
 *   the global `button {}` reset.
 * - Workflow + conversation entries are paper-dark sub-cards with 1px ink
 *   border.
 * - Action buttons all use `.btn.sm` / `.btn.sm.ghost`. The close affordance
 *   uses `.icon-btn`.
 * - Error toast uses `--accent-contradicts` border on paper instead of
 *   rose-500.
 * - Empty / loading states use dashed-ink-on-paper.
 */
const PANEL_STYLE: React.CSSProperties = {
  position: 'absolute',
  right: 24,
  top: 24,
  bottom: 24,
  zIndex: 22,
  width: 'min(460px, calc(100% - 3rem))',
  maxWidth: '100%',
  background: 'var(--paper)',
  border: '2px solid var(--ink)',
  borderRadius: 14,
  boxShadow: '3px 3px 0 var(--ink)',
  pointerEvents: 'auto',
  color: 'var(--ink)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const HEADER_STYLE: React.CSSProperties = {
  borderBottom: '1.5px solid var(--ink)',
  padding: '14px 16px',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
};

const EYEBROW_STYLE: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  color: 'var(--ink-faint)',
};

const TITLE_STYLE: React.CSSProperties = {
  margin: '4px 0 0',
  fontFamily: 'var(--f-hand)',
  fontSize: 24,
  lineHeight: 1.1,
  color: 'var(--ink)',
};

const META_STYLE: React.CSSProperties = {
  margin: '4px 0 0',
  fontFamily: 'var(--f-mono)',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--ink-faint)',
};

const FILTERS_STYLE: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  padding: '10px 16px 4px',
  borderBottom: '1px solid var(--hairline)',
};

const FILTER_CHIP_BASE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 9px',
  borderRadius: 999,
  border: '1.2px solid var(--ink)',
  background: 'var(--paper)',
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--ink)',
  cursor: 'pointer',
};

const FILTER_CHIP_ACTIVE: React.CSSProperties = {
  ...FILTER_CHIP_BASE,
  background: 'var(--ink)',
  color: 'var(--paper)',
};

const BODY_STYLE: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const FOOTER_STYLE: React.CSSProperties = {
  borderTop: '1.5px solid var(--ink)',
  padding: '10px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  background: 'var(--paper)',
};

const SECTION_HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  marginBottom: 8,
};

const SECTION_META_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--ink-faint)',
};

const ENTRY_STYLE: React.CSSProperties = {
  background: 'var(--paper-dark)',
  border: '1px solid var(--ink)',
  borderRadius: 10,
  padding: '10px 12px',
  marginBottom: 8,
  color: 'var(--ink)',
};

const TAG_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 7px',
  borderRadius: 4,
  border: '1px solid var(--ink)',
  background: 'var(--paper)',
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--ink)',
};

const TIME_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--ink-faint)',
};

const ENTRY_HEAD_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};

const ENTRY_HEADLINE_STYLE: React.CSSProperties = {
  margin: '6px 0 0',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.4,
  color: 'var(--ink)',
};

const ENTRY_SUB_STYLE: React.CSSProperties = {
  margin: '4px 0 0',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 12,
  lineHeight: 1.4,
  color: 'var(--ink-soft)',
};

const ENTRY_ORIGIN_STYLE: React.CSSProperties = {
  margin: '4px 0 0',
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--ink-faint)',
};

const META_PILL_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 6px',
  borderRadius: 999,
  border: '1px solid var(--ink)',
  background: 'var(--paper)',
  fontFamily: 'var(--f-mono)',
  fontSize: 9.5,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--ink)',
};

const ENTRY_BODY_STYLE: React.CSSProperties = {
  margin: '8px 0 0',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 14,
  lineHeight: 1.55,
  color: 'var(--ink)',
};

const ENTRY_TOOL_HINT_STYLE: React.CSSProperties = {
  margin: '8px 0 0',
  fontFamily: 'var(--f-mono)',
  fontSize: 11,
  color: 'var(--ink-soft)',
};

const RATIONALE_STYLE: React.CSSProperties = {
  marginTop: 8,
  padding: '8px 10px',
  background: 'var(--paper)',
  border: '1px dashed var(--ink)',
  borderRadius: 8,
};

const RATIONALE_LABEL_STYLE: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--f-mono)',
  fontSize: 9,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  color: 'var(--accent-critique)',
};

const RATIONALE_BODY_STYLE: React.CSSProperties = {
  margin: '4px 0 0',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 13,
  lineHeight: 1.45,
  color: 'var(--ink)',
};

const ENTRY_ACTIONS_STYLE: React.CSSProperties = {
  marginTop: 10,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 6,
};

const BOARD_HINT_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--ink-faint)',
};

const LOADING_STYLE: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--f-hand-body)',
  fontSize: 14,
  color: 'var(--ink-soft)',
};

const ERROR_STYLE: React.CSSProperties = {
  margin: 0,
  padding: '8px 12px',
  borderRadius: 10,
  border: '1.5px solid var(--accent-contradicts)',
  background: 'var(--paper)',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 13,
  color: 'var(--accent-contradicts)',
};

const EMPTY_STATE_STYLE: React.CSSProperties = {
  padding: '14px 16px',
  borderRadius: 12,
  border: '1.5px dashed var(--ink)',
  background: 'var(--paper)',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 13,
  color: 'var(--ink-soft)',
};

const FOOTER_META_STYLE: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--ink-faint)',
};

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
    <aside className="bo-turn-log-panel bo-elevated-panel" aria-label="Turn log" style={PANEL_STYLE}>
      <div style={HEADER_STYLE}>
        <div style={{ minWidth: 0 }}>
          <p style={EYEBROW_STYLE}>Turn log · idea</p>
          <h2 style={TITLE_STYLE}>
            {currentIdea.rawText.slice(0, 64)}{currentIdea.rawText.length > 64 ? '…' : ''}
          </h2>
          <p style={META_STYLE}>
            {aiTurnCount} AI · {userTurnCount} you · {pinnedCount} pinned
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn"
            aria-label="Close turn log"
            style={{ fontFamily: 'var(--f-mono)', fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      </div>

      <div style={FILTERS_STYLE}>
        {filters.map(key => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            style={filter === key ? FILTER_CHIP_ACTIVE : FILTER_CHIP_BASE}
            aria-pressed={filter === key}
          >
            {FILTER_LABEL[key]}
          </button>
        ))}
      </div>

      <div style={BODY_STYLE}>
        {loading && (
          <p style={LOADING_STYLE}>Loading workflow memory…</p>
        )}
        {error && (
          <p style={ERROR_STYLE} role="alert">
            {error}
          </p>
        )}

        {!loading && visibleWorkflow.length > 0 && (
          <section>
            <div style={SECTION_HEADER_STYLE}>
              <p style={EYEBROW_STYLE}>Workflow memory</p>
              <span style={SECTION_META_STYLE}>
                {visibleWorkflow.length} / {workflow.totalEvents}
              </span>
            </div>
            {visibleWorkflow.map(event => (
              <article key={`${event.source}-${event.sourceId ?? event.sourceSeq ?? event.at}`} style={ENTRY_STYLE}>
                <div style={ENTRY_HEAD_STYLE}>
                  <span style={TAG_STYLE}>{event.changeKinds.join(' + ')}</span>
                  <span style={TIME_STYLE}>{formatWhen(event.at)}</span>
                </div>
                <p style={ENTRY_HEADLINE_STYLE}>{event.summary}</p>
                <p style={ENTRY_SUB_STYLE}>
                  {event.actor.label ?? actorLabel(event)}
                </p>
              </article>
            ))}
            {workflow.nextCursor && (
              <button
                type="button"
                onClick={() => { void loadMoreWorkflow(); }}
                className="btn sm ghost"
              >
                {loadingMore === 'workflow' ? 'Loading…' : 'Load earlier'}
              </button>
            )}
          </section>
        )}

        {!loading && activeTurnRows.length > 0 && (
          <section>
            <div style={SECTION_HEADER_STYLE}>
              <p style={EYEBROW_STYLE}>Conversation trail</p>
              <span style={SECTION_META_STYLE}>
                {activeTurnRows.length} / {visibleTurnsWithMeta.length}
              </span>
            </div>
            {activeTurnRows.map(({ entry, index, origin, rationale, key }) => (
              <article key={key} style={ENTRY_STYLE}>
                <div style={ENTRY_HEAD_STYLE}>
                  <span style={TAG_STYLE}>{turnOriginLabel(origin)}</span>
                  <span style={TIME_STYLE}>{formatRelativeTurn(index, turnLog.totalTurns)}</span>
                </div>
                <p style={ENTRY_ORIGIN_STYLE}>
                  {origin === 'user' ? 'You' : origin === 'critique' ? 'Dev · critique' : origin === 'ai' ? 'Dev · facilitator' : 'System'} · {turnOriginLabel(origin)}
                </p>
                {(entry.meta?.phaseLabel || entry.meta?.roleId || entry.meta?.provider || entry.meta?.model) && (
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {entry.meta?.phaseLabel && (
                      <span style={META_PILL_STYLE}>
                        {entry.meta.phaseLabel}
                      </span>
                    )}
                    {entry.meta?.roleId && (
                      <span style={META_PILL_STYLE}>
                        {entry.meta.roleId}
                      </span>
                    )}
                    {(entry.meta?.provider || entry.meta?.model) && (
                      <span style={META_PILL_STYLE}>
                        {[entry.meta?.provider, entry.meta?.model].filter(Boolean).join('/')}
                      </span>
                    )}
                  </div>
                )}
                {entry.meta?.source === 'phase_run' && (
                  <p style={ENTRY_TOOL_HINT_STYLE}>
                    {summarizeToolUsage(entry)}
                  </p>
                )}
                <p style={ENTRY_BODY_STYLE}>
                  {formatTurnEntryContent(entry)}
                </p>
                {rationale && (
                  <div style={RATIONALE_STYLE}>
                    <p style={RATIONALE_LABEL_STYLE}>Why</p>
                    <p style={RATIONALE_BODY_STYLE}>{rationale}</p>
                  </div>
                )}
                <div style={ENTRY_ACTIONS_STYLE}>
                  <button
                    type="button"
                    onClick={() => { handlePin(entry, index); }}
                    className="btn sm ghost"
                  >
                    {pinnedTurnKeys.has(key) ? '★ pinned' : '☆ pin'}
                  </button>
                  {onTransfer && (
                    <button
                      type="button"
                      onClick={() => { handleTransfer(entry); }}
                      className="btn sm ghost"
                    >
                      Transfer →
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { handleDismiss(entry, key, index); }}
                    className="btn sm ghost"
                  >
                    Dismiss
                  </button>
                  {onOpenInspector && (
                    <span style={BOARD_HINT_STYLE}>Open note workspace</span>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}

        {!loading && visibleWorkflow.length === 0 && visibleTurnsWithMeta.length === 0 && (
          <div style={EMPTY_STATE_STYLE}>
            No entries match the current filter yet.
          </div>
        )}
      </div>

      <div style={FOOTER_STYLE}>
        <p style={FOOTER_META_STYLE}>
          Paginated · cursor {footerCursorLabel}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onOpenInspector && (
            <button type="button" onClick={onOpenInspector} className="btn sm ghost">
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
              className="btn sm"
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
