/**
 * bo-102 — DB v11 migration + default project back-fill.
 *
 * Tests:
 *  1. Fresh DB at v11 → getDefaultProject() returns id 'local-project'.
 *  2. Seed a v10 DB with one BoardRecord (no projectId, id 'local-board'),
 *     reopen at v11, board has projectId 'local-project' AND keeps its id
 *     (deep-link safety per IMPLEMENTATION_PLAN decision #5).
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';

import { __resetDbForTests, getDb } from './db';
import { DEFAULT_PROJECT_ID, getDefaultProject } from './projects';

const DB_NAME = 'brainstorming-orchestrator';
const LOCAL_BOARD_ID = 'local-board';

function deleteDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

async function closeAndReset(): Promise<void> {
  // Close any open IDBPDatabase the module cache is holding so deleteDatabase
  // doesn't get blocked. We swallow errors because the DB may already be
  // closed (e.g. when no test ever opened it).
  try {
    const cached = await getDb();
    cached.close();
  } catch {
    /* noop */
  }
  __resetDbForTests();
}

describe('DB v11 migration', () => {
  beforeEach(async () => {
    await closeAndReset();
    await deleteDb();
  });

  afterEach(async () => {
    await closeAndReset();
    await deleteDb();
  });

  it('fresh open at v11 yields the default project', async () => {
    const project = await getDefaultProject();
    expect(project.id).toBe(DEFAULT_PROJECT_ID);
    expect(project.title).toBe('My workspace');
    expect(project.autonomyDial).toBe('active');
  });

  it('back-fills projectId on existing boards while preserving local-board id', async () => {
    // Seed a minimal v10 database with the schema slice we need: a `boards`
    // store containing one BoardRecord with id 'local-board' and no projectId.
    const v10 = await openDB(DB_NAME, 10, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('boards')) {
          const store = db.createObjectStore('boards', { keyPath: 'id' });
          store.createIndex('byUpdatedAt', 'updatedAt');
        }
      },
    });
    const now = Date.now();
    await v10.put('boards', {
      id: LOCAL_BOARD_ID,
      title: 'Main Board',
      createdAt: now,
      updatedAt: now,
      dataVersion: 1,
      changeCursor: 0,
      nextChangeSeq: 1,
    });
    v10.close();

    // Reopen via the production getDb() — triggers the v10 → v11 upgrade
    // path including the back-fill block.
    __resetDbForTests();
    const db = await getDb();

    const board = await db.get('boards', LOCAL_BOARD_ID);
    expect(board).toBeDefined();
    expect(board!.id).toBe(LOCAL_BOARD_ID);
    expect(board!.projectId).toBe(DEFAULT_PROJECT_ID);

    const project = await db.get('projects', DEFAULT_PROJECT_ID);
    expect(project).toBeDefined();
    expect(project!.id).toBe(DEFAULT_PROJECT_ID);
  });

  it('does not duplicate the default project on re-open', async () => {
    await getDefaultProject();
    // Close the cached connection so the module-level cache reset takes effect.
    const first = await getDb();
    first.close();
    __resetDbForTests();
    const db = await getDb();

    const all = await db.getAll('projects');
    expect(all.length).toBe(1);
    expect(all[0].id).toBe(DEFAULT_PROJECT_ID);
  });
});
