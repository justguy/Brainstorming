/**
 * bo-120 — Persona storage module.
 *
 * Mirrors the conventions of boards.ts / groups.ts:
 *  - top-level async functions
 *  - all access via getDb()
 *  - new rows use crypto.randomUUID(); built-ins use deterministic ids from
 *    src/personas/registry.ts so seeding is idempotent across reloads.
 */
import {
  BUILT_IN_PERSONAS,
  makeBuiltInPersona,
} from '../personas/registry';
import type { BoardId, Persona, PersonaKind, PersonaScope, ProjectId } from '../types';
import { getDb } from './db';
import { DEFAULT_PROJECT_ID } from './projects';

export async function getPersona(id: string): Promise<Persona | undefined> {
  const db = await getDb();
  return db.get('personas', id);
}

export async function listPersonas(): Promise<Persona[]> {
  const db = await getDb();
  const all = await db.getAll('personas');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listPersonasForProject(
  projectId: ProjectId = DEFAULT_PROJECT_ID,
): Promise<Persona[]> {
  const all = await listPersonas();
  return all.filter(p => p.scope === 'project' && (p.projectId ?? DEFAULT_PROJECT_ID) === projectId);
}

export async function listPersonasForBoard(boardId: BoardId): Promise<Persona[]> {
  const all = await listPersonas();
  return all.filter(p => p.scope === 'board' && p.boardId === boardId);
}

export interface CreatePersonaInput {
  name: string;
  kind: PersonaKind;
  roleIds: string[];
  scope: PersonaScope;
  active?: boolean;
  projectId?: ProjectId;
  boardId?: BoardId;
  /** Optional explicit id. Used by built-ins; UUID otherwise. */
  id?: string;
}

export async function createPersona(input: CreatePersonaInput): Promise<Persona> {
  const now = Date.now();
  const persona: Persona = {
    id: input.id ?? crypto.randomUUID(),
    name: input.name,
    kind: input.kind,
    roleIds: [...input.roleIds],
    scope: input.scope,
    active: input.active ?? true,
    projectId: input.projectId,
    boardId: input.boardId,
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDb();
  await db.put('personas', persona);
  return persona;
}

export async function updatePersona(id: string, patch: Partial<Persona>): Promise<Persona> {
  const db = await getDb();
  const current = await db.get('personas', id);
  if (!current) throw new Error(`Persona not found: ${id}`);
  const updated: Persona = { ...current, ...patch, id, updatedAt: Date.now() };
  await db.put('personas', updated);
  return updated;
}

export async function deletePersona(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('personas', id);
}

/**
 * Idempotently seed the four built-in personas (Scout / Synthesizer / Devil /
 * Historian) for a given project. Skips entries that already exist (by their
 * deterministic id from the registry) so it's safe to call on every boot.
 *
 * Returns the persona records that exist for the project after seeding.
 */
export async function seedBuiltInPersonas(
  projectId: ProjectId = DEFAULT_PROJECT_ID,
): Promise<Persona[]> {
  const db = await getDb();
  const seeded: Persona[] = [];
  for (const spec of BUILT_IN_PERSONAS) {
    const existing = await db.get('personas', spec.id);
    if (existing) {
      seeded.push(existing);
      continue;
    }
    const persona = makeBuiltInPersona(spec, projectId, 'project', true);
    await db.put('personas', persona);
    seeded.push(persona);
  }
  return seeded;
}
