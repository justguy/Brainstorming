import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import { useRoute } from '../routing/useRoute';
import { useProjectSync } from '../useProjectSync';
import { usePromoteToPrinciple } from '../usePromoteToPrinciple';
import { useThemeOverlap, type ThemeOverlapEdge } from '../useThemeOverlap';
import { getDb } from '../../../src/storage/db';
import type { BoardRecord } from '../../../src/board/types';
import type { Idea, ProjectId } from '../../../src/types';

/**
 * Screen 03 · Cross-board map (force-directed planet view).
 *
 * Spec: Design/Build Spec.html §03, Design/Screen Map.html §03 (galaxy-art).
 *
 * Each board is a circular SVG "planet". Planets repel one another while being
 * pulled toward the viewport centre via a tiny iterative physics loop. Cross-
 * board edges are derived from two sources:
 *   1. Solid purple — ideas with `pinnedToBoardIds.length > 1` (every pair of
 *      pinned boards gets an edge).
 *   2. Dashed green — AI-detected theme overlap. v1 uses `IdeaGroup.theme`
 *      records: any two boards that share a normalised theme label (or have
 *      Jaccard token overlap > 0.3) become a dashed-green pair. Real wiring to
 *      the `themeOverlapDetector` role lives behind bo-161 (see TODO below).
 *
 * Out of scope (deferred):
 *   - Persona overlays / cluster halos.
 *   - Synthesizer "promote to principle" mutation — for v1 the actions are
 *     console.info logs; bo-162's promote flow owns the real mutation.
 *   - Real `themeOverlapDetector` integration (bo-161).
 */

