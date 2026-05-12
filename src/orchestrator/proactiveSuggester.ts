/**
 * proactiveSuggester.ts — coach-style nudges fired between explicit beats.
 *
 * The orchestrator already runs scout/connect/critique/cluster/summarise beats
 * on demand. This module composes a smaller, lower-pressure prompt — anchored
 * to the current beat's coaching technique — and returns 2-3 short suggestions
 * the canvas surfaces as peripheral ghost cards. Cooldown and idle gating live
 * in the calling hook (apps/web/useProactiveSuggester.ts).
 */

import { z } from 'zod';
import type { BeatName } from '../beats/types';
import { getCoachingPromptForBeat } from './beatRegistry';
import type { RoleSpec } from './ctmcp';
import { zodToJsonSchema } from './ctmcp';
import { runAdhocRole } from './adhocRole';
import type { Idea, LlmMessage } from '../types';

const proactiveSuggestionItemSchema = z.object({
  rawText: z.string().min(8).max(280),
  rationale: z.string().min(8).max(280),
  source: z.string().min(3).max(80),
});

const proactiveSuggestionSchema = z.object({
  suggestions: z.array(proactiveSuggestionItemSchema).max(3),
});

export type ProactiveSuggestion = z.infer<typeof proactiveSuggestionItemSchema>;
export type ProactiveSuggesterOutput = z.infer<typeof proactiveSuggestionSchema>;

export interface ProactiveTrigger {
  kind: 'idle' | 'plateau';
  detail?: string;
}

export interface ProactiveSuggesterContext {
  beat: BeatName;
  trigger: ProactiveTrigger;
  liveIdeas: Pick<Idea, 'id' | 'rawText' | 'tags'>[];
  recentTurnLog?: LlmMessage[];
  lastUserMessage?: string;
  boardTitle?: string;
}

const IDEA_CHAR_CAP = 180;
const TURN_LOG_CHAR_CAP = 320;
const MAX_RECENT_TURN_ENTRIES = 4;
const MAX_LIVE_IDEAS = 12;

const baseSystemPrompt = `You are the brainstorming coach.
The user has not asked for help — you are being invited in because they paused or the board stopped moving. Be useful but invisible: 2-3 short lines they can ignore.

Rules:
- Each suggestion is ONE line, phrased as either a question, a contrarian claim, an analogy, or a sharp angle.
- No restatements of what is already on the board. No platitudes ("consider the user").
- "rawText" is what shows on the suggestion card — keep it under 25 words.
- "rationale" is one sentence explaining the move you used.
- "source" is a short label like "analogy: X", "5-whys", "reverse-brainstorm", "contrarian read".
- Returning fewer than 3 is fine. Returning 0 (empty array) is fine if nothing is worth saying.`;

function renderRoleSpec(beat: BeatName): RoleSpec {
  const coaching = getCoachingPromptForBeat(beat);
  const systemPrompt = `${baseSystemPrompt}

# Beat in play: ${beat}
# Technique: ${coaching.technique}
# Voice: ${coaching.voice}`;

  return {
    id: `proactive_suggester_${beat}`,
    systemPrompt,
    schema: proactiveSuggestionSchema,
    jsonSchema: zodToJsonSchema(proactiveSuggestionSchema),
    buildTask: () => '',
    parse: (raw: unknown) => proactiveSuggestionSchema.parse(raw),
  };
}

export function composeProactiveSuggesterTask(context: ProactiveSuggesterContext): string {
  const ideas = context.liveIdeas.slice(0, MAX_LIVE_IDEAS).map(idea => {
    const tags = idea.tags.length > 0 ? ` [${idea.tags.slice(0, 3).join(', ')}]` : '';
    const body = idea.rawText.slice(0, IDEA_CHAR_CAP) + (idea.rawText.length > IDEA_CHAR_CAP ? '…' : '');
    return `- "${body}"${tags}`;
  }).join('\n') || '(empty board — the user has not added notes yet)';

  const recentEntries = (context.recentTurnLog ?? [])
    .slice(-MAX_RECENT_TURN_ENTRIES)
    .map(entry => {
      const trimmed = entry.content.slice(0, TURN_LOG_CHAR_CAP);
      const truncated = entry.content.length > TURN_LOG_CHAR_CAP ? '…' : '';
      return `- [${entry.role}] ${trimmed}${truncated}`;
    })
    .join('\n') || '(no recent turn log)';

  const lastUser = context.lastUserMessage?.trim() || '(none)';
  const triggerLabel = context.trigger.kind === 'plateau'
    ? 'The board readiness score has not moved for a while.'
    : 'The user has been idle for a while.';

  return [
    `# Proactive nudge`,
    triggerLabel,
    context.trigger.detail ? `Detail: ${context.trigger.detail}` : '',
    '',
    `# Board${context.boardTitle ? ` — ${context.boardTitle}` : ''}`,
    `## Live notes`,
    ideas,
    '',
    `## Recent activity`,
    recentEntries,
    '',
    `## Last user message`,
    lastUser,
    '',
    `Produce 2-3 nudges in this beat's voice. Stay short.`,
  ].filter(Boolean).join('\n');
}

export type ProactiveSuggesterResult =
  | { ok: true; suggestions: ProactiveSuggestion[] }
  | { ok: false; reason: 'fallback' | 'invalid_output'; error?: Error };

export async function runProactiveSuggester(
  context: ProactiveSuggesterContext,
): Promise<ProactiveSuggesterResult> {
  const role = renderRoleSpec(context.beat);
  const task = composeProactiveSuggesterTask(context);
  const { result, usedFallback, lastError } = await runAdhocRole<ProactiveSuggesterOutput>(role, task, { maxTokens: 768 });
  if (usedFallback || result === null) {
    return { ok: false, reason: 'fallback', error: lastError };
  }
  if (!Array.isArray(result.suggestions)) {
    return { ok: false, reason: 'invalid_output' };
  }
  return { ok: true, suggestions: result.suggestions.slice(0, 3) };
}
