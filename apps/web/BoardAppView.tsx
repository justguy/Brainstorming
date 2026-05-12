import React, { useEffect, useState } from 'react';
import { deriveIdeaBeadState } from '../../src/orchestrator/beadState';
import { AppApiKeyBanner } from './AppApiKeyBanner';
import { AppCompanionRail } from './AppCompanionRail';
import { AppHeaderBar } from './AppHeaderBar';
import { BoardCanvasStage } from './BoardCanvasStage';
import { BoardWorkspaceOverlays } from './BoardWorkspaceOverlays';
import { PersonaPanel } from './screens/PersonaPanel';
import { useRoute } from './routing/useRoute';
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
  /**
   * Optional handler for opening the Brief screen for the currently selected
   * idea. When provided, the selected-idea dock surfaces a small "Brief"
   * action alongside Docs / Turn log / Inspector. Wired from BoardScreen
   * through to BoardSelectedIdeaDock; left optional so existing call sites
   * (and tests) that don't need cross-screen navigation continue to compile.
   */
  onOpenBrief?: (ideaId: string) => void;
  /**
   * Bloom / Focus surface. When non-null, the host has chosen to open the
   * idea in either Bloom (in-place card) or Focus (full takeover) mode. The
   * legacy `BoardSelectedIdeaDock` is suppressed for that idea while the
   * overlay is mounted so we don't double-render selection chrome.
   */
  bloomFocusSurface?: React.ReactNode;
  /**
   * Whether the Bloom/Focus surface is currently active. When true the
   * right-side dock is suppressed; the host (BoardScreen) owns the surface.
   */
  bloomFocusActive?: boolean;
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
  onOpenBrief,
  bloomFocusSurface,
  bloomFocusActive = false,
}: BoardAppViewProps): React.ReactElement {
  const hasTurnLogPanel = Boolean(turnLogPanel);
  // Suppress the legacy dock while the Bloom/Focus surface is active so the
  // host doesn't render two competing selection chromes for the same idea.
  const hasSelectedIdeaDock = Boolean(workspaceOverlays.selectedBoardIdea) && !bloomFocusActive;
  const [route] = useRoute();
  const boardIdFromRoute = route.kind === 'board' ? route.boardId : undefined;
  const [personaDrawerOpen, setPersonaDrawerOpen] = useState(false);

  useEffect(() => {
    if (!personaDrawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPersonaDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [personaDrawerOpen]);
  const selectedIdeaDock = workspaceOverlays.selectedBoardIdea && !bloomFocusActive ? (
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
      onOpenBrief={onOpenBrief}
      onClose={workspaceOverlays.onCloseSelectedIdea}
    />
  ) : null;

  return (
    <div
      className="paper-grid bo-board-shell"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
    >
      <div style={{ position: 'absolute', inset: 0 }}>
        <BoardCanvasStage {...canvasStage}>
          {historyPanel}
          {reviewPanel}
          <BoardWorkspaceOverlays {...workspaceOverlays} />
        </BoardCanvasStage>
      </div>

      {hasTurnLogPanel && (
        <div
          className="bo-shell-backdrop"
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, background: 'rgba(26,24,20,0.18)', zIndex: 15 }}
        />
      )}
      {hasSelectedIdeaDock && (
        <div
          className="bo-shell-focus-backdrop"
          onClick={workspaceOverlays.onCloseSelectedIdea}
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, background: 'rgba(26,24,20,0.10)', zIndex: 14 }}
        />
      )}

      <div
        className="bo-shell-topbar"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 25, pointerEvents: 'none' }}
      >
        <AppHeaderBar {...header} />
        {showApiKeyBanner && (
          <div style={{ pointerEvents: 'auto', padding: '0 16px' }}>
            <AppApiKeyBanner onOpenOptions={onOpenOptions} />
          </div>
        )}
      </div>

      {beadStrip && (
        <section
          className="bo-shell-home bo-shell-home-bead"
          aria-label="Bead strip home"
          style={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 18 }}
        >
          {beadStrip}
        </section>
      )}

      {selectedIdeaDock && (
        <section
          className="bo-shell-home bo-shell-home-focus"
          aria-label="Selected note home"
          style={{ position: 'absolute', right: 16, top: 96, bottom: 16, width: 'min(420px, 32vw)', zIndex: 22 }}
        >
          {selectedIdeaDock}
        </section>
      )}

      <section
        className="bo-shell-home bo-shell-home-persona"
        aria-label="Persona dock home"
        style={{ position: 'absolute', left: 16, bottom: 16, zIndex: 18, maxWidth: 380 }}
      >
        <AppCompanionRail {...companionRail} />
      </section>

      {discardPile && (
        <section
          className="bo-shell-home bo-shell-home-discard"
          aria-label="Discard pile home"
          style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 18 }}
        >
          {discardPile}
        </section>
      )}

      {hasTurnLogPanel && (
        <section
          className="bo-shell-home bo-shell-home-turn-log"
          aria-label="Turn log home"
          style={{ position: 'absolute', right: 16, top: 96, bottom: 16, width: 'min(460px, 36vw)', zIndex: 24 }}
        >
          {turnLogPanel}
        </section>
      )}

      {peerStrip && (
        <section
          className="bo-shell-home bo-shell-home-peers"
          aria-label="Peer chip row home"
          style={{ position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 19 }}
        >
          {peerStrip}
        </section>
      )}

      {extraOverlays}

      {bloomFocusSurface}

      <button
        type="button"
        className="icon-btn"
        aria-label={personaDrawerOpen ? 'Close personas panel' : 'Open personas panel'}
        aria-expanded={personaDrawerOpen}
        title="Personas"
        onClick={() => setPersonaDrawerOpen(open => !open)}
        style={{ position: 'absolute', top: 72, left: 16, zIndex: 26 }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19c.6-3 3-4.6 5.5-4.6S14 16 14.5 19" />
          <circle cx="16.5" cy="6.5" r="2.4" />
          <path d="M14 12.4c.7-.4 1.6-.6 2.5-.6 2 0 3.7 1.2 4.2 3.1" />
        </svg>
      </button>

      {personaDrawerOpen && (
        <div
          role="presentation"
          aria-hidden="true"
          onClick={() => setPersonaDrawerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(26,24,20,0.25)',
            zIndex: 40,
          }}
        />
      )}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Personas panel"
        aria-hidden={!personaDrawerOpen}
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: 'min(440px, 42vw)',
          background: 'var(--paper)',
          borderLeft: '2px solid var(--ink)',
          boxShadow: personaDrawerOpen ? '-6px 0 0 rgba(26,24,20,0.18)' : 'none',
          transform: personaDrawerOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 240ms ease',
          zIndex: 41,
          overflowY: 'auto',
          pointerEvents: personaDrawerOpen ? 'auto' : 'none',
        }}
      >
        <div
          style={{
            position: 'sticky',
            top: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 16px',
            background: 'var(--paper)',
            borderBottom: '1.5px solid var(--ink)',
            zIndex: 1,
          }}
        >
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            In the room
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close personas panel"
            onClick={() => setPersonaDrawerOpen(false)}
          >
            ×
          </button>
        </div>
        {personaDrawerOpen && <PersonaPanel boardId={boardIdFromRoute} />}
      </aside>
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
  onOpenBrief?: (ideaId: string) => void;
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
  onOpenBrief,
  onClose,
}: BoardSelectedIdeaDockProps): React.ReactElement {
  const progressSummary = summarizeIdeaProgress(idea);
  const docsLabel = `${docCount} doc${docCount === 1 ? '' : 's'}`;

  return (
    <aside
      className="bo-selected-bubble"
      aria-label="Selected note"
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--paper)',
        border: '2px solid var(--ink)',
        borderRadius: 12,
        boxShadow: '3px 3px 0 var(--ink)',
      }}
    >
      <div className="bo-selected-bubble__tail" aria-hidden="true" />
      <div
        className="bo-selected-bubble__shell"
        style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
      >
        <div
          className="bo-selected-bubble__header"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '12px 14px',
            borderBottom: '1.5px solid var(--hairline)',
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              className="bo-selected-bubble__who"
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--ink-faint)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span className="bo-selected-bubble__avatar" aria-hidden="true" />
              Dev · selected note
            </div>
            <h2
              className="bo-selected-bubble__title"
              title={idea.rawText}
              style={{
                fontFamily: 'var(--f-hand)',
                fontSize: 22,
                lineHeight: 1.15,
                margin: '4px 0 4px',
                color: 'var(--ink)',
              }}
            >
              {idea.rawText.slice(0, 84)}
              {idea.rawText.length > 84 ? '…' : ''}
            </h2>
            <div
              className="bo-selected-bubble__meta"
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--ink-soft)',
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <span>{progressSummary}</span>
              <span>·</span>
              <span style={{ textTransform: 'capitalize' }}>{idea.readiness} readiness</span>
              <span>·</span>
              <span>{docsLabel}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn bo-selected-bubble__close"
            aria-label="Back to canvas"
            title="Back to canvas"
          >
            ×
          </button>
        </div>

        <div
          className="bo-selected-bubble__body"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '12px 14px',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          <p
            className="bo-selected-bubble__copy"
            style={{ margin: 0, fontFamily: 'var(--f-hand-body)', color: 'var(--ink)', lineHeight: 1.4 }}
          >
            {idea.rawText}
          </p>

          {idea.tags.length > 0 && (
            <div
              className="bo-selected-bubble__tags"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
            >
              {idea.tags.map(tag => (
                <span
                  key={tag}
                  className="bo-selected-bubble__tag"
                  style={{
                    fontFamily: 'var(--f-mono)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    padding: '3px 8px',
                    border: '1.5px solid var(--ink)',
                    borderRadius: 6,
                    color: 'var(--ink-soft)',
                    background: 'var(--paper)',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div
            className="bo-selected-bubble__actions"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
          >
            {canOpenDocs && onOpenDocs && (
              <button
                type="button"
                onClick={() => onOpenDocs(idea.id)}
                className="btn sm bo-selected-bubble__action"
              >
                Docs
              </button>
            )}
            {canToggleTurnLog && onToggleTurnLog && (
              <button
                type="button"
                onClick={onToggleTurnLog}
                className={`btn sm bo-selected-bubble__action ${isTurnLogOpen ? 'primary bo-selected-bubble__action--primary' : ''}`}
              >
                {isTurnLogOpen ? 'Hide log' : 'Turn log'}
              </button>
            )}
            {canOpenInspector && onOpenInspector && (
              <button
                type="button"
                onClick={onOpenInspector}
                className="btn sm bo-selected-bubble__action"
              >
                Open inspector
              </button>
            )}
            {onOpenBrief && (
              <button
                type="button"
                onClick={() => onOpenBrief(idea.id)}
                className="btn sm bo-selected-bubble__action"
                title="Open the Brief for this idea"
                aria-label="Open brief for this idea"
              >
                ↗ Brief
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn sm ghost bo-selected-bubble__action bo-selected-bubble__action--ghost"
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
