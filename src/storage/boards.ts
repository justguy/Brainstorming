import { DEFAULT_BOARD_ID, DEFAULT_BOARD_TITLE, type BoardRecord } from '../board/types';
import { getDb } from './db';

function makeBoard(id = DEFAULT_BOARD_ID, title = DEFAULT_BOARD_TITLE): BoardRecord {
  const now = Date.now();
  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    dataVersion: 0,
  };
}

export async function getBoard(id: string): Promise<BoardRecord | undefined> {
  const db = await getDb();
  return db.get('boards', id);
}

export async function ensureBoard(id = DEFAULT_BOARD_ID, title = DEFAULT_BOARD_TITLE): Promise<BoardRecord> {
  const db = await getDb();
  const existing = await db.get('boards', id);
  if (existing) return existing;

  const board = makeBoard(id, title);
  await db.put('boards', board);
  return board;
}

export async function updateBoard(id: string, patch: Partial<BoardRecord>): Promise<BoardRecord> {
  const db = await getDb();
  const current = (await db.get('boards', id)) ?? makeBoard(id);
  const updated: BoardRecord = {
    ...current,
    ...patch,
    id,
    updatedAt: Date.now(),
  };
  await db.put('boards', updated);
  return updated;
}

export async function getDefaultBoard(): Promise<BoardRecord> {
  return ensureBoard();
}
