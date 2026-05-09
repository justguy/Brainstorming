import type {
  BoardId,
  Connection,
  Idea,
  IdeaInsight,
  IdeaCritique,
  IdeaGroup,
  LlmMessage,
  ProjectId,
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

// M1 / bo-110: screens-v2 lifecycle for a board. 'active' is the working
// state, 'shelved' is paused/archived but recoverable, 'shipped' means a
// brief graduated and the board's primary work is done.
export type BoardStatus = 'active' | 'shelved' | 'shipped';

export interface BoardRecord {
  id: BoardId;
  title: string;
  createdAt: number;
  updatedAt: number;
  dataVersion: number;
  changeCursor: number;
  nextChangeSeq: number;
  // M0 / bo-102: introduce a Project layer above Board. The default workspace
  // back-fills `projectId: 'local-project'` via the v11 migration.
  projectId?: ProjectId;
  // --- M1 / bo-110 screens-v2 widening (all optional for back-compat) ---
  // Older v11-migrated boards may lack these fields; `hydrateBoard` in
  // src/storage/boards.ts fills sensible defaults at read time so consumers
  // can treat them as present (see DEFAULTS there). Type-side, they remain
  // optional so writers keep working without partial-update plumbing.
  status?: BoardStatus;
  // 1-indexed sub-phase id the board is currently anchored on (Build Spec §02
  // PhaseStrip). Distinct from the per-Idea `phase` cursor.
  currentPhase?: number;
  // Persona ids actively rostered on this board. Source of truth for the
  // PersonaChip strip on Screen 02. Empty array == no personas active.
  activePersonas?: string[];
  // Epoch ms of the most recent meaningful activity on the board (capture,
  // move, brief edit, etc). Drives Home sort order. Defaults to `updatedAt`.
  lastActivityAt?: number;
  // 'self' for now (single-user). Reserved for future multiplayer.
  openedBy?: string;
  // Short user / AI-supplied description shown on the BoardThumbnail.
  summary?: string;
}

export interface IdeaTurnRecord {
  id: string;
  boardId: BoardId;
  ideaId: string;
  sequence: number;
  role: LlmMessage['role'];
  content: string;
  meta?: LlmMessage['meta'];
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
  | 'move_suggestion'
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
