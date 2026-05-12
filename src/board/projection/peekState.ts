/**
 * bo-156 — Peek state reducer for the Screen 06 log scrubber.
 *
 * Replays an ordered list of `ChangeSetRecord.forward` patch ops up to (and
 * including) a target seq, producing the *visual* board state as it existed at
 * that point in history. The result is intentionally minimal — we only
 * reconstruct the entity stores that the canvas + log surfaces read from
 * (ideas, groups, connections, suggestions, critiques, docs). Beat-run side
 * effects (e.g. nudge resolutions in non-store memory) are explicitly out of
 * scope; the peek view is read-only and exists to give the user a feel for
 * "what did the board look like when this happened".
 *
 * Pure function. No IDB access. Memoisable by callers.
 *
 * Design notes:
 *  - We replay `forward` patches monotonically; we do *not* honour
 *    `status: 'undone'` because the user is looking *back at* history. The
 *    spec wording ("the canvas state AS IT WAS at that point") implies the
 *    state immediately after that change committed, regardless of whether the
 *    change was later undone.
 *  - Patches are JSON-Patch flavoured (`op: 'add' | 'replace' | 'remove'`).
 *    Each `path` is `/stores/<storeName>/<id>`. We index by store + id.
 *  - We deep-clone patch values on insert so external mutation of the peek
 *    state cannot bleed back into the caller's `ChangeSetRecord` instances.
 */

import type {
  BoardPatchOp,
  BoardStoreName,
  ChangeSetRecord,
} from '../types';
import type {
  Connection,
  Idea,
  IdeaCritique,
  IdeaGroup,
  ScoutSuggestion,
  SupportingDoc,
} from '../../types';

// Stores we surface in the peek render. We deliberately ignore the remaining
// stores (`tweaks`, `boards`, `beatReviewSessions`, `beatReviewItems`) — the
// canvas does not visualise them.
const PEEK_STORES = new Set<BoardStoreName>([
  'ideas',
  'groups',
  'connections',
  'suggestions',
  'critiques',
  'docs',
]);

export interface PeekBoardState {
  /** Highest seq successfully applied. `null` when the timeline is empty. */
  appliedSeq: number | null;
  /** Idea records in stable insertion order (sorted by id for determinism). */
  ideas: Idea[];
  groups: IdeaGroup[];
  connections: Connection[];
  suggestions: ScoutSuggestion[];
  critiques: IdeaCritique[];
  docs: SupportingDoc[];
}

interface PeekStores {
  ideas: Map<string, Idea>;
  groups: Map<string, IdeaGroup>;
  connections: Map<string, Connection>;
  suggestions: Map<string, ScoutSuggestion>;
  critiques: Map<string, IdeaCritique>;
  docs: Map<string, SupportingDoc>;
}

function createStores(): PeekStores {
  return {
    ideas: new Map(),
    groups: new Map(),
    connections: new Map(),
    suggestions: new Map(),
    critiques: new Map(),
    docs: new Map(),
  };
}

/**
 * Replay the supplied changeSets up to `targetSeq` and return a snapshot of
 * the visual stores. When `targetSeq` is `null` the function returns an empty
 * baseline (i.e. the board before the first change). When `targetSeq` is
 * larger than the highest seq present, every record is applied.
 *
 * The function mutates a local working copy only; inputs are read-only.
 */
export function computePeekState(
  changeSets: readonly ChangeSetRecord[],
  targetSeq: number | null,
): PeekBoardState {
  const stores = createStores();
  let appliedSeq: number | null = null;

  if (targetSeq === null) {
    return finalize(stores, appliedSeq);
  }

  // Sort ascending by seq. We tolerate already-sorted input but cannot trust
  // the caller — `listChangeSets` returns descending seq order.
  const ordered = [...changeSets].sort((left, right) => left.seq - right.seq);

  for (const record of ordered) {
    if (record.seq > targetSeq) break;
    for (const patch of record.forward) {
      applyPatchToStores(stores, patch);
    }
    appliedSeq = record.seq;
  }

  return finalize(stores, appliedSeq);
}

function applyPatchToStores(stores: PeekStores, patch: BoardPatchOp): void {
  const parsed = parsePatchPath(patch.path);
  if (!parsed) return;
  if (!PEEK_STORES.has(parsed.store)) return;

  const map = storeMap(stores, parsed.store);
  if (!map) return;

  if (patch.op === 'remove') {
    map.delete(parsed.id);
    return;
  }
  // 'add' and 'replace' both upsert. JSON Patch distinguishes them for
  // conflict semantics; for a peek render we treat them identically.
  map.set(parsed.id, deepClone(patch.value) as never);
}

function storeMap(
  stores: PeekStores,
  name: BoardStoreName,
): Map<string, unknown> | null {
  switch (name) {
    case 'ideas':
      return stores.ideas as Map<string, unknown>;
    case 'groups':
      return stores.groups as Map<string, unknown>;
    case 'connections':
      return stores.connections as Map<string, unknown>;
    case 'suggestions':
      return stores.suggestions as Map<string, unknown>;
    case 'critiques':
      return stores.critiques as Map<string, unknown>;
    case 'docs':
      return stores.docs as Map<string, unknown>;
    default:
      return null;
  }
}

function finalize(
  stores: PeekStores,
  appliedSeq: number | null,
): PeekBoardState {
  return {
    appliedSeq,
    ideas: sortById(Array.from(stores.ideas.values())),
    groups: sortById(Array.from(stores.groups.values())),
    connections: sortById(Array.from(stores.connections.values())),
    suggestions: sortById(Array.from(stores.suggestions.values())),
    critiques: sortById(Array.from(stores.critiques.values())),
    docs: sortById(Array.from(stores.docs.values())),
  };
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

function parsePatchPath(
  path: BoardPatchOp['path'],
): { store: BoardStoreName; id: string } | null {
  // Path shape: "/stores/<storeName>/<id>"
  if (!path.startsWith('/stores/')) return null;
  const remainder = path.slice('/stores/'.length);
  const slash = remainder.indexOf('/');
  if (slash <= 0) return null;
  const store = remainder.slice(0, slash) as BoardStoreName;
  const id = remainder.slice(slash + 1);
  if (id.length === 0) return null;
  return { store, id };
}

function deepClone<T>(value: T): T {
  // Use structuredClone when available (browser + modern node); fall back to
  // JSON round-trip for environments that lack it (older test runners).
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
