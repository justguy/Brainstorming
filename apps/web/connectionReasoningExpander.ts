/**
 * connectionReasoningExpander.ts — Screen 05 "show reasoning" helper.
 *
 * Spec: Design/Build Spec.html §05 — "Show reasoning expands the AI's
 * chain-of-thought for why this line was drawn (only for AI-authored
 * connections)."
 *
 * The Connection Inspector popover renders the canonical (short) rationale
 * stored on the Connection. When the user wants more, we synthesise a 3-5
 * sentence chain-of-thought on-demand by calling the LLM directly via the
 * service-worker bridge — no role registration, no persistence. The
 * expansion is in-memory for the popover's lifetime.
 *
 * Mirrors the call shape used by `CustomPersonaForm.handleSuggestPrompt`:
 * read the active provider / model from settings, build a small
 * system+user message pair, dispatch through `callLlmViaSW`, and return
 * the trimmed `raw` string. No JSON schema — we want plain prose.
 */
import type { Connection, Idea, LlmMessage } from '../../src/types';
import {
  connectionKindLabel,
  connectionKindMeaning,
} from '../../src/connections/kindMapping';
import { callLlmViaSW } from '../../src/orchestrator/llmBridge';
import { getSettings } from '../../src/storage/settings';

/** Max chars of each idea body included in the prompt. */
const IDEA_BODY_CAP = 600;

function clipIdea(idea: Idea | null | undefined, cap = IDEA_BODY_CAP): string {
  if (!idea) return '(missing idea)';
  const trimmed = idea.rawText.trim();
  if (!trimmed) return '(empty idea)';
  return trimmed.length > cap ? `${trimmed.slice(0, cap)}…` : trimmed;
}

export interface ExpandConnectionReasoningArgs {
  connection: Connection;
  fromIdea: Idea | null | undefined;
  toIdea: Idea | null | undefined;
}

/**
 * Ask the LLM to expand the (possibly empty) rationale into a short
 * chain-of-thought. Returns the prose body; throws on failure so the caller
 * can surface the error inline.
 */
export async function expandConnectionReasoning(
  args: ExpandConnectionReasoningArgs,
): Promise<string> {
  const { connection, fromIdea, toIdea } = args;
  const kindLabel = connectionKindLabel(connection.kind);
  const kindMeaning = connectionKindMeaning(connection.kind);
  const priorRationale = (connection.rationale ?? '').trim();
  const priorBlock = priorRationale
    ? `Existing short rationale: "${priorRationale}"`
    : 'Existing short rationale: (none — infer from the idea bodies)';

  const system =
    'You are explaining the chain-of-thought behind a connection an AI ' +
    'brainstorming role drew between two ideas on a thinking canvas. ' +
    'Return ONLY the explanation as 3-5 sentences of plain prose. ' +
    'No markdown, no quotes, no preamble, no headings, no lists, no labels.';

  const userParts: string[] = [
    `Connection type: ${kindLabel} (${kindMeaning}).`,
    priorBlock,
    `Idea A: "${clipIdea(fromIdea)}"`,
    `Idea B: "${clipIdea(toIdea)}"`,
    'Walk through the inferential steps that justify drawing this ' +
      'connection from Idea A to Idea B. Name the specific mechanism — ' +
      'what in A implies / contradicts / depends on / supports / shares ' +
      'a theme with what in B. Be concrete; do not hedge. 3-5 sentences.',
  ];

  const messages: LlmMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: userParts.join('\n\n') },
  ];

  const settings = await getSettings();
  const result = await callLlmViaSW({
    providerId: settings.activeProvider,
    model: settings.activeModel,
    messages,
    maxTokens: 400,
  });
  const text = (result.raw ?? '').trim();
  if (!text) {
    throw new Error('The model returned an empty response.');
  }
  return text;
}
