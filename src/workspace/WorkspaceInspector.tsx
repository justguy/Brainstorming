import React, { useEffect, useMemo, useState } from 'react';
import { deriveIdeaBeadState, type DerivedBeadEntry } from '../orchestrator/beadState';
import { getIdeaPhaseHistory, type IdeaPhaseHistoryEvent } from '../storage/phaseHistory';
import type { Idea } from '../types';
import { createLegacyWorkspaceAdapter } from './legacyPhaseAdapter';
import { findLatestPhaseRun } from './phaseRunTrace';
import { WorkspaceScoutInspectorBody } from './WorkspaceScoutInspector';

export interface WorkspaceInspectorProps {
  idea: Idea;
  onUpdate?: (updated: Idea) => void;
  docCount?: number;
  onOpenDocs?: (ideaId: string) => void;
  onClose?: () => void;
}

interface HistoryState {
  events: IdeaPhaseHistoryEvent[];
  loading: boolean;
  error: string | null;
}

export function WorkspaceInspector({
  idea,
  onUpdate,
  docCount = 0,
  onOpenDocs,
  onClose,
}: WorkspaceInspectorProps): React.ReactElement {
  const [currentIdea, setCurrentIdea] = useState<Idea>(idea);
  const [history, setHistory] = useState<HistoryState>({ events: [], loading: true, error: null });
  const [exported, setExported] = useState(false);
  const [activeSurface, setActiveSurface] = useState<'idea' | 'scout'>('idea');
  const beadState = deriveIdeaBeadState(currentIdea);
  const phaseAdapter = createLegacyWorkspaceAdapter(currentIdea);
  const latestRun = findLatestPhaseRun(currentIdea.turnLog);
  const events = useMemo(() => [...history.events].reverse(), [history.events]);
  const newestEvent = events[0] ?? null;
  const activeIndex = beadState.beads.findIndex(bead => bead.status === 'active');
  const processIndex = activeIndex >= 0
    ? activeIndex + 1
    : beadState.beads.filter(bead => bead.status === 'completed').length;
  const activeBead = activeIndex >= 0 ? beadState.beads[activeIndex] ?? null : null;
  const scoutSurfaceAvailable = currentIdea.briefState.lenses.length > 0;

  useEffect(() => {
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
          error: err instanceof Error ? err.message : 'Failed to load inspector history.',
        });
      });

    return () => {
      active = false;
    };
  }, [idea.id]);

  useEffect(() => {
    setCurrentIdea(idea);
  }, [idea]);

  useEffect(() => {
    setActiveSurface('idea');
  }, [idea.id]);

  function handleIdeaUpdate(updated: Idea): void {
    setCurrentIdea(updated);
    onUpdate?.(updated);
  }

  async function handleExport(): Promise<void> {
    if (!currentIdea.artifactMd) return;

    const blob = new Blob([currentIdea.artifactMd], { type: 'text/markdown; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const filename = `handoff_${slugify(currentIdea.rawText || currentIdea.id)}.md`;

    try {
      await navigator.clipboard.writeText(currentIdea.artifactMd);
    } catch {
      // clipboard copy is convenience only
    }

    if (typeof chrome !== 'undefined' && chrome.downloads) {
      chrome.downloads.download({ url, filename }, () => {
        URL.revokeObjectURL(url);
      });
    } else {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    }

    setExported(true);
    window.setTimeout(() => setExported(false), 2400);
  }

  const body = activeSurface === 'scout'
    ? (
      <WorkspaceScoutInspectorBody
        idea={currentIdea}
        onUpdate={handleIdeaUpdate}
        docCount={docCount}
        onOpenDocs={onOpenDocs}
        onClose={() => setActiveSurface('idea')}
        closeLabel="Back to idea inspector"
      />
    )
    : (
      <>
        <div className="bo-insp-head">
          <div className="min-w-0">
            <div className="bo-insp-head__who">Dev · inspecting</div>
            <h2 className="bo-insp-head__title" title={currentIdea.rawText}>
              {currentIdea.rawText}
            </h2>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="bo-insp-head__close" aria-label="Close inspector">
              ×
            </button>
          )}
        </div>

        <div className="bo-insp-provenance">
          <div className="bo-insp-provenance__row">
            <span className="bo-insp-provenance__key">Origin</span>
            <span className="bo-insp-provenance__value">
              <span className="bo-insp-provenance__chip">{originActorLabel(newestEvent, latestRun)}</span>
              {newestEvent?.summary ?? 'This note is on the board and ready for review.'}
            </span>
          </div>
          <div className="bo-insp-provenance__row">
            <span className="bo-insp-provenance__key">Model</span>
            <span className="bo-insp-provenance__value">
              <span className="bo-insp-provenance__model">
                {latestRun?.providerLabel ?? currentIdea.providerUsed ?? 'provider not recorded'}
              </span>
              <span>{latestRun ? 'most recent phase run' : 'no recent phase run recorded'}</span>
            </span>
          </div>
          <div className="bo-insp-provenance__row">
            <span className="bo-insp-provenance__key">Added</span>
            <span className="bo-insp-provenance__value">
              {formatRelativeTime(newestEvent?.at ?? currentIdea.lastTurnAt ?? currentIdea.updatedAt)} · {autonomyCaption(currentIdea)}
            </span>
          </div>
          <div className="bo-insp-provenance__row">
            <span className="bo-insp-provenance__key">Reversible</span>
            <span className="bo-insp-provenance__value">
              {currentIdea.turnLog.length > 0 ? 'Tracked in board history and turn memory.' : 'No reversible AI action recorded yet.'}
            </span>
          </div>
        </div>

        <div className="bo-insp-section-label">
          <span>Lifecycle for this idea</span>
          <span className="bo-insp-section-label__right">
            {processIndex} / {beadState.beads.length} · {activeBead?.label ?? phaseAdapter.activeSpec?.label ?? 'Queued'}
          </span>
        </div>

        <div className="bo-insp-journey">
          <div className="bo-insp-journey__track">
            <div className="bo-insp-journey__line" aria-hidden="true">
              <div
                className="bo-insp-journey__filled"
                style={{ width: `${filledJourneyWidth(beadState.beads, processIndex)}%` }}
              />
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
            <span>{formatRelativeTime(currentIdea.createdAt)} start</span>
            <span>{beadState.summary}</span>
          </div>
        </div>

        <div className="bo-insp-now">
          <div className="bo-insp-now__name">{phaseAdapter.activeSpec?.label ?? 'Waiting to start'}</div>
          <div className="bo-insp-now__sub">
            {phaseAdapter.activeSpec?.kind === 'micro' ? 'Optional micro-step.' : 'Main lifecycle step.'} {activeBead?.summary ?? ''}
          </div>
          <div className="bo-insp-now__say">
            <b>Dev · {latestRun?.roleLabel ?? 'facilitator'}</b>
            {narrateNowCard({ idea: currentIdea, latestRun, activeBead })}
          </div>
          <div className="bo-insp-now__actions">
            {scoutSurfaceAvailable && (
              <button type="button" className="bo-insp-btn bo-insp-btn--primary" onClick={() => setActiveSurface('scout')}>
                Open scout
              </button>
            )}
            {onOpenDocs && (
              <button type="button" className="bo-insp-btn" onClick={() => onOpenDocs(currentIdea.id)}>
                Docs
              </button>
            )}
            {currentIdea.artifactMd && (
              <button type="button" className="bo-insp-btn" onClick={() => { void handleExport(); }}>
                {exported ? 'Copied' : 'Export'}
              </button>
            )}
            {onClose && (
              <button type="button" className="bo-insp-btn" onClick={onClose}>
                Show on board
              </button>
            )}
          </div>
        </div>

        <div className="bo-insp-section-label">
          <span>Attached</span>
          <span className="bo-insp-section-label__right">
            {artifactCount(currentIdea, docCount)} artifact{artifactCount(currentIdea, docCount) === 1 ? '' : 's'}
          </span>
        </div>

        <div className="bo-insp-artifacts">
          {onOpenDocs && (
            <button type="button" className="bo-insp-artifact" onClick={() => onOpenDocs(currentIdea.id)}>
              <span className="bo-insp-artifact__icon">📎</span>
              Supporting docs
              <span className="bo-insp-artifact__count">{docCount}</span>
            </button>
          )}
          {currentIdea.artifactMd && (
            <button type="button" className="bo-insp-artifact" onClick={() => { void handleExport(); }}>
              <span className="bo-insp-artifact__icon">✎</span>
              Handoff draft
              <span className="bo-insp-artifact__count">1</span>
            </button>
          )}
          {currentIdea.liveToolContext && (
            <div className="bo-insp-artifact">
              <span className="bo-insp-artifact__icon">🔗</span>
              {currentIdea.liveToolContext.title}
              <span className="bo-insp-artifact__count">{currentIdea.liveToolContext.tools.length}</span>
            </div>
          )}
        </div>

        <div className="bo-insp-section-label">
          <span>What has happened to this idea</span>
          <span className="bo-insp-section-label__right">newest first</span>
        </div>

        <div className="bo-insp-timeline">
          {history.loading && <p className="bo-insp-empty">Loading history…</p>}
          {!history.loading && history.error && <p className="bo-insp-error">{history.error}</p>}
          {!history.loading && !history.error && events.length === 0 && (
            <p className="bo-insp-empty">No dated interventions have been recorded for this note yet.</p>
          )}
          {!history.loading && !history.error && events.map(event => (
            <article
              key={`${event.source}-${event.sourceId ?? event.sourceSeq ?? event.at}`}
              className={`${timelineRowClassName(event)} ${scoutSurfaceAvailable && isScoutHistoryEvent(event) ? 'bo-insp-timeline__row--interactive' : ''}`}
              onClick={scoutSurfaceAvailable && isScoutHistoryEvent(event) ? () => setActiveSurface('scout') : undefined}
            >
              <div className="bo-insp-timeline__head">
                <span className="bo-insp-timeline__who">{timelineActorLabel(event)}</span>
                <span>{event.changeKinds.join(' · ')}</span>
                <span className="bo-insp-timeline__when">{formatWhen(event.at)}</span>
              </div>
              <p className="bo-insp-timeline__body">{event.summary}</p>
              {(onClose || (scoutSurfaceAvailable && isScoutHistoryEvent(event))) && (
                <div className="bo-insp-timeline__tools">
                  {scoutSurfaceAvailable && isScoutHistoryEvent(event) && (
                    <button type="button" onClick={() => setActiveSurface('scout')}>open scout</button>
                  )}
                  {onClose && (
                    <button type="button" onClick={onClose}>show on board</button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </>
    );

  return (
    <aside className="bo-inspector-drawer" aria-label="Inspector drawer">
      <div className="bo-inspector-drawer__scroll">
        {body}
      </div>
    </aside>
  );
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

function narrateNowCard(input: {
  idea: Idea;
  latestRun: ReturnType<typeof findLatestPhaseRun>;
  activeBead: DerivedBeadEntry | null;
}): string {
  if (input.latestRun) {
    const firstLine = input.latestRun.content.split('\n').map(line => line.trim()).find(Boolean);
    if (firstLine) return firstLine;
  }
  return input.activeBead?.summary ?? input.idea.rawText;
}

function originActorLabel(event: IdeaPhaseHistoryEvent | null, latestRun: ReturnType<typeof findLatestPhaseRun>): string {
  if (event) return timelineActorLabel(event);
  return latestRun?.roleLabel ?? 'Board';
}

function timelineActorLabel(event: IdeaPhaseHistoryEvent): string {
  if (event.actor.type === 'ai') return event.actor.label ?? `${roleTitle(event.actor.beat)} role`;
  if (event.actor.type === 'tool') return event.actor.label ?? 'Lifecycle tool';
  if (event.actor.type === 'user') return event.actor.label ?? 'You';
  return event.actor.label ?? 'System';
}

function isScoutHistoryEvent(event: IdeaPhaseHistoryEvent): boolean {
  const actor = timelineActorLabel(event).toLowerCase();
  const summary = event.summary.toLowerCase();
  return actor.includes('scout') || summary.includes('lens');
}

function roleTitle(value?: string): string {
  switch (value) {
    case 'scout': return 'Scout';
    case 'connect': return 'Synthesizer';
    case 'critique': return 'Challenger';
    case 'summarise': return 'Summarizer';
    case 'cluster': return 'Cluster';
    default: return 'AI';
  }
}

function timelineRowClassName(event: IdeaPhaseHistoryEvent): string {
  const tone = event.actor.type === 'user' ? 'user' : event.actor.type === 'tool' ? 'edit' : 'ai';
  return `bo-insp-timeline__row bo-insp-timeline__row--${tone}`;
}

function autonomyCaption(idea: Idea): string {
  return idea.liveToolContext
    ? `active-tab tools from ${idea.liveToolContext.origin}`
    : 'board autonomy mode not recorded';
}

function artifactCount(idea: Idea, docCount: number): number {
  return (docCount > 0 ? 1 : 0) + (idea.artifactMd ? 1 : 0) + (idea.liveToolContext ? 1 : 0);
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

function slugify(text: string): string {
  return text
    .slice(0, 40)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
