import type { BoardId } from '../types';
import { getRedoChangeSet } from './changeSets';
import { ensureBoard } from './boards';
import type { BoardHistoryState } from './boardControllerTypes';

export async function getBoardHistoryState(boardId: BoardId): Promise<BoardHistoryState> {
  const board = await ensureBoard(boardId);
  return {
    canUndo: board.changeCursor > 0,
    canRedo: !!(await getRedoChangeSet(boardId, board.changeCursor + 1)),
    cursor: board.changeCursor,
    nextSeq: board.nextChangeSeq,
  };
}
