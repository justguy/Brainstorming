import type {
  BoardId,
  Connection,
  Idea,
  IdeaCritique,
  IdeaGroup,
  LlmMessage,
  ScoutSuggestion,
  SupportingDoc,
} from '../types';

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

export interface BoardDocument {
  board: BoardRecord;
  ideas: Idea[];
  groups: IdeaGroup[];
  docs: SupportingDoc[];
  suggestions: ScoutSuggestion[];
  critiques: IdeaCritique[];
  connections: Connection[];
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
  beat?: string;
  label?: string;
}

export type ChangeSetKind =
  | 'capture_idea'
  | 'move_idea'
  | 'discard_idea'
  | 'restore_idea'
  | 'group_ideas'
  | 'ungroup_idea'
  | 'set_group_theme'
  | 'dismiss_critique'
  | 'dismiss_suggestion';

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
