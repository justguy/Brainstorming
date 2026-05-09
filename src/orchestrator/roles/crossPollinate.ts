import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea, ScoutSuggestion } from '../../types';
import { nullableOf } from './schemaHelpers';

const proposalSchema = z.object({
  rawText: z.string().min(8).max(400),
  rationale: z.string().min(8).max(500),
  sourceIdeaIds: z.tuple([z.string(), z.string()]),
  sourceLabel: z.string().min(3).max(80).optional(),
  tensions: z.array(z.string().min(3).max(160)).max(3).optional(),
});

const schema = z.object({
  proposal: nullableOf(proposalSchema),
  skipReason: z.string().min(3).max(240).optional(),
});

type Output = z.infer<typeof schema>;
export type CrossPollinateProposal = z.infer<typeof proposalSchema>;

export const crossPollinate: RoleSpec = {
  id: 'cross_pollinate',

  systemPrompt: `You are the Cross-Pollinate role. The user has a live board of ideas. Your job is to find two distinct ideas already on the board and propose a third concept that productively merges their core mechanisms.

Rules:
- Prefer ideas from different groups when the board makes that possible, but never fabricate authors or metadata that are not present.
- Return at most one proposal. If no pair produces a sharp merged concept, return {"proposal": null, "skipReason": "..."}.
- proposal.rawText: phrase it exactly as a new idea card would read.
- proposal.rationale: 1-3 sentences explaining what each source idea contributes and why the merged concept is worth trying.
- proposal.sourceIdeaIds: exactly two distinct idea ids from the board shown in the task.
- proposal.sourceLabel: optional short label naming the fusion move.
- proposal.tensions: optional. Up to 3 tensions or tradeoffs created by the merge.
- Keep the result anchored to what is already on the board. Do not drift into generic scouting, adjacent-field speculation, or unrelated outside knowledge.
- Do not simply restate one source idea with a cosmetic twist. The merged concept must need both sources.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    return `Cross-pollinate fallback call — prefer buildCrossPollinateTask helper. Seed: "${idea.rawText}"`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export function buildCrossPollinateTask(args: {
  liveIdeas: Idea[];
  existingSuggestions?: ScoutSuggestion[];
  ideaCharCap?: number;
  maxIdeas?: number;
}): string {
  const {
    liveIdeas,
    existingSuggestions = [],
    ideaCharCap = 220,
    maxIdeas = 24,
  } = args;

  const renderIdea = (idea: Idea) => {
    const tags = idea.tags.length > 0 ? ` [${idea.tags.slice(0, 4).join(', ')}]` : '';
    const groupId = idea.panel?.groupId ? ` group=${idea.panel.groupId}` : '';
    const body = idea.rawText.slice(0, ideaCharCap) + (idea.rawText.length > ideaCharCap ? '…' : '');
    return `- id=${idea.id}${tags}${groupId} "${body}"`;
  };

  const suggestions = existingSuggestions
    .filter(suggestion => suggestion.status === 'pending' || suggestion.status === 'admitted')
    .slice(0, 10)
    .map(suggestion => `- "${suggestion.rawText.slice(0, 180)}"`)
    .join('\n') || '(none)';

  const board = liveIdeas.slice(0, maxIdeas).map(renderIdea).join('\n') || '(none)';

  return (
    `# Live ideas\n${board}\n\n` +
    `# Already proposed suggestions\n${suggestions}\n\n` +
    `Choose two source ideas from the live list above and propose one merged concept only if the fusion creates a genuinely sharper direction than either source alone.`
  );
}

export type CrossPollinateOutput = Output;
