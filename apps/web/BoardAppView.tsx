import React from 'react';
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
  discardPile,
  turnLogPanel,
  peerStrip,
  historyPanel,
  reviewPanel,
}: BoardAppViewProps): React.ReactElement {
  const hasTurnLogPanel = Boolean(turnLogPanel);

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

      <div className="bo-shell-topbar">
        <AppHeaderBar {...header} />
      </div>

      {beadStrip && (
        <section className="bo-shell-home bo-shell-home-bead" aria-label="Bead strip home">
          {beadStrip}
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
    </div>
  );
}
