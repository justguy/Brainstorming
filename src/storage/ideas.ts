import { createCapturedIdea, defaultBriefState, defaultPanelForIdea } from '../board/ideaFactory';
import { DEFAULT_BOARD_ID } from '../board/types';
import type { BoardId, Idea, LlmMessage, BriefState, Panel } from '../types';
import { getDb } from './db';
import { deleteIdeaRow, publishIdeaRow, startIdeaSync } from './ideaSync';
import { ensureBoardStorageBridge } from './migrationBridge';
import {
  appendTurnRecord,
  countTurnsForIdea,
  getTurnLogPageFromStore,
  syncTurnsForIdea,
  type TurnLogPage,
} from './turns';

// Backfill fields added in later migrations onto older rows so callers can
// assume the full shape. Mutates a copy, not the caller's object.
function hydrateIdea(idea: Idea): Idea {
  const bs = idea.briefState ?? ({} as BriefState);
  const hydrated: Idea = {
    ...idea,
    boardId: idea.boardId ?? DEFAULT_BOARD_ID,
    briefState: {
      ...bs,
      mustStayTrueRules: bs.mustStayTrueRules ?? [],
      approaches: bs.approaches ?? [],
      rejectedApproaches: bs.rejectedApproaches ?? [],
      risks: bs.risks ?? [],
      successCriteria: bs.successCriteria ?? [],
      outOfScope: bs.outOfScope ?? [],
      openQuestions: bs.openQuestions ?? [],
      lenses: bs.lenses ?? [],
      challenges: bs.challenges ?? [],
      stressResults: bs.stressResults ?? [],
    },
    lastTurnAt: idea.lastTurnAt ?? (idea.turnLog.length > 0 ? idea.updatedAt : undefined),
    panel: idea.panel ?? defaultPanelForIdea(idea),
  };
  return hydrated;
}

