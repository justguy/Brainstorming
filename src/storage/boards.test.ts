/**
 * bo-110 — BoardRecord screens-v2 widening: runtime-defaulting on read.
 *
 * We extended `BoardRecord` with `status`, `currentPhase`, `activePersonas`,
 * `lastActivityAt`, `openedBy`, `summary`. To stay back-compat with existing
 * IDB rows (no v12 migration), `hydrateBoard()` fills defaults at read time.
 * This test seeds a v11-shaped row that lacks the new fields and verifies
 * `getBoard()` returns the populated shape.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetDbForTests, getDb } from './db';
import { ensureBoard, getBoard } from './boards';
import { DEFAULT_BOARD_ID } from '../board/types';

const DB_NAME = 'brainstorming-orchestrator';

function deleteDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

async function closeAndReset(): Promise<void> {
  try {
    const cached = await getDb();
    cached.close();
  } catch {
    /* noop */
  }
  __resetDbForTests();
}

describe('boards: runtime-defaulting for screens-v2 fields', () => {
  beforeEach(async () => {
    await closeAndReset();
    await deleteDb();
  });

  afterEach(async () => {
    await closeAndReset();
    await deleteDb();
  });

  it('ensureBoard() produces a screens-v2-shaped record on first creation', async () => {
    const board = await ensureBoard();
    expect(board.status).toBe('active');
    expect(board.currentPhase).toBe(1);
    expect(board.activePersonas).toEqual([]);
    expect(board.lastActivityAt).toBe(board.updatedAt);
  });

  it('getBoard() back-fills defaults for legacy rows lacking new fields', async () => {
    // Seed a row that mimics what the v11 migration produced for an
    // existing user (projectId set, but none of the bo-110 fields present).
    const db = await getDb();
    const now = Date.now();
    await db.put('boards', {
      id: DEFAULT_BOARD_ID,
      title: 'Legacy Board',
      createdAt: now - 10_000,
      updatedAt: now,
      dataVersion: 1,
      changeCursor: 0,
      nextChangeSeq: 1,
      projectId: 'local-project',
    });

    const hydrated = await getBoard(DEFAULT_BOARD_ID);
    expect(hydrated).toBeDefined();
    expect(hydrated!.status).toBe('active');
    expect(hydrated!.currentPhase).toBe(1);
    expect(hydrated!.activePersonas).toEqual([]);
    expect(hydrated!.lastActivityAt).toBe(now);
    // Existing fields preserved untouched.
    expect(hydrated!.projectId).toBe('local-project');
    expect(hydrated!.title).toBe('Legacy Board');
  });

  it('getBoard() preserves explicitly-set screens-v2 fields rather than overwriting them', async () => {
    const db = await getDb();
    const now = Date.now();
    await db.put('boards', {
      id: DEFAULT_BOARD_ID,
      title: 'Shipped Board',
      createdAt: now - 20_000,
      updatedAt: now,
      dataVersion: 1,
      changeCursor: 0,
      nextChangeSeq: 1,
      projectId: 'local-project',
      status: 'shipped',
      currentPhase: 8,
      activePersonas: ['scout', 'devil'],
      lastActivityAt: now - 5_000,
      openedBy: 'self',
      summary: 'Done.',
    });

    const hydrated = await getBoard(DEFAULT_BOARD_ID);
    expect(hydrated!.status).toBe('shipped');
    expect(hydrated!.currentPhase).toBe(8);
    expect(hydrated!.activePersonas).toEqual(['scout', 'devil']);
    expect(hydrated!.lastActivityAt).toBe(now - 5_000);
    expect(hydrated!.openedBy).toBe('self');
    expect(hydrated!.summary).toBe('Done.');
  });
});
