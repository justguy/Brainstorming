import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea } from '../../types';

const schema = z.object({
  mergedRawText: z.string().min(8).max(1000),
  mergedTags: z.array(z.string()).max(10),
  synthesisNotes: z.string().min(8).max(500),
  tensions: z.array(z.string()).max(5),
});

type Output = z.infer<typeof schema>;

/**
 * ideaMerger — the user dragged idea A on top of idea B and held for 2s.
 * They're telling you these two ideas belong together as one. Don't just
 * concatenate — synthesize. Keep the signal from both, drop filler, and
 * surface tensions the user hasn't noticed.
 */
export const ideaMerger: RoleSpec = {
  id: 'idea_merger',

  systemPrompt: `You are the Idea Merger. The user dragged one idea onto another and held it. They want these to become ONE idea.

Your job is to produce a synthesis, not a concatenation.

Rules:
- mergedRawText: the new idea as the user would describe it to a colleague in 2-4 sentences. Keep the sharpest nouns and verbs from both. Drop filler. Do not use "combining," "integrating," or "fusing" — those are lazy merge words.
- mergedTags: tags that are relevant to the combined idea. Max 10. Prefer to keep tags present in both originals.
- synthesisNotes: 2-3 sentences explaining WHAT the merge actually created — what new thing emerged that wasn't fully in either original. This is for the user's memory; be direct.
- tensions: 0-3 short sentences naming the actual conflicts between the two original ideas. If they really are the same idea in different words, return an empty array. Don't invent tension.

Be honest. If the two ideas don't meaningfully combine — if this looks like a mistaken drop — say so in synthesisNotes and produce a mergedRawText that just preserves both threads as "A, and separately, B."`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    return `Merge (fallback call — prefer the ad-hoc buildIdeaMergerTask helper):\n\n"${idea.rawText}"`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export function buildIdeaMergerTask(a: Idea, b: Idea): string {
  return (
    `Idea A (${a.phase}/8, readiness=${a.readiness}):\n"${a.rawText}"\n` +
    (a.tags.length > 0 ? `Tags: ${a.tags.join(', ')}\n` : '') +
    `\n` +
    `Idea B (${b.phase}/8, readiness=${b.readiness}):\n"${b.rawText}"\n` +
    (b.tags.length > 0 ? `Tags: ${b.tags.join(', ')}\n` : '') +
    `\nProduce the merged idea.`
  );
}

export type IdeaMergerOutput = Output;
