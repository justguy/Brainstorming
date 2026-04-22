import React from 'react';
import type { Idea } from '../../src/types';
import {
  CaptureIdeaPopover,
  type CaptureIdeaPopoverProps,
} from './CaptureIdeaPopover';

export interface BoardWorkspaceOverlaysProps {
  ideas: Idea[];
  selectedBoardIdea: Idea | null;
  docCounts: Record<string, number>;
  capturePopover: CaptureIdeaPopoverProps;
  docsPanel?: React.ReactNode;
  selectedIdeaDockContent?: React.ReactNode;
  inspectorContent?: React.ReactNode;
  isInspectorOpen: boolean;
  isTurnLogOpen?: boolean;
  onToggleTurnLog?: () => void;
  onOpenDocs?: (ideaId: string) => void;
  onOpenInspector?: () => void;
  onCloseInspector: () => void;
  onCloseSelectedIdea: () => void;
}

export function BoardWorkspaceOverlays({
  selectedBoardIdea,
  docCounts,
  capturePopover,
  docsPanel,
  selectedIdeaDockContent,
  inspectorContent,
  isInspectorOpen,
  isTurnLogOpen = false,
  onToggleTurnLog,
  onOpenDocs,
  onOpenInspector,
  onCloseInspector,
  onCloseSelectedIdea,
}: BoardWorkspaceOverlaysProps): React.ReactElement {
  return (
    <>
      <CaptureIdeaPopover {...capturePopover} />

      {docsPanel}

      {isInspectorOpen && inspectorContent && (
        <>
          <div
            className="bo-inspector-backdrop"
            onClick={onCloseInspector}
            aria-hidden="true"
          />
          <div className="bo-inspector-drawer-wrap" aria-label="Inspector">
            <div className="bo-inspector-drawer-shell">
              {inspectorContent}
            </div>
          </div>
        </>
      )}
    </>
  );
}
