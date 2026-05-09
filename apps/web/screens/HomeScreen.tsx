import { useCallback, useEffect, useMemo, useState } from 'react';
import { BoardThumbnail } from '../primitives/BoardThumbnail';
import { useRoute } from '../routing/useRoute';
import { useProjectSync } from '../useProjectSync';
import { getDb } from '../../../src/storage/db';
import { ensureBoard } from '../../../src/storage/boards';
import { DEFAULT_PROJECT_ID } from '../../../src/storage/projects';
import type { BoardRecord } from '../../../src/board/types';
import type { ProjectId } from '../../../src/types';

/**
 * Screen 01 · Multi-board home (M0 shim).
 *
 * Spec: Design/IMPLEMENTATION_PLAN.md §5 (Screen 01) and §6 M0 — "Trivial
 * HomeScreen shim that lists boards by title". This is a placeholder; M4
 * (bo-150) replaces it with the polished multi-board home (BoardTile,
 * CrossBoardSearchOverlay, NewBoardPrompt, log digests, etc).
 *
 * v0 scope (bo-104):
 *   - Resolve the active Project via `useProjectSync` (defaults to
 *     `local-project`).
 *   - List every board in that project as a `<BoardThumbnail>` with an
 *     "Open board" affordance (the thumbnail itself is a button).
 *   - "New board" button → `ensureBoard(<random id>, 'Untitled board')` then
 *     navigate to `#/b/:boardId`.
 *
 * Out of scope, deferred to bo-150 / M4:
 *   - "Shared with you" tab, cross-board search overlay, log digests, project
 *     switcher, custom board titles on creation, empty-state polish.
 *
 * App.tsx route dispatch (rendering this screen on `route.kind === 'home'`)
 * lives with bo-130 (BoardScreen refactor of App.tsx). This module only
 * exports the screen.
 */

export interface HomeScreenProps {
  /**
   * Optional escape hatch for tests / Storybook — bypass IndexedDB and render
   * a fixed list. When omitted, the screen loads boards via `getDb()`.
   */
  boardsOverride?: ReadonlyArray<BoardRecord>;
  /**
   * Optional override for the project id used when filtering boards. When
   * omitted, the screen reads the active project from `useProjectSync` and
   * falls back to `DEFAULT_PROJECT_ID`.
   */
  projectIdOverride?: ProjectId;
  /**
   * Optional override for board creation. Defaults to `ensureBoard`.
   * Returns the new board's id so the caller can navigate to it.
   */
  createBoardImpl?: (id: string, title: string) => Promise<{ id: string }>;
}

const ROOT_CLASS =
  'bo-home-screen relative flex min-h-screen flex-col gap-6 bg-slate-50 px-8 py-10 text-slate-900';
const HEADER_CLASS = 'flex flex-wrap items-end justify-between gap-3';
const HEADER_TEXT_CLASS = 'flex flex-col gap-1';
const TITLE_CLASS = 'text-2xl font-semibold tracking-tight';
const SUBTITLE_CLASS = 'text-sm text-slate-500';
const NEW_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-60';
const GRID_CLASS =
  'grid w-full grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4';
const EMPTY_CLASS =
  'rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center text-sm text-slate-500';
const LOADING_CLASS = 'text-sm text-slate-500';
const ERROR_CLASS =
  'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700';

interface LoadedState {
  boards: ReadonlyArray<BoardRecord>;
  ideaCounts: Readonly<Record<string, number>>;
}

async function loadBoards(projectId: ProjectId): Promise<LoadedState> {
  const db = await getDb();
  const allBoards = await db.getAll('boards');

  // bo-101 back-fills `projectId: 'local-project'` onto pre-existing boards.
  // Treat a missing `projectId` as belonging to the default project so legacy
  // single-board users see their board on the home screen.
  const boards = allBoards.filter(
    (b) => (b.projectId ?? DEFAULT_PROJECT_ID) === projectId,
  );

  // Sort by `lastActivityAt` (with `updatedAt` fallback) so the most recently
  // touched board surfaces first — matches the cross-board map's convention.
  const sorted = [...boards].sort(
    (a, b) =>
      (b.lastActivityAt ?? b.updatedAt) - (a.lastActivityAt ?? a.updatedAt),
  );

  const counts: Record<string, number> = {};
  for (const board of sorted) {
    try {
      const ideas = await db.getAllFromIndex('ideas', 'byBoardId', board.id);
      counts[board.id] = ideas.length;
    } catch {
      counts[board.id] = 0;
    }
  }

  return { boards: sorted, ideaCounts: counts };
}

