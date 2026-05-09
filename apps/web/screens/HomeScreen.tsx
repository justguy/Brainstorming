import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { BoardThumbnail } from '../primitives/BoardThumbnail';
import { useRoute } from '../routing/useRoute';
import { useProjectSync } from '../useProjectSync';
import { getDb } from '../../../src/storage/db';
import { ensureBoard } from '../../../src/storage/boards';
import { DEFAULT_PROJECT_ID } from '../../../src/storage/projects';
import {
  projectLogEvents,
  type LogEvent,
} from '../../../src/board/projection/logEvents';
import type {
  BoardRecord,
  BoardStatus,
  ChangeSetRecord,
} from '../../../src/board/types';
import type { AutonomyLevel, ProjectId } from '../../../src/types';

/**
 * Screen 01 · Multi-board home (M4 polish — bo-150).
 *
 * Spec: Design/IMPLEMENTATION_PLAN.md §5 (Screen 01) and §6 M4. Builds on the
 * M0 shim (bo-104), filling in:
 *
 *   1. Project header — project title, read-only autonomy dial summary chip,
 *      summary text, and the "New board" CTA.
 *   2. Boards grid — every board in the active project sorted by
 *      `lastActivityAt` desc. Active boards prominent, shipped/shelved
 *      subdued in a second sub-section.
 *   3. Empty state — first-run "Create your first board" CTA when the project
 *      has zero boards.
 *   4. New-board flow — inline modal taking a custom title (still calls
 *      `ensureBoard` from storage; rich workflows stay deferred).
 *   5. Recent activity — bottom strip with the last few `LogEvent`s across
 *      every board in the project (uses bo-119's `projectLogEvents`).
 *
 * Out of scope, deferred:
 *   - "Shared with you" tab, cross-board search overlay, BoardTile bloom
 *     animations, project switcher.
 *   - Routing/dispatch — App.tsx wiring lives with bo-130 (BoardScreen
 *     refactor); this module only exports the screen.
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
  /**
   * Optional override for the recent-activity feed. When omitted the screen
   * reads `changeSets` per board and projects them via `projectLogEvents`.
   */
  recentActivityOverride?: ReadonlyArray<LogEvent>;
}

// --- Style tokens -----------------------------------------------------------
// Tailwind utility strings centralised at the top so the JSX stays readable
// and design-token tweaks land in one place. Whiteboard palette only — no
// new fonts/colors per IMPLEMENTATION_PLAN §4.

const ROOT_CLASS =
  'bo-home-screen relative flex min-h-screen flex-col gap-6 bg-slate-50 px-8 py-10 text-slate-900';
const HEADER_CLASS = 'flex flex-wrap items-start justify-between gap-4';
const HEADER_TEXT_CLASS = 'flex flex-col gap-2';
const TITLE_ROW_CLASS = 'flex flex-wrap items-center gap-3';
const TITLE_CLASS = 'text-2xl font-semibold tracking-tight';
const AUTONOMY_CHIP_CLASS =
  'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600';
const AUTONOMY_DOT_CLASS = 'h-1.5 w-1.5 rounded-full';
const SUMMARY_CLASS = 'max-w-2xl text-sm text-slate-500';
const SUBTITLE_CLASS = 'text-sm text-slate-500';
const NEW_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-60';
const SECTION_TITLE_CLASS =
  'text-xs font-semibold uppercase tracking-[0.16em] text-slate-500';
const GRID_CLASS =
  'grid w-full grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4';
const SUBDUED_GRID_CLASS = `${GRID_CLASS} opacity-70`;
const EMPTY_CLASS =
  'flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-16 text-center';
const EMPTY_TITLE_CLASS = 'text-base font-semibold text-slate-700';
const EMPTY_BODY_CLASS = 'max-w-sm text-sm text-slate-500';
const LOADING_CLASS = 'text-sm text-slate-500';
const ERROR_CLASS =
  'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700';

// --- Modal --
const MODAL_BACKDROP_CLASS =
  'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4';
const MODAL_CARD_CLASS =
  'flex w-full max-w-md flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl';
const MODAL_TITLE_CLASS = 'text-lg font-semibold text-slate-900';
const MODAL_LABEL_CLASS =
  'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500';
const MODAL_INPUT_CLASS =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-300';
const MODAL_ACTIONS_CLASS = 'flex justify-end gap-2 pt-2';
const MODAL_PRIMARY_CLASS =
  'inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-60';
const MODAL_SECONDARY_CLASS =
  'inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300';

// --- Activity strip --
const ACTIVITY_SECTION_CLASS =
  'mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4';
