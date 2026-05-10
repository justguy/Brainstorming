import React from 'react';
import { deriveIdeaBeadState } from '../../src/orchestrator/beadState';
import { AppApiKeyBanner } from './AppApiKeyBanner';
import { AppCompanionRail } from './AppCompanionRail';
import { AppHeaderBar } from './AppHeaderBar';
import { BoardCanvasStage } from './BoardCanvasStage';
import { BoardWorkspaceOverlays } from './BoardWorkspaceOverlays';
import type { Idea } from '../../src/types';

interface BoardAppViewProps {
  header: React.ComponentProps<typeof AppHeaderBar>;
  showApiKeyBanner: boolean;
  onOpenOptions: () => void;
  companionRail: React.ComponentProps<typeof AppCompanionRail>;
  canvasStage: React.ComponentProps<typeof BoardCanvasStage>;
  workspaceOverlays: React.ComponentProps<typeof BoardWorkspaceOverlays>;
  selectedIdeaDockContent?: React.ReactNode;
  beadStrip?: React.ReactNode;
  discardPile?: React.ReactNode;
  turnLogPanel?: React.ReactNode;
  peerStrip?: React.ReactNode;
  historyPanel?: React.ReactNode;
  reviewPanel?: React.ReactNode;
  /**
   * Extra screen-level overlay nodes (popovers, dialogs) rendered alongside
   * the existing shell. The host is responsible for positioning — this slot
   * is a no-op for layout but lets the screen mount portals/popovers without
   * having to thread additional props through `BoardWorkspaceOverlays`.
   */
  extraOverlays?: React.ReactNode;
}

export function BoardAppView({
  header,
  showApiKeyBanner,
  onOpenOptions,
  companionRail,
  canvasStage,
  workspaceOverlays,
  selectedIdeaDockContent,
  beadStrip,
  discardPile,
  turnLogPanel,
  peerStrip,
  historyPanel,
  reviewPanel,
  extraOverlays,
}: BoardAppViewProps): React.ReactElement {
  const hasTurnLogPanel = Boolean(turnLogPanel);
  const hasSelectedIdeaDock = Boolean(workspaceOverlays.selectedBoardIdea);
  const selectedIdeaDock = workspaceOverlays.selectedBoardIdea ? (
    <BoardSelectedIdeaDock
      idea={workspaceOverlays.selectedBoardIdea}
      docCount={workspaceOverlays.docCounts[workspaceOverlays.selectedBoardIdea.id] ?? 0}
      dockContent={selectedIdeaDockContent}
      isTurnLogOpen={workspaceOverlays.isTurnLogOpen}
      canOpenDocs={Boolean(workspaceOverlays.onOpenDocs)}
      canToggleTurnLog={Boolean(workspaceOverlays.onToggleTurnLog)}
      canOpenInspector={Boolean(workspaceOverlays.inspectorContent && workspaceOverlays.onOpenInspector)}
      onOpenDocs={workspaceOverlays.onOpenDocs}
      onToggleTurnLog={workspaceOverlays.onToggleTurnLog}
      onOpenInspector={workspaceOverlays.onOpenInspector}
      onClose={workspaceOverlays.onCloseSelectedIdea}
    />
  ) : null;

  return (
    <div className="bo-board-shell relative h-screen overflow-hidden">
      <div className="absolute inset-0">
        <BoardCanvasStage {...canvasStage}>
          {historyPanel}
          {reviewPanel}
          <BoardWorkspaceOverlays {...workspaceOverlays} />
        </BoardCanvasStage>
      </div>

      {hasTurnLogPanel && <div className="bo-shell-backdrop" aria-hidden="true" />}
      {hasSelectedIdeaDock && (
        <div
          className="bo-shell-focus-backdrop"
          onClick={workspaceOverlays.onCloseSelectedIdea}
          aria-hidden="true"
        />
      )}

      <div className="bo-shell-topbar">
        <AppHeaderBar {...header} />
        {showApiKeyBanner && <AppApiKeyBanner onOpenOptions={onOpenOptions} />}
      </div>

      {beadStrip && (
        <section className="bo-shell-home bo-shell-home-bead" aria-label="Bead strip home">
          {beadStrip}
        </section>
      )}

      {selectedIdeaDock && (
        <section className="bo-shell-home bo-shell-home-focus" aria-label="Selected note home">
          {selectedIdeaDock}
        </section>
      )}

      <section className="bo-shell-home bo-shell-home-persona" aria-label="Persona dock home">
        <AppCompanionRail {...companionRail} />
      </section>

      {discardPile && (
        <section className="bo-shell-home bo-shell-home-discard" aria-label="Discard pile home">
          {discardPile}
        </section>
      )}

      {hasTurnLogPanel && (
        <section className="bo-shell-home bo-shell-home-turn-log" aria-label="Turn log home">
          {turnLogPanel}
        </section>
      )}

      {peerStrip && (
        <section className="bo-shell-home bo-shell-home-peers" aria-label="Peer chip row home">
          {peerStrip}
        </section>
      )}

      {extraOverlays}
    </div>
  );
}

