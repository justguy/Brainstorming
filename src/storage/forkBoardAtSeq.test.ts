/**
 * bo-157 — forkBoardAtSeq mutation tests.
 *
 * Coverage:
 *   1. Forking at an intermediate seq seeds the new board's stores with the
 *      visual state at that seq (idea exists, later additions don't leak).
 *   2. The source board is left untouched (rows + seq counters intact).
 *   3. Title defaults to "Fork of <source.title> at #<seq>" and respects
 *      caller-supplied overrides.
 *   4. The fork carries `projectId` from the source so it lands in the same
 *      project.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetDbForTests, getDb } from './db';
import { forkBoardAtSeq } from './forkBoardAtSeq';
import type { BoardRecord, ChangeSetRecord } from '../board/types';
import type { Idea } from '../types';

const DB_NAME = 'brainstorming-orchestrator';
const SOURCE_BOARD_ID = 'source-board-1';
const SOURCE_PROJECT_ID = 'local-project';

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

// Build a minimal Idea row. We intentionally only populate the fields the
// fork pipeline reads + writes; the IDB store is schemaless beyond keypath so
// missing fields round-trip fine.
function makeIdea(partial: Partial<Idea> & { id: string }): Idea {
  return {
    id: partial.id,
    boardId: partial.boardId ?? SOURCE_BOARD_ID,
    rawText: partial.rawText ?? `idea ${partial.id} text`,
    tags: partial.tags ?? [],
    createdAt: partial.createdAt ?? 1_000,
    updatedAt: partial.updatedAt ?? 2_000,
    status: partial.status ?? 'captured',
    phase: partial.phase ?? 0,
    briefState: partial.briefState ?? ({
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
    } as unknown as Idea['briefState']),
    ambiguities: partial.ambiguities ?? [],
    clarifications: partial.clarifications ?? [],
    turnLog: partial.turnLog ?? [],
    readiness: partial.readiness ?? 'red',
    panel: partial.panel ?? { x: 0, y: 0, width: 200, height: 120 },
  };
}

function changeSet(input: {
  id: string;
  seq: number;
  ideaId: string;
  ideaPayload: Idea;
  kind?: ChangeSetRecord['kind'];
}): ChangeSetRecord {
  const kind = input.kind ?? 'capture_idea';
  return {
    id: input.id,
    boardId: SOURCE_BOARD_ID,
    seq: input.seq,
    baseSeq: input.seq - 1,
    kind,
    actor: { type: 'user', source: 'canvas' },
    summary: `seed ${input.ideaId}`,
    affected: [{ store: 'ideas', id: input.ideaId }],
    forward: [
      {
        op: 'add',
        path: `/stores/ideas/${input.ideaId}`,
        value: input.ideaPayload,
      },
    ],
    inverse: [
      {
        op: 'remove',
        path: `/stores/ideas/${input.ideaId}`,
      },
    ],
    committedAt: 1_000 + input.seq,
    status: 'committed',
  };
}

async function seedSource(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['boards', 'changeSets'], 'readwrite');

  const sourceBoard: BoardRecord = {
    id: SOURCE_BOARD_ID,
    title: 'Source board',
    createdAt: 1_000,
    updatedAt: 5_000,
    dataVersion: 1,
    changeCursor: 3,
    nextChangeSeq: 4,
    projectId: SOURCE_PROJECT_ID,
    status: 'active',
    currentPhase: 2,
    activePersonas: ['scout'],
    lastActivityAt: 5_000,
    summary: 'source summary',
  };
  await tx.objectStore('boards').put(sourceBoard);

  // Three changeSets, each adding one idea. After seq 1: {idea-1}.
  // After seq 2: {idea-1, idea-2}. After seq 3: {idea-1, idea-2, idea-3}.
  const cs1 = changeSet({
    id: 'cs-1',
    seq: 1,
    ideaId: 'idea-1',
    ideaPayload: makeIdea({ id: 'idea-1', rawText: 'first' }),
  });
  const cs2 = changeSet({
    id: 'cs-2',
    seq: 2,
    ideaId: 'idea-2',
    ideaPayload: makeIdea({ id: 'idea-2', rawText: 'second' }),
  });
  const cs3 = changeSet({
    id: 'cs-3',
    seq: 3,
    ideaId: 'idea-3',
    ideaPayload: makeIdea({ id: 'idea-3', rawText: 'third' }),
  });
  await tx.objectStore('changeSets').put(cs1);
  await tx.objectStore('changeSets').put(cs2);
  await tx.objectStore('changeSets').put(cs3);

  await tx.done;
}

describe('forkBoardAtSeq', () => {
  beforeEach(async () => {
    await closeAndReset();
    await deleteDb();
    await seedSource();
  });

  afterEach(async () => {
    await closeAndReset();
    await deleteDb();
  });

  it('forks at an intermediate seq with only the ideas that existed then', async () => {
    const fork = await forkBoardAtSeq(SOURCE_BOARD_ID, 2, {
      newBoardId: 'fork-board-A',
      now: 99_999,
    });

    expect(fork.id).toBe('fork-board-A');
    expect(fork.title).toBe('Fork of Source board at #2');
    expect(fork.projectId).toBe(SOURCE_PROJECT_ID);
    expect(fork.changeCursor).toBe(0);
    expect(fork.nextChangeSeq).toBe(1);
    expect(fork.status).toBe('active');
    expect(fork.currentPhase).toBe(2);
    expect(fork.activePersonas).toEqual(['scout']);
    expect(fork.lastActivityAt).toBe(99_999);
    expect(fork.createdAt).toBe(99_999);
    expect(fork.updatedAt).toBe(99_999);

    const db = await getDb();
    const forkedIdeas = await db.getAllFromIndex('ideas', 'byBoardId', 'fork-board-A');
    const ids = forkedIdeas.map((i) => i.id).sort();
    expect(ids).toEqual(['idea-1', 'idea-2']);
    // boardId rewritten on every seeded row.
    for (const idea of forkedIdeas) {
      expect(idea.boardId).toBe('fork-board-A');
    }
  });

  it('leaves the source board and its rows untouched', async () => {
    const before = await snapshotSource();
    await forkBoardAtSeq(SOURCE_BOARD_ID, 1, {
      newBoardId: 'fork-board-B',
      now: 12_345,
    });
    const after = await snapshotSource();

    expect(after.board).toEqual(before.board);
    // Same number of changeSets, no boardId mutation.
    expect(after.changeSets.length).toBe(before.changeSets.length);
    expect(after.changeSets.map((cs) => cs.id).sort()).toEqual(
      before.changeSets.map((cs) => cs.id).sort(),
    );
    // Source ideas should still be empty (we never wrote rows directly to the
    // ideas store on the source — they only exist as patches in changeSets).
    expect(after.ideas.length).toBe(0);
  });

  it('honors the title override and synthesises the default otherwise', async () => {
    const overridden = await forkBoardAtSeq(SOURCE_BOARD_ID, 3, {
      newBoardId: 'fork-board-C',
      title: 'My fork',
      now: 1,
    });
    expect(overridden.title).toBe('My fork');

    const defaulted = await forkBoardAtSeq(SOURCE_BOARD_ID, 3, {
      newBoardId: 'fork-board-D',
      now: 2,
    });
    expect(defaulted.title).toBe('Fork of Source board at #3');
  });

  it('throws when the source board does not exist', async () => {
    await expect(
      forkBoardAtSeq('does-not-exist', 1, { newBoardId: 'x', now: 0 }),
    ).rejects.toThrow(/source board not found/i);
  });
});

async function snapshotSource(): Promise<{
  board: BoardRecord | undefined;
  changeSets: ChangeSetRecord[];
  ideas: Idea[];
}> {
  const db = await getDb();
  const board = await db.get('boards', SOURCE_BOARD_ID);
  const changeSets = (await db.getAllFromIndex(
    'changeSets',
    'byBoardId',
    SOURCE_BOARD_ID,
  )) as ChangeSetRecord[];
  const ideas = (await db.getAllFromIndex(
    'ideas',
    'byBoardId',
    SOURCE_BOARD_ID,
  )) as Idea[];
  return { board, changeSets, ideas };
}
