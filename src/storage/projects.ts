import type { AutonomyLevel, BoardId, CrossBoardEdge, Project, ProjectId } from '../types';
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

/**
 * bo-161 — canonicalise a cross-board edge so (A,B) and (B,A) collapse to one
 * entry. Sorts the pair lexicographically and trims/dedupes themes. Returns
 * null when the pair is invalid (self-edge, missing ids, no themes).
 */
export function normaliseCrossBoardEdge(
  edge: CrossBoardEdge,
): CrossBoardEdge | null {
  const a = edge.boardA?.trim();
  const b = edge.boardB?.trim();
  if (!a || !b || a === b) return null;
  const [boardA, boardB] = a < b ? [a, b] : [b, a];

  const seenThemes = new Set<string>();
  const themes: string[] = [];
  for (const theme of edge.themes ?? []) {
    const trimmed = theme?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seenThemes.has(key)) continue;
    seenThemes.add(key);
    themes.push(trimmed);
  }
  if (themes.length === 0) return null;

  const confidence = Number.isFinite(edge.confidence)
    ? Math.max(0, Math.min(1, edge.confidence))
    : 0;

  const next: CrossBoardEdge = { boardA, boardB, themes, confidence };
  if (edge.rationale && edge.rationale.trim().length > 0) {
    next.rationale = edge.rationale.trim();
  }
  if (Number.isFinite(edge.detectedAt)) {
    next.detectedAt = edge.detectedAt;
  }
  return next;
}

/**
 * bo-161 — replace `Project.crossBoardEdges` with a freshly produced list.
 * Canonicalises each edge and dedupes by board pair (last write wins for the
 * same pair). Stamps `detectedAt = Date.now()` on entries that don't carry one.
 */
export async function setCrossBoardEdges(
  projectId: ProjectId,
  edges: ReadonlyArray<CrossBoardEdge>,
): Promise<Project> {
  const now = Date.now();
  const byPair = new Map<string, CrossBoardEdge>();
  for (const raw of edges) {
    const norm = normaliseCrossBoardEdge(raw);
    if (!norm) continue;
    if (norm.detectedAt === undefined) norm.detectedAt = now;
    byPair.set(`${norm.boardA}::${norm.boardB}`, norm);
  }
  const sorted = Array.from(byPair.values()).sort((x, y) => {
    if (x.boardA !== y.boardA) return x.boardA.localeCompare(y.boardA);
    return x.boardB.localeCompare(y.boardB);
  });
  return updateProject(projectId, { crossBoardEdges: sorted });
}

/**
 * bo-161 — convenience read for the cross-board map UI. Returns [] when the
 * project doesn't exist or hasn't run the detector yet.
 */
export async function getCrossBoardEdges(
  projectId: ProjectId,
): Promise<CrossBoardEdge[]> {
  const project = await getProject(projectId);
  return project?.crossBoardEdges ?? [];
}

/**
 * bo-161 — drop any edges that reference boards that no longer exist. Lets the
 * map screen recover gracefully when a board is deleted between detector runs.
 */
export function pruneCrossBoardEdges(
  edges: ReadonlyArray<CrossBoardEdge>,
  validBoardIds: ReadonlySet<BoardId>,
): CrossBoardEdge[] {
  return edges.filter(
    (edge) => validBoardIds.has(edge.boardA) && validBoardIds.has(edge.boardB),
  );
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
