import type { BoardPatchOp, BoardStoreName } from '../board/types';
import type { BoardId } from '../types';

export function createEntityPatches(
  store: BoardStoreName,
  id: string,
  before: unknown,
  after: unknown,
): { forward: BoardPatchOp[]; inverse: BoardPatchOp[] } {
  if (serialize(before) === serialize(after)) {
    return { forward: [], inverse: [] };
  }
  const path = `/stores/${store}/${id}` as const;
  if (before == null) {
    return {
      forward: [{ op: 'add', path, value: structuredClone(after) }],
      inverse: [{ op: 'remove', path }],
    };
  }
  if (after == null) {
    return {
      forward: [{ op: 'remove', path }],
      inverse: [{ op: 'add', path, value: structuredClone(before) }],
    };
  }
  return {
    forward: [{ op: 'replace', path, value: structuredClone(after) }],
    inverse: [{ op: 'replace', path, value: structuredClone(before) }],
  };
}

export async function applyPatches(tx: any, patches: BoardPatchOp[]): Promise<void> {
  for (const patch of patches) {
    const { store, id } = parsePatchPath(patch.path);
    const storeHandle = tx.objectStore(store);
    if (patch.op === 'remove') {
      await storeHandle.delete(id);
      continue;
    }
    await storeHandle.put(structuredClone(patch.value));
  }
}

export async function supersedeFutureChanges(
  changeSetsStore: any,
  boardId: BoardId,
  fromSeq: number,
): Promise<void> {
  const records = await changeSetsStore.getAll();
  for (const record of records) {
    if (record.boardId !== boardId) continue;
    if (record.seq < fromSeq) continue;
    if (record.status !== 'undone') continue;
    await changeSetsStore.put({ ...record, status: 'superseded' });
  }
}

export function hydrateBoardState<T extends { changeCursor?: number; nextChangeSeq?: number } | undefined>(board: T) {
  if (!board) return board;
  return {
    ...board,
    changeCursor: board.changeCursor ?? 0,
    nextChangeSeq: board.nextChangeSeq ?? 1,
  };
}

function parsePatchPath(path: BoardPatchOp['path']): { store: BoardStoreName; id: string } {
  const [, , store, ...rest] = path.split('/');
  return { store: store as BoardStoreName, id: rest.join('/') };
}

function serialize(value: unknown): string {
  return JSON.stringify(value);
}
