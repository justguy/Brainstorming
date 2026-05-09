import type { AutonomyLevel, Project, ProjectId } from '../types';
import { getDb } from './db';

export const DEFAULT_PROJECT_ID: ProjectId = 'local-project';
export const DEFAULT_PROJECT_TITLE = 'My workspace';
export const DEFAULT_AUTONOMY_DIAL: AutonomyLevel = 'active';

export function makeProject(
  id: ProjectId = DEFAULT_PROJECT_ID,
  title: string = DEFAULT_PROJECT_TITLE,
  autonomyDial: AutonomyLevel = DEFAULT_AUTONOMY_DIAL,
): Project {
  const now = Date.now();
  return {
    id,
    title,
    autonomyDial,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getProject(id: ProjectId): Promise<Project | undefined> {
  const db = await getDb();
  return db.get('projects', id);
}

export async function ensureProject(
  id: ProjectId = DEFAULT_PROJECT_ID,
  title: string = DEFAULT_PROJECT_TITLE,
): Promise<Project> {
  const db = await getDb();
  const existing = await db.get('projects', id);
  if (existing) return existing;
  const project = makeProject(id, title);
  await db.put('projects', project);
  return project;
}

export async function listProjects(): Promise<Project[]> {
  const db = await getDb();
  const all = await db.getAll('projects');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function updateProject(
  id: ProjectId,
  patch: Partial<Project>,
): Promise<Project> {
  const db = await getDb();
  const current = (await db.get('projects', id)) ?? makeProject(id);
  const updated: Project = {
    ...current,
    ...patch,
    id,
    updatedAt: Date.now(),
  };
  await db.put('projects', updated);
  return updated;
}

export async function getDefaultProject(): Promise<Project> {
  const project = await ensureProject();
  // bo-120: seed built-in personas the first time the default project is
  // touched. Idempotent — a no-op on subsequent boots. Lazy import keeps
  // module load order independent.
  const { seedBuiltInPersonas } = await import('./personas');
  await seedBuiltInPersonas(project.id);
  return project;
}
