import React from 'react';
import Canvas, { type CanvasProps } from '../../src/canvas/Canvas';
import {
  CritiqueCardsLayer,
  type CritiqueCardsLayerProps,
} from '../../src/canvas/CritiqueCardsLayer';
import type { IdeaCritique } from '../../src/types';

type CritiqueBusyByIdea = Record<string, boolean | null | undefined>;

export interface BoardCanvasStageProps extends Omit<CanvasProps, 'overlayContent'> {
  children?: React.ReactNode;
  critiques: IdeaCritique[];
  critiqueBusyByIdea?: CritiqueBusyByIdea;
  critiqueFocusIdeaId?: string | null;
  hoverIdeaId?: string | null;
  editingIdeaId?: string | null;
  animatedCritiqueIds?: string[];
  onAcceptCritique?: CritiqueCardsLayerProps['onAccept'];
  onDismissCritique?: CritiqueCardsLayerProps['onDismiss'];
}

function getBusyIdeaIds(critiqueBusyByIdea: CritiqueBusyByIdea | undefined): string[] {
  if (!critiqueBusyByIdea) return [];

  return Object.entries(critiqueBusyByIdea)
    .filter(([, busy]) => Boolean(busy))
    .map(([ideaId]) => ideaId);
}

export function BoardCanvasStage({
  children,
  critiques,
  critiqueBusyByIdea,
  critiqueFocusIdeaId = null,
  hoverIdeaId = null,
  editingIdeaId = null,
  animatedCritiqueIds = [],
  suppressAnimations = false,
  onAcceptCritique,
  onDismissCritique,
  ideas,
  ...canvasProps
}: BoardCanvasStageProps): React.ReactElement {
  const busyIdeaIds = getBusyIdeaIds(critiqueBusyByIdea);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <main className="h-full w-full overflow-hidden" aria-label="Canvas">
        <Canvas
          {...canvasProps}
          ideas={ideas}
          suppressAnimations={suppressAnimations}
          overlayContent={
            <CritiqueCardsLayer
              ideas={ideas}
              critiques={critiques}
              busyIdeaIds={busyIdeaIds}
              activeIdeaId={critiqueFocusIdeaId}
              hoveredIdeaId={hoverIdeaId}
              editingIdeaId={editingIdeaId}
              animatedCritiqueIds={animatedCritiqueIds}
              suppressAnimations={suppressAnimations}
              onAccept={onAcceptCritique}
              onDismiss={onDismissCritique}
            />
          }
        />
      </main>
      {children}
    </div>
  );
}
