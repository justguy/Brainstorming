import type { ChangeActor, ChangeSetRecord } from '../board/types';
import { createEntityPatches, applyPatches, hydrateBoardState } from './boardJournal';
import type { BoardCommitResult } from './boardControllerTypes';
import { ensureBoard } from './boards';
import { getDb } from './db';
import { loadBoardDocument } from './boardDocument';
import { getBoardHistoryState } from './boardHistoryState';
import { publishIdeaRows } from './ideaSync';
import type { BoardId } from '../types';

export interface AiUndoTarget {
  changeSetId: string;
  seq: number;
  summary: string;
  tooltip: string;
}

export function findLatestSafeAiUndoTarget(
  changeSets: ChangeSetRecord[],
  cursor: number,
): AiUndoTarget | null {
  const committed = changeSets
    .filter(changeSet => changeSet.status === 'committed' && changeSet.seq <= cursor)
    .sort((left, right) => right.seq - left.seq);

  for (const changeSet of committed) {
    if (changeSet.actor.type !== 'ai') continue;
    const targets = nonBoardTargets(changeSet);
    if (targets.length === 0) continue;
    const hasConflictingLaterChange = committed.some(candidate => (
      candidate.seq > changeSet.seq && intersectsTargets(candidate, targets)
    ));
    if (hasConflictingLaterChange) continue;
    return {
      changeSetId: changeSet.id,
      seq: changeSet.seq,
      summary: changeSet.summary,
      tooltip: `Undo: ${changeSet.summary}`,
    };
  }

  return null;
}

export async function undoAiChange(
  boardId: BoardId,
  changeSetId: string,
  actor: ChangeActor,
): Promise<BoardCommitResult | null> {
  await ensureBoard(boardId);
  const db = await getDb();
  const allChangeSets = (await db.getAllFromIndex('changeSets', 'byBoardId', boardId)) as ChangeSetRecord[];
  const boardStore = db.transaction(['boards'], 'readonly').objectStore('boards');
  const board = hydrateBoardState(await boardStore.get(boardId));
  if (!board) throw new Error(`Board not found: ${boardId}`);

  const safeTarget = findLatestSafeAiUndoTarget(allChangeSets, board.changeCursor);
  if (!safeTarget || safeTarget.changeSetId !== changeSetId) {
    return null;
  }

  const targetChangeSet = allChangeSets.find(changeSet => changeSet.id === changeSetId);
  if (!targetChangeSet) return null;
  const relevantInverse = targetChangeSet.inverse.filter(patch => !patch.path.startsWith('/stores/boards/'));
  const relevantForward = targetChangeSet.forward.filter(patch => !patch.path.startsWith('/stores/boards/'));
  if (relevantInverse.length === 0) return null;

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
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  await applyPatches(tx, relevantInverse);

  const now = Date.now();
  const seq = currentBoard.nextChangeSeq;
  const nextBoard = {
    ...currentBoard,
    updatedAt: now,
    changeCursor: seq,
    nextChangeSeq: seq + 1,
  };
  const boardPatches = createEntityPatches('boards', boardId, currentBoard, nextBoard);
  const changeSet: ChangeSetRecord = {
    id: crypto.randomUUID(),
    boardId,
    seq,
    baseSeq: currentBoard.changeCursor,
    kind: 'ai_undo',
    actor,
    summary: `Undo robot: ${targetChangeSet.summary}`,
    affected: [
      { store: 'boards', id: boardId },
      ...nonBoardTargets(targetChangeSet),
    ],
    forward: [...relevantInverse, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...relevantForward],
    committedAt: now,
    status: 'committed',
  };

  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  const document = await loadBoardDocument(boardId);
  if (changeSet.affected.some(target => target.store === 'ideas')) {
    await publishIdeaRows(document.ideas, boardId);
  }

  return {
    document,
    history: await getBoardHistoryState(boardId),
    changeSet,
  };
}

function nonBoardTargets(changeSet: ChangeSetRecord): ChangeSetRecord['affected'] {
  return changeSet.affected.filter(target => target.store !== 'boards');
}

function intersectsTargets(
  changeSet: ChangeSetRecord,
  targets: ChangeSetRecord['affected'],
): boolean {
  return changeSet.affected.some(candidate => (
    candidate.store !== 'boards'
    && targets.some(target => target.store === candidate.store && target.id === candidate.id)
  ));
}
