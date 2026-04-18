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

export async function countDocsForIdea(
  ideaId: string,
  boardId: BoardId = DEFAULT_BOARD_ID,
): Promise<number> {
  await ensureBoardStorageBridge(boardId);
  const db = await getDb();
  const all = await db.getAllFromIndex('docs', 'byIdeaId', ideaId);
  return all.filter(doc => (doc.boardId ?? DEFAULT_BOARD_ID) === boardId).length;
}

export function deriveTitle(rawText: string): string {
  const firstLine = rawText.split(/\r?\n/).find(l => l.trim().length > 0) ?? '';
  const trimmed = firstLine.trim();
  if (trimmed.length === 0) return 'Untitled note';
  return trimmed.length > 60 ? trimmed.slice(0, 57) + '…' : trimmed;
}

export type { SupportingDocStatus };
