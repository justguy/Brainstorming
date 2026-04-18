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
}

export function BoardAppView({
  header,
  showApiKeyBanner,
  onOpenOptions,
  companionRail,
  canvasStage,
  workspaceOverlays,
}: BoardAppViewProps): React.ReactElement {
  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      <AppHeaderBar {...header} />
      {showApiKeyBanner && <AppApiKeyBanner onOpenOptions={onOpenOptions} />}
      <AppCompanionRail {...companionRail} />
      <BoardCanvasStage {...canvasStage}>
        <BoardWorkspaceOverlays {...workspaceOverlays} />
      </BoardCanvasStage>
    </div>
  );
}
