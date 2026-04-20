import React from 'react';
import { AppApiKeyBanner } from './AppApiKeyBanner';
import { AppCompanionRail } from './AppCompanionRail';
import { AppHeaderBar } from './AppHeaderBar';
import { BoardCanvasStage } from './BoardCanvasStage';
import { BoardWorkspaceOverlays } from './BoardWorkspaceOverlays';

interface BoardAppViewProps {
  header: React.ComponentProps<typeof AppHeaderBar>;
  showApiKeyBanner: boolean;
  onOpenOptions: () => void;
  companionRail: React.ComponentProps<typeof AppCompanionRail>;
  canvasStage: React.ComponentProps<typeof BoardCanvasStage>;
  workspaceOverlays: React.ComponentProps<typeof BoardWorkspaceOverlays>;
  beadStrip?: React.ReactNode;
  rulesRibbon?: React.ReactNode;
  discardPile?: React.ReactNode;
  turnLogPanel?: React.ReactNode;
  peerStrip?: React.ReactNode;
  historyPanel?: React.ReactNode;
  reviewPanel?: React.ReactNode;
}

export function BoardAppView({
  header,
  showApiKeyBanner,
  onOpenOptions,
  companionRail,
  canvasStage,
  workspaceOverlays,
  beadStrip,
  rulesRibbon,
  discardPile,
  turnLogPanel,
  peerStrip,
  historyPanel,
  reviewPanel,
}: BoardAppViewProps): React.ReactElement {
  return (
    <div className="bo-board-shell flex h-screen min-h-0 flex-col overflow-hidden">
      <AppHeaderBar {...header} />
      {showApiKeyBanner && <AppApiKeyBanner onOpenOptions={onOpenOptions} />}
      <div className="bo-canvas-shell min-h-0 flex-1">
        <div className="bo-shell-canvas relative h-full w-full overflow-hidden">
          <BoardCanvasStage {...canvasStage}>
            {historyPanel}
            {reviewPanel}
            <BoardWorkspaceOverlays {...workspaceOverlays} />
          </BoardCanvasStage>

          {rulesRibbon && (
            <div className="bo-shell-rules">{rulesRibbon}</div>
          )}

          <section className="bo-shell-home bo-shell-home-bead" aria-label="Bead strip home">
            {beadStrip ?? <span className="bo-slot-label">Bead strip</span>}
          </section>

          <section className="bo-shell-home bo-shell-home-persona" aria-label="Persona dock home">
            <div className="bo-shell-home-frame">
              <span className="bo-slot-label">Persona dock</span>
              <AppCompanionRail {...companionRail} />
            </div>
          </section>

          <section className="bo-shell-home bo-shell-home-discard" aria-label="Discard pile home">
            {discardPile ?? <span className="bo-slot-label">Discard pile</span>}
          </section>

          {turnLogPanel && (
            <section className="bo-shell-home bo-shell-home-turn-log" aria-label="Turn log home">
              {turnLogPanel}
            </section>
          )}

          <section className="bo-shell-home bo-shell-home-peers" aria-label="Peer chip row home">
            {peerStrip ?? <span className="bo-slot-label">Peer chip row</span>}
          </section>
        </div>
      </div>
    </div>
  );
}
