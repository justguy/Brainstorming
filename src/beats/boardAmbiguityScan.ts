/**
 * boardAmbiguityScan.ts — board-level Historian (ambiguity) scan.
 *
 * The existing `ambiguityExtractor` role expects a single Idea body. On the
 * canvas the user just stickies things — there is no per-idea phase flow to
 * fire the Historian, so ambiguity flags never surface. This helper wraps
 * `ambiguityExtractor` and feeds it a small synthetic "board body" composed of
 * the most recently updated stickies, so the same role can produce a coarse
 * board-wide pass without rewiring the per-idea state machine.
 *
 * Compromises:
 *   - Token budget: cap at the 12 most recently updated stickies, truncate
 *     each body to 240 chars. This keeps the LLM input bounded regardless of
 *     board size.
 *   - Per-sticky attribution: the role returns flat ambiguities; we try to
 *     match each flag back to the sticky that mentions the same phrase via a
 *     cheap substring scan. Misses fall through with `ideaId: undefined` and
 *     surface as board-wide flags.
 *
 * No new beat is added to `beatRegistry` — keeping the BeatName/BeatContextMap
 * unions stable avoids cross-cutting type churn for five parallel agents.
 */

import { runAdhocRole } from '../orchestrator/adhocRole';
import {
  ambiguityExtractor,
  type AmbiguityExtractorOutput,
} from '../orchestrator/roles/ambiguityExtractor';
import type { Idea } from '../types';

export const BOARD_AMBIGUITY_SCAN_MAX_IDEAS = 12;
export const BOARD_AMBIGUITY_SCAN_MAX_BODY_CHARS = 240;

export interface BoardAmbiguityFlag {
  /** Stable id minted by the role. */
  id: string;
  /** Free-form question/gap statement. */
  plainLanguage: string;
  type:
    | 'terminology'
    | 'goal'
    | 'scope'
    | 'audience'
    | 'ux'
    | 'data_process'
    | 'integration'
    | 'operational'
    | 'policy_legal_security'
    | 'ownership';
  severity: 'high' | 'medium' | 'low';
  resolutionMode: 'ask' | 'assume' | 'prototype' | 'research' | 'defer';
  /** Best-effort idea attribution by phrase match; may be undefined. */
  ideaId?: string;
}

export interface BoardAmbiguityScanResult {
  flags: BoardAmbiguityFlag[];
  scannedIdeaIds: string[];
  /** True when the role bailed (network error, schema fail, no live ideas). */
  failed: boolean;
}

/**
 * Pick the slice of ideas that goes into the synthetic body. Sorted by
 * `updatedAt desc`, capped at `BOARD_AMBIGUITY_SCAN_MAX_IDEAS`. Discarded /
 * archived ideas are skipped.
 */
export function selectIdeasForBoardAmbiguityScan(ideas: Idea[]): Idea[] {
  return ideas
    .filter(idea => idea.status !== 'discarded' && idea.status !== 'archived')
    .slice() // don't mutate caller
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, BOARD_AMBIGUITY_SCAN_MAX_IDEAS);
}

/** Build the synthetic "idea body" the role sees. */
export function buildBoardAmbiguityPrompt(ideas: Idea[]): string {
  return ideas
    .map((idea, index) => {
      const truncated = idea.rawText.length > BOARD_AMBIGUITY_SCAN_MAX_BODY_CHARS
        ? `${idea.rawText.slice(0, BOARD_AMBIGUITY_SCAN_MAX_BODY_CHARS - 1)}…`
        : idea.rawText;
      return `${index + 1}. [sticky:${idea.id}] ${truncated}`;
    })
    .join('\n');
}

/**
 * Best-effort idea attribution. The role doesn't carry sticky ids forward, so
 * we look for the longest noun-phrase-ish substring of the plain-language flag
 * inside each sticky's body. Cheap; misses fall back to a board-wide flag.
 */
export function attributeFlagToIdea(
  flagText: string,
  ideas: Idea[],
): string | undefined {
  const haystack = flagText.toLowerCase();
  // Pull out tokens longer than 4 chars — these are the "specific" words most
  // likely to be quoted back from the sticky.
  const tokens = Array.from(
    new Set(
      haystack
        .replace(/[^a-z0-9 ]+/g, ' ')
        .split(/\s+/)
        .filter(token => token.length >= 5),
    ),
  );
  if (tokens.length === 0) return undefined;

  let best: { id: string; score: number } | null = null;
  for (const idea of ideas) {
    const body = idea.rawText.toLowerCase();
    if (body.length === 0) continue;
    let score = 0;
    for (const token of tokens) {
      if (body.includes(token)) score += 1;
    }
    if (score > 0 && (best === null || score > best.score)) {
      best = { id: idea.id, score };
    }
  }
  return best?.id;
}

/**
 * Run the Historian (ambiguity) role across the board. Falls back gracefully
 * when no live ideas are present or the role bails — callers should treat a
 * `failed: true` result as a no-op (do not stage an empty insight).
 */
export async function runBoardAmbiguityScan(
  ideas: Idea[],
  options: { runner?: typeof runAdhocRole } = {},
): Promise<BoardAmbiguityScanResult> {
  const scanIdeas = selectIdeasForBoardAmbiguityScan(ideas);
  if (scanIdeas.length === 0) {
    return { flags: [], scannedIdeaIds: [], failed: false };
  }

  const prompt = buildBoardAmbiguityPrompt(scanIdeas);
  const task = `The following are stickies from a brainstorming board. Each line is one sticky; treat the board as a single body of work and surface the ambiguities that cut across multiple stickies (or hide inside one). Refer to specific words from the stickies in your plainLanguage so the user knows which sticky you mean.\n\n${prompt}`;

  const runner = options.runner ?? runAdhocRole;
  try {
    const result = await runner<AmbiguityExtractorOutput>(
      ambiguityExtractor,
      task,
    );
    if (!result.result) {
      return {
        flags: [],
        scannedIdeaIds: scanIdeas.map(idea => idea.id),
        failed: true,
      };
    }
    const flags = result.result.ambiguities.map(item => ({
      id: item.id,
      plainLanguage: item.plainLanguage,
      type: item.type,
      severity: item.severity,
      resolutionMode: item.resolutionMode,
      ideaId: attributeFlagToIdea(item.plainLanguage, scanIdeas),
    }));
    return {
      flags,
      scannedIdeaIds: scanIdeas.map(idea => idea.id),
      failed: false,
    };
  } catch (err) {
    console.warn('[boardAmbiguityScan] role call failed:', err);
    return {
      flags: [],
      scannedIdeaIds: scanIdeas.map(idea => idea.id),
      failed: true,
    };
  }
}
