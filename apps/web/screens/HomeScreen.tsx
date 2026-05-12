import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactElement,
} from 'react';
import { BoardThumbnail } from '../primitives/BoardThumbnail';
import { NudgeCard } from '../primitives/NudgeCard';
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
import type { AutonomyLevel, Idea, ProjectId } from '../../../src/types';

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
 * Visual layer restyled to the hand-drawn paper aesthetic — uses the design
 * tokens & classes shipped in `Design/brainstorm.css` (paper-dots, dash-head,
 * board-grid, board-card, btn/btn.primary, Caveat/Kalam fonts, ink shadows).
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

// --- Inline style tokens ----------------------------------------------------
// We rely primarily on classes from `Design/brainstorm.css` (`.paper-dots`,
// `.dashboard`, `.dash-head`, `.board-grid`, `.board-card`, `.btn`, ...).
// The handful of inline styles below carry the hand-drawn vocabulary into
// nodes the design CSS doesn't already cover (section headings, autonomy
// pill, recent-activity strip, modal backdrop).

const ROOT_STYLE: CSSProperties = {
  minHeight: '100vh',
  maxHeight: '100vh',
  overflowY: 'auto',
  padding: '40px 48px 56px',
  display: 'flex',
  flexDirection: 'column',
  gap: 28,
  color: 'var(--ink)',
};

const AUTONOMY_PILL_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 10px',
  border: '1.5px solid var(--ink)',
  borderRadius: 999,
  background: 'var(--paper)',
  boxShadow: '1.5px 1.5px 0 var(--ink)',
  fontFamily: 'var(--f-hand)',
  fontSize: 18,
  lineHeight: 1,
  color: 'var(--ink)',
  transform: 'rotate(-1.5deg)',
};

const AUTONOMY_DOT_STYLE: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  border: '1.2px solid var(--ink)',
};

const SECTION_LABEL_STYLE: CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--ink-faint)',
  margin: '0 0 12px',
};

const NEW_BOARD_TILE_STYLE: CSSProperties = {
  cursor: 'pointer',
  width: '100%',
  aspectRatio: '4 / 3',
};

const EMPTY_WRAP_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: 12,
  padding: '56px 32px',
  background: 'var(--paper)',
  border: '2px dashed var(--ink)',
  borderRadius: 14,
  boxShadow: 'var(--shadow-lift)',
};

const EMPTY_TITLE_STYLE: CSSProperties = {
  fontFamily: 'var(--f-hand)',
  fontSize: 44,
  lineHeight: 1,
  margin: 0,
  color: 'var(--ink)',
};

const EMPTY_BODY_STYLE: CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 16,
  maxWidth: 460,
  color: 'var(--ink-soft)',
  margin: 0,
};

const LOADING_STYLE: CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 16,
  color: 'var(--ink-soft)',
};

const ERROR_STYLE: CSSProperties = {
  background: 'var(--paper)',
  border: '2px solid var(--ink)',
  borderRadius: 10,
  boxShadow: '3px 3px 0 var(--ink)',
  padding: '10px 14px',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 14,
  color: 'var(--ink)',
};

const ACTIVITY_SECTION_STYLE: CSSProperties = {
  marginTop: 12,
  padding: '20px 22px',
  background: 'var(--paper)',
  border: '2px solid var(--ink)',
  borderRadius: 12,
  boxShadow: 'var(--shadow-lift)',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const ACTIVITY_LIST_STYLE: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const ACTIVITY_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 12,
  fontFamily: 'var(--f-hand-body)',
  fontSize: 14,
  color: 'var(--ink)',
};

const ACTIVITY_CHIP_STYLE: CSSProperties = {
  display: 'inline-flex',
  justifyContent: 'center',
  minWidth: 72,
  padding: '2px 8px',
  border: '1.5px solid var(--ink)',
  borderRadius: 999,
  background: 'var(--paper)',
  fontFamily: 'var(--f-mono)',
  fontSize: 9.5,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink)',
  boxShadow: '1px 1px 0 var(--ink)',
};

const ACTIVITY_BODY_STYLE: CSSProperties = {
  flex: 1,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const ACTIVITY_TIME_STYLE: CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--ink-faint)',
};

