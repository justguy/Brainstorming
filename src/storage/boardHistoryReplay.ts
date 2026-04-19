import { applyPatches, hydrateBoardState } from './boardJournal';
import { loadBoardDocument } from './boardDocument';
import type { BoardCommitResult } from './boardControllerTypes';
import { ensureBoard } from './boards';
import { getDb } from './db';
import { getBoardHistoryState } from './boardHistoryState';
import type { BoardId } from '../types';

export async function replayChangeSet(
  boardId: BoardId,
  direction: 'undo' | 'redo',
): Promise<BoardCommitResult | null> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx = db.transaction(
    [
      'boards',
      'ideas',
      'groups',
      'docs',
      'suggestions',
      'critiques',
      'connections',
      'beatReviewSessions',
      'beatReviewItems',
      'tweaks',
      'changeSets',
    ],
    'readwrite',
  );
  const boardsStore = tx.objectStore('boards');
  const changeSetsStore = tx.objectStore('changeSets');
  const board = hydrateBoardState(await boardsStore.get(boardId));
  if (!board) throw new Error(`Board not found: ${boardId}`);

  const targetSeq = direction === 'undo' ? board.changeCursor : board.changeCursor + 1;
  if (targetSeq <= 0) {
    await tx.done;
    return null;
  }

  const changeSet = await changeSetsStore.index('byBoardSeq').get([boardId, targetSeq]);
  if (!changeSet) {
    await tx.done;
    return null;
  }
  if (direction === 'undo' && changeSet.status !== 'committed') {
    await tx.done;
    return null;
  }
  if (direction === 'redo' && changeSet.status !== 'undone') {
    await tx.done;
    return null;
  }

  await applyPatches(tx, direction === 'undo' ? changeSet.inverse : changeSet.forward);
  await changeSetsStore.put({
    ...changeSet,
    status: direction === 'undo' ? 'undone' : 'committed',
    undoneAt: direction === 'undo' ? Date.now() : undefined,
  });

  const boardAfter = hydrateBoardState(await boardsStore.get(boardId));
  if (!boardAfter) throw new Error(`Board not found after ${direction}: ${boardId}`);
  await boardsStore.put({
    ...boardAfter,
    changeCursor: direction === 'undo' ? changeSet.baseSeq : changeSet.seq,
    nextChangeSeq: Math.max(boardAfter.nextChangeSeq ?? 1, changeSet.seq + 1),
  });
  await tx.done;

  return {
    document: await loadBoardDocument(boardId),
    history: await getBoardHistoryState(boardId),
    changeSet,
  };
}
