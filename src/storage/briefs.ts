/**
 * bo-151 — Brief storage module.
 *
 * Mirrors boards.ts / groups.ts conventions. The Brief is a top-level entity
 * that holds explicit version snapshots and persona-attributed margin notes
 * for a single source idea. `BriefState` (embedded on Idea) stays the live
 * derivation surface; `Brief` snapshots it on graduation / ⌘S.
 */
import type {
  BoardId,
  Brief,
  BriefShipStatus,
  BriefState,
  BriefVersion,
  MarginNote,
  MarginNoteStatus,
  ProjectId,
} from '../types';
import { getDb } from './db';

export async function getBrief(id: string): Promise<Brief | undefined> {
  const db = await getDb();
  return db.get('briefs', id);
}

/** Latest brief for an idea (most recently updated) or undefined. */
export async function getBriefForIdea(ideaId: string): Promise<Brief | undefined> {
  const db = await getDb();
  const all = await db.getAllFromIndex('briefs', 'byIdeaId', ideaId);
  if (all.length === 0) return undefined;
  return all.sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

export async function listBriefs(boardId: BoardId): Promise<Brief[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('briefs', 'byBoardId', boardId);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface CreateBriefInput {
  boardId: BoardId;
  ideaId: string;
  projectId?: ProjectId;
  shipStatus?: BriefShipStatus;
  /** Optional initial snapshot. If supplied, becomes versions[0]. */
  initialBriefState?: BriefState;
  initialArtifactMd?: string;
  initialAuthoredBy?: string;
  initialNote?: string;
}

export async function createBrief(input: CreateBriefInput): Promise<Brief> {
  const now = Date.now();
  const id = crypto.randomUUID();
  const versions: BriefVersion[] = [];
  if (input.initialBriefState) {
    versions.push({
      id: crypto.randomUUID(),
      briefId: id,
      seq: 1,
      briefState: input.initialBriefState,
      artifactMd: input.initialArtifactMd,
      authoredBy: input.initialAuthoredBy,
      note: input.initialNote,
      createdAt: now,
    });
  }
  const brief: Brief = {
    id,
    boardId: input.boardId,
    ideaId: input.ideaId,
    projectId: input.projectId,
    shipStatus: input.shipStatus ?? 'draft',
    versions,
    marginNotes: [],
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDb();
  await db.put('briefs', brief);
  return brief;
}

export interface AppendBriefVersionInput {
  briefState: BriefState;
  artifactMd?: string;
  authoredBy?: string;
  note?: string;
}

/** Append a new version snapshot to an existing brief. Auto-increments seq. */
export async function appendBriefVersion(
  briefId: string,
  input: AppendBriefVersionInput,
): Promise<Brief> {
  const db = await getDb();
  const current = await db.get('briefs', briefId);
  if (!current) throw new Error(`Brief not found: ${briefId}`);
  const now = Date.now();
  const lastSeq = current.versions.length > 0
    ? current.versions[current.versions.length - 1].seq
    : 0;
  const version: BriefVersion = {
    id: crypto.randomUUID(),
    briefId,
    seq: lastSeq + 1,
    briefState: input.briefState,
    artifactMd: input.artifactMd,
    authoredBy: input.authoredBy,
    note: input.note,
    createdAt: now,
  };
  const updated: Brief = {
    ...current,
    versions: [...current.versions, version],
    updatedAt: now,
  };
  await db.put('briefs', updated);
  return updated;
}

export interface AddMarginNoteInput {
  text: string;
  authorPersonaId?: string;
  authorLabel?: string;
  anchorSection?: string;
  anchorVersionId?: string;
}

export async function addMarginNote(
  briefId: string,
  input: AddMarginNoteInput,
): Promise<Brief> {
  const db = await getDb();
  const current = await db.get('briefs', briefId);
  if (!current) throw new Error(`Brief not found: ${briefId}`);
  const now = Date.now();
  const note: MarginNote = {
    id: crypto.randomUUID(),
    briefId,
    text: input.text,
    authorPersonaId: input.authorPersonaId,
    authorLabel: input.authorLabel,
    anchorSection: input.anchorSection,
    anchorVersionId: input.anchorVersionId,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };
  const updated: Brief = {
    ...current,
    marginNotes: [...current.marginNotes, note],
    updatedAt: now,
  };
  await db.put('briefs', updated);
  return updated;
}

export interface ResolveMarginNoteInput {
  noteId: string;
  status: Exclude<MarginNoteStatus, 'open'>;
  resolvedBy?: string;
  resolutionNote?: string;
}

export async function resolveMarginNote(
  briefId: string,
  input: ResolveMarginNoteInput,
): Promise<Brief> {
  const db = await getDb();
  const current = await db.get('briefs', briefId);
  if (!current) throw new Error(`Brief not found: ${briefId}`);
  const idx = current.marginNotes.findIndex(n => n.id === input.noteId);
  if (idx < 0) throw new Error(`Margin note not found: ${input.noteId}`);
  const now = Date.now();
  const next = [...current.marginNotes];
  next[idx] = {
    ...next[idx],
    status: input.status,
    resolvedAt: now,
    resolvedBy: input.resolvedBy,
    resolutionNote: input.resolutionNote,
    updatedAt: now,
  };
  const updated: Brief = {
    ...current,
    marginNotes: next,
    updatedAt: now,
  };
  await db.put('briefs', updated);
  return updated;
}

export async function setShipStatus(
  briefId: string,
  shipStatus: BriefShipStatus,
): Promise<Brief> {
  const db = await getDb();
  const current = await db.get('briefs', briefId);
  if (!current) throw new Error(`Brief not found: ${briefId}`);
  const now = Date.now();
  const updated: Brief = {
    ...current,
    shipStatus,
    shippedAt: shipStatus === 'shipped' ? (current.shippedAt ?? now) : current.shippedAt,
    updatedAt: now,
  };
  await db.put('briefs', updated);
  return updated;
}
