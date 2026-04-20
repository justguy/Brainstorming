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
  historyPanel,
  reviewPanel,
}: BoardAppViewProps): React.ReactElement {
  return (
    <div className="bo-board-shell flex h-screen min-h-0 flex-col overflow-hidden">
      <AppHeaderBar {...header} />
      {showApiKeyBanner && <AppApiKeyBanner onOpenOptions={onOpenOptions} />}
      <div className="min-h-0 flex flex-1 flex-col lg:flex-row">
        <BoardCanvasStage {...canvasStage}>
          {historyPanel}
          {reviewPanel}
          <BoardWorkspaceOverlays {...workspaceOverlays} />
        </BoardCanvasStage>

        <aside className="shrink-0 overflow-hidden border-t border-slate-200/60 lg:min-h-0 lg:w-[24rem] lg:border-l lg:border-t-0">
          <AppCompanionRail {...companionRail} />
        </aside>
      </div>
    </div>
  );
}
