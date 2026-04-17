import { getDb } from './db';
import type { CritiqueStatus, IdeaCritique } from '../types';

export async function listCritiques(): Promise<IdeaCritique[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('critiques', 'byUpdatedAt');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listCritiquesForIdea(
  ideaId: string,
  status?: CritiqueStatus,
): Promise<IdeaCritique[]> {
  const db = await getDb();
  const rows = status
    ? await db.getAllFromIndex('critiques', 'byStatus', status)
    : await db.getAllFromIndex('critiques', 'byIdeaId', ideaId);
  return rows
    .filter(critique => critique.ideaId === ideaId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getCritique(id: string): Promise<IdeaCritique | undefined> {
  const db = await getDb();
  return db.get('critiques', id);
}

export async function createCritique(input: {
  ideaId: string;
  critique: string;
  evidenceAsk: string;
}): Promise<IdeaCritique> {
  const now = Date.now();
  const critique: IdeaCritique = {
    id: crypto.randomUUID(),
    ideaId: input.ideaId,
    critique: input.critique,
    evidenceAsk: input.evidenceAsk,
    status: 'active',
    source: 'devils_advocate',
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDb();
  await db.put('critiques', critique);
  return critique;
}

export async function updateCritique(id: string, patch: Partial<IdeaCritique>): Promise<IdeaCritique> {
  const db = await getDb();
  const current = await db.get('critiques', id);
  if (!current) throw new Error(`Critique not found: ${id}`);
  const updated: IdeaCritique = { ...current, ...patch, id, updatedAt: Date.now() };
  await db.put('critiques', updated);
  return updated;
}

export async function dismissCritique(id: string): Promise<IdeaCritique> {
  return updateCritique(id, { status: 'dismissed' });
}
