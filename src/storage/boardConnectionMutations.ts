import type { ChangeActor } from '../board/types';
import type { BoardId, Connection, ConnectionKind, IdeaAuthorRef } from '../types';
import { createEntityPatches, hydrateBoardState, supersedeFutureChanges } from './boardJournal';
import { createChangeSet } from './boardGroupMutationHelpers';
import { loadBoardDocument } from './boardDocument';
import { getBoardHistoryState } from './boardHistoryState';
import type { BoardCommitResult } from './boardControllerTypes';
import { ensureBoard } from './boards';
import { getDb } from './db';
import { recordFacilitatorBoardMutation } from './facilitatorSync';

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
  recordFacilitatorBoardMutation(boardId, {
    kind: 'connection',
    actorType: input.actor.type,
    at: now,
    summary: input.summary ?? `Replaced ${nextRows.length} connection${nextRows.length === 1 ? '' : 's'}`,
  });

  return {
    document: await loadBoardDocument(boardId),
    history: await getBoardHistoryState(boardId),
    changeSet,
  };
}

/**
 * Build Spec §s05 — "flip type": log a NEW Connection row with the new kind,
 * mark the existing row `state: 'superseded'` and back-point it via
 * `supersededBy`. The original is not deleted so the log scrubber can
 * reconstruct the line's kind-history.
 *
 * `authorRef` (IdeaAuthorRef) is what the inspector passes in; the changeSet
 * actor is derived from it so the journal stays consistent with how user vs.
 * AI edits are attributed elsewhere.
 */
