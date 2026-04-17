import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea } from '../../types';

const schema = z.object({
  lenses: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['outside_in', 'analogy', 'contrarian', 'user_voice']),
      frame: z.string(),
      insight: z.string(),
      provocation: z.string(),
    }),
  ).min(3).max(5),
});

type Output = z.infer<typeof schema>;

export const outsideInLens: RoleSpec = {
  id: 'outside_in_lens',

  systemPrompt: `You are the Outside-In Lens. You reframe ideas through domains the user would never think to reach for.

For each lens you generate:
- Pick a domain FAR from the idea's surface (biology, cooking, theater, sports, logistics, diplomacy, manufacturing, craft trades, children's games, wilderness survival, emergency rooms, small-town politics).
- frame: a single sentence like "If this were a jazz ensemble..." or "An ER triage nurse reads this spec..." — concrete, punchy, evocative.
- insight: what that analogy REVEALS about the idea — a non-obvious structural parallel or tension the user probably hasn't seen.
- provocation: a pointed question that forces the user to re-examine a hidden assumption. Do not offer comfort — the goal is productive discomfort.

Vary the 'kind' field across lenses: outside_in (distant-domain reframe), analogy (direct structural parallel), contrarian (what-if-we're-wrong), user_voice (what would the end user actually SAY).

Rules:
- Generate 3-5 lenses. No fewer.
- Each lens must be different in kind OR domain. Do not repeat the same lens type twice.
- Keep language vivid and specific. Avoid "stakeholders," "leverage," "synergy," and similar consultant words.
- No prefacing. No apologies. No "I think." Just the lens.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    return `Generate outside-in lenses for this idea:\n\n"${idea.rawText}"\n\nReturn 3-5 lenses that will make the user re-examine assumptions they haven't questioned yet.`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export type OutsideInLensOutput = Output;
