import type { ChangeActor } from '../board/types';
import { createEntityPatches, hydrateBoardState, supersedeFutureChanges } from './boardJournal';
import { createChangeSet } from './boardGroupMutationHelpers';
import { loadBoardDocument } from './boardDocument';
import { getBoardHistoryState } from './boardHistoryState';
import type { BoardTweaksCommitResult } from './boardControllerTypes';
import { ensureBoard } from './boards';
import { getDb } from './db';
import { createBoardTweaksRecord, TWEAKS_RECORD_PREFIX } from './tweaks';

export async function commitUpdateTweaks(
  boardId: string,
  input: { patch: Record<string, unknown>; actor: ChangeActor; summary?: string },
): Promise<BoardTweaksCommitResult> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'tweaks', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const tweaksStore = tx.objectStore('tweaks');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const tweakId = `${TWEAKS_RECORD_PREFIX}${boardId}`;
  const tweaksBefore = (await tweaksStore.get(tweakId)) ?? createBoardTweaksRecord(boardId);
  const nextValues = {
    ...tweaksBefore.values,
    ...input.patch,
  };
  if (JSON.stringify(nextValues) === JSON.stringify(tweaksBefore.values)) {
    await tx.done;
    const document = await loadBoardDocument(boardId);
    return {
      document,
      history: await getBoardHistoryState(boardId),
      tweaks: tweaksBefore,
    };
  }

  const now = Date.now();
  const tweaksAfter = {
    ...tweaksBefore,
    values: nextValues,
    updatedAt: now,
  };
  const tweakPatches = createEntityPatches('tweaks', tweakId, tweaksBefore, tweaksAfter);
  const nextBoard = {
    ...currentBoard,
    updatedAt: now,
    changeCursor: currentBoard.nextChangeSeq,
    nextChangeSeq: currentBoard.nextChangeSeq + 1,
  };
  const boardPatches = createEntityPatches('boards', boardId, currentBoard, nextBoard);
  const changeSet = createChangeSet({
    boardId,
    seq: currentBoard.nextChangeSeq,
    baseSeq: currentBoard.changeCursor,
    actor: input.actor,
    kind: 'update_tweaks',
    summary: input.summary ?? 'Updated board tweaks',
    affected: [
      { store: 'boards', id: boardId },
      { store: 'tweaks', id: tweakId },
    ],
    forward: [...tweakPatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...tweakPatches.inverse],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await tweaksStore.put(tweaksAfter);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  return {
    document: await loadBoardDocument(boardId),
    history: await getBoardHistoryState(boardId),
    changeSet,
    tweaks: tweaksAfter,
  };
}
