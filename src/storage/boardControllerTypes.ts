import type { ChangeSetRecord } from '../board/types';
import type { BoardDocument } from '../board/types';
import type { Idea, IdeaCritique, ScoutSuggestion, SupportingDoc } from '../types';

export interface BoardHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  cursor: number;
  nextSeq: number;
}

export interface BoardCommitResult {
  document: BoardDocument;
  history: BoardHistoryState;
  changeSet?: ChangeSetRecord;
}

export interface BoardGroupCommitResult extends BoardCommitResult {
  groupId: string;
}

export interface BoardCritiqueCommitResult extends BoardCommitResult {
  critique: IdeaCritique;
}

export interface BoardSuggestionCommitResult extends BoardCommitResult {
  suggestion: ScoutSuggestion;
}

export interface BoardSuggestionAdmitCommitResult extends BoardCommitResult {
  suggestion: ScoutSuggestion;
  idea: Idea;
}

export interface BoardIdeaCommitResult extends BoardCommitResult {
  idea: Idea;
}

export interface BoardDocCommitResult extends BoardCommitResult {
  doc: SupportingDoc;
}

export interface BoardMergeCommitResult extends BoardCommitResult {
  idea: Idea;
}
