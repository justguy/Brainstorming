import type {
  BeatReviewItemRecord,
  BeatReviewSessionRecord,
  ChangeActor,
} from '../board/types';
import { createEntityPatches, hydrateBoardState, supersedeFutureChanges } from './boardJournal';
import { createChangeSet } from './boardGroupMutationHelpers';
import { loadBoardDocument } from './boardDocument';
import { getBoardHistoryState } from './boardHistoryState';
import type {
  BoardBeatReviewItemCommitResult,
  BoardBeatReviewSessionCommitResult,
} from './boardControllerTypes';
import { ensureBoard } from './boards';
import { getDb } from './db';
import { buildBeatReviewRecords, getBeatReviewSession } from './beatReviewStore';
import type { BeatResult } from '../beats/types';
import type { BoardId } from '../types';

type ReviewableBeatResult = BeatResult<'cluster'> | BeatResult<'summarise'>;

export async function commitCreateBeatReviewSession(
  boardId: BoardId,
  input: { result: ReviewableBeatResult; actor: ChangeActor },
): Promise<BoardBeatReviewSessionCommitResult | null> {
  if (!input.result.ok) {
    return null;
  }

  const { session, items } = buildBeatReviewRecords(boardId, input.result);
  if (items.length === 0) {
    return null;
  }

  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'beatReviewSessions', 'beatReviewItems', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const sessionsStore = tx.objectStore('beatReviewSessions');
  const itemsStore = tx.objectStore('beatReviewItems');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const sessionPatches = createEntityPatches('beatReviewSessions', session.id, undefined, session);
  const itemPatches = items.map(item => createEntityPatches('beatReviewItems', item.id, undefined, item));
  const nextBoard = {
    ...currentBoard,
    updatedAt: session.updatedAt,
    changeCursor: currentBoard.nextChangeSeq,
    nextChangeSeq: currentBoard.nextChangeSeq + 1,
  };
  const boardPatches = createEntityPatches('boards', boardId, currentBoard, nextBoard);
  const changeSet = createChangeSet({
    boardId,
    seq: currentBoard.nextChangeSeq,
    baseSeq: currentBoard.changeCursor,
    actor: input.actor,
    kind: 'create_beat_review_session',
    summary: `Created ${session.beat} review session ${session.id}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'beatReviewSessions', id: session.id },
      ...items.map(item => ({ store: 'beatReviewItems' as const, id: item.id })),
    ],
    forward: [
      ...sessionPatches.forward,
      ...itemPatches.flatMap(entry => entry.forward),
      ...boardPatches.forward,
    ],
    inverse: [
      ...boardPatches.inverse,
      ...itemPatches.flatMap(entry => entry.inverse).reverse(),
      ...sessionPatches.inverse,
    ],
    committedAt: session.updatedAt,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await sessionsStore.put(session);
  for (const item of items) {
    await itemsStore.put(item);
  }
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  return {
    session,
    items,
    document: await loadBoardDocument(boardId),
    history: await getBoardHistoryState(boardId),
    changeSet,
  };
}

export async function commitBeatReviewItemDecision(
  boardId: BoardId,
  input: { itemId: string; status: 'kept' | 'scratched'; actor: ChangeActor },
): Promise<BoardBeatReviewItemCommitResult> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'beatReviewSessions', 'beatReviewItems', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const sessionsStore = tx.objectStore('beatReviewSessions');
  const itemsStore = tx.objectStore('beatReviewItems');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const itemBefore = await itemsStore.get(input.itemId);
  if (!itemBefore) throw new Error(`Beat review item not found: ${input.itemId}`);
  const sessionBefore = await sessionsStore.get(itemBefore.sessionId);
  if (!sessionBefore) throw new Error(`Beat review session not found: ${itemBefore.sessionId}`);

  const now = Date.now();
  const itemAfter = itemBefore.status === input.status
    ? itemBefore
    : {
        ...itemBefore,
        status: input.status,
        updatedAt: now,
        reviewedAt: now,
        keptAt: input.status === 'kept' ? now : undefined,
        scratchedAt: input.status === 'scratched' ? now : undefined,
        tombstone: input.status === 'scratched'
          ? { scratchedAt: now, note: 'Scratched during beat review.' }
          : undefined,
        decisionHistory: [
          ...(itemBefore.decisionHistory ?? []),
          {
            status: input.status,
            decidedAt: now,
            actor: input.actor.type,
            note: input.status === 'kept'
              ? 'Accepted from beat review.'
              : 'Dismissed from beat review.',
          },
        ],
      };
  const relatedItems = await itemsStore.index('bySessionId').getAll(itemBefore.sessionId);
  const sessionAfter = deriveSessionAfterDecision(
    sessionBefore,
    relatedItems.map((item: BeatReviewItemRecord) => (item.id === itemBefore.id ? itemAfter : item)),
    now,
  );
  const itemPatches = createEntityPatches('beatReviewItems', itemAfter.id, itemBefore, itemAfter);
  const sessionPatches = createEntityPatches('beatReviewSessions', sessionAfter.id, sessionBefore, sessionAfter);
  if (itemPatches.forward.length === 0 && sessionPatches.forward.length === 0) {
    await tx.done;
    return {
      item: itemAfter,
      session: sessionAfter,
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
    kind: input.status === 'kept' ? 'keep_beat_review_item' : 'scratch_beat_review_item',
    summary: `${input.status === 'kept' ? 'Kept' : 'Scratched'} review item ${itemAfter.id}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'beatReviewSessions', id: sessionAfter.id },
      { store: 'beatReviewItems', id: itemAfter.id },
    ],
    forward: [...itemPatches.forward, ...sessionPatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...sessionPatches.inverse, ...itemPatches.inverse],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await itemsStore.put(itemAfter);
  await sessionsStore.put(sessionAfter);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  return {
    item: itemAfter,
    session: sessionAfter,
    document: await loadBoardDocument(boardId),
    history: await getBoardHistoryState(boardId),
    changeSet,
  };
}

function deriveSessionAfterDecision(
  session: Awaited<ReturnType<typeof getBeatReviewSession>>,
  items: BeatReviewItemRecord[],
  now: number,
): BeatReviewSessionRecord {
  const pendingCount = items.filter(item => item.status === 'pending').length;
  const keptCount = items.filter(item => item.status === 'kept').length;
  const scratchedCount = items.filter(item => item.status === 'scratched').length;
  return {
    ...session!,
    status: pendingCount > 0 ? 'open' as const : 'resolved' as const,
    updatedAt: now,
    resolvedAt: pendingCount > 0 ? undefined : now,
    pendingCount,
    keptCount,
    scratchedCount,
  };
}