function summarizeIdeaProgress(idea: Idea): string {
  const beadState = deriveIdeaBeadState(idea);
  const activeIndex = beadState.beads.findIndex(bead => bead.status === 'active');
  const completedCount = beadState.beads.filter(bead => bead.status === 'completed').length;
  const progressIndex = activeIndex >= 0 ? activeIndex + 1 : Math.max(0, completedCount);
  const label = activeIndex >= 0
    ? beadState.beads[activeIndex]?.shortLabel
    : completedCount >= beadState.beads.length
      ? 'done'
      : 'queued';
  return `${progressIndex} / ${beadState.beads.length} · ${label ?? 'queued'}`;
}

interface BoardSelectedIdeaDockProps {
  idea: Idea;
  docCount: number;
  dockContent?: React.ReactNode;
  isTurnLogOpen?: boolean;
  canOpenDocs: boolean;
  canToggleTurnLog: boolean;
  canOpenInspector: boolean;
  onOpenDocs?: (ideaId: string) => void;
  onToggleTurnLog?: () => void;
  onOpenInspector?: () => void;
  onClose: () => void;
}

function BoardSelectedIdeaDock({
  idea,
  docCount,
  dockContent,
  isTurnLogOpen = false,
  canOpenDocs,
  canToggleTurnLog,
  canOpenInspector,
  onOpenDocs,
  onToggleTurnLog,
  onOpenInspector,
  onClose,
}: BoardSelectedIdeaDockProps): React.ReactElement {
  const progressSummary = summarizeIdeaProgress(idea);
  const docsLabel = `${docCount} doc${docCount === 1 ? '' : 's'}`;

  return (
    <aside
      className="bo-selected-bubble flex w-full flex-col overflow-hidden"
      aria-label="Selected note"
    >
      <div className="bo-selected-bubble__tail" aria-hidden="true" />
      <div className="bo-selected-bubble__shell">
        <div className="bo-selected-bubble__header">
          <div className="min-w-0 flex-1">
            <div className="bo-selected-bubble__who">
              <span className="bo-selected-bubble__avatar" aria-hidden="true" />
              Dev · selected note
            </div>
            <h2 className="bo-selected-bubble__title" title={idea.rawText}>
              {idea.rawText.slice(0, 84)}
              {idea.rawText.length > 84 ? '…' : ''}
            </h2>
            <div className="bo-selected-bubble__meta">
              <span>{progressSummary}</span>
              <span>·</span>
              <span className="capitalize">{idea.readiness} readiness</span>
              <span>·</span>
              <span>{docsLabel}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bo-selected-bubble__close"
            aria-label="Back to canvas"
            title="Back to canvas"
          >
            Close
          </button>
        </div>

        <div className="bo-selected-bubble__body">
          <p className="bo-selected-bubble__copy">
            {idea.rawText}
          </p>

          {idea.tags.length > 0 && (
            <div className="bo-selected-bubble__tags">
              {idea.tags.map(tag => (
                <span
                  key={tag}
                  className="bo-selected-bubble__tag"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="bo-selected-bubble__actions">
            {canOpenDocs && onOpenDocs && (
              <button
                type="button"
                onClick={() => onOpenDocs(idea.id)}
                className="bo-selected-bubble__action"
              >
                Docs
              </button>
            )}
            {canToggleTurnLog && onToggleTurnLog && (
              <button
                type="button"
                onClick={onToggleTurnLog}
                className={`bo-selected-bubble__action ${isTurnLogOpen ? 'bo-selected-bubble__action--primary' : ''}`}
              >
                {isTurnLogOpen ? 'Hide log' : 'Turn log'}
              </button>
            )}
            {canOpenInspector && onOpenInspector && (
              <button
                type="button"
                onClick={onOpenInspector}
                className="bo-selected-bubble__action"
              >
                Open inspector
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="bo-selected-bubble__action bo-selected-bubble__action--ghost"
            >
              Back to board
            </button>
          </div>

          {dockContent && (
            <div className="bo-selected-bubble__content">
              {dockContent}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
