import React, { useEffect, useMemo, useState } from 'react';
import { deriveIdeaBeadState, type DerivedBeadEntry } from '../orchestrator/beadState';
import { getIdeaPhaseHistory, type IdeaPhaseHistoryEvent } from '../storage/phaseHistory';
import type { Idea, ScoutSuggestion } from '../types';
import LensGrid from './LensGrid';
import { createLegacyWorkspaceAdapter } from './legacyPhaseAdapter';
import { findLatestPhaseRun } from './phaseRunTrace';
import {
  buildIdeaScoutPromptHighlights,
  buildSuggestionPromptHighlights,
} from './scoutPromptHighlights';

type SuggestionBusyState = 'admit' | 'elaborate' | 'dismiss' | null;

interface HistoryState {
  events: IdeaPhaseHistoryEvent[];
  loading: boolean;
  error: string | null;
}

interface WorkspaceScoutInspectorBodyProps {
  idea: Idea | null;
  boardIdeas?: Idea[];
  suggestion?: ScoutSuggestion | null;
  onUpdate?: (updated: Idea) => void;
  docCount?: number;
  onOpenDocs?: (ideaId: string) => void;
  onAdmitSuggestion?: (id: string) => void;
  onDismissSuggestion?: (id: string) => void;
  onElaborateSuggestion?: (id: string) => void;
  suggestionBusy?: SuggestionBusyState;
  suggestionError?: string | null;
  onClose?: () => void;
  closeLabel?: string;
}

export function WorkspaceScoutInspector(props: WorkspaceScoutInspectorBodyProps): React.ReactElement {
  return (
    <aside className="bo-inspector-drawer" aria-label="Scout drawer">
      <div className="bo-inspector-drawer__scroll">
        <WorkspaceScoutInspectorBody {...props} />
      </div>
    </aside>
  );
}

