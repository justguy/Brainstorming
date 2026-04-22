/**
 * suggestions.ts — CRUD for scout-generated suggestions (ghost ideas).
 *
 * Suggestions are NOT ideas. They are proposals produced by the outsideKnowledgeScout
 * role that the user hasn't admitted yet. Admitted suggestions produce a real Idea;
 * dismissed ones stay in the store so the scout can avoid re-proposing them.
 */

import { DEFAULT_BOARD_ID } from '../board/types';
import type { BoardId, ScoutSuggestion, ScoutSuggestionStatus } from '../types';
import { getDb } from './db';
import { ensureBoardStorageBridge } from './migrationBridge';

export async function listSuggestions(boardId: BoardId = DEFAULT_BOARD_ID): Promise<ScoutSuggestion[]> {
  await ensureBoardStorageBridge(boardId);
  const db = await getDb();
  const all = await db.getAllFromIndex('suggestions', 'byBoardId', boardId);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listSuggestionsByStatus(
  status: ScoutSuggestionStatus,
  boardId: BoardId = DEFAULT_BOARD_ID,
): Promise<ScoutSuggestion[]> {
  await ensureBoardStorageBridge(boardId);
  const db = await getDb();
  const all = await db.getAllFromIndex('suggestions', 'byStatus', status);
  return all
    .filter(suggestion => (suggestion.boardId ?? DEFAULT_BOARD_ID) === boardId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSuggestion(id: string): Promise<ScoutSuggestion | undefined> {
  const db = await getDb();
  return db.get('suggestions', id);
}

export interface CreateSuggestionInput {
  boardId?: BoardId;
  rawText: string;
  rationale: string;
  source: string;
  sourceIdeaIds?: string[];
  relatedIdeaIds?: string[];
  panel?: ScoutSuggestion['panel'];
}

export async function createSuggestion(input: CreateSuggestionInput): Promise<ScoutSuggestion> {
  const boardId = input.boardId ?? DEFAULT_BOARD_ID;
  await ensureBoardStorageBridge(boardId);
  const now = Date.now();
  const suggestion: ScoutSuggestion = {
    id: crypto.randomUUID(),
    boardId,
    rawText: input.rawText,
    rationale: input.rationale,
    source: input.source,
    status: 'pending',
    sourceIdeaIds: input.sourceIdeaIds,
    relatedIdeaIds: input.relatedIdeaIds,
    panel: input.panel,
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDb();
  await db.put('suggestions', suggestion);
  return suggestion;
}

export async function updateSuggestion(id: string, patch: Partial<ScoutSuggestion>): Promise<ScoutSuggestion> {
  const db = await getDb();
  const current = await db.get('suggestions', id);
  if (!current) throw new Error(`Suggestion not found: ${id}`);
  const updated: ScoutSuggestion = { ...current, ...patch, id, updatedAt: Date.now() };
  await db.put('suggestions', updated);
  return updated;
}

/** Mark a suggestion admitted and link it to the new real Idea id. */
export async function admitSuggestion(id: string, admittedIdeaId: string): Promise<ScoutSuggestion> {
  return updateSuggestion(id, { status: 'admitted', admittedIdeaId });
}

/** Mark a suggestion dismissed. It stays in the store so the scout can avoid re-proposing it. */
export async function dismissSuggestion(id: string): Promise<ScoutSuggestion> {
  return updateSuggestion(id, { status: 'dismissed' });
}

/** Store elaboration text on a suggestion (from a scout re-call). */
export async function setSuggestionElaboration(id: string, elaboration: string): Promise<ScoutSuggestion> {
  return updateSuggestion(id, { elaboration });
}
