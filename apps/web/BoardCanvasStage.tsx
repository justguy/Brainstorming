import React from 'react';
import Canvas, { type CanvasProps } from '../../src/canvas/ReactFlowCanvas';
import {
  CritiqueCardsLayer,
  type CritiqueCardsLayerProps,
} from '../../src/canvas/CritiqueCardsLayer';
import { ClarificationBoardOverlay } from '../../src/canvas/ClarificationBoardOverlay';
import { IdeaAttentionLayer } from '../../src/canvas/IdeaAttentionLayer';
import type { Idea, IdeaCritique } from '../../src/types';

type CritiqueBusyByIdea = Record<string, boolean | null | undefined>;

export interface BoardCanvasStageProps extends Omit<CanvasProps, 'overlayContent'> {
  children?: React.ReactNode;
  critiques: IdeaCritique[];
  critiqueBusyByIdea?: CritiqueBusyByIdea;
  critiqueFocusIdeaId?: string | null;
  selectedIdeaId?: string | null;
  hoverIdeaId?: string | null;
  editingIdeaId?: string | null;
  animatedCritiqueIds?: string[];
  onAcceptCritique?: CritiqueCardsLayerProps['onAccept'];
  onDismissCritique?: CritiqueCardsLayerProps['onDismiss'];
  onIdeaUpdate?: (updated: Idea) => void;
  onActivateAttentionItem?: (input: { ideaId: string; attentionId: string }) => void;
  showClarificationOverlay?: boolean;
}

function getBusyIdeaIds(critiqueBusyByIdea: CritiqueBusyByIdea | undefined): string[] {
  if (!critiqueBusyByIdea) return [];

  return Object.entries(critiqueBusyByIdea)
    .filter(([, busy]) => Boolean(busy))
    .map(([ideaId]) => ideaId);
}

export function BoardCanvasStage({
  children,
  boardTheme,
  critiques,
  critiqueBusyByIdea,
  critiqueFocusIdeaId = null,
  selectedIdeaId = null,
  hoverIdeaId = null,
  editingIdeaId = null,
  animatedCritiqueIds = [],
  suppressAnimations = false,
  onAcceptCritique,
  onDismissCritique,
  onIdeaUpdate,
  onActivateAttentionItem,
  showClarificationOverlay = true,
  ideas,
  ...canvasProps
}: BoardCanvasStageProps): React.ReactElement {
  const busyIdeaIds = getBusyIdeaIds(critiqueBusyByIdea);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <main className="h-full w-full overflow-hidden" aria-label="Canvas">
        <Canvas
          {...canvasProps}
          boardTheme={boardTheme}
          ideas={ideas}
          selectedIdeaId={selectedIdeaId}
          suppressAnimations={suppressAnimations}
          overlayContent={
            <BoardCanvasOverlayStack
              boardTheme={boardTheme}
              ideas={ideas}
              critiques={critiques}
              busyIdeaIds={busyIdeaIds}
              activeIdeaId={critiqueFocusIdeaId}
              hoveredIdeaId={hoverIdeaId}
              editingIdeaId={editingIdeaId}
              animatedCritiqueIds={animatedCritiqueIds}
              suppressAnimations={suppressAnimations}
              selectedIdeaId={selectedIdeaId}
              onAcceptCritique={onAcceptCritique}
              onDismissCritique={onDismissCritique}
              onIdeaUpdate={onIdeaUpdate}
              onActivateAttentionItem={onActivateAttentionItem}
              showClarificationOverlay={showClarificationOverlay}
            />
          }
        />
      </main>
      {children}
    </div>
  );
}

interface BoardCanvasOverlayStackProps {
  boardTheme: BoardCanvasStageProps['boardTheme'];
  ideas?: Idea[];
  critiques: IdeaCritique[];
  busyIdeaIds: string[];
  activeIdeaId: string | null;
  hoveredIdeaId: string | null;
  editingIdeaId: string | null;
  animatedCritiqueIds: string[];
  suppressAnimations: boolean;
  selectedIdeaId: string | null;
  onAcceptCritique?: CritiqueCardsLayerProps['onAccept'];
  onDismissCritique?: CritiqueCardsLayerProps['onDismiss'];
  onIdeaUpdate?: (updated: Idea) => void;
  onActivateAttentionItem?: (input: { ideaId: string; attentionId: string }) => void;
  showClarificationOverlay: boolean;
}

function BoardCanvasOverlayStack({
  boardTheme,
  ideas = [],
  critiques,
  busyIdeaIds,
  activeIdeaId,
  hoveredIdeaId,
  editingIdeaId,
  animatedCritiqueIds,
  suppressAnimations,
  selectedIdeaId,
  onAcceptCritique,
  onDismissCritique,
  onIdeaUpdate,
  onActivateAttentionItem,
  showClarificationOverlay,
}: BoardCanvasOverlayStackProps): React.ReactElement {
  return (
    <>
      <IdeaAttentionLayer
        ideas={ideas}
        critiques={critiques}
        onActivate={input => onActivateAttentionItem?.(input)}
      />
      {showClarificationOverlay && selectedIdeaId && onIdeaUpdate ? (
        <ClarificationBoardOverlay
          ideas={ideas}
          selectedIdeaId={selectedIdeaId}
          onIdeaUpdate={onIdeaUpdate}
        />
      ) : null}
      <CritiqueCardsLayer
        boardTheme={boardTheme}
        ideas={ideas}
        critiques={critiques}
        busyIdeaIds={busyIdeaIds}
        activeIdeaId={activeIdeaId}
        hoveredIdeaId={hoveredIdeaId}
        editingIdeaId={editingIdeaId}
        animatedCritiqueIds={animatedCritiqueIds}
        suppressAnimations={suppressAnimations}
        onAccept={onAcceptCritique}
        onDismiss={onDismissCritique}
      />
    </>
  );
}