const ACTIVITY_LIST_CLASS = 'flex flex-col gap-1.5';
const ACTIVITY_ROW_CLASS =
  'flex items-baseline gap-3 text-xs text-slate-600';
const ACTIVITY_KIND_CLASS =
  'inline-flex min-w-[5.25rem] justify-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600';
const ACTIVITY_BODY_CLASS = 'flex-1 truncate';
const ACTIVITY_TIME_CLASS =
  'text-[10px] uppercase tracking-[0.14em] text-slate-400';
const ACTIVITY_EMPTY_CLASS = 'text-xs italic text-slate-400';

// --- Autonomy dial display --
// Read-only chip on the home header. The interactive 4-stop control lives in
// PersonaPanel (Screen 08); we mirror the same vocabulary so users see the
// same labels everywhere.
const AUTONOMY_LABELS: Readonly<Record<AutonomyLevel, string>> = {
  silent: 'Silent',
  whispers: 'Whispers',
  active: 'Active',
  'takes-pen': 'Takes the pen',
};

const AUTONOMY_DOT_COLOR: Readonly<Record<AutonomyLevel, string>> = {
  silent: 'bg-slate-300',
  whispers: 'bg-sky-300',
  active: 'bg-emerald-400',
  'takes-pen': 'bg-amber-400',
};

// --- Helpers ----------------------------------------------------------------

interface LoadedState {
  boards: ReadonlyArray<BoardRecord>;
  ideaCounts: Readonly<Record<string, number>>;
  recentActivity: ReadonlyArray<LogEvent>;
}

const RECENT_ACTIVITY_LIMIT = 5;
const RECENT_ACTIVITY_SCAN_LIMIT = 50;

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

  // bo-119: read recent changeSets per board, project them through the pure
  // `projectLogEvents` reducer, and pick the freshest few across the project.
  // We intentionally don't load `beatRuns` here — Screen 06 has the rich log;
  // Home only needs a coarse "what just happened" digest.
  const recentActivity = await loadRecentActivity(sorted);

  return { boards: sorted, ideaCounts: counts, recentActivity };
}

