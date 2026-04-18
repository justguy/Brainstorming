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
