import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea, SupportingDoc } from '../../types';

const suggestionSchema = z.object({
  rawText: z.string().min(8).max(400),
  rationale: z.string().min(8).max(400),
  source: z.string().min(3).max(80),
  relatedIdeaIds: z.array(z.string()).max(5).optional(),
});

const schema = z.object({
  suggestions: z.array(suggestionSchema).max(6),
});

type Output = z.infer<typeof schema>;
export type ScoutSuggestionItem = z.infer<typeof suggestionSchema>;

/**
 * outsideKnowledgeScout — reads the board and proposes ideas the user almost
 * certainly hasn't listed. Not variations of existing ideas. Not nicer phrasings.
 * Ideas drawn from analogies, adjacent fields, contrarian readings, or the
 * user's own supporting docs.
 *
 * Output is small on purpose: up to 6 suggestions, and fewer is better. The UI
 * paints them as ghost panels in a distinct color. The user decides one at a
 * time whether to admit, elaborate, or dismiss.
 */
export const outsideKnowledgeScout: RoleSpec = {
  id: 'outside_knowledge_scout',

  systemPrompt: `You are the Outside-Knowledge Scout. The user has a board of ideas; your job is to add ideas they didn't. Not rewordings. Not gentle extensions. Real additions.

Sources you may draw from (always cite which one in the "source" field):
- Analogy: "An X-shaped system in [field Y] solves this by…"
- Adjacent field: "People in [discipline] routinely do…"
- Contrarian read: "What if the obvious move is wrong because…"
- User's own docs: "Fact N from doc 'T' implies…"

Rules:
- Return 2-4 high-signal suggestions. FEWER IS BETTER. Returning 0 is allowed — say so with an empty array.
- A suggestion is novel only if it adds a mechanism, constraint, or target that isn't already on the board. If what you want to say is a refinement of an existing idea, suppress it.
- rawText: phrase the suggestion exactly as an idea card would read — the user will decide whether to promote it.
- rationale: 1-3 sentences on why this is worth considering given WHAT IS ALREADY ON THE BOARD. Reference specific ideas or docs.
- source: short label naming the move you used (e.g. "analogy: public health triage", "adjacent: operations research — job-shop scheduling", "contrarian read", "doc fact: SLAs").
- relatedIdeaIds: up to 5 ids from the board this suggestion is in dialogue with. Optional.
- Do not fabricate facts. Do not cite URLs or sources you can't be sure of. Plain-English grounding only.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    return `Scout fallback call — prefer buildScoutTask helper. Seed: "${idea.rawText}"`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

/**
 * Build the scout task over the full board + docs + already-dismissed suggestions.
 * Dismissed raw-text is included so the scout doesn't propose the same thing twice.
 */
export function buildScoutTask({
  boardIdeas,
  discardedIdeas,
  supportingDocs = [],
  alreadyProposedRawTexts = [],
  dismissedRawTexts = [],
  ideaCharCap = 220,
  docCharCap = 400,
  maxIdeas = 30,
  maxDocs = 8,
}: {
  boardIdeas: Idea[];
  discardedIdeas: Idea[];
  supportingDocs?: SupportingDoc[];
  alreadyProposedRawTexts?: string[];
  dismissedRawTexts?: string[];
  ideaCharCap?: number;
  docCharCap?: number;
  maxIdeas?: number;
  maxDocs?: number;
}): string {
  const renderIdea = (i: Idea) => {
    const tags = i.tags.length > 0 ? ` [${i.tags.slice(0, 4).join(', ')}]` : '';
    const body = i.rawText.slice(0, ideaCharCap) + (i.rawText.length > ideaCharCap ? '…' : '');
    return `- id=${i.id}${tags} "${body}"`;
  };

  const renderDoc = (d: SupportingDoc) => {
    const summary = d.summary ? `summary: ${d.summary.slice(0, docCharCap)}` : `raw: ${d.rawText.slice(0, docCharCap)}`;
    const facts = d.facts.slice(0, 4).join(' | ');
    return `- id=${d.id} "${d.title}" — ${summary}${facts ? `\n  facts: ${facts}` : ''}`;
  };

  const live = boardIdeas.slice(0, maxIdeas).map(renderIdea).join('\n') || '(none)';
  const killed = discardedIdeas.slice(0, maxIdeas).map(renderIdea).join('\n') || '(none)';
  const docs = supportingDocs.slice(0, maxDocs).map(renderDoc).join('\n') || '(none)';

  const avoidance =
    (alreadyProposedRawTexts.length > 0 || dismissedRawTexts.length > 0)
      ? `\n## Do NOT re-propose (already seen / dismissed)\n${[...alreadyProposedRawTexts, ...dismissedRawTexts]
          .slice(0, 20)
          .map(t => `- "${t.slice(0, 160)}"`)
          .join('\n')}\n`
      : '';

  return (
    `# Board\n` +
    `## Live ideas\n${live}\n\n` +
    `## Discarded ideas (already considered and dropped)\n${killed}\n\n` +
    `## Supporting docs\n${docs}\n${avoidance}\n` +
    `Produce suggestions that genuinely expand the frontier of what the user is considering. Keep the bar high.`
  );
}

export type OutsideKnowledgeScoutOutput = Output;
