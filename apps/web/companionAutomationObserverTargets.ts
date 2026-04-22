import type { FacilitatorAiAction } from '../../src/storage/facilitatorSync';
import type { Idea, IdeaCritique } from '../../src/types';

export interface PendingObserverWork {
  connectionIdeaIds: string[];
  scoutIdeaIds: string[];
}

export function reconcilePendingObserverWork(input: {
  visibleIdeas: Idea[];
  previousVisibleIdeaIds: Set<string>;
  pendingWork: PendingObserverWork;
  docCounts: Record<string, number>;
  trackNewIdeas: boolean;
}): PendingObserverWork {
  const visibleIdeaIds = new Set(input.visibleIdeas.map(idea => idea.id));
  const connectionIdeaIds = input.pendingWork.connectionIdeaIds.filter(id => visibleIdeaIds.has(id));
  const scoutIdeaIds = input.pendingWork.scoutIdeaIds.filter(
    id => visibleIdeaIds.has(id) && (input.docCounts[id] ?? 0) === 0,
  );

  if (input.trackNewIdeas) {
    for (const idea of input.visibleIdeas) {
      if (input.previousVisibleIdeaIds.has(idea.id)) continue;
      connectionIdeaIds.push(idea.id);
      if ((input.docCounts[idea.id] ?? 0) === 0) scoutIdeaIds.push(idea.id);
    }
  }

  return {
    connectionIdeaIds: [...new Set(connectionIdeaIds)],
    scoutIdeaIds: [...new Set(scoutIdeaIds)],
  };
}

export function consumeSharedObserverWork(
  pendingWork: PendingObserverWork,
  action: FacilitatorAiAction | null,
): PendingObserverWork {
  if (!action) return pendingWork;
  if (action.kind === 'connect') {
    return { ...pendingWork, connectionIdeaIds: [] };
  }
  if (action.kind === 'scout' && action.ideaId) {
    return {
      ...pendingWork,
      scoutIdeaIds: pendingWork.scoutIdeaIds.filter(id => id !== action.ideaId),
    };
  }
  return pendingWork;
}

export function selectPendingScoutIdeaId(
  scoutIdeaIds: string[],
  docCounts: Record<string, number>,
): string | null {
  return scoutIdeaIds.find(id => (docCounts[id] ?? 0) === 0) ?? null;
}

export function observerAutomationKey(kind: 'critique' | 'scout', ideaId: string): string {
  return `auto-${kind}:${ideaId}`;
}

export function selectCritiqueTarget(input: {
  visibleIdeas: Idea[];
  selectedBoardIdea: Idea | null;
  activeCritiques: IdeaCritique[];
}): Idea | null {
  const activeCritiqueIdeaIds = new Set(input.activeCritiques.map(critique => critique.ideaId));
  const candidates = input.visibleIdeas.filter(idea => idea.phase >= 4 && !activeCritiqueIdeaIds.has(idea.id));
  const selectedCandidate = input.selectedBoardIdea
    && input.selectedBoardIdea.phase >= 4
    && !activeCritiqueIdeaIds.has(input.selectedBoardIdea.id)
    ? input.selectedBoardIdea
    : null;
  return selectedCandidate ?? candidates[0] ?? null;
}
