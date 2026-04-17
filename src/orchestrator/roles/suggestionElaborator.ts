import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea, ScoutSuggestion } from '../../types';

const schema = z.object({
  elaboration: z.string().min(40).max(1200),
  subSuggestions: z.array(z.string().min(10).max(240)).max(5),
  implicationsIfAdmitted: z.array(z.string().min(10).max(240)).max(5),
});

type Output = z.infer<typeof schema>;

/**
 * suggestionElaborator — the user hovered a scout suggestion and asked "tell me more."
 * Expand the suggestion into a concrete elaboration, a handful of sub-suggestions
 * (not more ideas — sub-parts of this one), and the downstream implications if
 * the user admits it onto the canvas.
 */
export const suggestionElaborator: RoleSpec = {
  id: 'suggestion_elaborator',

  systemPrompt: `You are the Suggestion Elaborator. The user is considering one scout-generated suggestion and wants it fleshed out before deciding whether to admit it onto the canvas.

Rules:
- elaboration: 3-7 sentences. Make the suggestion concrete. Name what it would look like in practice, not in theory. Reference the existing board where relevant.
- subSuggestions: 0-3 sub-parts of THIS suggestion (not new ideas). Each should be a single clause that, together with the others, makes the suggestion testable.
- implicationsIfAdmitted: 0-3 short sentences naming what admitting this onto the board would change — what it invalidates, what it accelerates, what tradeoffs it forces. Be honest about downsides.
- Do not hedge. Do not repeat the suggestion back at the user. Do not invent external facts.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    return `Elaborator fallback call — prefer buildElaboratorTask helper. Seed: "${idea.rawText}"`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export function buildElaboratorTask({
  suggestion,
  boardIdeas,
  ideaCharCap = 180,
  maxIdeas = 15,
}: {
  suggestion: ScoutSuggestion;
  boardIdeas: Idea[];
  ideaCharCap?: number;
  maxIdeas?: number;
}): string {
  const relatedIds = new Set(suggestion.relatedIdeaIds ?? []);
  const prioritised = [
    ...boardIdeas.filter(i => relatedIds.has(i.id)),
    ...boardIdeas.filter(i => !relatedIds.has(i.id)),
  ].slice(0, maxIdeas);

  const boardLines = prioritised
    .map(i => {
      const marker = relatedIds.has(i.id) ? '★' : '-';
      const body = i.rawText.slice(0, ideaCharCap) + (i.rawText.length > ideaCharCap ? '…' : '');
      return `${marker} id=${i.id} "${body}"`;
    })
    .join('\n') || '(board is empty)';

  return (
    `# Suggestion\n` +
    `source: ${suggestion.source}\n` +
    `rawText: "${suggestion.rawText}"\n` +
    `scout's rationale: ${suggestion.rationale}\n\n` +
    `# Existing board (★ = ideas the scout referenced)\n${boardLines}\n\n` +
    `Elaborate this suggestion. Make it testable. Name what admitting it would change.`
  );
}

export type SuggestionElaboratorOutput = Output;
