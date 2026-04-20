import type {
  BoardId,
  Connection,
  Idea,
  IdeaInsight,
  IdeaCritique,
  IdeaGroup,
  LlmMessage,
  ScoutSuggestion,
  Settings,
  SupportingDoc,
} from '../types';
import type {
  BeatClusterHint,
  BeatConfidence,
  BeatName,
  BeatSize,
  BeatSourceRef,
  BeatTrigger,
} from '../beats/types';

export const DEFAULT_BOARD_ID: BoardId = 'local-board';
export const DEFAULT_BOARD_TITLE = 'Main Board';
export const BOARD_DATA_VERSION = 1;

export interface BoardRecord {
  id: BoardId;
  title: string;
  createdAt: number;
  updatedAt: number;
  dataVersion: number;
  changeCursor: number;
  nextChangeSeq: number;
}

export interface IdeaTurnRecord {
  id: string;
  boardId: BoardId;
  ideaId: string;
  sequence: number;
  role: LlmMessage['role'];
  content: string;
  createdAt: number;
}

export interface BoardTweaksRecord {
  id: string;
  boardId: BoardId;
  values: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface BeatRunRecord {
  id: string;
  boardId: BoardId;
  beat: BeatName;
  roleId: string;
  usedFallback: boolean;
  startedAt: number;
  finishedAt: number;
  trigger: BeatTrigger;
  size: BeatSize;
  focusIdeaId?: string;
  ok: boolean;
  reason?: string;
  proposal: unknown;
}

export type BeatReviewSessionStatus = 'open' | 'resolved';
export type BeatReviewItemStatus = 'pending' | 'kept' | 'scratched';

export interface BeatReviewAffectedRef {
  kind: BeatSourceRef['kind'] | 'group' | 'suggestion' | 'structure';
  id: string;
  label?: string;
}

export interface BeatReviewDecisionRecord {
  status: BeatReviewItemStatus;
  decidedAt: number;
  actor: 'user' | 'ai' | 'tool' | 'system';
  note?: string;
}

export interface BeatReviewRunProvenance {
  beatRunId: string;
  beat: BeatName;
  roleId: string;
  usedFallback: boolean;
  trigger: BeatTrigger;
  size: BeatSize;
  startedAt: number;
  finishedAt: number;
  focusIdeaId?: string;
}

export interface BeatReviewTombstone {
  scratchedAt: number;
  note?: string;
}

export interface BeatReviewSessionRecord {
  id: string;
  boardId: BoardId;
  beatRunId: string;
  beat: BeatName;
  roleId: string;
  usedFallback: boolean;
  trigger: BeatTrigger;
  size: BeatSize;
  focusIdeaId?: string;
  title: string;
  summary: string;
  status: BeatReviewSessionStatus;
  itemIds: string[];
  startedAt: number;
  finishedAt: number;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  pendingCount?: number;
  keptCount?: number;
  scratchedCount?: number;
  proposalKeys?: string[];
  rawProposal?: unknown;
  provenance?: BeatReviewRunProvenance;
}

interface BeatReviewCandidateBaseRecord {
  label: string;
  summary: string;
  detail?: string;
  confidence?: BeatConfidence;
  affectedIdeaIds: string[];
  affectedStructureIds?: string[];
  sources: BeatSourceRef[];
  payload: unknown;
  affectedRefs?: BeatReviewAffectedRef[];
  collectionKey?: string;
  position?: number;
  rawProposal?: unknown;
}

export interface BeatReviewClusterHintCandidateRecord extends BeatReviewCandidateBaseRecord {
  kind: 'cluster_hint';
  payload: BeatClusterHint;
}

export interface BeatReviewIdeaInsightCandidateRecord extends BeatReviewCandidateBaseRecord {
  kind: 'idea_insight';
  payload: {
    summary: string;
    targetIdeaIds: string[];
    insight: IdeaInsight;
  };
}

export interface BeatReviewIdeaSpawnCandidateRecord extends BeatReviewCandidateBaseRecord {
  kind: 'idea_spawn';
  payload: {
    rawText: string;
    tags: string[];
    insights: IdeaInsight[];
  };
}

export type BeatReviewCandidateRecord =
  | BeatReviewClusterHintCandidateRecord
  | BeatReviewIdeaInsightCandidateRecord
  | BeatReviewIdeaSpawnCandidateRecord;

export interface BeatReviewItemRecord {
  id: string;
  boardId: BoardId;
  sessionId: string;
  beatRunId: string;
  beat: BeatName;
  status: BeatReviewItemStatus;
  candidate: BeatReviewCandidateRecord;
  createdAt: number;
  updatedAt: number;
  reviewedAt?: number;
  provenance?: BeatReviewRunProvenance;
  decisionHistory?: BeatReviewDecisionRecord[];
  keptAt?: number;
  scratchedAt?: number;
  tombstone?: BeatReviewTombstone;
}

export interface SettingsRecord {
  id: string;
  value: Settings;
  createdAt: number;
  updatedAt: number;
  migratedFrom?: 'chrome.storage.local' | 'localStorage';
}

export interface BoardDocument {
  board: BoardRecord;
  ideas: Idea[];
  groups: IdeaGroup[];
  docs: SupportingDoc[];
  suggestions: ScoutSuggestion[];
  critiques: IdeaCritique[];
  connections: Connection[];
  beatRuns: BeatRunRecord[];
  beatReviewSessions: BeatReviewSessionRecord[];
  beatReviewItems: BeatReviewItemRecord[];
  tweaks: BoardTweaksRecord | null;
}

export type BoardStoreName =
  | 'boards'
  | 'ideas'
  | 'groups'
  | 'docs'
  | 'suggestions'
  | 'critiques'
  | 'connections'
  | 'beatReviewSessions'
  | 'beatReviewItems'
  | 'tweaks';

export type BoardPatchOp =
  | {
      op: 'add' | 'replace';
      path: `/stores/${BoardStoreName}/${string}`;
      value: unknown;
    }
  | {
      op: 'remove';
      path: `/stores/${BoardStoreName}/${string}`;
    };

export interface ChangeActor {
  type: 'user' | 'ai' | 'tool' | 'system';
  source: 'canvas' | 'webmcp' | 'workspace' | 'beat' | 'system';
  beat?: BeatName;
  label?: string;
}

export type ChangeSetKind =
  | 'capture_idea'
  | 'move_idea'
  | 'discard_idea'
  | 'restore_idea'
  | 'update_tweaks'
  | 'update_idea'
  | 'merge_ideas'
  | 'group_ideas'
  | 'ungroup_idea'
  | 'set_group_theme'
  | 'dismiss_critique'
  | 'create_critique'
  | 'create_suggestion'
  | 'elaborate_suggestion'
  | 'admit_suggestion'
  | 'create_doc'
  | 'update_doc'
  | 'delete_doc'
  | 'replace_connections'
  | 'create_beat_review_session'
  | 'keep_beat_review_item'
  | 'scratch_beat_review_item'
  | 'dismiss_suggestion'
  | 'ai_undo';

export type ChangeSetStatus = 'committed' | 'undone' | 'superseded';

export interface ChangeSetRecord {
  id: string;
  boardId: BoardId;
  seq: number;
  baseSeq: number;
  kind: ChangeSetKind;
  actor: ChangeActor;
  summary: string;
  affected: Array<{ store: BoardStoreName; id: string }>;
  forward: BoardPatchOp[];
  inverse: BoardPatchOp[];
  committedAt: number;
  status: ChangeSetStatus;
  beatRunId?: string;
  undoneAt?: number;
}
