import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { BeatName } from '../../src/beats/types';
import type { FacilitatorAiAction } from '../../src/storage/facilitatorSync';
import type { ActivityState, ActivityKind } from './softMode';

export type MeaningfulActivity = { kind: ActivityKind | null; at: number };

export interface RecentAiAction {
  kind: Extract<BeatName, 'connect' | 'scout' | 'critique'>;
  createdAt: number;
  ideaId?: string;
}

export interface AutoCooldownState {
  lastConnectionsAt: number;
  lastScoutAt: number;
  lastAiActionAt: number;
  lastObservedBoardChangeAt: number;
  critiqueByIdea: Record<string, number>;
}

export function actionLabelFor(mode: 'explore' | 'structure' | 'stress' | 'converge', hasCritiqueTarget: boolean): string | undefined {
  switch (mode) {
    case 'explore':
      return 'Run scout';
    case 'structure':
      return 'Find links';
    case 'stress':
      return hasCritiqueTarget ? 'Stress-test idea' : undefined;
    case 'converge':
    default:
      return undefined;
  }
}

export function recordAiAction(
  autoCooldownRef: MutableRefObject<AutoCooldownState>,
  setAiActions: Dispatch<SetStateAction<RecentAiAction[]>>,
  kind: RecentAiAction['kind'],
  ideaId?: string,
  createdAt = Date.now(),
): void {
  const action: RecentAiAction = { kind, createdAt, ...(ideaId ? { ideaId } : {}) };
  applySharedAiAction(autoCooldownRef, { kind, at: createdAt, ...(ideaId ? { ideaId } : {}) });
  setAiActions(prev => [action, ...prev].slice(0, 5));
}

export function applySharedAiAction(
  autoCooldownRef: MutableRefObject<AutoCooldownState>,
  action: Pick<FacilitatorAiAction, 'kind' | 'at' | 'ideaId'> | null,
): void {
  if (!action) return;
  autoCooldownRef.current.lastAiActionAt = Math.max(autoCooldownRef.current.lastAiActionAt, action.at);
  if (action.kind === 'connect') {
    autoCooldownRef.current.lastConnectionsAt = Math.max(autoCooldownRef.current.lastConnectionsAt, action.at);
  }
  if (action.kind === 'scout') {
    autoCooldownRef.current.lastScoutAt = Math.max(autoCooldownRef.current.lastScoutAt, action.at);
  }
  if (action.kind === 'critique' && action.ideaId) {
    autoCooldownRef.current.critiqueByIdea[action.ideaId] = Math.max(
      autoCooldownRef.current.critiqueByIdea[action.ideaId] ?? 0,
      action.at,
    );
  }
}

export function latestMeaningfulActivity(activity: ActivityState): MeaningfulActivity {
  const latestEntries: MeaningfulActivity[] = [
    { kind: 'edit', at: activity.recentEdits.at(-1) ?? 0 },
    { kind: 'group', at: activity.recentGroups.at(-1) ?? 0 },
    { kind: 'doc', at: activity.recentDocs.at(-1) ?? 0 },
  ];
  return latestEntries.reduce<MeaningfulActivity>(
    (latest, entry) => (entry.at > latest.at ? entry : latest),
    { kind: null, at: 0 },
  );
}