const ACTIVITY_EMPTY_STYLE: CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 14,
  fontStyle: 'italic',
  color: 'var(--ink-faint)',
  margin: 0,
};

const MODAL_BACKDROP_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  background: 'rgba(26, 24, 20, 0.35)',
};

const MODAL_CARD_STYLE: CSSProperties = {
  width: '100%',
  maxWidth: 460,
  background: 'var(--paper)',
  border: '2px solid var(--ink)',
  borderRadius: 14,
  boxShadow: '4px 4px 0 var(--ink)',
  padding: 22,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const MODAL_TITLE_STYLE: CSSProperties = {
  fontFamily: 'var(--f-hand)',
  fontSize: 36,
  lineHeight: 1,
  margin: 0,
  color: 'var(--ink)',
};

const MODAL_LABEL_STYLE: CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink-faint)',
};

const MODAL_INPUT_STYLE: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1.5px solid var(--ink)',
  borderRadius: 8,
  background: 'var(--paper)',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 18,
  color: 'var(--ink)',
  outline: 'none',
  boxShadow: 'inset 1px 1px 0 rgba(26,24,20,0.06)',
};

const MODAL_ERROR_STYLE: CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 13,
  color: '#c94a3a',
  margin: 0,
};

const MODAL_ACTIONS_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  paddingTop: 4,
};

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
  silent: 'var(--ink-faint)',
  whispers: '#b8dbe8',
  active: '#c5e0a8',
  'takes-pen': '#f5ccac',
};

// --- Helpers ----------------------------------------------------------------

interface LoadedState {
  boards: ReadonlyArray<BoardRecord>;
  ideaCounts: Readonly<Record<string, number>>;
  recentActivity: ReadonlyArray<LogEvent>;
  /**
   * Full descending log-event list across all boards in the project — used to
   * derive per-board AI-nudge change summaries. Distinct from
   * `recentActivity`, which is clipped for the bottom strip.
   */
  allEvents: ReadonlyArray<LogEvent>;
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
  const { recent, all } = await loadRecentActivity(sorted);

  return {
    boards: sorted,
    ideaCounts: counts,
    recentActivity: recent,
    allEvents: all,
  };
}

async function loadRecentActivity(
  boards: ReadonlyArray<BoardRecord>,
): Promise<{ recent: LogEvent[]; all: LogEvent[] }> {
  if (boards.length === 0) return { recent: [], all: [] };
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
  if (allChangeSets.length === 0) return { recent: [], all: [] };
  const events = projectLogEvents(allChangeSets, []);
  // `projectLogEvents` returns ascending; reverse to desc and clip for the
  // bottom-of-Home digest, while preserving the full descending list for the
  // per-board "what changed while you were away" nudge derivation.
  const descending = [...events].reverse();
  return { recent: descending.slice(0, RECENT_ACTIVITY_LIMIT), all: descending };
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

// --- Cross-board search ----------------------------------------------------

interface SearchHit {
  ideaId: string;
  boardId: string;
  title: string;
  matched: 'title' | 'tag' | 'brief';
  snippet?: string;
}

/**
 * Pull the first non-empty line of an idea's `rawText` as the display title.
 * Mirrors `splitRawText` in `Sticky.tsx` — keep the two in sync if either
 * changes.
 */
function ideaDisplayTitle(idea: Idea): string {
  const firstLine = idea.rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ?? 'Untitled idea';
}

async function runCrossBoardSearch(
  query: string,
  projectId: ProjectId,
): Promise<SearchHit[]> {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 2) return [];
  const db = await getDb();
  const allBoards = await db.getAll('boards');
  const projectBoardIds = new Set(
    allBoards
      .filter((b) => (b.projectId ?? DEFAULT_PROJECT_ID) === projectId)
      .map((b) => b.id),
  );
  if (projectBoardIds.size === 0) return [];
  const ideas = await db.getAll('ideas');
  const hits: SearchHit[] = [];
  for (const idea of ideas) {
    const boardId = idea.boardId;
    if (!boardId || !projectBoardIds.has(boardId)) continue;
    const title = ideaDisplayTitle(idea);
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes(trimmed)) {
      hits.push({ ideaId: idea.id, boardId, title, matched: 'title' });
      continue;
    }
    const tagHit = idea.tags?.find((tag) =>
      tag.toLowerCase().includes(trimmed),
    );
    if (tagHit) {
      hits.push({
        ideaId: idea.id,
        boardId,
        title,
        matched: 'tag',
        snippet: `#${tagHit}`,
      });
      continue;
    }
    const brief = idea.artifactMd;
    if (brief) {
      const idx = brief.toLowerCase().indexOf(trimmed);
      if (idx !== -1) {
        const start = Math.max(0, idx - 24);
        const end = Math.min(brief.length, idx + trimmed.length + 36);
        const snippet =
          (start > 0 ? '…' : '') +
          brief.slice(start, end).replace(/\s+/g, ' ').trim() +
          (end < brief.length ? '…' : '');
        hits.push({
          ideaId: idea.id,
          boardId,
          title,
          matched: 'brief',
          snippet,
        });
      }
    }
  }
  return hits;
}

