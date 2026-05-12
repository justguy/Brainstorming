import { DEFAULT_BOARD_ID } from '../board/types';
import type { BoardId, Connection, ConnectionKind, IdeaAuthorRef } from '../types';
import {
  commitFlipConnectionType,
  commitSoftDeleteConnection,
  commitUnsoftDeleteConnection,
} from './boardConnectionMutations';
import type { BoardCommitResult } from './boardControllerTypes';
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

/**
 * Read a single Connection row by id, scanning every board.
 *
 * Connection mutations triggered from the inspector (flip-type, soft-delete,
 * undo) only know the connection id — the boardId lives on the row. This
 * helper looks the row up so the commit functions can route to the right
 * board's changeSet pipeline.
 */
async function findConnectionRow(connectionId: string): Promise<Connection | null> {
  await ensureBoardStorageBridge(DEFAULT_BOARD_ID);
  const db = await getDb();
  const row = (await db.get('connections', connectionId)) as Connection | undefined;
  return row ?? null;
}

/**
 * Build Spec §s05 — "flip type" from the Connection inspector.
 *
 * Resolves the connection's board and routes through the changeSet pipeline
 * (`commitFlipConnectionType`) so the operation participates in undo/redo,
 * facilitator sync, and log scrubber replay. Returns the BoardCommitResult so
 * callers that already manage a board snapshot can re-apply the document.
 */
export async function flipConnectionType(
  connectionId: string,
  newKind: ConnectionKind,
  authorRef: IdeaAuthorRef,
): Promise<BoardCommitResult> {
  const row = await findConnectionRow(connectionId);
  if (!row) throw new Error(`Connection not found: ${connectionId}`);
  const boardId: BoardId = row.boardId ?? DEFAULT_BOARD_ID;
  return commitFlipConnectionType(boardId, { connectionId, newKind, authorRef });
}

/**
 * Build Spec §s05 — "↶ delete" from the Connection inspector.
 *
 * Soft-delete: sets `state: 'deleted'` on the row (NOT a hard remove) so the
 * row survives for log replay and the 5-second undo toast. Routed through the
 * changeSet pipeline.
 */
export async function softDeleteConnection(
  connectionId: string,
  authorRef: IdeaAuthorRef,
): Promise<BoardCommitResult> {
  const row = await findConnectionRow(connectionId);
  if (!row) throw new Error(`Connection not found: ${connectionId}`);
  const boardId: BoardId = row.boardId ?? DEFAULT_BOARD_ID;
  return commitSoftDeleteConnection(boardId, { connectionId, authorRef });
}

/**
 * Reverse a prior soft-delete (Build Spec §s05 — "undo" toast). Restores
 * `state` to 'active' via the changeSet pipeline.
 */
export async function unsoftDeleteConnection(
  connectionId: string,
  authorRef: IdeaAuthorRef,
): Promise<BoardCommitResult> {
  const row = await findConnectionRow(connectionId);
  if (!row) throw new Error(`Connection not found: ${connectionId}`);
  const boardId: BoardId = row.boardId ?? DEFAULT_BOARD_ID;
  return commitUnsoftDeleteConnection(boardId, { connectionId, authorRef });
}
