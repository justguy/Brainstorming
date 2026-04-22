import type { BoardId } from '../types';
import type { ChangeSetRecord } from '../board/types';
import { getDb } from './db';

export async function appendChangeSet(record: ChangeSetRecord): Promise<ChangeSetRecord> {
  const db = await getDb();
  await db.put('changeSets', record);
  return record;
}

export async function getChangeSet(boardId: BoardId, seq: number): Promise<ChangeSetRecord | undefined> {
  const db = await getDb();
  return db.getFromIndex('changeSets', 'byBoardSeq', [boardId, seq]);
}

export async function listChangeSets(boardId: BoardId, limit = 50): Promise<ChangeSetRecord[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('changeSets', 'byBoardId', boardId);
  return all
    .sort((left, right) => right.seq - left.seq)
    .slice(0, limit);
}

export async function getRedoChangeSet(boardId: BoardId, nextSeq: number): Promise<ChangeSetRecord | undefined> {
  const db = await getDb();
  const record = await db.getFromIndex('changeSets', 'byBoardSeq', [boardId, nextSeq]);
  return record?.status === 'undone' ? record : undefined;
}

export async function markChangeSetStatus(
  changeSetId: string,
  status: ChangeSetRecord['status'],
): Promise<ChangeSetRecord> {
  const db = await getDb();
  const existing = await db.get('changeSets', changeSetId);
  if (!existing) throw new Error(`Change set not found: ${changeSetId}`);
  const updated: ChangeSetRecord = {
    ...existing,
    status,
    undoneAt: status === 'undone' ? Date.now() : undefined,
  };
  await db.put('changeSets', updated);
  return updated;
}

export async function markSupersededChangeSets(boardId: BoardId, fromSeq: number): Promise<void> {
  const db = await getDb();
  const records = await db.getAllFromIndex('changeSets', 'byBoardId', boardId);
  for (const record of records) {
    if (record.seq < fromSeq) continue;
    if (record.status !== 'undone') continue;
    await db.put('changeSets', {
      ...record,
      status: 'superseded',
    });
  }
}