async function loadRecentActivity(
  boards: ReadonlyArray<BoardRecord>,
): Promise<LogEvent[]> {
  if (boards.length === 0) return [];
  const db = await getDb();
  const allChangeSets: ChangeSetRecord[] = [];
  for (const board of boards) {
    try {
      const records = await db.getAllFromIndex(
        'changeSets',
        'byBoardId',
        board.id,
      );
      // Cap per-board scan so a noisy board can't starve the digest.
      const sorted = [...records]
        .sort((a, b) => b.committedAt - a.committedAt)
        .slice(0, RECENT_ACTIVITY_SCAN_LIMIT);
      allChangeSets.push(...sorted);
    } catch {
      // Skip boards whose changeSets index is missing — surfaces gracefully
      // as "no recent activity" rather than blowing up the home screen.
    }
  }
  if (allChangeSets.length === 0) return [];
  const events = projectLogEvents(allChangeSets, []);
  // `projectLogEvents` returns ascending; reverse to desc and clip.
  return events.slice(-RECENT_ACTIVITY_LIMIT).reverse();
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

function effectiveBoardStatus(board: BoardRecord): BoardStatus {
  // Older v11-migrated boards may lack `status`; treat them as 'active' to
  // keep the Home grid populated. `hydrateBoard` in storage/boards.ts also
  // applies this default at read time.
  return board.status ?? 'active';
}

function formatRelativeTimestamp(
  timestamp: number,
  now: number = Date.now(),
): string {
  const deltaMs = Math.max(0, now - timestamp);
  const seconds = Math.round(deltaMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(days / 365);
  return `${years}y ago`;
}

function logEventLabel(event: LogEvent): string {
  // Coarse short labels for the activity strip chip. Mirrors the
  // BoardHistoryPanel vocabulary at a higher level — Home is a digest, not
  // the full Screen 06 log.
  switch (event.kind) {
    case 'idea-created':
      return 'Idea';
    case 'idea-edited':
      return 'Edit';
    case 'connection-drawn':
      return 'Link';
    case 'cluster-proposed':
      return 'Cluster';
    case 'ai-nudge':
      return 'Nudge';
    case 'nudge-resolved':
      return 'Resolved';
    case 'board-meta':
      return 'Meta';
    case 'role-run':
      return 'Role';
  }
}

function logEventSummary(event: LogEvent): string {
  // role-run events don't carry a `payload.summary`; render a synthetic line
  // for them so the strip stays readable.
  if (event.kind === 'role-run') {
    const ok = event.payload.ok ? 'ran' : 'failed';
    return `${event.payload.roleId} ${ok}`;
  }
  return event.payload.summary;
}

// --- Component --------------------------------------------------------------

export function HomeScreen({
  boardsOverride,
  projectIdOverride,
  createBoardImpl,
  recentActivityOverride,
}: HomeScreenProps = {}): ReactElement {
  const [, navigate] = useRoute();
  const { project, isLoading: projectLoading } = useProjectSync();

  const activeProjectId: ProjectId =
    projectIdOverride ?? project?.id ?? DEFAULT_PROJECT_ID;

  const initialState: LoadedState | null =
    boardsOverride !== undefined
      ? {
          boards: boardsOverride,
          ideaCounts: {},
          recentActivity: recentActivityOverride ?? [],
        }
      : null;

  const [state, setState] = useState<LoadedState | null>(initialState);
  const [error, setError] = useState<Error | null>(null);
  const [creating, setCreating] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalError, setModalError] = useState<Error | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (boardsOverride !== undefined) {
      setState({
        boards: boardsOverride,
        ideaCounts: {},
        recentActivity: recentActivityOverride ?? [],
      });
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
          setState({ boards: [], ideaCounts: {}, recentActivity: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeProjectId,
    boardsOverride,
    projectLoading,
    recentActivityOverride,
    reloadToken,
  ]);

  // Focus the title input when the modal opens for keyboard-first creation.
  useEffect(() => {
    if (modalOpen) {
      // Defer focus to next tick so the input is in the DOM.
      const id = setTimeout(() => titleInputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [modalOpen]);

  // Esc-to-close on the modal — small affordance that keeps the screen
  // keyboard-friendly without pulling in a focus-trap library.
  useEffect(() => {
    if (!modalOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModalOpen(false);
        setModalError(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  const handleSelect = useCallback(
    (boardId: string) => {
      navigate({ kind: 'board', boardId, ideaId: null });
    },
    [navigate],
  );

  const openModal = useCallback(() => {
    setModalTitle('');
    setModalError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setModalError(null);
  }, []);

  const submitCreate = useCallback(
    async (rawTitle: string) => {
      if (creating) return;
      const title = rawTitle.trim() || 'Untitled board';
      setCreating(true);
      setError(null);
      setModalError(null);
      try {
        const id = generateBoardId();
        const create =
          createBoardImpl ??
          ((nextId, nextTitle) => ensureBoard(nextId, nextTitle));
        const created = await create(id, title);
        setModalOpen(false);
        navigate({ kind: 'board', boardId: created.id, ideaId: null });
      } catch (cause) {
        const err = cause instanceof Error ? cause : new Error(String(cause));
        setModalError(err);
        setError(err);
        // Refresh the grid so a partially-created row still appears.
        setReloadToken((n) => n + 1);
      } finally {
        setCreating(false);
      }
    },
    [creating, createBoardImpl, navigate],
  );

  const handleModalSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submitCreate(modalTitle);
    },
    [modalTitle, submitCreate],
  );

  const renderTile = useCallback(
    (board: BoardRecord, ideaCount: number | undefined) => (
      <BoardThumbnail
        key={board.id}
        board={{
          id: board.id,
          title: board.title,
          ideaCount,
          lastTouchedAt: board.lastActivityAt ?? board.updatedAt,
        }}
        onSelect={handleSelect}
      />
    ),
    [handleSelect],
  );

  const partitioned = useMemo(() => {
    if (state === null) {
      return {
        active: [] as BoardRecord[],
        archived: [] as BoardRecord[],
      };
    }
    const active: BoardRecord[] = [];
    const archived: BoardRecord[] = [];
    for (const board of state.boards) {
      const status = effectiveBoardStatus(board);
      if (status === 'active') active.push(board);
      else archived.push(board);
    }
    return { active, archived };
  }, [state]);

  const isLoading = state === null || projectLoading;
  const isEmpty =
    !isLoading && state !== null && state.boards.length === 0;

  const projectTitle = project?.title ?? 'My workspace';
  const projectSummary = project?.summary;
  const autonomyLevel: AutonomyLevel = project?.autonomyDial ?? 'active';
  const autonomyLabel = AUTONOMY_LABELS[autonomyLevel];
  const autonomyDot = AUTONOMY_DOT_COLOR[autonomyLevel];

  return (
    <div className={ROOT_CLASS} aria-label="Home">
      <header className={HEADER_CLASS}>
        <div className={HEADER_TEXT_CLASS}>
          <div className={TITLE_ROW_CLASS}>
            <h1 className={TITLE_CLASS}>{projectTitle}</h1>
            <span
              className={AUTONOMY_CHIP_CLASS}
              aria-label={`Autonomy: ${autonomyLabel}`}
              title="Adjust in Personas panel"
            >
              <span
                className={`${AUTONOMY_DOT_CLASS} ${autonomyDot}`}
                aria-hidden="true"
              />
              {autonomyLabel}
            </span>
          </div>
          {projectSummary ? (
            <p className={SUMMARY_CLASS}>{projectSummary}</p>
          ) : (
            <p className={SUBTITLE_CLASS}>
              Pick a board to keep working, or start a new one.
            </p>
          )}
        </div>
        <button
          type="button"
          className={NEW_BUTTON_CLASS}
          onClick={openModal}
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
          <p className={EMPTY_TITLE_CLASS}>No boards yet</p>
          <p className={EMPTY_BODY_CLASS}>
            A board is where ideas, connections, and personas come together.
            Create your first one to get started.
          </p>
          <button
            type="button"
            className={NEW_BUTTON_CLASS}
            onClick={openModal}
            disabled={creating}
            aria-label="Create your first board"
          >
            {creating ? 'Creating…' : 'Create your first board'}
          </button>
        </div>
      )}

      {!isLoading && partitioned.active.length > 0 && (
        <section
          className="flex flex-col gap-3"
          aria-labelledby="bo-home-active-label"
        >
          <h2 id="bo-home-active-label" className={SECTION_TITLE_CLASS}>
            Active boards
          </h2>
          <div className={GRID_CLASS} role="list">
            {partitioned.active.map((board) =>
              renderTile(board, state?.ideaCounts[board.id]),
            )}
          </div>
        </section>
      )}

      {!isLoading && partitioned.archived.length > 0 && (
        <section
          className="flex flex-col gap-3"
          aria-labelledby="bo-home-archived-label"
        >
          <h2 id="bo-home-archived-label" className={SECTION_TITLE_CLASS}>
            Shipped &amp; shelved
          </h2>
          <div className={SUBDUED_GRID_CLASS} role="list">
            {partitioned.archived.map((board) =>
              renderTile(board, state?.ideaCounts[board.id]),
            )}
          </div>
        </section>
      )}

      {!isLoading && state !== null && state.boards.length > 0 && (
        <section
          className={ACTIVITY_SECTION_CLASS}
          aria-labelledby="bo-home-activity-label"
        >
          <h2 id="bo-home-activity-label" className={SECTION_TITLE_CLASS}>
            Recent activity
          </h2>
          {state.recentActivity.length === 0 ? (
            <p className={ACTIVITY_EMPTY_CLASS}>
              Activity from your boards will show up here.
            </p>
          ) : (
            <ul className={ACTIVITY_LIST_CLASS}>
              {state.recentActivity.map((event) => (
                <li key={event.id} className={ACTIVITY_ROW_CLASS}>
                  <span className={ACTIVITY_KIND_CLASS}>
                    {logEventLabel(event)}
                  </span>
                  <span className={ACTIVITY_BODY_CLASS}>
                    {logEventSummary(event)}
                  </span>
                  <span className={ACTIVITY_TIME_CLASS}>
                    {formatRelativeTimestamp(event.ts)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {modalOpen && (
        <div
          className={MODAL_BACKDROP_CLASS}
          role="dialog"
          aria-modal="true"
          aria-labelledby="bo-home-new-board-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <form className={MODAL_CARD_CLASS} onSubmit={handleModalSubmit}>
            <h2 id="bo-home-new-board-title" className={MODAL_TITLE_CLASS}>
              New board
            </h2>
            <label className="flex flex-col gap-1.5">
              <span className={MODAL_LABEL_CLASS}>Title</span>
              <input
                ref={titleInputRef}
                type="text"
                className={MODAL_INPUT_CLASS}
                value={modalTitle}
                onChange={(event) => setModalTitle(event.target.value)}
                placeholder="Untitled board"
                maxLength={120}
                aria-label="Board title"
                disabled={creating}
              />
            </label>
            {modalError && (
              <p className="text-xs text-rose-700">{modalError.message}</p>
            )}
            <div className={MODAL_ACTIONS_CLASS}>
              <button
                type="button"
                className={MODAL_SECONDARY_CLASS}
                onClick={closeModal}
                disabled={creating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={MODAL_PRIMARY_CLASS}
                disabled={creating}
              >
                {creating ? 'Creating…' : 'Create board'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default HomeScreen;
