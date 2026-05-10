/**
 * bo-157 — Fork-from-here mutation for the Screen 06 log scrubber.
 *
 * Spec: Design/IMPLEMENTATION_PLAN.md §5 (Screen 06) + §6 M4. Sibling of
 * `src/board/projection/peekState.ts` (bo-156), which already gives us the
 * pure reducer that reconstructs canvas state at any historical seq.
 *
 * Behavior:
 *   1. Load the source `BoardRecord` and every `ChangeSetRecord` for it.
 *   2. Replay forward patches up to `targetSeq` via `computePeekState` to
 *      derive the visual stores (ideas, groups, connections, suggestions,
 *      critiques, docs) as they existed then.
 *   3. Allocate a fresh `BoardRecord` (new UUID, same project, fresh activity
 *      timestamps) and seed each of those stores with deep clones — but with
 *      `boardId` rewritten to the new board's id so cross-board indexes resolve
 *      correctly.
 *   4. Persist board + seeded entities in a single readwrite transaction so
 *      the new board never appears half-populated to readers.
 *
 * What we do NOT carry over (intentionally):
 *   - `changeSets` — the fork is treated as a fresh history. It still records
 *     `parentBoardId` + `parentSeq` on the new board (via the Brief-style
 *     metadata on `summary`) for traceability without polluting the schema.
 *   - `beatRuns`, `beatReviewSessions`, `beatReviewItems`, `tweaks`, `turns`
 *     — peek view explicitly excludes these (peekState.ts, PEEK_STORES).
 *   - `briefs` — briefs are project-scoped outputs; a fork is meant to be a
 *     new exploration thread that starts before any brief shipped.
 *
 * The function is idempotent only in the trivial sense — every call mints a
 * fresh board id. Callers that want "reuse if exists" must dedupe at the call
 * site. We deliberately avoid that here so a user can fork the same seq twice
 * to compare two divergent threads.
 */

import {
  BOARD_DATA_VERSION,
  type BoardRecord,
  type ChangeSetRecord,
} from '../board/types';
import type {
  BoardId,
  Connection,
  Idea,
  IdeaCritique,
  IdeaGroup,
  ScoutSuggestion,
  SupportingDoc,
} from '../types';
import { computePeekState } from '../board/projection/peekState';
import { getDb } from './db';

export interface ForkBoardAtSeqOptions {
  /**
   * Override the title of the forked board. When omitted we synthesize
   *   `Fork of <source title> at #<seq>`.
   */
  title?: string;
  /**
   * Optional injection seam for tests. When provided, used instead of
   * `crypto.randomUUID()` for the new board id. Production code should not set
   * this.
   */
  newBoardId?: string;
  /**
   * Optional injection seam for tests. When provided, used as the `createdAt /
   * updatedAt / lastActivityAt` of the new board. Defaults to `Date.now()`.
   */
  now?: number;
}

/**
 * Fork the source board at a specific seq, creating a brand-new board whose
 * stores reflect the peek state at that seq. Returns the new `BoardRecord`.
 *
 * Throws when the source board does not exist. Returns successfully (with an
 * empty seeded board) when `targetSeq` falls before the earliest seq — the
 * fork represents the empty baseline.
 */
