import type { BoardId, ConnectionKind, ConnectionStrength, CritiqueStatus } from '../types';

export const BEAT_NAMES = ['scout', 'connect', 'critique', 'cluster', 'summarise'] as const;

export type BeatName = typeof BEAT_NAMES[number];
export type BeatTrigger = 'manual' | 'automatic';
export type BeatSize = 'small' | 'big';
export type BeatAggressiveness = 'gentle' | 'balanced' | 'aggressive';
export type BeatConfidence = 'low' | 'medium' | 'high';

export interface BeatRunMeta {
  runId: string;
  beat: BeatName;
  roleId: string;
  usedFallback: boolean;
  startedAt: number;
  finishedAt: number;
  trigger: BeatTrigger;
  size: BeatSize;
  focusIdeaId?: string;
}

export interface BeatSourceRef {
  kind: 'idea' | 'doc' | 'critique' | 'connection' | 'group';
  id: string;
  label?: string;
}

export interface BeatIdeaSnapshot {
  id: string;
  rawText: string;
  tags: string[];
  killed: boolean;
  groupId?: string;
}

export interface BeatSupportingDocSnapshot {
  id: string;
  ideaId: string;
  title: string;
  summary?: string;
  facts: string[];
}

export interface BeatCritiqueSnapshot {
  id: string;
  ideaId: string;
  critique: string;
  evidenceAsk: string;
  status: CritiqueStatus;
}

export interface BeatConnectionSnapshot {
  id: string;
  kind: ConnectionKind;
  ideaIds: string[];
  supportingDocIds?: string[];
  rationale: string;
  strength: ConnectionStrength;
}

export interface BeatGroupSnapshot {
  id: string;
  theme?: string;
  sharedQuestion?: string;
  ideaIds: string[];
}

interface BeatContextBase<TBeat extends BeatName> {
  beat: TBeat;
  boardId: BoardId;
  boardTitle?: string;
  aggressiveness: BeatAggressiveness;
  turnsUsed: number;
  trigger: BeatTrigger;
  size: BeatSize;
}

export interface ScoutBeatContext extends BeatContextBase<'scout'> {
  liveIdeas: BeatIdeaSnapshot[];
  discardedIdeas: BeatIdeaSnapshot[];
  supportingDocs: BeatSupportingDocSnapshot[];
  priorSuggestionTexts: {
    active: string[];
    dismissed: string[];
  };
}

export interface ConnectBeatContext extends BeatContextBase<'connect'> {
  liveIdeas: BeatIdeaSnapshot[];
  discardedIdeas: BeatIdeaSnapshot[];
  supportingDocs: BeatSupportingDocSnapshot[];
}

export interface CritiqueBeatContext extends BeatContextBase<'critique'> {
  focusIdeaId: string;
  liveIdeas: BeatIdeaSnapshot[];
  supportingDocs: BeatSupportingDocSnapshot[];
  existingCritiques: BeatCritiqueSnapshot[];
}

export interface ClusterBeatContext extends BeatContextBase<'cluster'> {
  liveIdeas: BeatIdeaSnapshot[];
  connections: BeatConnectionSnapshot[];
}

export interface SummariseBeatContext extends BeatContextBase<'summarise'> {
  liveIdeas: BeatIdeaSnapshot[];
  groups: BeatGroupSnapshot[];
  connections: BeatConnectionSnapshot[];
}

export type BeatContextMap = {
  scout: ScoutBeatContext;
  connect: ConnectBeatContext;
  critique: CritiqueBeatContext;
  cluster: ClusterBeatContext;
  summarise: SummariseBeatContext;
};

interface BeatProposalBase {
  confidence: BeatConfidence;
  sources: BeatSourceRef[];
}

export interface ScoutBeatSuggestion extends BeatProposalBase {
  rawText: string;
  rationale: string;
  source: string;
  relatedIdeaIds?: string[];
}

export interface BeatConnectionProposal extends BeatProposalBase {
  kind: ConnectionKind;
  ideaIds: string[];
  supportingDocIds?: string[];
  rationale: string;
  strength: ConnectionStrength;
}

export interface BeatCritiqueChallenge extends BeatProposalBase {
  id: string;
  critique: string;
  evidenceAsk: string;
}

export interface BeatClusterHint extends BeatProposalBase {
  ideaIds: string[];
  theme: string;
  sharedQuestion: string;
}

export interface BeatSummaryProposal extends BeatProposalBase {
  summary: string;
  relatedIdeaIds: string[];
  relatedGroupIds?: string[];
}

export type BeatProposalMap = {
  scout: { suggestions: ScoutBeatSuggestion[] };
  connect: { connections: BeatConnectionProposal[] };
  critique: { challenges: BeatCritiqueChallenge[] };
  cluster: { hints: BeatClusterHint[] };
  summarise: { summaries: BeatSummaryProposal[] };
};

export type BeatResult<T extends BeatName> =
  | {
      ok: true;
      beat: T;
      meta: BeatRunMeta;
      proposal: BeatProposalMap[T];
    }
  | {
      ok: false;
      beat: T;
      meta: BeatRunMeta;
      proposal: null;
      reason?: string;
    };

export interface BeatRunState {
  beat: BeatName;
  trigger: BeatTrigger;
  size: BeatSize;
  status: 'running' | 'failed';
  startedAt: number;
  focusIdeaId?: string;
}
