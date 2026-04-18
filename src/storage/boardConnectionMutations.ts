import type { ChangeActor } from '../board/types';
import type { BoardId, Connection } from '../types';
import { createEntityPatches, hydrateBoardState, supersedeFutureChanges } from './boardJournal';
import { createChangeSet } from './boardGroupMutationHelpers';
import { loadBoardDocument } from './boardDocument';
import { getBoardHistoryState } from './boardHistoryState';
import type { BoardCommitResult } from './boardControllerTypes';
import { ensureBoard } from './boards';
import { getDb } from './db';

export async function commitReplaceConnections(
  boardId: BoardId,
  input: {
    connections: Connection[];
    actor: ChangeActor;
    summary?: string;
  },
): Promise<BoardCommitResult> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'connections', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const connectionsStore = tx.objectStore('connections');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const existingRows = (await connectionsStore.index('byBoardId').getAll(boardId)) as Connection[];
  const existingById = new Map<string, Connection>(existingRows.map(row => [row.id, row]));
  const nextRows: Connection[] = input.connections.map(connection => ({ ...connection, boardId }));
  const nextById = new Map<string, Connection>(nextRows.map(connection => [connection.id, connection]));

  const connectionPatches = createConnectionPatches(existingById, nextById);
  if (connectionPatches.forward.length === 0) {
    await tx.done;
    return {
      document: await loadBoardDocument(boardId),
      history: await getBoardHistoryState(boardId),
    };
  }

  const now = Date.now();
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
    kind: 'replace_connections',
    summary: input.summary ?? `Replaced connection set for board ${boardId}`,
    affected: [
      { store: 'boards', id: boardId },
      ...uniqueConnectionIds([...existingById.keys(), ...nextById.keys()]).map(id => ({ store: 'connections' as const, id })),
    ],
    forward: [...connectionPatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...connectionPatches.inverse],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  for (const existing of existingRows) {
    await connectionsStore.delete(existing.id);
  }
  for (const next of nextRows) {
    await connectionsStore.put(next);
  }
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  return {
    document: await loadBoardDocument(boardId),
    history: await getBoardHistoryState(boardId),
    changeSet,
  };
}

function createConnectionPatches(
  existingById: Map<string, Connection>,
  nextById: Map<string, Connection>,
) {
  const ids = uniqueConnectionIds([...existingById.keys(), ...nextById.keys()]);
  const forward: ReturnType<typeof createEntityPatches>['forward'] = [];
  const inverse: ReturnType<typeof createEntityPatches>['inverse'] = [];

  for (const id of ids) {
    const patches = createEntityPatches('connections', id, existingById.get(id), nextById.get(id));
    forward.push(...patches.forward);
    inverse.push(...patches.inverse);
  }

  return { forward, inverse };
}

function uniqueConnectionIds(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}