function generateBoardId(): string {
  // Prefer `crypto.randomUUID()` when available (browsers + Node 18+); fall
  // back to a timestamp+random suffix in environments that lack it (older
  // jsdom, etc). The shim does not need cryptographic strength here.
  const cryptoObj =
    typeof globalThis !== 'undefined' && 'crypto' in globalThis
      ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      : undefined;
  if (cryptoObj?.randomUUID) {
    return `board-${cryptoObj.randomUUID()}`;
  }
  return `board-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function HomeScreen({
  boardsOverride,
  projectIdOverride,
  createBoardImpl,
}: HomeScreenProps = {}): React.ReactElement {
  const [, navigate] = useRoute();
  const { project, isLoading: projectLoading } = useProjectSync();

  const activeProjectId: ProjectId =
    projectIdOverride ?? project?.id ?? DEFAULT_PROJECT_ID;

  const initialState: LoadedState | null =
    boardsOverride !== undefined
      ? { boards: boardsOverride, ideaCounts: {} }
      : null;

  const [state, setState] = useState<LoadedState | null>(initialState);
  const [error, setError] = useState<Error | null>(null);
  const [creating, setCreating] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (boardsOverride !== undefined) {
      setState({ boards: boardsOverride, ideaCounts: {} });
      return;
    }
    // Wait for project sync before issuing the initial query so we don't
    // briefly show the wrong project's boards.
    if (projectLoading) return;

    let cancelled = false;
    setError(null);
    loadBoards(activeProjectId)
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
          setState({ boards: [], ideaCounts: {} });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, boardsOverride, projectLoading, reloadToken]);

  const handleSelect = useCallback(
    (boardId: string) => {
      navigate({ kind: 'board', boardId, ideaId: null });
    },
    [navigate],
  );

  const handleCreate = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const id = generateBoardId();
      const title = 'Untitled board';
      // M0 shim: `ensureBoard` is the closest existing primitive to a
      // "create board" action. M4 (bo-150) introduces a richer creation
      // flow with custom titles + empty-state copy.
      const create =
        createBoardImpl ?? ((nextId, nextTitle) => ensureBoard(nextId, nextTitle));
      const created = await create(id, title);
      navigate({ kind: 'board', boardId: created.id, ideaId: null });
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
      setCreating(false);
      // Refresh the grid so a partially-created row still appears.
      setReloadToken((n) => n + 1);
      return;
    }
    setCreating(false);
  }, [creating, createBoardImpl, navigate]);

  const tiles = useMemo(() => {
    if (state === null) return null;
    return state.boards.map((board) => (
      <BoardThumbnail
        key={board.id}
        board={{
          id: board.id,
          title: board.title,
          ideaCount: state.ideaCounts[board.id],
          lastTouchedAt: board.lastActivityAt ?? board.updatedAt,
        }}
        onSelect={handleSelect}
      />
    ));
  }, [state, handleSelect]);

  const isLoading = state === null || projectLoading;
  const isEmpty = !isLoading && state !== null && state.boards.length === 0;
  const projectTitle = project?.title ?? 'My workspace';

  return (
    <div className={ROOT_CLASS} aria-label="Home">
      <header className={HEADER_CLASS}>
        <div className={HEADER_TEXT_CLASS}>
          <h1 className={TITLE_CLASS}>{projectTitle}</h1>
          <p className={SUBTITLE_CLASS}>
            Pick a board to keep working, or start a new one.
          </p>
        </div>
        <button
          type="button"
          className={NEW_BUTTON_CLASS}
          onClick={handleCreate}
          disabled={creating}
          aria-label="Create a new board"
        >
          {creating ? 'Creating…' : 'New board'}
        </button>
      </header>

      {error && (
        <div className={ERROR_CLASS} role="alert">
          Could not load boards: {error.message}
        </div>
      )}

      {isLoading && !error && (
        <div className={LOADING_CLASS} role="status">
          Loading boards…
        </div>
      )}

      {isEmpty && !error && (
        <div className={EMPTY_CLASS}>
          No boards yet. Click &ldquo;New board&rdquo; to start one.
        </div>
      )}

      {tiles && tiles.length > 0 && (
        <div className={GRID_CLASS} role="list">
          {tiles}
        </div>
      )}
    </div>
  );
}

export default HomeScreen;