export async function commitFlipConnectionType(
  boardId: BoardId,
  input: {
    connectionId: string;
    newKind: ConnectionKind;
    authorRef: IdeaAuthorRef;
    newConnectionId?: string;  // injectable for deterministic tests
    now?: number;
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

  const before = (await connectionsStore.get(input.connectionId)) as Connection | undefined;
  if (!before) throw new Error(`Connection not found: ${input.connectionId}`);
  if (before.kind === input.newKind && before.state !== 'superseded') {
    // No-op — nothing to flip. Abort the transaction without writing.
    await tx.done;
    return {
      document: await loadBoardDocument(boardId),
      history: await getBoardHistoryState(boardId),
    };
  }

  const now = input.now ?? Date.now();
  const newConnectionId = input.newConnectionId ?? crypto.randomUUID();

  // 1) Mark the existing row as superseded (do NOT mutate its other fields —
  // the log scrubber needs the original kind for replay accuracy).
  const olderAfter: Connection = {
    ...before,
    state: 'superseded',
    boardId,
  };

  // 2) New row with the chosen kind + supersededBy back-pointer. `createdAt`
  // is fresh; rationale / strength / ideaIds / supportingDocIds carry over.
  const newConnection: Connection = {
    id: newConnectionId,
    boardId,
    kind: input.newKind,
    ideaIds: [...before.ideaIds],
    supportingDocIds: before.supportingDocIds ? [...before.supportingDocIds] : undefined,
    rationale: before.rationale,
    strength: before.strength,
    createdAt: now,
    state: 'active',
    supersededBy: before.id,
    authorRef: input.authorRef,
  };

  const olderPatches = createEntityPatches('connections', before.id, before, olderAfter);
  const newerPatches = createEntityPatches('connections', newConnection.id, undefined, newConnection);

  const nextBoard = {
    ...currentBoard,
    updatedAt: now,
    changeCursor: currentBoard.nextChangeSeq,
    nextChangeSeq: currentBoard.nextChangeSeq + 1,
  };
  const boardPatches = createEntityPatches('boards', boardId, currentBoard, nextBoard);
  const actor: ChangeActor = authorRefToActor(input.authorRef);
  const changeSet = createChangeSet({
    boardId,
    seq: currentBoard.nextChangeSeq,
    baseSeq: currentBoard.changeCursor,
    actor,
    kind: 'flip_connection_type',
    summary: `Flipped connection ${before.id} kind ${before.kind} → ${input.newKind}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'connections', id: before.id },
      { store: 'connections', id: newConnection.id },
    ],
    forward: [...olderPatches.forward, ...newerPatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...newerPatches.inverse, ...olderPatches.inverse],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await connectionsStore.put(olderAfter);
  await connectionsStore.put(newConnection);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;
  recordFacilitatorBoardMutation(boardId, {
    kind: 'connection',
    actorType: actor.type,
    at: now,
    summary: `Flipped connection kind to ${input.newKind}`,
  });

  return {
    document: await loadBoardDocument(boardId),
    history: await getBoardHistoryState(boardId),
    changeSet,
  };
}

/**
 * Build Spec §s05 — "↶ delete": soft-delete via `state: 'deleted'`. The row
 * is preserved for log replay (and for the 5-second undo toast in the
 * inspector). Use `commitUnsoftDeleteConnection` to revert.
 */
export async function commitSoftDeleteConnection(
  boardId: BoardId,
  input: {
    connectionId: string;
    authorRef: IdeaAuthorRef;
    now?: number;
  },
): Promise<BoardCommitResult> {
  return commitConnectionStateTransition(boardId, {
    connectionId: input.connectionId,
    nextState: 'deleted',
    authorRef: input.authorRef,
    changeKind: 'soft_delete_connection',
    summaryVerb: 'Soft-deleted',
    now: input.now,
  });
}

/**
 * Undo a prior soft-delete. Restores `state` to 'active'. Used by the
 * inspector's undo-toast within its 5-second window.
 */
export async function commitUnsoftDeleteConnection(
  boardId: BoardId,
  input: {
    connectionId: string;
    authorRef: IdeaAuthorRef;
    now?: number;
  },
): Promise<BoardCommitResult> {
  return commitConnectionStateTransition(boardId, {
    connectionId: input.connectionId,
    nextState: 'active',
    authorRef: input.authorRef,
    changeKind: 'unsoft_delete_connection',
    summaryVerb: 'Restored',
    now: input.now,
  });
}

async function commitConnectionStateTransition(
  boardId: BoardId,
  input: {
    connectionId: string;
    nextState: 'active' | 'deleted';
    authorRef: IdeaAuthorRef;
    changeKind: 'soft_delete_connection' | 'unsoft_delete_connection';
    summaryVerb: string;
    now?: number;
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

  const before = (await connectionsStore.get(input.connectionId)) as Connection | undefined;
  if (!before) throw new Error(`Connection not found: ${input.connectionId}`);
  const currentState: 'active' | 'superseded' | 'deleted' = before.state ?? 'active';
  if (currentState === input.nextState) {
    await tx.done;
    return {
      document: await loadBoardDocument(boardId),
      history: await getBoardHistoryState(boardId),
    };
  }

  const now = input.now ?? Date.now();
  const after: Connection = {
    ...before,
    state: input.nextState,
    boardId,
  };
  const connectionPatches = createEntityPatches('connections', before.id, before, after);

  const nextBoard = {
    ...currentBoard,
    updatedAt: now,
    changeCursor: currentBoard.nextChangeSeq,
    nextChangeSeq: currentBoard.nextChangeSeq + 1,
  };
  const boardPatches = createEntityPatches('boards', boardId, currentBoard, nextBoard);
  const actor: ChangeActor = authorRefToActor(input.authorRef);
  const changeSet = createChangeSet({
    boardId,
    seq: currentBoard.nextChangeSeq,
    baseSeq: currentBoard.changeCursor,
    actor,
    kind: input.changeKind,
    summary: `${input.summaryVerb} connection ${before.id}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'connections', id: before.id },
    ],
    forward: [...connectionPatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...connectionPatches.inverse],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await connectionsStore.put(after);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;
  recordFacilitatorBoardMutation(boardId, {
    kind: 'connection',
    actorType: actor.type,
    at: now,
    summary: `${input.summaryVerb} connection`,
  });

  return {
    document: await loadBoardDocument(boardId),
    history: await getBoardHistoryState(boardId),
    changeSet,
  };
}

/**
 * Project an IdeaAuthorRef (the screens-v2 attribution model) onto the
 * journal's ChangeActor shape. The journal needs an `actor.type` of
 * 'user' | 'ai' | 'tool' | 'system'; persona / role / system author kinds
 * collapse to 'ai' / 'system' here.
 */
function authorRefToActor(authorRef: IdeaAuthorRef): ChangeActor {
  switch (authorRef.kind) {
    case 'user':
      return { type: 'user', source: 'canvas', label: authorRef.label ?? 'connectionInspector' };
    case 'persona':
    case 'role':
      return { type: 'ai', source: 'canvas', label: authorRef.label ?? authorRef.id };
    case 'system':
      return { type: 'system', source: 'system', label: authorRef.label ?? authorRef.id };
  }
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
