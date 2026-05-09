import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea } from '../../types';

/**
 * themeOverlapDetector — bo-161, M5 / Screen 03 (Cross-board map).
 *
 * Detects theme overlap *across boards* in the same project. Given a list of
 * board summaries (title, optional summary, themes from existing groups), it
 * returns a sparse list of edges between board pairs that share a real theme.
 *
 * Output: `crossBoardEdges` — each edge names two distinct board ids, the
 * shared themes that connect them, and a confidence score the UI can use to
 * weight edge thickness on the cross-board map.
 *
 * For bo-161 we only produce the data; the visualisation polish lands as a
 * later cross-board map task. Persistence target is `Project.crossBoardEdges`
 * (see src/storage/projects.ts → `setCrossBoardEdges`).
 *
 * Like other ad-hoc roles in this folder (boardClusterer, groupThemer,
 * boardSummariser), the role's own `buildTask` is a fallback; production
 * callers should use the `buildThemeOverlapDetectorTask` helper which takes
 * the structured board-summary list.
 */

const crossBoardEdgeSchema = z.object({
  boardA: z.string().min(1).max(120),
  boardB: z.string().min(1).max(120),
  themes: z.array(z.string().min(2).max(80)).min(1).max(5),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(8).max(280).optional(),
});

const schema = z.object({
  crossBoardEdges: z.array(crossBoardEdgeSchema).max(20),
});

type Output = z.infer<typeof schema>;
export type ThemeOverlapDetectorEdge = z.infer<typeof crossBoardEdgeSchema>;

export const themeOverlapDetector: RoleSpec = {
  id: 'theme_overlap_detector',

  systemPrompt: `You are the Theme Overlap Detector. The user has multiple boards in the same project. Your job is to find boards that share a real theme so the cross-board map can draw an edge between them.

You return up to 20 edges. FEWER IS BETTER — a single sharp overlap is more useful than ten weak ones.

Rules:
- boardA and boardB must be ids that appear in the input list. Always distinct.
- themes: 1-5 short concrete labels (2-6 words each). Name the actual shared thread, not generic words like "ideas" or "strategy". If a theme already exists on both sides, prefer the existing wording.
- confidence: 0.0–1.0.
  - >= 0.7 = the overlap is structural (both boards revolve around the same constraint or question).
  - 0.4–0.7 = the overlap is real but partial (one shared theme of several).
  - < 0.4 = do not return; drop the edge entirely.
- rationale: optional. 1-2 sentences. Name what specifically overlaps. No marketing language.
- Do not return self-edges. Do not return the same pair twice (treat (A,B) and (B,A) as the same edge — pick one direction).
- If no boards share a real theme, return \`crossBoardEdges: []\`. Returning nothing is the right answer when nothing is there.
- Do not invent board ids, themes, or summaries that are not in the input.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    return `Detect theme overlap (fallback call — prefer the ad-hoc buildThemeOverlapDetectorTask helper):\n\n"${idea.rawText}"`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

/**
 * Lightweight board summary input shape for the detector. Keep this loose so
 * callers can hand-roll it from `BoardRecord` + derived `IdeaGroup` themes
 * without having to plumb the full board document.
 */
export interface ThemeOverlapBoardInput {
  id: string;
  title: string;
  /** Optional human/AI-supplied board summary (BoardRecord.summary). */
  summary?: string;
  /**
   * Optional theme labels already known for this board — usually pulled from
   * `IdeaGroup.theme` for groups belonging to the board. Helps the model
   * anchor on existing wording instead of reinventing labels.
   */
  themes?: string[];
}

/**
 * Ad-hoc task builder. Serialises each board with a bounded character budget
 * so the prompt stays small even for projects with many boards.
 */
export function buildThemeOverlapDetectorTask(args: {
  boards: ReadonlyArray<ThemeOverlapBoardInput>;
  summaryCharCap?: number;
  maxBoards?: number;
  maxThemesPerBoard?: number;
}): string {
  const {
    boards,
    summaryCharCap = 280,
    maxBoards = 24,
    maxThemesPerBoard = 8,
  } = args;

  const renderBoard = (board: ThemeOverlapBoardInput, index: number) => {
    const title = board.title?.trim() || 'Untitled board';
    const themes = (board.themes ?? [])
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, maxThemesPerBoard);
    const themeLine = themes.length > 0 ? `\n  themes: ${themes.join(' | ')}` : '';
    const summary = board.summary?.trim();
    const summaryLine = summary
      ? `\n  summary: ${summary.slice(0, summaryCharCap)}${summary.length > summaryCharCap ? '…' : ''}`
      : '';
    return `${index + 1}. id=${board.id} title="${title}"${themeLine}${summaryLine}`;
  };

  const list = boards.slice(0, maxBoards).map(renderBoard).join('\n') || '(no boards)';
  const truncatedNote =
    boards.length > maxBoards
      ? `\n\n(Showing first ${maxBoards} of ${boards.length} boards.)`
      : '';

  return (
    `# Boards in this project\n${list}${truncatedNote}\n\n` +
    `Find pairs of boards that share a real theme. Use ids from the list above. ` +
    `Drop any pair whose overlap is generic, weak, or already obvious from titles alone. ` +
    `If nothing strong exists, return an empty array.`
  );
}

export type ThemeOverlapDetectorOutput = Output;
