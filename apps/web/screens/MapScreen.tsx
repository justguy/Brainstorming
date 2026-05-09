import { useCallback, useEffect, useMemo, useState } from 'react';
import { BoardThumbnail } from '../primitives/BoardThumbnail';
import { useRoute } from '../routing/useRoute';
import { getDb } from '../../../src/storage/db';
import type { BoardRecord } from '../../../src/board/types';
import type { ProjectId } from '../../../src/types';

/**
 * Screen 03 · Cross-board map (v0 shell).
 *
 * Spec: Design/IMPLEMENTATION_PLAN.md §5 (Screen 03), Design/Build Spec.html §03.
 *
 * v0 scope (bo-160):
 *   - Render every board in the active project as a `<BoardThumbnail>` grid.
 *   - Click a thumbnail → `navigate({kind: 'board', boardId, ideaId: null})`.
 *   - Mark the board referenced by the current `/b/:boardId/map` route as active.
 *   - Surface idea-counts per board from the `ideas` store's `byBoardId` index.
 *
 * Out of scope, deferred to follow-up tasks:
 *   - Force-directed planet layout + cross-board edges  → bo-161
 *     (`themeOverlapDetector` role + AI-detected theme overlap).
 *   - Right-rail principles drawer + promote-to-principle flow → bo-162.
 *   - Persona overlays / cluster halos → tracked elsewhere in M3/M5.
 *   - App.tsx route dispatch (rendering this screen on `route.kind === 'map'`)
 *     is left to bo-130 (BoardScreen refactor of App.tsx).
 *
 * The component is a self-contained named export (`MapScreen`) plus a default
 * export, so route dispatchers can pick whichever convention is simpler.
 */

export interface MapScreenProps {
  /** Constrain the grid to a specific project; defaults to all boards. */
  projectId?: ProjectId;
  /**
   * Optional escape hatch for tests / Storybook — bypass IndexedDB and render
   * a fixed list. When omitted, the screen loads boards via `getDb()`.
   */
  boardsOverride?: ReadonlyArray<BoardRecord>;
  /**
   * Optional escape hatch for idea-count loading. When omitted, the screen
   * counts ideas via the `byBoardId` index for each board.
   */
  ideaCountsOverride?: Readonly<Record<string, number>>;
}

interface LoadedState {
  boards: ReadonlyArray<BoardRecord>;
  ideaCounts: Readonly<Record<string, number>>;
}

const ROOT_CLASS =
  'bo-map-screen relative flex min-h-screen flex-col gap-6 bg-slate-50 px-8 py-10 text-slate-900';
const HEADER_CLASS = 'flex flex-col gap-1';
const TITLE_CLASS = 'text-2xl font-semibold tracking-tight';
const SUBTITLE_CLASS = 'text-sm text-slate-500';
const GRID_CLASS =
  'grid w-full grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4';
const EMPTY_CLASS =
  'rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center text-sm text-slate-500';
const LOADING_CLASS = 'text-sm text-slate-500';
const ERROR_CLASS =
  'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700';

async function loadBoards(
  projectId: ProjectId | undefined,
): Promise<LoadedState> {
  const db = await getDb();
  const allBoards = await db.getAll('boards');

  // bo-101 back-fills `projectId: 'local-project'` onto pre-existing boards.
  // When `projectId` is supplied, filter to that project; otherwise return all.
  const boards = projectId
    ? allBoards.filter((b) => (b.projectId ?? 'local-project') === projectId)
    : allBoards;

  // Sort newest-touched first so the grid feels lived-in.
  const sorted = [...boards].sort((a, b) => b.updatedAt - a.updatedAt);

  // Idea counts per board via the `byBoardId` index. Cheap for the small board
  // count this screen targets; the spec calls out "tiny board count".
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

export function MapScreen({
  projectId,
  boardsOverride,
  ideaCountsOverride,
}: MapScreenProps = {}): React.ReactElement {
  const [route, navigate] = useRoute();
  const activeBoardId = route.kind === 'map' ? route.boardId : null;

  const initialState: LoadedState | null =
    boardsOverride !== undefined
      ? {
          boards: boardsOverride,
          ideaCounts: ideaCountsOverride ?? {},
        }
      : null;

  const [state, setState] = useState<LoadedState | null>(initialState);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (boardsOverride !== undefined) {
      setState({
        boards: boardsOverride,
        ideaCounts: ideaCountsOverride ?? {},
      });
      return;
    }

    let cancelled = false;
    setError(null);
    loadBoards(projectId)
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
  }, [projectId, boardsOverride, ideaCountsOverride]);

  const handleSelect = useCallback(
    (boardId: string) => {
      navigate({ kind: 'board', boardId, ideaId: null });
    },
    [navigate],
  );

  const tiles = useMemo(() => {
    if (state === null) return null;
    return state.boards.map((board) => (
      <BoardThumbnail
        key={board.id}
        board={{
          id: board.id,
          title: board.title,
          ideaCount: state.ideaCounts[board.id],
          lastTouchedAt: board.updatedAt,
        }}
        active={board.id === activeBoardId}
        onSelect={handleSelect}
      />
    ));
  }, [state, activeBoardId, handleSelect]);

  const isLoading = state === null;
  const isEmpty = state !== null && state.boards.length === 0;

  return (
    <div className={ROOT_CLASS} aria-label="Cross-board map">
      <header className={HEADER_CLASS}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className={TITLE_CLASS}>Cross-board map</h1>
            <p className={SUBTITLE_CLASS}>
              Every board in this project. Click a board to open it.
            </p>
          </div>
          {/*
            bo-162 — explicit drawer trigger on the screen the spec calls
            out as the principles' natural home (Screen 03 right-rail).
            The drawer itself is mounted at the App level; this button just
            pokes the global handle so we don't double-mount.
          */}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
            onClick={() => {
              if (typeof window !== 'undefined' && typeof window.__openPrinciplesDrawer === 'function') {
                window.__openPrinciplesDrawer();
              }
            }}
            aria-label="Open principles drawer"
            title="Open the project's principles drawer"
          >
            <span aria-hidden="true">¶</span>
            Principles
          </button>
        </div>
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
          No boards yet. Create one from the home screen to see it here.
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

export default MapScreen;
