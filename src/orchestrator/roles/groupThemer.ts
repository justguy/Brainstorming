import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea } from '../../types';

const schema = z.object({
  theme: z.string().min(3).max(60),
  sharedQuestion: z.string().min(8).max(140),
});

type Output = z.infer<typeof schema>;

/**
 * groupThemer — given a small cluster of ideas the user just grouped visually,
 * name the thing they have in common. Not marketing copy. The theme should be
 * the actual intellectual thread that connects them; the sharedQuestion should
 * be the question the user is unconsciously working on by putting these together.
 *
 * NOTE: unlike the phase roles, this is invoked ad-hoc with a custom buildTask —
 * the RoleSpec's own buildTask just uses idea.rawText as a fallback.
 */
export const groupThemer: RoleSpec = {
  id: 'group_themer',

  systemPrompt: `You are the Group Themer. The user just placed several ideas next to each other on a canvas — they felt related.

Your job is to name WHAT MAKES THEM RELATED. Not a summary. The actual connecting thread.

Rules:
- theme: 2-6 words. Concrete. Specific enough that a person seeing only the theme could guess what's in the group. Not "various ideas" or "miscellaneous" or "projects." If you can't find a specific thread, say "No clear thread" and let the user name it.
- sharedQuestion: a single interrogative sentence that gets at what the user is actually trying to figure out by grouping these. It should feel like a question the user hasn't quite asked themselves yet.
- No consultant-speak. No "strategic," "innovative," "leverage," "synergize," "holistic."`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    return `Theme this cluster (fallback call — prefer the ad-hoc buildGroupThemerTask helper):\n\n"${idea.rawText}"`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

/**
 * Ad-hoc task builder for grouping multiple ideas at once.
 */
export function buildGroupThemerTask(ideas: Idea[]): string {
  const lines = ideas.map((i, idx) => `${idx + 1}. ${i.rawText.slice(0, 200)}`).join('\n');
  return `The user placed these ${ideas.length} ideas next to each other on a canvas:\n\n${lines}\n\nName the actual thread connecting them, and ask the question they're really working on.`;
}

export type GroupThemerOutput = Output;
