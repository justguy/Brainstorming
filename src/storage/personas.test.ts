/**
 * bo-120 — built-in persona seeding.
 *
 * Asserts:
 *  1. After getDefaultProject(), four built-in personas exist with the
 *     expected kinds (scout, synthesizer, devil, historian).
 *  2. seedBuiltInPersonas() is idempotent — a second call leaves the row
 *     count unchanged and re-uses the same ids.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetDbForTests, getDb } from './db';
import { getDefaultProject } from './projects';
import { listPersonas, seedBuiltInPersonas } from './personas';

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

describe('built-in persona seeding', () => {
  beforeEach(async () => {
    await closeAndReset();
    await deleteDb();
  });

  afterEach(async () => {
    await closeAndReset();
    await deleteDb();
  });

  it('seeds four built-ins after first getDefaultProject()', async () => {
    await getDefaultProject();
    const personas = await listPersonas();
    expect(personas.length).toBe(4);

    const kinds = personas.map(p => p.kind).sort();
    expect(kinds).toEqual(['devil', 'historian', 'scout', 'synthesizer']);

    // All built-ins should be active and project-scoped under the default
    // project id.
    for (const p of personas) {
      expect(p.active).toBe(true);
      expect(p.scope).toBe('project');
      expect(p.projectId).toBe('local-project');
      expect(p.roleIds.length).toBeGreaterThan(0);
    }
  });

  it('is idempotent across repeated seed calls', async () => {
    await getDefaultProject();
    const first = await listPersonas();
    const idsFirst = first.map(p => p.id).sort();

    // Call seed again; nothing should be appended.
    await seedBuiltInPersonas();
    const second = await listPersonas();
    expect(second.length).toBe(first.length);
    expect(second.map(p => p.id).sort()).toEqual(idsFirst);
  });
});
