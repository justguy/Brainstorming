/**
 * docs.ts — CRUD for per-idea supporting documents.
 *
 * Supporting docs are NOT ideas. They are reference material the user pastes in
 * (copy/paste from wiki, PRD excerpts, research notes). Each doc belongs to one
 * idea and is refined once at upload into a summary + list of facts that the
 * orchestrator injects into future phase prompts.
 */

import { DEFAULT_BOARD_ID } from '../board/types';
import type { BoardId, SupportingDoc, SupportingDocStatus } from '../types';
import { getDb } from './db';
import { ensureBoardStorageBridge } from './migrationBridge';

export async function listDocs(boardId: BoardId = DEFAULT_BOARD_ID): Promise<SupportingDoc[]> {
  await ensureBoardStorageBridge(boardId);
  const db = await getDb();
  const all = await db.getAllFromIndex('docs', 'byBoardId', boardId);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listDocsForIdea(
  ideaId: string,
  boardId: BoardId = DEFAULT_BOARD_ID,
): Promise<SupportingDoc[]> {
  await ensureBoardStorageBridge(boardId);
  const db = await getDb();
  const all = await db.getAllFromIndex('docs', 'byIdeaId', ideaId);
  return all
    .filter(doc => (doc.boardId ?? DEFAULT_BOARD_ID) === boardId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDoc(id: string): Promise<SupportingDoc | undefined> {
  const db = await getDb();
  return db.get('docs', id);
}

export interface CreateDocInput {
  boardId?: BoardId;
  ideaId: string;
  title: string;
  rawText: string;
}

export async function createDoc(input: CreateDocInput): Promise<SupportingDoc> {
  const boardId = input.boardId ?? DEFAULT_BOARD_ID;
  await ensureBoardStorageBridge(boardId);
  const now = Date.now();
  const doc: SupportingDoc = {
    id: crypto.randomUUID(),
    boardId,
    ideaId: input.ideaId,
    title: input.title.trim() || deriveTitle(input.rawText),
    rawText: input.rawText,
    facts: [],
    status: 'processing',
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDb();
  await db.put('docs', doc);
  return doc;
}

export async function updateDoc(id: string, patch: Partial<SupportingDoc>): Promise<SupportingDoc> {
  const db = await getDb();
  const current = await db.get('docs', id);
  if (!current) throw new Error(`Doc not found: ${id}`);
  const updated: SupportingDoc = { ...current, ...patch, id, updatedAt: Date.now() };
  await db.put('docs', updated);
  return updated;
}

export async function deleteDoc(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('docs', id);
}

export async function countDocsForIdea(
  ideaId: string,
  boardId: BoardId = DEFAULT_BOARD_ID,
): Promise<number> {
  await ensureBoardStorageBridge(boardId);
  const db = await getDb();
  const all = await db.getAllFromIndex('docs', 'byIdeaId', ideaId);
  return all.filter(doc => (doc.boardId ?? DEFAULT_BOARD_ID) === boardId).length;
}

export async function markDocReady(
  id: string,
  summary: string,
  facts: string[]
): Promise<SupportingDoc> {
  return updateDoc(id, { status: 'ready', summary, facts, error: undefined });
}

export async function markDocFailed(id: string, error: string): Promise<SupportingDoc> {
  return updateDoc(id, { status: 'failed', error });
}

export function deriveTitle(rawText: string): string {
  const firstLine = rawText.split(/\r?\n/).find(l => l.trim().length > 0) ?? '';
  const trimmed = firstLine.trim();
  if (trimmed.length === 0) return 'Untitled note';
  return trimmed.length > 60 ? trimmed.slice(0, 57) + '…' : trimmed;
}

export type { SupportingDocStatus };
