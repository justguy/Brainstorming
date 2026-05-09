/**
 * bo-162 — usePromoteToPrinciple data-flow tests.
 *
 * Mirrors `useProjectSync.test.ts`: the repo doesn't ship
 * `@testing-library/react`, so we exercise the storage path the hook depends
 * on (load default project, append a principle, dedupe) instead of rendering.
 * The test pins down two contracts:
 *
 *   1. `usePromoteToPrinciple` and `PrinciplesDrawer` agree on dedupe rules
 *      via the exported `principleMatches` helper (case-insensitive trim).
 *   2. The append + write-back round-trip preserves prior entries and adds
 *      the new one at the end (promotion order).
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetDbForTests, getDb } from '../../src/storage/db';
import {
  DEFAULT_PROJECT_ID,
  getDefaultProject,
  updateProject,
} from '../../src/storage/projects';
import { principleMatches } from './usePromoteToPrinciple';

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
    /* no-op */
  }
  __resetDbForTests();
}

describe('usePromoteToPrinciple data flow', () => {
  beforeEach(async () => {
    await closeAndReset();
    await deleteDb();
  });

  afterEach(async () => {
    await closeAndReset();
    await deleteDb();
  });

  it('principleMatches dedupes case-insensitively after trim', () => {
    expect(principleMatches('Ship small', 'ship small')).toBe(true);
    expect(principleMatches('  Ship small  ', 'SHIP SMALL')).toBe(true);
    expect(principleMatches('Ship small', 'Ship smaller')).toBe(false);
    expect(principleMatches('', '')).toBe(true);
  });

  it('appends a fresh principle to the project list and persists', async () => {
    const initial = await getDefaultProject();
    expect(initial.principles ?? []).toEqual([]);

    const updated = await updateProject(initial.id, {
      principles: [...(initial.principles ?? []), 'Default to clarity'],
    });
    expect(updated.id).toBe(DEFAULT_PROJECT_ID);
    expect(updated.principles).toEqual(['Default to clarity']);

    const reloaded = await getDefaultProject();
    expect(reloaded.principles).toEqual(['Default to clarity']);
  });

  it('promotion order is stable and append-only across repeated writes', async () => {
    const initial = await getDefaultProject();
    await updateProject(initial.id, {
      principles: ['First', 'Second'],
    });
    await new Promise(resolve => setTimeout(resolve, 2));
    const next = await updateProject(initial.id, {
      principles: ['First', 'Second', 'Third'],
    });
    expect(next.principles).toEqual(['First', 'Second', 'Third']);
  });
});
