import type { ChangeActor } from '../board/types';
import type { BoardId, SupportingDoc } from '../types';
import { createEntityPatches, hydrateBoardState, supersedeFutureChanges } from './boardJournal';
import { loadBoardDocument } from './boardDocument';
import type { BoardDocCommitResult } from './boardControllerTypes';
import { createChangeSet } from './boardGroupMutationHelpers';
import { getBoardHistoryState } from './boardHistoryState';
import { ensureBoard } from './boards';
import { getDb } from './db';
import { deriveTitle, type CreateDocInput } from './docs';

type DocPatch = Partial<Pick<SupportingDoc, 'title' | 'rawText' | 'summary' | 'facts' | 'status' | 'error'>>;

export async function commitCreateDoc(
  boardId: BoardId,
  input: CreateDocInput & { actor: ChangeActor },
): Promise<BoardDocCommitResult> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'docs', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const docsStore = tx.objectStore('docs');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const now = Date.now();
  const doc: SupportingDoc = {
    id: crypto.randomUUID(),
    boardId,
    ideaId: input.ideaId,
    title: input.title.trim() || deriveTitle(input.rawText),
    rawText: input.rawText,
    facts: [],
    status: 'processing',
    createdAt: now,
    updatedAt: now,
  };
  const docPatches = createEntityPatches('docs', doc.id, undefined, doc);
  const nextBoard = nextBoardRecord(currentBoard, now);
  const boardPatches = createEntityPatches('boards', boardId, currentBoard, nextBoard);
  const changeSet = createChangeSet({
    boardId,
    seq: currentBoard.nextChangeSeq,
    baseSeq: currentBoard.changeCursor,
    actor: input.actor,
    kind: 'create_doc',
    summary: `Created supporting doc ${doc.id} for idea ${doc.ideaId}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'docs', id: doc.id },
    ],
    forward: [...docPatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...docPatches.inverse],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await docsStore.put(doc);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  return {
    doc,
    document: await loadBoardDocument(boardId),
    history: await getBoardHistoryState(boardId),
    changeSet,
  };
}

export async function commitUpdateDoc(
  boardId: BoardId,
  input: { docId: string; patch: DocPatch; actor: ChangeActor; summary?: string },
): Promise<BoardDocCommitResult> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'docs', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const docsStore = tx.objectStore('docs');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const docBefore = (await docsStore.get(input.docId)) as SupportingDoc | undefined;
  if (!docBefore) throw new Error(`Doc not found: ${input.docId}`);
  const now = Date.now();
  const doc: SupportingDoc = {
    ...docBefore,
    ...input.patch,
    id: docBefore.id,
    boardId,
    ideaId: docBefore.ideaId,
    updatedAt: now,
  };
  const docPatches = createEntityPatches('docs', doc.id, docBefore, doc);
  if (docPatches.forward.length === 0) {
    await tx.done;
    return {
      doc,
      document: await loadBoardDocument(boardId),
      history: await getBoardHistoryState(boardId),
    };
  }

  const nextBoard = nextBoardRecord(currentBoard, now);
  const boardPatches = createEntityPatches('boards', boardId, currentBoard, nextBoard);
  const changeSet = createChangeSet({
    boardId,
    seq: currentBoard.nextChangeSeq,
    baseSeq: currentBoard.changeCursor,
    actor: input.actor,
    kind: 'update_doc',
    summary: input.summary ?? `Updated supporting doc ${doc.id}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'docs', id: doc.id },
    ],
    forward: [...docPatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...docPatches.inverse],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await docsStore.put(doc);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  return {
    doc,
    document: await loadBoardDocument(boardId),
    history: await getBoardHistoryState(boardId),
    changeSet,
  };
}

export async function commitDeleteDoc(
  boardId: BoardId,
  input: { docId: string; actor: ChangeActor },
): Promise<BoardDocCommitResult> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'docs', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const docsStore = tx.objectStore('docs');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const doc = (await docsStore.get(input.docId)) as SupportingDoc | undefined;
  if (!doc) throw new Error(`Doc not found: ${input.docId}`);
  const now = Date.now();
  const docPatches = createEntityPatches('docs', doc.id, doc, undefined);
  const nextBoard = nextBoardRecord(currentBoard, now);
  const boardPatches = createEntityPatches('boards', boardId, currentBoard, nextBoard);
  const changeSet = createChangeSet({
    boardId,
    seq: currentBoard.nextChangeSeq,
    baseSeq: currentBoard.changeCursor,
    actor: input.actor,
    kind: 'delete_doc',
    summary: `Deleted supporting doc ${doc.id}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'docs', id: doc.id },
    ],
    forward: [...docPatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...docPatches.inverse],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await docsStore.delete(doc.id);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  return {
    doc,
    document: await loadBoardDocument(boardId),
    history: await getBoardHistoryState(boardId),
    changeSet,
  };
}

function nextBoardRecord(board: { updatedAt: number; changeCursor: number; nextChangeSeq: number }, now: number) {
  return {
    ...board,
    updatedAt: now,
    changeCursor: board.nextChangeSeq,
    nextChangeSeq: board.nextChangeSeq + 1,
  };
}