const SEARCH_INPUT_STYLE: CSSProperties = {
  width: 240,
  padding: '7px 10px',
  border: '1.5px solid var(--ink)',
  borderRadius: 8,
  background: 'var(--paper)',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 15,
  color: 'var(--ink)',
  outline: 'none',
  boxShadow: '1.5px 1.5px 0 var(--ink)',
};

const SEARCH_OVERLAY_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 40,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '64px 16px 16px',
  background: 'rgba(26, 24, 20, 0.35)',
};

const SEARCH_CARD_STYLE: CSSProperties = {
  width: '100%',
  maxWidth: 720,
  maxHeight: '70vh',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  background: 'var(--paper)',
  border: '2px solid var(--ink)',
  borderRadius: 14,
  boxShadow: '4px 4px 0 var(--ink)',
  padding: 18,
};

const SEARCH_GROUP_LABEL_STYLE: CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--ink-faint)',
  margin: '10px 0 4px',
};

const SEARCH_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 12,
  padding: '6px 0',
  borderTop: '1px dashed var(--ink-faint)',
};

const SEARCH_ROW_TITLE_STYLE: CSSProperties = {
  fontFamily: 'var(--f-hand)',
  fontSize: 20,
  lineHeight: 1.1,
  color: 'var(--ink)',
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const SEARCH_ROW_SNIPPET_STYLE: CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 12,
  color: 'var(--ink-soft)',
  display: 'block',
  marginTop: 2,
};

const SHARED_EMPTY_CARD_STYLE: CSSProperties = {
  padding: '22px 20px',
  background: 'var(--paper)',
  border: '2px dashed var(--ink)',
  borderRadius: 12,
  boxShadow: 'var(--shadow-lift)',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 15,
  color: 'var(--ink-soft)',
  textAlign: 'center',
};

const THUMBNAIL_WRAPPER_STYLE: CSSProperties = {
  position: 'relative',
};

const NUDGE_OVERLAY_STYLE: CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  width: 'min(220px, 80%)',
  zIndex: 2,
  pointerEvents: 'auto',
};

// --- Last-visit storage -----------------------------------------------------

const LAST_VISIT_KEY_PREFIX = 'bo-home-last-visit-';
const LAST_VISIT_WRITE_DELAY_MS = 5000;

function lastVisitKey(projectId: ProjectId): string {
  return `${LAST_VISIT_KEY_PREFIX}${projectId}`;
}

function readLastVisit(projectId: ProjectId): number | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(lastVisitKey(projectId));
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeLastVisit(projectId: ProjectId, ts: number): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(lastVisitKey(projectId), String(ts));
  } catch {
    // Storage may be disabled (Safari private mode etc.); silently drop.
  }
}

// --- AI nudge derivation ----------------------------------------------------

interface NudgeSummary {
  newIdeas: number;
  newConnections: number;
  contradictions: number;
  total: number;
}

function summariseChanges(
  events: ReadonlyArray<LogEvent>,
  boardId: string,
  since: number,
): NudgeSummary {
  let newIdeas = 0;
  let newConnections = 0;
  let contradictions = 0;
  for (const event of events) {
    if (event.boardId !== boardId) continue;
    if (event.ts <= since) continue;
    switch (event.kind) {
      case 'idea-created':
        newIdeas += event.payload.affectedIdeaIds.length || 1;
        break;
      case 'connection-drawn':
        newConnections +=
          event.payload.affectedConnectionIds.length || 1;
        break;
      case 'ai-nudge':
        if (event.payload.surface === 'critique') {
          contradictions += event.payload.affectedIds.length || 1;
        }
        break;
      default:
        break;
    }
  }
  return {
    newIdeas,
    newConnections,
    contradictions,
    total: newIdeas + newConnections + contradictions,
  };
}

