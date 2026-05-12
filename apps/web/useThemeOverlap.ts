/**
 * useThemeOverlap — bo-161 wiring helper.
 *
 * Thin React hook that produces cross-board theme edges for the MapScreen.
 * Prefers the `themeOverlapDetector` LLM role; falls back to a deterministic
 * lexical scan (exact-match + Jaccard token overlap on `IdeaGroup.theme`) when
 * the role is unavailable, errors out, or returns nothing usable.
 *
 * Contract:
 *   - Input: the set of boards on the current map plus an identity hash so the
 *     hook can detect roster changes without churning on every render.
 *   - Output: `{ edges, source, isLoading }`. `edges` carries the same shape
 *     MapScreen renders today plus an optional `confidence` for LLM edges so
 *     low-signal pairs can be dimmed in the SVG.
 *   - The LLM call lives behind a `useEffect` keyed on `boardKey` + `projectId`
 *     so identical mounts re-use the cached result rather than re-billing the
 *     provider on every render. On success we also persist via
 *     `setCrossBoardEdges` so a future cold-load can hydrate from Project state
 *     before the role re-runs.
 *
 * Out of scope:
 *   - Confidence-threshold tuning (held by caller — default 0.4 in MapScreen).
 *   - Edge prune on board delete (the canonical pruner lives in
 *     `storage/projects.pruneCrossBoardEdges`; MapScreen calls it post-load).
 */
import { useEffect, useMemo, useState } from 'react';
import type { BoardRecord } from '../../src/board/types';
import { getDb } from '../../src/storage/db';
import { runAdhocRole } from '../../src/orchestrator/adhocRole';
import {
  buildThemeOverlapDetectorTask,
  themeOverlapDetector,
  type ThemeOverlapBoardInput,
  type ThemeOverlapDetectorOutput,
} from '../../src/orchestrator/roles/themeOverlapDetector';
import {
  getCrossBoardEdges,
  pruneCrossBoardEdges,
  setCrossBoardEdges,
} from '../../src/storage/projects';
import type { CrossBoardEdge, ProjectId } from '../../src/types';

export interface ThemeOverlapEdge {
  boardA: string;
  boardB: string;
  /** Source label — primary shared theme used by the notice card. */
  label: string;
  /** All shared themes the detector returned (LLM edges carry >=1). */
  themes: string[];
  /** Detector confidence in [0,1]; lexical fallback edges report `null`. */
  confidence: number | null;
}

export type ThemeOverlapSource = 'llm' | 'lexical';

export interface UseThemeOverlapResult {
  edges: ThemeOverlapEdge[];
  source: ThemeOverlapSource;
  isLoading: boolean;
}

interface ThemeOverlapCacheEntry {
  edges: ThemeOverlapEdge[];
  source: ThemeOverlapSource;
}

/**
 * Module-level cache so repeated mounts (or re-renders that don't change the
 * board roster) don't re-bill the LLM. Keyed by `${projectId ?? ''}::${boardKey}`.
 */
const overlapCache = new Map<string, ThemeOverlapCacheEntry>();

function cacheKey(projectId: ProjectId | undefined, boardKey: string): string {
  return `${projectId ?? ''}::${boardKey}`;
}

