import { DEFAULT_BOARD_ID } from '../board/types';
import type { BoardId, Connection } from '../types';
import { getDb } from './db';
import { ensureBoardStorageBridge } from './migrationBridge';

export async function listConnections(boardId: BoardId = DEFAULT_BOARD_ID): Promise<Connection[]> {
  await ensureBoardStorageBridge(boardId);
  const db = await getDb();
  const all = await db.getAllFromIndex('connections', 'byBoardId', boardId);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function replaceConnections(
  connections: Connection[],
  boardId: BoardId = DEFAULT_BOARD_ID,
): Promise<void> {
  await ensureBoardStorageBridge(boardId);
  const db = await getDb();
  const tx = db.transaction('connections', 'readwrite');
  const existing = await tx.store.index('byBoardId').getAll(boardId);

  for (const connection of existing) {
    await tx.store.delete(connection.id);
  }
  for (const connection of connections) {
    await tx.store.put({
      ...connection,
      boardId,
    });
  }
  await tx.done;
}
