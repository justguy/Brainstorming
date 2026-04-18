import type { ChangeActor } from '../board/types';
import type { BoardId, Idea } from '../types';
import { createEntityPatches, hydrateBoardState, supersedeFutureChanges } from './boardJournal';
import { loadBoardDocument } from './boardDocument';
import { createChangeSet } from './boardGroupMutationHelpers';
import { getBoardHistoryState } from './boardHistoryState';
import type { BoardIdeaCommitResult } from './boardControllerTypes';
import { ensureBoard } from './boards';
import { getDb } from './db';
import { syncTurnsForIdea } from './turns';

export async function commitUpdateIdea(
  boardId: BoardId,
  input: {
    ideaId: string;
    patch: Partial<Idea>;
    actor: ChangeActor;
    summary?: string;
  },
): Promise<BoardIdeaCommitResult> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'ideas', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const ideasStore = tx.objectStore('ideas');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const ideaBefore = await ideasStore.get(input.ideaId);
  if (!ideaBefore) throw new Error(`Idea not found: ${input.ideaId}`);

  const now = Date.now();
  const ideaAfter: Idea = {
    ...ideaBefore,
    ...input.patch,
    id: ideaBefore.id,
    boardId,
    updatedAt: now,
  };
  const ideaPatches = createEntityPatches('ideas', ideaAfter.id, ideaBefore, ideaAfter);
  if (ideaPatches.forward.length === 0) {
    await tx.done;
    return {
      idea: ideaAfter,
      document: await loadBoardDocument(boardId),
      history: await getBoardHistoryState(boardId),
    };
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
    kind: 'update_idea',
    summary: input.summary ?? `Updated idea ${ideaAfter.id}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'ideas', id: ideaAfter.id },
    ],
    forward: [...ideaPatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...ideaPatches.inverse],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await ideasStore.put(ideaAfter);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  if (input.patch.turnLog) {
    await syncTurnsForIdea(boardId, ideaAfter.id, ideaAfter.turnLog, ideaAfter.lastTurnAt ?? ideaAfter.updatedAt);
  }

  return {
    idea: ideaAfter,
    document: await loadBoardDocument(boardId),
    history: await getBoardHistoryState(boardId),
    changeSet,
  };
}