export function WorkspaceScoutInspectorBody({
  idea,
  boardIdeas,
  suggestion = null,
  onUpdate,
  docCount = 0,
  onOpenDocs,
  onAdmitSuggestion,
  onDismissSuggestion,
  onElaborateSuggestion,
  suggestionBusy = null,
  suggestionError = null,
  onClose,
  closeLabel = 'Close',
}: WorkspaceScoutInspectorBodyProps): React.ReactElement {
  const [history, setHistory] = useState<HistoryState>({ events: [], loading: false, error: null });
  const latestRun = idea ? findLatestPhaseRun(idea.turnLog) : null;
  const beadState = idea ? deriveIdeaBeadState(idea) : null;
  const phaseAdapter = idea ? createLegacyWorkspaceAdapter(idea) : null;
  const promptItems = suggestion
    ? buildSuggestionPromptHighlights({ suggestion, ideas: boardIdeas ?? (idea ? [idea] : []) })
    : idea
      ? buildIdeaScoutPromptHighlights(idea)
      : [];
  const scoutEvents = useMemo(
    () => [...history.events].reverse().filter(isScoutHistoryEvent),
    [history.events],
  );
  const activeIndex = beadState?.beads.findIndex(bead => bead.status === 'active') ?? -1;
  const processIndex = beadState
    ? (activeIndex >= 0 ? activeIndex + 1 : beadState.beads.filter(bead => bead.status === 'completed').length)
    : 0;
  const activeBead = beadState && activeIndex >= 0 ? beadState.beads[activeIndex] ?? null : null;
  const lifecycleLabel = activeBead?.label ?? phaseAdapter?.activeSpec?.label ?? 'Scout';
  const title = suggestion?.rawText ?? activeBead?.label ?? phaseAdapter?.activeSpec?.label ?? 'Scout';

  useEffect(() => {
    if (!idea) {
      setHistory({ events: [], loading: false, error: null });
      return;
    }
    let active = true;
    setHistory({ events: [], loading: true, error: null });
    void getIdeaPhaseHistory({ ideaId: idea.id, limit: 18 })
      .then(page => {
        if (!active) return;
        setHistory({ events: page.events, loading: false, error: null });
      })
      .catch(err => {
        if (!active) return;
        setHistory({
          events: [],
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load scout history.',
        });
      });
    return () => {
      active = false;
    };
  }, [idea?.id]);

  return (
    <>
      <div className="bo-insp-head">
        <div className="min-w-0">
          <div className="bo-insp-head__who">Dev · Scout</div>
          <h2 className="bo-insp-head__title" title={title}>{title}</h2>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="bo-insp-head__close" aria-label={closeLabel}>
            ×
          </button>
        )}
      </div>

      <div className="bo-insp-provenance">
        <div className="bo-insp-provenance__row">
          <span className="bo-insp-provenance__key">Origin</span>
          <span className="bo-insp-provenance__value">
            <span className="bo-insp-provenance__chip">Scout</span>
            {suggestion ? `Found this using ${suggestion.source}.` : 'Surfaced this while pressure-testing the idea from the outside.'}
          </span>
        </div>
        <div className="bo-insp-provenance__row">
          <span className="bo-insp-provenance__key">Model</span>
          <span className="bo-insp-provenance__value">
            <span className="bo-insp-provenance__model">{latestRun?.providerLabel ?? 'provider not recorded'}</span>
            <span>{suggestion ? 'board scout suggestion' : (latestRun?.roleLabel ?? 'outside-in lens')}</span>
          </span>
        </div>
        <div className="bo-insp-provenance__row">
          <span className="bo-insp-provenance__key">Added</span>
          <span className="bo-insp-provenance__value">
            {formatRelativeTime(suggestion?.createdAt ?? idea?.lastTurnAt ?? idea?.updatedAt ?? Date.now())}
          </span>
        </div>
        <div className="bo-insp-provenance__row">
          <span className="bo-insp-provenance__key">Reversible</span>
          <span className="bo-insp-provenance__value">
            {suggestion ? 'Keep it to promote it to the board, or dismiss it.' : 'Pin, dismiss, or note the lens before moving on.'}
          </span>
        </div>
      </div>

      {beadState && (
        <>
          <div className="bo-insp-section-label">
            <span>Lifecycle for this idea</span>
            <span className="bo-insp-section-label__right">
              {processIndex} / {beadState.beads.length} · {lifecycleLabel}
            </span>
          </div>
          <div className="bo-insp-journey">
            <div className="bo-insp-journey__track">
              <div className="bo-insp-journey__line" aria-hidden="true">
                <div className="bo-insp-journey__filled" style={{ width: `${filledJourneyWidth(beadState.beads, processIndex)}%` }} />
              </div>
              <div className="bo-insp-journey__beads">
                {beadState.beads.map(bead => (
                  <div key={bead.id} className={journeyBeadClassName(bead)}>
                    <div className="bo-insp-journey__dot">
                      {bead.status === 'completed' ? '✓' : bead.kind === 'micro' ? '' : bead.phaseNumber}
                    </div>
                    <div className="bo-insp-journey__label">{bead.shortLabel}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bo-insp-journey__meta">
              <span>{formatRelativeTime(idea?.createdAt ?? Date.now())} start</span>
              <span>{beadState.summary}</span>
            </div>
          </div>
        </>
      )}

      <div className="bo-insp-now">
        <div className="bo-insp-now__name">{suggestion ? sourceLabel(suggestion.source) : "Looking through other people's eyes"}</div>
        <div className="bo-insp-now__sub">
          {suggestion
            ? 'Scout suggestion. Accept to turn this into a real note, or dismiss it and keep the board clean.'
            : 'Outside-in lens · optional step. Running this surfaces angles that insiders miss.'}
        </div>
        <div className="bo-insp-now__say">
          <b>Dev · Scout</b>
          {suggestion?.elaboration ?? suggestion?.rationale ?? latestRun?.content.split('\n').map(line => line.trim()).find(Boolean) ?? 'No scout narration recorded yet.'}
        </div>
        <div className="bo-insp-now__actions">
          {suggestion && onAdmitSuggestion && (
            <button
              type="button"
              className="bo-insp-btn bo-insp-btn--primary"
              onClick={() => onAdmitSuggestion(suggestion.id)}
              disabled={suggestionBusy !== null}
            >
              {suggestionBusy === 'admit' ? 'keeping…' : 'keep it →'}
            </button>
          )}
          {suggestion && onDismissSuggestion && (
            <button
              type="button"
              className="bo-insp-btn"
              onClick={() => onDismissSuggestion(suggestion.id)}
              disabled={suggestionBusy !== null}
            >
              {suggestionBusy === 'dismiss' ? 'dismissing…' : 'dismiss'}
            </button>
          )}
          {suggestion && onElaborateSuggestion && (
            <button
              type="button"
              className="bo-insp-btn"
              onClick={() => onElaborateSuggestion(suggestion.id)}
              disabled={suggestionBusy !== null}
            >
              {suggestionBusy === 'elaborate' ? 'thinking…' : 'show reasoning'}
            </button>
          )}
          {!suggestion && onOpenDocs && idea && (
            <button type="button" className="bo-insp-btn" onClick={() => onOpenDocs(idea.id)}>
              Docs
            </button>
          )}
        </div>
        {suggestion && suggestionError && (
          <p role="alert" className="bo-insp-error mt-2 text-[11px] font-medium text-rose-600">
            {suggestionError}
          </p>
        )}
      </div>

      {promptItems.length > 0 && (
        <>
          <div className="bo-insp-section-label">
            <span>Prompt focus</span>
            <span className="bo-insp-section-label__right">high value only</span>
          </div>
          <div className="bo-scout-prompt">
            {promptItems.map(item => (
              <div key={item.label} className="bo-scout-prompt__row">
                <span className="bo-scout-prompt__key">{item.label}</span>
                <span className="bo-scout-prompt__value">{item.value}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {idea && onOpenDocs && (
        <>
          <div className="bo-insp-section-label">
            <span>Attached</span>
            <span className="bo-insp-section-label__right">{docCount} artifact{docCount === 1 ? '' : 's'}</span>
          </div>
          <div className="bo-insp-artifacts">
            <button type="button" className="bo-insp-artifact" onClick={() => onOpenDocs(idea.id)}>
              <span className="bo-insp-artifact__icon">📎</span>
              Supporting docs
              <span className="bo-insp-artifact__count">{docCount}</span>
            </button>
          </div>
        </>
      )}

      {idea && onUpdate && idea.briefState.lenses.length > 0 && (
        <>
          <div className="bo-insp-section-label">
            <span>LLM suggestions</span>
            <span className="bo-insp-section-label__right">accept or dismiss</span>
          </div>
          <div className="bo-scout-lens-grid">
            <LensGrid idea={idea} onUpdate={onUpdate} />
          </div>
        </>
      )}

      <div className="bo-insp-section-label">
        <span>{idea ? 'What has happened to this idea' : 'What Dev suggested'}</span>
        <span className="bo-insp-section-label__right">newest first</span>
      </div>
      <div className="bo-insp-timeline">
        {suggestion && (
          <article className="bo-insp-timeline__row bo-insp-timeline__row--ai">
            <div className="bo-insp-timeline__head">
              <span className="bo-insp-timeline__who">Dev · Scout</span>
              <span>board suggestion</span>
              <span className="bo-insp-timeline__when">{formatWhen(suggestion.createdAt)}</span>
            </div>
            <p className="bo-insp-timeline__body">{suggestion.rawText}</p>
            <div className="bo-insp-timeline__tools">
              {onAdmitSuggestion && (
                <button type="button" onClick={() => onAdmitSuggestion(suggestion.id)} disabled={suggestionBusy !== null}>
                  keep it
                </button>
              )}
              {onElaborateSuggestion && (
                <button type="button" onClick={() => onElaborateSuggestion(suggestion.id)} disabled={suggestionBusy !== null}>
                  show reasoning
                </button>
              )}
              {onDismissSuggestion && (
                <button type="button" onClick={() => onDismissSuggestion(suggestion.id)} disabled={suggestionBusy !== null}>
                  dismiss
                </button>
              )}
            </div>
          </article>
        )}
        {history.loading && <p className="bo-insp-empty">Loading scout history…</p>}
        {!history.loading && history.error && <p className="bo-insp-error">{history.error}</p>}
        {!history.loading && !history.error && scoutEvents.length === 0 && !suggestion && (
          <p className="bo-insp-empty">No scout-specific interventions have been recorded yet.</p>
        )}
        {!history.loading && !history.error && scoutEvents.map(event => (
          <article key={`${event.source}-${event.sourceId ?? event.sourceSeq ?? event.at}`} className={timelineRowClassName(event)}>
            <div className="bo-insp-timeline__head">
              <span className="bo-insp-timeline__who">{timelineActorLabel(event)}</span>
              <span>{event.changeKinds.join(' · ')}</span>
              <span className="bo-insp-timeline__when">{formatWhen(event.at)}</span>
            </div>
            <p className="bo-insp-timeline__body">{event.summary}</p>
          </article>
        ))}
      </div>
    </>
  );
}

function sourceLabel(source: string): string {
  if (source.toLowerCase().includes('analogy')) return 'Analogy';
  if (source.toLowerCase().includes('adjacent')) return 'Adjacent practice';
  if (source.toLowerCase().includes('contrarian')) return 'Contrarian read';
  if (source.toLowerCase().includes('doc')) return 'Doc signal';
  return 'Outside-in lens';
}

function journeyBeadClassName(bead: DerivedBeadEntry): string {
  return [
    'bo-insp-journey__bead',
    `bo-insp-journey__bead--${bead.status.replace('_', '-')}`,
    bead.kind === 'micro' ? 'bo-insp-journey__bead--optional' : '',
  ].filter(Boolean).join(' ');
}

function filledJourneyWidth(beads: DerivedBeadEntry[], processIndex: number): number {
  if (beads.length <= 1) return 100;
  return Math.max(0, Math.min(100, ((Math.max(processIndex, 1) - 1) / (beads.length - 1)) * 100));
}

function isScoutHistoryEvent(event: IdeaPhaseHistoryEvent): boolean {
  const actor = timelineActorLabel(event).toLowerCase();
  const summary = event.summary.toLowerCase();
  return actor.includes('scout') || summary.includes('lens');
}

function timelineActorLabel(event: IdeaPhaseHistoryEvent): string {
  if (event.actor.type === 'ai') return event.actor.label ?? `${event.actor.beat ?? 'AI'} role`;
  if (event.actor.type === 'tool') return event.actor.label ?? 'Lifecycle tool';
  if (event.actor.type === 'user') return event.actor.label ?? 'You';
  return event.actor.label ?? 'System';
}

function timelineRowClassName(event: IdeaPhaseHistoryEvent): string {
  const tone = event.actor.type === 'user' ? 'user' : event.actor.type === 'tool' ? 'edit' : 'ai';
  return `bo-insp-timeline__row bo-insp-timeline__row--${tone}`;
}

function formatWhen(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function formatRelativeTime(timestamp: number): string {
  const deltaMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return '1 hr ago';
  if (hours < 48) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