export interface MapScreenProps {
  /** Constrain the map to a specific project; defaults to all boards. */
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

interface CrossBoardEdgeRecord {
  boardA: string;
  boardB: string;
  /** 'pinned' (solid purple) or 'theme' (dashed green). */
  kind: 'pinned' | 'theme';
  /** Source label — pinned idea title or shared theme. Used by the notice card. */
  label: string;
}

interface NoticeRecord {
  /** The pinned-idea or shared-theme title. */
  label: string;
  /** Boards this title appears on. */
  boardCount: number;
}

interface LoadedState {
  boards: ReadonlyArray<BoardRecord>;
  ideaCounts: Readonly<Record<string, number>>;
  /** Pinned-idea edges only — theme edges merge in at render time from the LLM hook. */
  pinnedEdges: ReadonlyArray<CrossBoardEdgeRecord>;
  notice: NoticeRecord | null;
}

/**
 * Threshold below which an LLM-detected theme edge renders dimmed (0.4 mirrors
 * the role's own "drop if < 0.4" rule — we keep edges at the boundary visible
 * but lower the opacity so the eye prioritises stronger signals).
 */
const THEME_CONFIDENCE_DIM_THRESHOLD = 0.4;

// ---------- Sticky-palette planet colour map ----------
const PLANET_PALETTE: ReadonlyArray<{ fill: string; edge: string }> = [
  { fill: 'var(--sticky-yellow)', edge: 'var(--sticky-yellow-edge)' }, // y
  { fill: 'var(--sticky-pink)', edge: 'var(--sticky-pink-edge)' }, // p
  { fill: 'var(--sticky-blue)', edge: 'var(--sticky-blue-edge)' }, // b
  { fill: 'var(--sticky-peach)', edge: 'var(--sticky-peach-edge)' }, // pe
  { fill: 'var(--sticky-green)', edge: 'var(--sticky-green-edge)' }, // g
  { fill: 'var(--sticky-lilac)', edge: 'var(--sticky-lilac-edge)' }, // l
];

/** Deterministic hash → palette index for stable per-board colour. */
function paletteIndexFor(boardId: string): number {
  let h = 0;
  for (let i = 0; i < boardId.length; i += 1) {
    h = (h * 31 + boardId.charCodeAt(i)) >>> 0;
  }
  return h % PLANET_PALETTE.length;
}

function radiusFor(ideaCount: number): number {
  if (ideaCount <= 5) return 30;
  if (ideaCount <= 15) return 42;
  return 54;
}

// ---------- Edge derivation ----------
// Lexical theme-overlap helpers moved to `useThemeOverlap` so the LLM-driven
// detector and its fallback share one implementation. MapScreen only owns the
// pinned-idea derivation now.

function deriveEdgesFromIdeas(
  ideas: ReadonlyArray<Idea>,
  boardIds: ReadonlySet<string>,
): { edges: CrossBoardEdgeRecord[]; notice: NoticeRecord | null } {
  // 1) Pinned-idea edges. An idea with pinnedToBoardIds of length > 1 produces
  //    a fully-connected clique across those boards.
  const edges: CrossBoardEdgeRecord[] = [];
  let topPinned: NoticeRecord | null = null;
  for (const idea of ideas) {
    const pinned = (idea.pinnedToBoardIds ?? []).filter((bid) =>
      boardIds.has(bid),
    );
    if (pinned.length < 2) continue;
    const sorted = [...pinned].sort();
    const title = idea.rawText.split(/\r?\n/)[0]?.slice(0, 80) ?? '(untitled)';
    if (!topPinned || pinned.length > topPinned.boardCount) {
      topPinned = { label: title, boardCount: pinned.length };
    }
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        edges.push({
          boardA: sorted[i],
          boardB: sorted[j],
          kind: 'pinned',
          label: title,
        });
      }
    }
  }
  // Dedupe pinned edges by pair (keep the first label).
  const seenPairs = new Set<string>();
  const dedupedPinned: CrossBoardEdgeRecord[] = [];
  for (const edge of edges) {
    const key = `${edge.boardA}::${edge.boardB}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    dedupedPinned.push(edge);
  }
  return { edges: dedupedPinned, notice: topPinned };
}

async function loadMapData(
  projectId: ProjectId | undefined,
): Promise<LoadedState> {
  const db = await getDb();
  const allBoards = await db.getAll('boards');
  const boards = projectId
    ? allBoards.filter((b) => (b.projectId ?? 'local-project') === projectId)
    : allBoards;
  const sorted = [...boards].sort((a, b) => b.updatedAt - a.updatedAt);

  const counts: Record<string, number> = {};
  for (const board of sorted) {
    try {
      const ideas = await db.getAllFromIndex('ideas', 'byBoardId', board.id);
      counts[board.id] = ideas.length;
    } catch {
      counts[board.id] = 0;
    }
  }

  const boardIdSet = new Set(sorted.map((b) => b.id));

  let allIdeas: Idea[] = [];
  try {
    allIdeas = await db.getAll('ideas');
  } catch {
    allIdeas = [];
  }
  const { edges: pinnedEdges, notice } = deriveEdgesFromIdeas(
    allIdeas,
    boardIdSet,
  );
  return {
    boards: sorted,
    ideaCounts: counts,
    pinnedEdges,
    notice,
  };
}

// ---------- Force-directed layout ----------

interface Vec2 {
  x: number;
  y: number;
}

interface PlanetLayout {
  id: string;
  pos: Vec2;
  r: number;
}

/**
 * Iterative repulsion + center-attraction. With ~20 boards, ~80 iterations
 * settles into a pleasant scatter. Constants tuned empirically against the
 * spec's loose scatter: repulsion=4500 ≈ 1/d² × ~k where d is in px; centre
 * pull is a soft spring toward viewport mid. We freeze positions after the
 * run and only recompute when the board list (id-set) changes.
 */
function runForceLayout(
  boards: ReadonlyArray<BoardRecord>,
  ideaCounts: Readonly<Record<string, number>>,
  width: number,
  height: number,
  iterations: number = 80,
): PlanetLayout[] {
  if (boards.length === 0) return [];
  const centre: Vec2 = { x: width / 2, y: height / 2 };
  // Seed positions on a circle around the centre — deterministic per id so
  // tests / re-mounts are stable.
  const planets: PlanetLayout[] = boards.map((b, idx) => {
    const r = radiusFor(ideaCounts[b.id] ?? 0);
    const seed = paletteIndexFor(b.id) + idx;
    const theta = (seed / Math.max(boards.length, 1)) * Math.PI * 2;
    const radius = Math.min(width, height) * 0.28;
    return {
      id: b.id,
      r,
      pos: {
        x: centre.x + Math.cos(theta) * radius,
        y: centre.y + Math.sin(theta) * radius,
      },
    };
  });

  const REPULSION = 4500;
  const CENTRE_PULL = 0.012;
  const STEP = 0.85;
  const MIN_DIST = 4;

  for (let iter = 0; iter < iterations; iter += 1) {
    const forces: Vec2[] = planets.map(() => ({ x: 0, y: 0 }));
    // Pairwise repulsion.
    for (let i = 0; i < planets.length; i += 1) {
      for (let j = i + 1; j < planets.length; j += 1) {
        const dx = planets[i].pos.x - planets[j].pos.x;
        const dy = planets[i].pos.y - planets[j].pos.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < MIN_DIST * MIN_DIST) distSq = MIN_DIST * MIN_DIST;
        const dist = Math.sqrt(distSq);
        // Boost repulsion when circles overlap so they always separate.
        const minSep = planets[i].r + planets[j].r + 14;
        const overlap = Math.max(0, minSep - dist);
        const force = REPULSION / distSq + overlap * 1.4;
        const nx = dx / dist;
        const ny = dy / dist;
        forces[i].x += nx * force;
        forces[i].y += ny * force;
        forces[j].x -= nx * force;
        forces[j].y -= ny * force;
      }
    }
    // Centre attraction.
    for (let i = 0; i < planets.length; i += 1) {
      forces[i].x += (centre.x - planets[i].pos.x) * CENTRE_PULL;
      forces[i].y += (centre.y - planets[i].pos.y) * CENTRE_PULL;
    }
    // Integrate. Damp by step; clamp inside viewport so planets don't escape.
    for (let i = 0; i < planets.length; i += 1) {
      planets[i].pos.x += forces[i].x * STEP * 0.02;
      planets[i].pos.y += forces[i].y * STEP * 0.02;
      const padX = planets[i].r + 12;
      const padY = planets[i].r + 36; // extra room for the count label
      planets[i].pos.x = Math.max(padX, Math.min(width - padX, planets[i].pos.x));
      planets[i].pos.y = Math.max(padY, Math.min(height - padY, planets[i].pos.y));
    }
  }
  return planets;
}

// ---------- Component ----------

const STAGE_WIDTH = 880;
const STAGE_HEIGHT = 560;

export function MapScreen({
  projectId,
  boardsOverride,
  ideaCountsOverride,
}: MapScreenProps = {}): React.ReactElement {
  const [route, navigate] = useRoute();
  const activeBoardId = route.kind === 'map' ? route.boardId : null;
  const { project } = useProjectSync();

  const initialState: LoadedState | null =
    boardsOverride !== undefined
      ? {
          boards: boardsOverride,
          ideaCounts: ideaCountsOverride ?? {},
          pinnedEdges: [],
          notice: null,
        }
      : null;

  const [state, setState] = useState<LoadedState | null>(initialState);
  const [error, setError] = useState<Error | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState<string | null>(null);

  useEffect(() => {
    if (boardsOverride !== undefined) {
      setState({
        boards: boardsOverride,
        ideaCounts: ideaCountsOverride ?? {},
        pinnedEdges: [],
        notice: null,
      });
      return;
    }
    let cancelled = false;
    setError(null);
    loadMapData(projectId)
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
          setState({ boards: [], ideaCounts: {}, pinnedEdges: [], notice: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, boardsOverride, ideaCountsOverride]);

  // Force layout — recompute only when the board id-set (or counts) changes.
  // Joining the ids gives us a stable dependency without re-running on every
  // unrelated state update.
  const boardKey = useMemo(() => {
    if (state === null) return '';
    return state.boards.map((b) => b.id).join('|');
  }, [state]);

  const planets = useMemo<PlanetLayout[]>(() => {
    if (state === null) return [];
    return runForceLayout(
      state.boards,
      state.ideaCounts,
      STAGE_WIDTH,
      STAGE_HEIGHT,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, state?.ideaCounts]);

  const planetById = useMemo(() => {
    const map = new Map<string, PlanetLayout>();
    for (const p of planets) map.set(p.id, p);
    return map;
  }, [planets]);

  // LLM-driven theme edges (bo-161). The hook caches per (projectId, boardKey)
  // so repeated renders / remounts don't re-bill the provider. When the LLM is
  // unavailable it falls back to lexical theme matching on `IdeaGroup.theme`.
  const themeOverlap = useThemeOverlap({
    projectId,
    boards: state?.boards ?? [],
    boardKey,
    // Tests bypass the detector when boardsOverride is supplied so the screen
    // stays deterministic for snapshots and storybook fixtures.
    disabled: boardsOverride !== undefined,
  });

  // Pinned edges win — strip any theme edge that duplicates a pinned pair so
  // the same two planets never get a doubled-up line. We model the merged set
  // as a tagged union so the render path can narrow on `kind` and pick up the
  // LLM-only `confidence` field without an unsafe cast.
  type RenderEdge =
    | { kind: 'pinned'; boardA: string; boardB: string; label: string }
    | {
        kind: 'theme';
        boardA: string;
        boardB: string;
        label: string;
        themes: string[];
        confidence: number | null;
      };
  const mergedEdges = useMemo<RenderEdge[]>(() => {
    if (state === null) return [];
    const pinnedKeys = new Set(
      state.pinnedEdges.map((e) => `${e.boardA}::${e.boardB}`),
    );
    const pinned: RenderEdge[] = state.pinnedEdges.map((e) => ({
      kind: 'pinned',
      boardA: e.boardA,
      boardB: e.boardB,
      label: e.label,
    }));
    const themeEdges: RenderEdge[] = themeOverlap.edges
      .filter((e: ThemeOverlapEdge) => !pinnedKeys.has(`${e.boardA}::${e.boardB}`))
      .map((e: ThemeOverlapEdge) => ({
        kind: 'theme',
        boardA: e.boardA,
        boardB: e.boardB,
        label: e.label,
        themes: e.themes,
        confidence: e.confidence,
      }));
    return [...pinned, ...themeEdges];
  }, [state, themeOverlap.edges]);

  // Promote-to-principle (bo-162). Wires the notice card's accept button to the
  // canonical mutation. The hook also gives us a live principles snapshot which
  // the drawer reads in preference to `project?.principles` so the new entry
  // shows up on the next render without waiting for useProjectSync to refresh.
  const { promoteToPrinciple, principles: hookPrinciples } = usePromoteToPrinciple();

  const handleSelect = useCallback(
    (boardId: string) => {
      navigate({ kind: 'board', boardId, ideaId: null });
    },
    [navigate],
  );

  const handlePromoteAccept = useCallback(
    async (label: string) => {
      setPromoteError(null);
      try {
        const grew = await promoteToPrinciple(label);
        // Even if `grew === false` (duplicate / empty) dismiss the card so the
        // user isn't stuck staring at a no-op CTA — the dedupe rule lives in
        // the hook and is the right place to silence repeats.
        setNoticeDismissed(true);
        if (!grew) {
          // Surface a one-line breadcrumb for diagnostics; the UI already
          // dismissed the notice so we don't need a banner.
          // eslint-disable-next-line no-console
          console.info('[MapScreen] notice.accept noop (duplicate / empty)', label);
        }
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : 'Could not promote.';
        setPromoteError(message);
      }
    },
    [promoteToPrinciple],
  );

  const handlePromotePreview = useCallback((label: string) => {
    // v1 preview: highlight the affected label inline. Non-destructive — the
    // promote mutation only runs on accept. (BriefScreen owns the richer ghost
    // preview; the map only has the notice card so a lightweight hint is the
    // right scope.)
    setPreviewLabel(label);
    // Keep the existing breadcrumb so design QA can scrub logs during demos.
    // eslint-disable-next-line no-console
    console.info('[MapScreen] notice.preview', label);
  }, []);

  const isLoading = state === null;
  const isEmpty = state !== null && state.boards.length === 0;
  // Prefer the hook's principles snapshot so a successful promote refreshes the
  // drawer immediately, even before `useProjectSync` round-trips state.
  const principles = hookPrinciples.length > 0
    ? hookPrinciples
    : project?.principles ?? [];
  const notice = state?.notice ?? null;

  return (
    <div className="paper-dots dashboard" aria-label="Cross-board map">
      <div className="dash-head">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h1>Map.</h1>
            <div className="dash-sub">
              Every board in this project — planets you can hop between. Lines
              are ideas or themes that cross boards.
            </div>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (
                typeof window !== 'undefined' &&
                typeof window.__openPrinciplesDrawer === 'function'
              ) {
                window.__openPrinciplesDrawer();
              }
            }}
            aria-label="Open principles drawer"
            title="Open the project's principles drawer"
          >
            <span aria-hidden="true">¶</span>&nbsp;Principles
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            border: '2px dashed var(--accent-contradicts)',
            background: 'rgba(201, 74, 58, 0.08)',
            color: 'var(--accent-contradicts)',
            borderRadius: 14,
            padding: '12px 16px',
            fontFamily: 'var(--f-hand-body)',
            fontSize: 16,
          }}
        >
          Could not load boards: {error.message}
        </div>
      )}

      {isLoading && !error && (
        <div
          role="status"
          style={{
            fontFamily: 'var(--f-hand-body)',
            color: 'var(--ink-soft)',
            fontSize: 17,
          }}
        >
          Loading boards…
        </div>
      )}

      {isEmpty && !error && (
        <div
          style={{
            border: '2px dashed var(--ink)',
            background: 'var(--paper)',
            borderRadius: 18,
            boxShadow: 'var(--shadow-lift)',
            padding: '32px 24px',
            textAlign: 'center',
            fontFamily: 'var(--f-hand-body)',
            color: 'var(--ink-soft)',
            fontSize: 17,
          }}
        >
          No boards yet — start one on the home screen and it will show up here.
        </div>
      )}

      {state && state.boards.length > 0 && (
        <div
          style={{
            position: 'relative',
            display: 'flex',
            gap: 16,
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              position: 'relative',
              flex: 1,
              border: '2px solid var(--ink)',
              borderRadius: 18,
              background: 'var(--paper)',
              boxShadow: 'var(--shadow-lift)',
              overflow: 'hidden',
            }}
          >
            <svg
              viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}
              width="100%"
              height={STAGE_HEIGHT}
              role="presentation"
              style={{ display: 'block' }}
            >
              {/* Edges first so planets render on top. */}
              <g aria-hidden="true">
                {mergedEdges.map((edge, idx) => {
                  const a = planetById.get(edge.boardA);
                  const b = planetById.get(edge.boardB);
                  if (!a || !b) return null;
                  // Curved path for a hand-drawn feel — control point offset
                  // perpendicular to the midpoint by ~12% of the segment.
                  const mx = (a.pos.x + b.pos.x) / 2;
                  const my = (a.pos.y + b.pos.y) / 2;
                  const dx = b.pos.x - a.pos.x;
                  const dy = b.pos.y - a.pos.y;
                  const len = Math.sqrt(dx * dx + dy * dy) || 1;
                  const nx = -dy / len;
                  const ny = dx / len;
                  const bow = Math.min(40, len * 0.12);
                  const cx = mx + nx * bow;
                  const cy = my + ny * bow;
                  const d = `M ${a.pos.x} ${a.pos.y} Q ${cx} ${cy} ${b.pos.x} ${b.pos.y}`;
                  const stroke =
                    edge.kind === 'pinned'
                      ? 'var(--accent-ghost)'
                      : 'var(--accent-revives)';
                  // Dim low-confidence theme edges so the eye prioritises the
                  // stronger overlaps. Lexical-fallback edges report
                  // `confidence: null` and render at the standard opacity —
                  // dimming them would conflate "weak signal" with "no signal".
                  const themeConfidence =
                    edge.kind === 'theme' ? edge.confidence : null;
                  const isLowConfidenceTheme =
                    typeof themeConfidence === 'number' &&
                    themeConfidence < THEME_CONFIDENCE_DIM_THRESHOLD;
                  const opacity = isLowConfidenceTheme ? 0.4 : 0.75;
                  return (
                    <path
                      key={`${edge.boardA}-${edge.boardB}-${edge.kind}-${idx}`}
                      d={d}
                      stroke={stroke}
                      strokeWidth={edge.kind === 'pinned' ? 2 : 1.6}
                      fill="none"
                      strokeDasharray={edge.kind === 'pinned' ? undefined : '5 5'}
                      opacity={opacity}
                    />
                  );
                })}
              </g>

              {/* Planets. */}
              {planets.map((p) => {
                const board = state.boards.find((b) => b.id === p.id);
                if (!board) return null;
                const palette = PLANET_PALETTE[paletteIndexFor(p.id)];
                const ideaCount = state.ideaCounts[p.id] ?? 0;
                const isActive = p.id === activeBoardId;
                const isHovered = hovered === p.id;
                const isArchived =
                  // BoardRecord may not carry an archived flag in v0; fall back
                  // to status-style discovery if/when it exists. Today we
                  // approximate archived via a `(board as any).archived` peek.
                  // The cast is intentional and isolated.
                  Boolean((board as { archived?: boolean }).archived);
                const scale = isHovered ? 1.04 : 1;
                const ringR = p.r + 6;
                return (
                  <g
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open board ${board.title}`}
                    style={{
                      cursor: 'pointer',
                      opacity: isArchived ? 0.55 : 1,
                      transform: `translate(${p.pos.x}px, ${p.pos.y}px) scale(${scale})`,
                      transformOrigin: `${p.pos.x}px ${p.pos.y}px`,
                      transformBox: 'fill-box',
                      transition: 'transform 120ms ease',
                    }}
                    onClick={() => handleSelect(p.id)}
                    onMouseEnter={() => setHovered(p.id)}
                    onMouseLeave={() =>
                      setHovered((cur) => (cur === p.id ? null : cur))
                    }
                    onFocus={() => setHovered(p.id)}
                    onBlur={() =>
                      setHovered((cur) => (cur === p.id ? null : cur))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelect(p.id);
                      }
                    }}
                  >
                    {isActive && (
                      <circle
                        cx={0}
                        cy={0}
                        r={ringR}
                        fill="none"
                        stroke="var(--accent-ai, var(--accent-ghost))"
                        strokeWidth={2}
                        strokeDasharray="4 3"
                      />
                    )}
                    <circle
                      cx={0}
                      cy={0}
                      r={p.r}
                      fill={palette.fill}
                      stroke="var(--ink)"
                      strokeWidth={1.6}
                      style={{
                        filter:
                          'drop-shadow(2px 3px 0 rgba(26,24,20,0.18))',
                      }}
                    />
                    <text
                      x={0}
                      y={-2}
                      textAnchor="middle"
                      style={{
                        fontFamily: 'var(--f-hand)',
                        fontWeight: 700,
                        fontSize: Math.min(p.r * 0.45, 22),
                        fill: 'var(--ink)',
                      }}
                    >
                      {truncate(board.title, p.r > 45 ? 14 : 10)}
                    </text>
                    <text
                      x={0}
                      y={p.r * 0.55}
                      textAnchor="middle"
                      style={{
                        fontFamily: 'var(--f-mono)',
                        fontSize: 9,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        fill: 'var(--ink-faint)',
                      }}
                    >
                      {ideaCount} {ideaCount === 1 ? 'idea' : 'ideas'}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Floating Synthesizer-notices card — top right. */}
            {notice && !noticeDismissed && (
              <div style={NOTICE_CARD_STYLE} role="status">
                <div style={NOTICE_KICKER_STYLE}>Synthesizer notices</div>
                <div style={{ marginBottom: 6 }}>
                  &ldquo;{truncate(notice.label, 36)}&rdquo; appears on{' '}
                  {notice.boardCount} boards.{' '}
                  <b>Promote to project principle?</b>
                </div>
                {previewLabel === notice.label && (
                  <div
                    style={{
                      fontFamily: 'var(--f-mono)',
                      fontSize: 10,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--accent-ghost)',
                      marginBottom: 6,
                    }}
                  >
                    Preview: would add &ldquo;{truncate(notice.label, 28)}&rdquo;
                    to principles.
                  </div>
                )}
                {promoteError && (
                  <div
                    role="alert"
                    style={{
                      fontFamily: 'var(--f-mono)',
                      fontSize: 10,
                      color: 'var(--accent-contradicts)',
                      marginBottom: 6,
                    }}
                  >
                    {promoteError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      void handlePromoteAccept(notice.label);
                    }}
                  >
                    accept
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => handlePromotePreview(notice.label)}
                  >
                    preview
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Dismiss synthesizer notice"
                    onClick={() => setNoticeDismissed(true)}
                    style={{ width: 26, height: 26, padding: 0 }}
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            {/* Theme-edge source hint — visible only when the LLM detector did
                not produce a result and we're falling back to lexical matches. */}
            {themeOverlap.source === 'lexical' && state.boards.length > 1 && (
              <div style={THEME_SOURCE_HINT_STYLE} aria-live="polite">
                Theme edges from lexical fallback — provider key missing or
                detector unavailable.
              </div>
            )}
          </div>

          {/* Right-rail principles drawer (inline, always visible). */}
          <aside
            aria-label="Project principles"
            style={PRINCIPLES_RAIL_STYLE}
          >
            <div
              style={{
                fontFamily: 'var(--f-hand)',
                fontSize: 22,
                fontWeight: 700,
                lineHeight: 1.05,
                marginBottom: 2,
              }}
            >
              Principles
            </div>
            <div
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--ink-faint)',
                marginBottom: 10,
              }}
            >
              {principles.length} pinned
            </div>
            {principles.length === 0 ? (
              <div
                style={{
                  fontFamily: 'var(--f-hand-body)',
                  fontSize: 14,
                  color: 'var(--ink-soft)',
                  border: '1.5px dashed var(--hairline)',
                  borderRadius: 10,
                  padding: '10px 12px',
                }}
              >
                None yet — promote a recurring idea to a principle.
              </div>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {principles.map((principle, idx) => (
                  <li
                    key={`${idx}-${principle.slice(0, 16)}`}
                    style={PRINCIPLES_ROW_STYLE}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        fontFamily: 'var(--f-hand)',
                        fontSize: 18,
                        color: 'var(--accent-ghost)',
                        lineHeight: 1,
                        marginTop: 1,
                      }}
                    >
                      ★
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontFamily: 'var(--f-hand-body)',
                        fontSize: 14,
                        color: 'var(--ink)',
                        lineHeight: 1.3,
                      }}
                    >
                      {principle}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

// ---------- Small utilities + style constants ----------

function truncate(input: string, n: number): string {
  if (input.length <= n) return input;
  return `${input.slice(0, Math.max(0, n - 1))}…`;
}

const NOTICE_CARD_STYLE: CSSProperties = {
  position: 'absolute',
  right: 14,
  top: 14,
  background: 'var(--paper)',
  border: '1.6px solid var(--accent-ghost)',
  borderRadius: 8,
  padding: '10px 12px',
  boxShadow: '2px 2px 0 rgba(122,92,171,0.25)',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 13,
  lineHeight: 1.35,
  maxWidth: 220,
  color: 'var(--ink)',
};

const NOTICE_KICKER_STYLE: CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 9,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--accent-ghost)',
  fontWeight: 700,
  display: 'block',
  marginBottom: 4,
};

const PRINCIPLES_RAIL_STYLE: CSSProperties = {
  width: 220,
  flexShrink: 0,
  border: '2px solid var(--ink)',
  borderRadius: 18,
  background: 'var(--paper)',
  boxShadow: 'var(--shadow-lift)',
  padding: '14px 14px',
  maxHeight: STAGE_HEIGHT,
  overflowY: 'auto',
};

const PRINCIPLES_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  border: '1.5px solid var(--ink)',
  borderRadius: 10,
  background: 'var(--paper-dark)',
  padding: '8px 10px',
  boxShadow: '1.5px 1.5px 0 var(--ink)',
};

const THEME_SOURCE_HINT_STYLE: CSSProperties = {
  position: 'absolute',
  left: 14,
  bottom: 10,
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  letterSpacing: '0.04em',
  color: 'var(--ink-faint)',
  background: 'rgba(255,255,255,0.6)',
  padding: '2px 6px',
  borderRadius: 6,
  pointerEvents: 'none',
};

export default MapScreen;