async function fetchIdea(id: string): Promise<Idea> {
  await ensureBoardStorageBridge();
  const db = await getDb();
  const idea = await db.get('ideas', id);
  if (!idea) throw new Error(`Idea not found: ${id}`);
  return hydrateIdea(idea);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Return all ideas for one board, sorted by updatedAt descending. */
export async function listIdeas(boardId: BoardId = DEFAULT_BOARD_ID): Promise<Idea[]> {
  await ensureBoardStorageBridge(boardId);
  startIdeaSync(boardId);
  const db = await getDb();
  const all = await db.getAllFromIndex('ideas', 'byBoardId', boardId);
  return all
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(hydrateIdea);
}

/** Return a single idea by id, or undefined if not found. */
export async function getIdea(id: string): Promise<Idea | undefined> {
  await ensureBoardStorageBridge();
  const db = await getDb();
  const row = await db.get('ideas', id);
  if (row?.boardId) startIdeaSync(row.boardId);
  return row ? hydrateIdea(row) : undefined;
}

/** Create a new idea with v2 defaults. */
export async function createIdea({
  rawText,
  tags,
  panel,
  boardId = DEFAULT_BOARD_ID,
}: {
  rawText: string;
  tags: string[];
  panel?: Panel;
  boardId?: BoardId;
}): Promise<Idea> {
  await ensureBoardStorageBridge(boardId);
  startIdeaSync(boardId);
  const idea = createCapturedIdea({ rawText, tags, panel, boardId });
  const db = await getDb();
  await db.put('ideas', idea);
  await publishIdeaRow(idea);
  return idea;
}

/** Shallow-merge patch into idea and bump updatedAt. */
export async function updateIdea(id: string, patch: Partial<Idea>): Promise<Idea> {
  const idea = await fetchIdea(id);
  const boardId = patch.boardId ?? idea.boardId ?? DEFAULT_BOARD_ID;
  const updated: Idea = { ...idea, ...patch, id, boardId, updatedAt: Date.now() };
  startIdeaSync(boardId);
  const db = await getDb();
  await db.put('ideas', updated);
  if (patch.turnLog) {
    await syncTurnsForIdea(boardId, id, updated.turnLog, updated.lastTurnAt ?? updated.updatedAt);
  }
  await publishIdeaRow(updated);
  return updated;
}

/** Delete an idea by id. */
export async function deleteIdea(id: string): Promise<void> {
  const idea = await getIdea(id);
  const db = await getDb();
  await db.delete('ideas', id);
  if (idea) {
    await deleteIdeaRow(idea.boardId ?? DEFAULT_BOARD_ID, id);
  }
}

/**
 * Move an idea to the discard pile (status='discarded'). Discarded ideas are
 * hidden from the canvas but remain indexed so the connection finder, scout,
 * and agents can still reason over what has been ruled out.
 */
export async function discardIdea(id: string): Promise<Idea> {
  return updateIdea(id, { status: 'discarded' });
}

/**
 * Restore a discarded idea back to its previous working status. We do not
 * persist prior status explicitly, so we flip it back to 'captured' — the user
 * can resume from whatever phase it was at.
 */
export async function restoreIdea(id: string): Promise<Idea> {
  return updateIdea(id, { status: 'captured' });
}

/** List every discarded idea, newest-discarded first (by updatedAt). */
export async function listDiscardedIdeas(boardId: BoardId = DEFAULT_BOARD_ID): Promise<Idea[]> {
  await ensureBoardStorageBridge(boardId);
  const db = await getDb();
  const all = await db.getAllFromIndex('ideas', 'byStatus', 'discarded');
  return all
    .filter(idea => (idea.boardId ?? DEFAULT_BOARD_ID) === boardId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(hydrateIdea);
}

// ---------------------------------------------------------------------------
// Domain operations
// ---------------------------------------------------------------------------

/** Append an LlmMessage to the idea's turnLog. */
export async function appendTurn(id: string, msg: LlmMessage): Promise<Idea> {
  const idea = await fetchIdea(id);
  const now = Date.now();
  const updated: Idea = {
    ...idea,
    turnLog: [...idea.turnLog, msg],
    updatedAt: now,
    lastTurnAt: now,
  };
  const db = await getDb();
  await db.put('ideas', updated);
  await appendTurnRecord(updated.boardId ?? DEFAULT_BOARD_ID, id, msg, now);
  await publishIdeaRow(updated);
  return updated;
}

export async function getTurnLogPage(
  id: string,
  options: { cursor?: string; limit?: number } = {},
): Promise<TurnLogPage> {
  const idea = await fetchIdea(id);
  const boardId = idea.boardId ?? DEFAULT_BOARD_ID;
  const storedTurns = await countTurnsForIdea(boardId, id);
  if (storedTurns > 0) {
    return getTurnLogPageFromStore(boardId, id, options);
  }
  const start = Math.max(0, Number.parseInt(options.cursor ?? '0', 10) || 0);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const entries = idea.turnLog.slice(start, start + limit);
  const nextIndex = start + entries.length;

  return {
    entries,
    nextCursor: nextIndex < idea.turnLog.length ? String(nextIndex) : null,
    totalTurns: idea.turnLog.length,
  };
}

/** Deep-ish merge for briefState: merges top-level fields, replacing arrays wholesale. */
export async function updateBriefState(
  id: string,
  partial: Partial<BriefState>,
): Promise<Idea> {
  const idea = await fetchIdea(id);
  const updated: Idea = {
    ...idea,
    briefState: { ...idea.briefState, ...partial },
    updatedAt: Date.now(),
  };
  const db = await getDb();
  await db.put('ideas', updated);
  await publishIdeaRow(updated);
  return updated;
}

/** Set the readiness signal on an idea. */
export async function setReadiness(
  id: string,
  readiness: 'red' | 'yellow' | 'green',
): Promise<Idea> {
  const idea = await fetchIdea(id);
  const updated: Idea = { ...idea, readiness, updatedAt: Date.now() };
  const db = await getDb();
  await db.put('ideas', updated);
  await publishIdeaRow(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Smoke test
// ---------------------------------------------------------------------------

/**
 * Round-trips an idea through create → updateBriefState → appendTurn → delete.
 * Returns true on success; throws on any failure.
 */
export async function smokeTest(): Promise<boolean> {
  const idea = await createIdea({
    rawText: '__smoke_test__',
    tags: ['__test__'],
  });

  await updateBriefState(idea.id, {
    problemStatement: 'smoke test problem',
    mustStayTrueRules: ['rule1'],
  });

  await appendTurn(idea.id, {
    role: 'user',
    content: 'smoke test message',
  });

  const fetched = await getIdea(idea.id);
  if (!fetched) throw new Error('smokeTest: idea not found after create');
  if (fetched.briefState.problemStatement !== 'smoke test problem') {
    throw new Error('smokeTest: briefState not persisted');
  }
  if (fetched.turnLog.length !== 1) {
    throw new Error('smokeTest: turnLog not persisted');
  }

  await deleteIdea(idea.id);

  const gone = await getIdea(idea.id);
  if (gone) throw new Error('smokeTest: idea not deleted');

  return true;
}
