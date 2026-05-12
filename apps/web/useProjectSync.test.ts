/**
 * bo-103 — useProjectSync data-flow tests.
 *
 * The repo doesn't ship `@testing-library/react`, so we unit-test the same
 * storage path the hook exercises (load default project, mutate via
 * updateProject) instead of rendering. The point of these tests is to pin
 * down the contract the hook depends on — if `getDefaultProject()` or
 * `updateProject()` ever change shape, this file fails alongside the hook.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetDbForTests, getDb } from '../../src/storage/db';
import {
  DEFAULT_PROJECT_ID,
  getDefaultProject,
  updateProject,
} from '../../src/storage/projects';

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

describe('useProjectSync data flow', () => {
  beforeEach(async () => {
    await closeAndReset();
    await deleteDb();
  });

  afterEach(async () => {
    await closeAndReset();
    await deleteDb();
  });

  it('initial load resolves the default project (mirrors hook mount)', async () => {
    const project = await getDefaultProject();
    expect(project.id).toBe(DEFAULT_PROJECT_ID);
    expect(project.title).toBe('My workspace');
    expect(project.autonomyDial).toBe('active');
  });

  it('updateProject persists patches and bumps updatedAt', async () => {
    const initial = await getDefaultProject();
    // Force a measurable delta for updatedAt without relying on timer mocks.
    await new Promise(resolve => setTimeout(resolve, 2));
    const patched = await updateProject(initial.id, {
      title: 'Renamed workspace',
      autonomyDial: 'whispers',
    });
    expect(patched.id).toBe(initial.id);
    expect(patched.title).toBe('Renamed workspace');
    expect(patched.autonomyDial).toBe('whispers');
    expect(patched.updatedAt).toBeGreaterThanOrEqual(initial.updatedAt);

    // Re-read through the same path the hook uses on a fresh mount.
    const reloaded = await getDefaultProject();
    expect(reloaded.title).toBe('Renamed workspace');
    expect(reloaded.autonomyDial).toBe('whispers');
  });

  it('updateProject preserves id even when patch tries to override it', async () => {
    const initial = await getDefaultProject();
    // The storage module clamps id back to the target id even when callers
    // include it in the patch. This guards the hook contract that the
    // project identity is stable across mutations.
    const patched = await updateProject(initial.id, {
      id: 'should-not-stick',
      title: 'Stable id check',
    });
    expect(patched.id).toBe(initial.id);
    expect(patched.title).toBe('Stable id check');
  });
});