export async function forkBoardAtSeq(
  sourceBoardId: BoardId,
  targetSeq: number,
  opts: ForkBoardAtSeqOptions = {},
): Promise<BoardRecord> {
  const db = await getDb();

  // Phase 1: read the source board + its changeSets in a snapshot transaction.
  // We do this in its own readonly tx so we don't hold a long-lived write lock
  // while computing peek state (which is pure / synchronous over an in-memory
  // copy and does not need DB access).
  const readTx = db.transaction(['boards', 'changeSets'], 'readonly');
  const sourceBoard = await readTx.objectStore('boards').get(sourceBoardId);
  if (!sourceBoard) {
    throw new Error(`forkBoardAtSeq: source board not found: ${sourceBoardId}`);
  }
  const allChangeSets = await readTx
    .objectStore('changeSets')
    .index('byBoardId')
    .getAll(sourceBoardId);
  await readTx.done;

  // Phase 2: replay patches up to targetSeq to get the visible stores.
  const peek = computePeekState(allChangeSets as ChangeSetRecord[], targetSeq);

  // Phase 3: allocate fresh ids + metadata.
  const now = opts.now ?? Date.now();
  const newBoardId = opts.newBoardId ?? crypto.randomUUID();
  const sourceTitle = sourceBoard.title ?? 'Untitled board';
  const title = opts.title ?? `Fork of ${sourceTitle} at #${targetSeq}`;

  const newBoard: BoardRecord = {
    id: newBoardId,
    title,
    createdAt: now,
    updatedAt: now,
    dataVersion: BOARD_DATA_VERSION,
    // Fresh seq counters — the fork starts a new history. The peek state was
    // applied as raw seed rows, not as a baseSeq=0 changeSet, so we begin at
    // seq=1 just like an `ensureBoard()` call would.
    changeCursor: 0,
    nextChangeSeq: 1,
    projectId: sourceBoard.projectId,
    status: 'active',
    currentPhase: sourceBoard.currentPhase ?? 1,
    activePersonas: [...(sourceBoard.activePersonas ?? [])],
    lastActivityAt: now,
    openedBy: sourceBoard.openedBy ?? 'self',
    summary: sourceBoard.summary,
  };

  // Phase 4: write the new board + seeded entities atomically. We include
  // every store the peek view touches; even when peek returns an empty list
  // the transaction succeeds and the board ends up empty (correct for forks
  // taken before the first change).
  const writeTx = db.transaction(
    ['boards', 'ideas', 'groups', 'connections', 'suggestions', 'critiques', 'docs'],
    'readwrite',
  );
  await writeTx.objectStore('boards').put(newBoard);
  await seedStore<Idea>(writeTx, 'ideas', peek.ideas, newBoardId);
  await seedStore<IdeaGroup>(writeTx, 'groups', peek.groups, newBoardId);
  await seedStore<Connection>(writeTx, 'connections', peek.connections, newBoardId);
  await seedStore<ScoutSuggestion>(writeTx, 'suggestions', peek.suggestions, newBoardId);
  await seedStore<IdeaCritique>(writeTx, 'critiques', peek.critiques, newBoardId);
  await seedStore<SupportingDoc>(writeTx, 'docs', peek.docs, newBoardId);
  await writeTx.done;

  return newBoard;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type PeekStoreName = 'ideas' | 'groups' | 'connections' | 'suggestions' | 'critiques' | 'docs';

interface BoardScopedRow {
  id: string;
  boardId?: BoardId;
}

/**
 * Deep-clone every peek-state row, rewrite its `boardId` to the new board, and
 * insert it into the supplied IDB transaction's store. Preserves entity ids so
 * intra-board references (e.g. `Connection.ideaIds`, `IdeaGroup.ideaIds`,
 * `IdeaCritique.ideaId`, `SupportingDoc.ideaId`, `Idea.panel.groupId`) keep
 * resolving on the forked board.
 *
 * Note: peek rows are already deep-cloned by `computePeekState` (see its
 * `applyPatchToStores`), but we clone defensively here too because callers
 * could in principle pass already-mutated arrays (the `peek` value is local to
 * this function so this is belt-and-suspenders).
 */
async function seedStore<T extends BoardScopedRow>(
  tx: ReturnType<Awaited<ReturnType<typeof getDb>>['transaction']>,
  store: PeekStoreName,
  rows: readonly T[],
  newBoardId: BoardId,
): Promise<void> {
  if (rows.length === 0) return;
  const objectStore = tx.objectStore(store);
  for (const row of rows) {
    const cloned = deepClone(row) as T;
    cloned.boardId = newBoardId;
    // The IDB store types are too narrow to accept the union here without a
    // cast, but every entity satisfies its own keypath ('id') so the put is
    // safe at runtime.
    await (objectStore as unknown as { put(value: T): Promise<unknown> }).put(cloned);
  }
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
