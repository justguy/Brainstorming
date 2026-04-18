import type { ChangeActor } from '../board/types';
import { createEntityPatches, hydrateBoardState, supersedeFutureChanges } from './boardJournal';
import { createChangeSet } from './boardGroupMutationHelpers';
import { loadBoardDocument } from './boardDocument';
import { getBoardHistoryState } from './boardHistoryState';
import type { BoardCommitResult } from './boardControllerTypes';
import { ensureBoard } from './boards';
import { getDb } from './db';

export async function commitDismissCritique(
  boardId: string,
  input: { critiqueId: string; actor: ChangeActor },
): Promise<BoardCommitResult> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'critiques', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const critiquesStore = tx.objectStore('critiques');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const critiqueBefore = await critiquesStore.get(input.critiqueId);
  if (!critiqueBefore) throw new Error(`Critique not found: ${input.critiqueId}`);
  const now = Date.now();
  const critiqueAfter = critiqueBefore.status === 'dismissed'
    ? critiqueBefore
    : { ...critiqueBefore, status: 'dismissed', updatedAt: now };
  const critiquePatches = createEntityPatches('critiques', input.critiqueId, critiqueBefore, critiqueAfter);
  if (critiquePatches.forward.length === 0) {
    await tx.done;
    const document = await loadBoardDocument(boardId);
    return { document, history: await getBoardHistoryState(boardId) };
  }

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
    kind: 'dismiss_critique',
    summary: `Dismissed critique ${input.critiqueId}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'critiques', id: input.critiqueId },
    ],
    forward: [...critiquePatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...critiquePatches.inverse],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await critiquesStore.put(critiqueAfter);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  const document = await loadBoardDocument(boardId);
  return { document, history: await getBoardHistoryState(boardId), changeSet };
}

export async function commitDismissSuggestion(
  boardId: string,
  input: { suggestionId: string; actor: ChangeActor },
): Promise<BoardCommitResult> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'suggestions', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const suggestionsStore = tx.objectStore('suggestions');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const suggestionBefore = await suggestionsStore.get(input.suggestionId);
  if (!suggestionBefore) throw new Error(`Suggestion not found: ${input.suggestionId}`);
  const now = Date.now();
  const suggestionAfter = suggestionBefore.status === 'dismissed'
    ? suggestionBefore
    : { ...suggestionBefore, status: 'dismissed', updatedAt: now };
  const suggestionPatches = createEntityPatches('suggestions', input.suggestionId, suggestionBefore, suggestionAfter);
  if (suggestionPatches.forward.length === 0) {
    await tx.done;
    const document = await loadBoardDocument(boardId);
    return { document, history: await getBoardHistoryState(boardId) };
  }

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
    kind: 'dismiss_suggestion',
    summary: `Dismissed suggestion ${input.suggestionId}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'suggestions', id: input.suggestionId },
    ],
    forward: [...suggestionPatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...suggestionPatches.inverse],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await suggestionsStore.put(suggestionAfter);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  const document = await loadBoardDocument(boardId);
  return { document, history: await getBoardHistoryState(boardId), changeSet };
}
