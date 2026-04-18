import type { ChangeSetRecord } from '../board/types';
import type { BoardDocument } from '../board/types';

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