function normaliseLabel(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

function tokenSet(input: string): Set<string> {
  return new Set(
    normaliseLabel(input)
      .split(/[^a-z0-9]+/g)
      .filter((tok) => tok.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  a.forEach((v) => {
    if (b.has(v)) inter += 1;
  });
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Pull `IdeaGroup.theme` strings per board out of IDB. Bounded to the boards
 * passed in so an absent or huge groups store doesn't poison the result.
 */
async function loadThemesByBoard(
  boardIds: ReadonlySet<string>,
): Promise<Map<string, Set<string>>> {
  const db = await getDb();
  let groups: Array<{ boardId?: string; theme?: string }> = [];
  try {
    groups = await db.getAll('groups');
  } catch {
    return new Map();
  }
  const themesByBoard = new Map<string, Set<string>>();
  for (const g of groups) {
    if (!g.boardId || !g.theme) continue;
    if (!boardIds.has(g.boardId)) continue;
    const norm = normaliseLabel(g.theme);
    if (!norm) continue;
    if (!themesByBoard.has(g.boardId)) themesByBoard.set(g.boardId, new Set());
    themesByBoard.get(g.boardId)!.add(g.theme.trim());
  }
  return themesByBoard;
}

function deriveLexicalEdges(
  themesByBoard: Map<string, Set<string>>,
): ThemeOverlapEdge[] {
  const entries = Array.from(themesByBoard.entries());
  const edges: ThemeOverlapEdge[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [aId, aThemes] = entries[i];
      const [bId, bThemes] = entries[j];
      const bNorm = new Set(Array.from(bThemes, (t) => normaliseLabel(t)));
      let label: string | null = null;
      // Exact-match check first (cheapest).
      for (const a of aThemes) {
        if (bNorm.has(normaliseLabel(a))) {
          label = a;
          break;
        }
      }
      // Fall back to Jaccard over token sets across all theme strings.
      if (label === null) {
        outer: for (const a of aThemes) {
          for (const b of bThemes) {
            if (jaccard(tokenSet(a), tokenSet(b)) > 0.3) {
              label = a;
              break outer;
            }
          }
        }
      }
      if (label !== null) {
        const [boardA, boardB] = aId < bId ? [aId, bId] : [bId, aId];
        const key = `${boardA}::${boardB}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
          boardA,
          boardB,
          label,
          themes: [label],
          confidence: null,
        });
      }
    }
  }
  return edges;
}

/**
 * Convert a persisted `CrossBoardEdge` list to the shape MapScreen renders.
 * Used both for the post-LLM mapping and the cold-start hydrate.
 */
function adaptPersistedEdges(
  edges: ReadonlyArray<CrossBoardEdge>,
): ThemeOverlapEdge[] {
  return edges.map((edge) => ({
    boardA: edge.boardA,
    boardB: edge.boardB,
    label: edge.themes[0] ?? '(shared theme)',
    themes: [...edge.themes],
    confidence: Number.isFinite(edge.confidence) ? edge.confidence : null,
  }));
}

export interface UseThemeOverlapArgs {
  projectId: ProjectId | undefined;
  boards: ReadonlyArray<BoardRecord>;
  /**
   * Stable identity for the board roster. MapScreen already computes this as
   * `boards.map(b => b.id).join('|')`; passing it in keeps the dep array
   * cheap and prevents a flicker when boards re-render with identical ids.
   */
  boardKey: string;
  /**
   * When true the hook is a no-op (used by tests / Storybook to bypass the
   * detector entirely).
   */
  disabled?: boolean;
}

export function useThemeOverlap(args: UseThemeOverlapArgs): UseThemeOverlapResult {
  const { projectId, boards, boardKey, disabled = false } = args;
  const cacheId = cacheKey(projectId, boardKey);

  // Seed from cache so a remount or sibling-state update is instant.
  const cached = overlapCache.get(cacheId);
  const [edges, setEdges] = useState<ThemeOverlapEdge[]>(cached?.edges ?? []);
  const [source, setSource] = useState<ThemeOverlapSource>(cached?.source ?? 'lexical');
  const [isLoading, setIsLoading] = useState<boolean>(!cached && !disabled && boards.length > 0);

  // Stable handle on the board roster so the effect can read ids without
  // re-running when the parent renders with a new array identity.
  const boardIds = useMemo(() => new Set(boards.map((b) => b.id)), [boardKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (disabled) {
      setIsLoading(false);
      return;
    }
    if (boards.length === 0) {
      setEdges([]);
      setSource('lexical');
      setIsLoading(false);
      return;
    }
    // Cache hit — already wired during the seed above; nothing to do.
    if (overlapCache.has(cacheId)) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      // 1) Hydrate from already-persisted Project.crossBoardEdges if present.
      //    Treats persistence as the LLM-source signal so the UI doesn't drop
      //    back to "lexical fallback" on every cold load. The detector will
      //    refresh in the background.
      let hydrated: ThemeOverlapEdge[] = [];
      if (projectId) {
        try {
          const persisted = await getCrossBoardEdges(projectId);
          const pruned = pruneCrossBoardEdges(persisted, boardIds);
          if (pruned.length > 0) {
            hydrated = adaptPersistedEdges(pruned);
            if (!cancelled) {
              setEdges(hydrated);
              setSource('llm');
            }
          }
        } catch {
          // Non-fatal — fall through to lexical fallback.
        }
      }

      // 2) Always build the lexical fallback so we have something on hand if
      //    the LLM step fails. Cheap (single IDB scan + O(n²) over themes).
      const themesByBoard = await loadThemesByBoard(boardIds);
      const lexicalEdges = deriveLexicalEdges(themesByBoard);

      // 3) Ask the detector for the canonical edge set.
      const boardInputs: ThemeOverlapBoardInput[] = boards.map((b) => ({
        id: b.id,
        title: b.title,
        summary: b.summary,
        themes: Array.from(themesByBoard.get(b.id) ?? []),
      }));

      try {
        const task = buildThemeOverlapDetectorTask({ boards: boardInputs });
        const { result } = await runAdhocRole<ThemeOverlapDetectorOutput>(
          themeOverlapDetector,
          task,
        );
        if (cancelled) return;
        if (result && Array.isArray(result.crossBoardEdges)) {
          const llmEdges: ThemeOverlapEdge[] = result.crossBoardEdges
            .filter((edge) => boardIds.has(edge.boardA) && boardIds.has(edge.boardB))
            .map((edge) => ({
              boardA: edge.boardA,
              boardB: edge.boardB,
              label: edge.themes[0] ?? '(shared theme)',
              themes: [...edge.themes],
              confidence: edge.confidence,
            }));
          const next: ThemeOverlapCacheEntry = {
            edges: llmEdges,
            source: 'llm',
          };
          overlapCache.set(cacheId, next);
          if (!cancelled) {
            setEdges(llmEdges);
            setSource('llm');
            setIsLoading(false);
          }
          // Persist so future cold loads hydrate from Project state.
          if (projectId) {
            try {
              await setCrossBoardEdges(
                projectId,
                result.crossBoardEdges.map((edge) => ({
                  boardA: edge.boardA,
                  boardB: edge.boardB,
                  themes: [...edge.themes],
                  confidence: edge.confidence,
                  rationale: edge.rationale,
                })),
              );
            } catch {
              // Persistence is best-effort; the UI already has the result.
            }
          }
          return;
        }
        // Result was null / unusable — fall through to lexical.
        throw new Error('themeOverlapDetector returned no edges');
      } catch {
        if (cancelled) return;
        const fallback: ThemeOverlapCacheEntry = {
          edges: hydrated.length > 0 ? hydrated : lexicalEdges,
          source: hydrated.length > 0 ? 'llm' : 'lexical',
        };
        // Only cache the lexical fallback if we have no LLM data at all. This
        // way a transient provider hiccup doesn't burn the cache and prevent a
        // later run from upgrading the source.
        if (fallback.source === 'llm') {
          overlapCache.set(cacheId, fallback);
        }
        if (!cancelled) {
          setEdges(fallback.edges);
          setSource(fallback.source);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // boardKey is the canonical identity for `boards`; including the array
    // itself would re-run on every parent render even when the roster is
    // identical.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheId, boardKey, projectId, disabled]);

  return { edges, source, isLoading };
}

/**
 * Test helper: clear the module-level cache between specs so each test sees a
 * clean LLM-call path. Not used by production code.
 */
export function __clearThemeOverlapCacheForTests(): void {
  overlapCache.clear();
}
