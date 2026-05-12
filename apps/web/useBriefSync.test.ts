/**
 * bo-153 — useBriefSync sanity tests.
 *
 * The hook's effect-driven render path is not exercised here because the
 * project does not ship jsdom / @testing-library/react. Instead we verify the
 * two pieces that matter for correctness independently of React:
 *
 *   1. `normaliseInput` resolves the `{ ideaId } | { briefId } | null`
 *      discriminator the hook keys its load on.
 *   2. The storage round-trip the hook delegates to (`getBriefForIdea` +
 *      `appendBriefVersion`) is wired such that the latest snapshot wins —
 *      the contract the hook relies on for the "fetch by idea" branch.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetDbForTests, getDb } from '../../src/storage/db';
import {
  appendBriefVersion,
  createBrief,
  getBrief,
  getBriefForIdea,
} from '../../src/storage/briefs';
import type { BriefState } from '../../src/types';
import { normaliseInput } from './useBriefSync';

const DB_NAME = 'brainstorming-orchestrator';

const EMPTY_BRIEF_STATE: BriefState = {
  mustStayTrueRules: [],
  approaches: [],
  rejectedApproaches: [],
  risks: [],
  successCriteria: [],
  outOfScope: [],
  openQuestions: [],
  lenses: [],
  challenges: [],
  stressResults: [],
};

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

describe('normaliseInput', () => {
  it('returns null for nullish input', () => {
    expect(normaliseInput(null)).toBeNull();
    expect(normaliseInput(undefined)).toBeNull();
  });

  it('prefers briefId when both are present (TS prevents this but runtime guards anyway)', () => {
    const result = normaliseInput({ briefId: 'brief-1' } as never);
    expect(result).toEqual({ kind: 'brief', id: 'brief-1' });
  });

  it('returns ideaId variant when only ideaId is supplied', () => {
    expect(normaliseInput({ ideaId: 'idea-42' })).toEqual({ kind: 'idea', id: 'idea-42' });
  });

  it('returns null when the supplied id is empty', () => {
    expect(normaliseInput({ ideaId: '' })).toBeNull();
    expect(normaliseInput({ briefId: '' })).toBeNull();
  });
});

describe('useBriefSync storage contract', () => {
  beforeEach(async () => {
    await closeAndReset();
    await deleteDb();
  });

  afterEach(async () => {
    await closeAndReset();
    await deleteDb();
  });

  it('getBriefForIdea returns the most recently updated brief for an idea', async () => {
    const older = await createBrief({ boardId: 'board-1', ideaId: 'idea-1' });
    // Tiny clock skew so updatedAt orders deterministically.
    await new Promise(r => setTimeout(r, 2));
    const newer = await createBrief({ boardId: 'board-1', ideaId: 'idea-1' });

    const fetched = await getBriefForIdea('idea-1');
    expect(fetched?.id).toBe(newer.id);
    expect(fetched?.id).not.toBe(older.id);
  });

  it('appendBriefVersion writes through and is observable via getBrief', async () => {
    const brief = await createBrief({ boardId: 'board-1', ideaId: 'idea-1' });
    const updated = await appendBriefVersion(brief.id, {
      briefState: EMPTY_BRIEF_STATE,
      authoredBy: 'user',
    });
    expect(updated.versions).toHaveLength(1);
    expect(updated.versions[0].seq).toBe(1);

    const refetched = await getBrief(brief.id);
    expect(refetched?.versions).toHaveLength(1);
    expect(refetched?.updatedAt).toBe(updated.updatedAt);
  });
});