function nudgeBody(summary: NudgeSummary): string {
  const parts: string[] = [];
  if (summary.newIdeas > 0) {
    parts.push(`${summary.newIdeas} new idea${summary.newIdeas === 1 ? '' : 's'}`);
  }
  if (summary.newConnections > 0) {
    parts.push(
      `${summary.newConnections} new connection${summary.newConnections === 1 ? '' : 's'}`,
    );
  }
  if (summary.contradictions > 0) {
    parts.push(
      `${summary.contradictions} contradiction${summary.contradictions === 1 ? '' : 's'}`,
    );
  }
  return parts.join(', ');
}

// Tiny inline plus glyph — keeps the design's hand-drawn vocabulary without
// pulling an icon library.
function PlusGlyph({ size = 14 }: { size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
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
          allEvents: recentActivityOverride ?? [],
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

  // --- Cross-board search state ---------------------------------------------
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<ReadonlyArray<SearchHit>>(
    [],
  );
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // --- Last-visit tracking for AI nudges over board thumbnails --------------
  // Captured once on mount per active project so any boards touched during
  // this session still show "what changed" until the next visit's write.
  const [lastVisitAt, setLastVisitAt] = useState<number | null>(null);
  const visitWrittenRef = useRef(false);

  useEffect(() => {
    visitWrittenRef.current = false;
    setLastVisitAt(readLastVisit(activeProjectId));
  }, [activeProjectId]);

  // Stamp `Date.now()` after 5s so a passive visit also counts as "seen".
  // Click handlers (board select, search-result open) also stamp eagerly.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!visitWrittenRef.current) {
        visitWrittenRef.current = true;
        writeLastVisit(activeProjectId, Date.now());
      }
    }, LAST_VISIT_WRITE_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [activeProjectId]);

  const stampVisit = useCallback(() => {
    if (visitWrittenRef.current) return;
    visitWrittenRef.current = true;
    writeLastVisit(activeProjectId, Date.now());
  }, [activeProjectId]);

  useEffect(() => {
    if (boardsOverride !== undefined) {
      setState({
        boards: boardsOverride,
        ideaCounts: {},
        recentActivity: recentActivityOverride ?? [],
        allEvents: recentActivityOverride ?? [],
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
          setState({
            boards: [],
            ideaCounts: {},
            recentActivity: [],
            allEvents: [],
          });
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

  // Run the cross-board search whenever the query has 2+ characters. Debounce
  // via the standard React effect cycle — IDB is fast enough that an explicit
  // debouncer would over-engineer the path.
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    runCrossBoardSearch(trimmed, activeProjectId)
      .then((hits) => {
        if (!cancelled) setSearchResults(hits);
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, searchQuery]);

  // Open the overlay as soon as the query becomes searchable; close when
  // cleared.
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      setSearchOpen(true);
    } else {
      setSearchOpen(false);
    }
  }, [searchQuery]);

  // Esc closes the overlay; mirrors the modal's keyboard ergonomics.
  useEffect(() => {
    if (!searchOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
  }, []);

  const handleSelect = useCallback(
    (boardId: string) => {
      stampVisit();
      navigate({ kind: 'board', boardId, ideaId: null });
    },
    [navigate, stampVisit],
  );

  const handleSearchResultOpen = useCallback(
    (hit: SearchHit) => {
      stampVisit();
      setSearchOpen(false);
      navigate({
        kind: 'board',
        boardId: hit.boardId,
        ideaId: hit.ideaId,
      });
    },
    [navigate, stampVisit],
  );

  const toggleSearchOverlay = useCallback(() => {
    setSearchOpen((open) => {
      const next = !open;
      if (next && searchInputRef.current) {
        searchInputRef.current.focus();
      }
      return next;
    });
  }, []);

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
    (
      board: BoardRecord,
      ideaCount: number | undefined,
      nudge?: { title: string; body: string } | null,
    ) => (
      <div key={board.id} style={THUMBNAIL_WRAPPER_STYLE}>
        <BoardThumbnail
          board={{
            id: board.id,
            title: board.title,
            ideaCount,
            lastTouchedAt: board.lastActivityAt ?? board.updatedAt,
          }}
          onSelect={handleSelect}
        />
        {nudge && (
          <div style={NUDGE_OVERLAY_STYLE} aria-live="polite">
            <NudgeCard
              eyebrow="while you were away"
              title={nudge.title}
              body={nudge.body}
              ariaLabel={`Changes on ${board.title}: ${nudge.body}`}
            />
          </div>
        )}
      </div>
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

  // Build per-board "what changed while you were away" summaries. We only
  // emit a nudge when the board has activity after `lastVisitAt` AND at least
  // one of (ideas / connections / contradictions) is non-zero — otherwise the
  // overlay would render an empty body.
  const boardNudges = useMemo(() => {
    const map: Record<string, { title: string; body: string }> = {};
    if (state === null || lastVisitAt === null) return map;
    for (const board of state.boards) {
      const since = Math.max(lastVisitAt, 0);
      const activityTs = board.lastActivityAt ?? board.updatedAt;
      if (activityTs <= since) continue;
      const summary = summariseChanges(state.allEvents, board.id, since);
      if (summary.total === 0) continue;
      const body = nudgeBody(summary);
      if (!body) continue;
      map[board.id] = { title: 'New since your last visit', body };
    }
    return map;
  }, [state, lastVisitAt]);

  // bo-s01: "Shared with you" — boards from other projects shared with this
  // user. The Project type does not yet declare a `sharedWith` field, so we
  // duck-type a read against the live project record and fall back to an
  // empty placeholder. The slot itself is always rendered so the spec layout
  // is honoured even before share-graph work lands.
  const sharedBoards = useMemo<ReadonlyArray<BoardRecord>>(() => {
    const projectRecord = project as
      | (typeof project & { sharedWith?: ReadonlyArray<BoardRecord> })
      | null
      | undefined;
    if (
      projectRecord &&
      Array.isArray(projectRecord.sharedWith) &&
      projectRecord.sharedWith.length > 0
    ) {
      return projectRecord.sharedWith;
    }
    return [];
  }, [project]);

  // Group search hits by board for the overlay. Memoised on the search-result
  // list to avoid re-bucketing on unrelated re-renders.
  const groupedSearchHits = useMemo(() => {
    if (searchResults.length === 0 || state === null) return [];
    const boardsById = new Map<string, BoardRecord>();
    for (const board of state.boards) {
      boardsById.set(board.id, board);
    }
    const groups = new Map<string, { board: BoardRecord | null; hits: SearchHit[] }>();
    for (const hit of searchResults) {
      const existing = groups.get(hit.boardId);
      if (existing) {
        existing.hits.push(hit);
      } else {
        groups.set(hit.boardId, {
          board: boardsById.get(hit.boardId) ?? null,
          hits: [hit],
        });
      }
    }
    return Array.from(groups.values());
  }, [searchResults, state]);

  const isLoading = state === null || projectLoading;
  const isEmpty =
    !isLoading && state !== null && state.boards.length === 0;

  const projectTitle = project?.title ?? 'My workspace';
  const projectSummary = project?.summary;
  const autonomyLevel: AutonomyLevel = project?.autonomyDial ?? 'active';
  const autonomyLabel = AUTONOMY_LABELS[autonomyLevel];
  const autonomyDotColor = AUTONOMY_DOT_COLOR[autonomyLevel];

  // The "+ start a blank board" tile that heads the grid. Reuses the design's
  // `.board-card.new-board` class so it matches sibling cards.
  const renderNewBoardTile = (): ReactElement => (
    <div
      role="button"
      tabIndex={0}
      className="board-card new-board"
      style={NEW_BOARD_TILE_STYLE}
      aria-label="Create a new board"
      onClick={openModal}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openModal();
        }
      }}
    >
      <div className="plus">+</div>
      <div className="hand-body" style={{ marginTop: 4 }}>
        start a blank board
      </div>
    </div>
  );

  return (
    <div className="paper-dots dashboard" style={ROOT_STYLE} aria-label="Home">
      <div className="dash-head">
        <div>
          <h1>{projectTitle}.</h1>
          <div className="dash-sub">
            {projectSummary ??
              "Pick a board to keep working, or start a new one."}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            ref={searchInputRef}
            type="search"
            role="searchbox"
            aria-label="Search ideas across all boards"
            placeholder="search ideas, tags, briefs"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (searchQuery.trim().length >= 2) setSearchOpen(true);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setSearchOpen(false);
              }
            }}
            onFocus={() => {
              if (searchQuery.trim().length >= 2) setSearchOpen(true);
            }}
            onClick={() => {
              // A second click on the input toggles the overlay, matching the
              // spec's "pressing the search input again toggles" requirement.
              if (searchQuery.trim().length >= 2) {
                toggleSearchOverlay();
              }
            }}
            style={SEARCH_INPUT_STYLE}
          />
          <span
            style={AUTONOMY_PILL_STYLE}
            aria-label={`Autonomy: ${autonomyLabel}`}
            title="Adjust in Personas panel"
          >
            <span
              style={{ ...AUTONOMY_DOT_STYLE, background: autonomyDotColor }}
              aria-hidden="true"
            />
            {autonomyLabel}
          </span>
          {/* "+ new board" header button removed — the "+ start a blank board"
              tile at the head of the boards grid is the canonical CTA. */}
        </div>
      </div>

      {error && (
        <div style={ERROR_STYLE} role="alert">
          Could not load boards: {error.message}
        </div>
      )}

      {isLoading && !error && (
        <div style={LOADING_STYLE} role="status">
          Loading boards…
        </div>
      )}

      {isEmpty && !error && (
        <div style={EMPTY_WRAP_STYLE}>
          <h2 style={EMPTY_TITLE_STYLE}>No boards yet.</h2>
          <p style={EMPTY_BODY_STYLE}>
            A board is where ideas, connections, and personas come together.
            Create your first one to get started.
          </p>
          <button
            type="button"
            className="btn primary"
            onClick={openModal}
            disabled={creating}
            aria-label="Create your first board"
          >
            <PlusGlyph size={14} />
            <span style={{ marginLeft: 6 }}>
              {creating ? 'creating…' : 'create your first board'}
            </span>
          </button>
        </div>
      )}

      {!isLoading && partitioned.active.length > 0 && (
        <section aria-labelledby="bo-home-active-label">
          <h2 id="bo-home-active-label" style={SECTION_LABEL_STYLE}>
            Active boards
          </h2>
          <div className="board-grid" role="list">
            {renderNewBoardTile()}
            {partitioned.active.map((board) =>
              renderTile(
                board,
                state?.ideaCounts[board.id],
                boardNudges[board.id] ?? null,
              ),
            )}
          </div>
        </section>
      )}

      {!isLoading && (
        <section aria-labelledby="bo-home-shared-label">
          <h2 id="bo-home-shared-label" style={SECTION_LABEL_STYLE}>
            Shared with you
          </h2>
          {sharedBoards.length > 0 ? (
            <div className="board-grid" role="list">
              {sharedBoards.map((board) =>
                renderTile(board, state?.ideaCounts[board.id], null),
              )}
            </div>
          ) : (
            <div style={SHARED_EMPTY_CARD_STYLE} role="note">
              Nothing shared yet — boards friends share with you will appear
              here.
            </div>
          )}
        </section>
      )}

      {!isLoading && partitioned.archived.length > 0 && (
        <section aria-labelledby="bo-home-archived-label">
          <h2 id="bo-home-archived-label" style={SECTION_LABEL_STYLE}>
            Shipped &amp; shelved
          </h2>
          <div
            className="board-grid"
            role="list"
            style={{ opacity: 0.72 }}
          >
            {partitioned.archived.map((board) =>
              renderTile(board, state?.ideaCounts[board.id], null),
            )}
          </div>
        </section>
      )}

      {!isLoading && state !== null && state.boards.length > 0 && (
        <section
          style={ACTIVITY_SECTION_STYLE}
          aria-labelledby="bo-home-activity-label"
        >
          <h2 id="bo-home-activity-label" style={SECTION_LABEL_STYLE}>
            Recent activity
          </h2>
          {state.recentActivity.length === 0 ? (
            <p style={ACTIVITY_EMPTY_STYLE}>
              Activity from your boards will show up here.
            </p>
          ) : (
            <ul style={ACTIVITY_LIST_STYLE}>
              {state.recentActivity.map((event) => (
                <li key={event.id} style={ACTIVITY_ROW_STYLE}>
                  <span style={ACTIVITY_CHIP_STYLE}>
                    {logEventLabel(event)}
                  </span>
                  <span style={ACTIVITY_BODY_STYLE}>
                    {logEventSummary(event)}
                  </span>
                  <span style={ACTIVITY_TIME_STYLE}>
                    {formatRelativeTimestamp(event.ts)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {searchOpen && (
        <div
          style={SEARCH_OVERLAY_STYLE}
          role="dialog"
          aria-modal="true"
          aria-labelledby="bo-home-search-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeSearch();
          }}
        >
          <div style={SEARCH_CARD_STYLE} className="paper">
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <h2
                id="bo-home-search-title"
                style={{
                  fontFamily: 'var(--f-hand)',
                  fontSize: 28,
                  margin: 0,
                  color: 'var(--ink)',
                }}
              >
                Search across boards.
              </h2>
              <span
                style={{
                  fontFamily: 'var(--f-mono)',
                  fontSize: 10,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-faint)',
                }}
              >
                {searchResults.length === 0
                  ? 'no matches'
                  : `${searchResults.length} ${
                      searchResults.length === 1 ? 'match' : 'matches'
                    }`}
              </span>
            </div>
            <div
              style={{
                overflowY: 'auto',
                paddingRight: 4,
                flex: 1,
                minHeight: 0,
              }}
            >
              {groupedSearchHits.length === 0 ? (
                <p
                  style={{
                    fontFamily: 'var(--f-hand-body)',
                    fontSize: 15,
                    fontStyle: 'italic',
                    color: 'var(--ink-faint)',
                    margin: '8px 0 0',
                  }}
                >
                  Nothing matches “{searchQuery.trim()}” yet.
                </p>
              ) : (
                groupedSearchHits.map(({ board, hits }) => (
                  <div key={board?.id ?? hits[0]?.boardId ?? 'unknown'}>
                    <div style={SEARCH_GROUP_LABEL_STYLE}>
                      {board?.title ?? 'unknown board'}
                    </div>
                    <ul
                      style={{
                        listStyle: 'none',
                        margin: 0,
                        padding: 0,
                      }}
                    >
                      {hits.map((hit) => (
                        <li key={`${hit.boardId}:${hit.ideaId}:${hit.matched}`}>
                          <div style={SEARCH_ROW_STYLE}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={SEARCH_ROW_TITLE_STYLE}>
                                {hit.title}
                              </div>
                              {hit.snippet && (
                                <span style={SEARCH_ROW_SNIPPET_STYLE}>
                                  {hit.snippet}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => handleSearchResultOpen(hit)}
                              aria-label={`Open ${hit.title} on ${
                                board?.title ?? 'board'
                              }`}
                            >
                              open
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          style={MODAL_BACKDROP_STYLE}
          role="dialog"
          aria-modal="true"
          aria-labelledby="bo-home-new-board-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <form
            className="paper"
            style={MODAL_CARD_STYLE}
            onSubmit={handleModalSubmit}
          >
            <h2 id="bo-home-new-board-title" style={MODAL_TITLE_STYLE}>
              New board.
            </h2>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={MODAL_LABEL_STYLE}>Title</span>
              <input
                ref={titleInputRef}
                type="text"
                style={MODAL_INPUT_STYLE}
                value={modalTitle}
                onChange={(event) => setModalTitle(event.target.value)}
                placeholder="Untitled board"
                maxLength={120}
                aria-label="Board title"
                disabled={creating}
              />
            </label>
            {modalError && <p style={MODAL_ERROR_STYLE}>{modalError.message}</p>}
            <div style={MODAL_ACTIONS_STYLE}>
              <button
                type="button"
                className="btn"
                onClick={closeModal}
                disabled={creating}
              >
                cancel
              </button>
              <button
                type="submit"
                className="btn primary"
                disabled={creating}
              >
                {creating ? 'creating…' : 'create board'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default HomeScreen;
