import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea, IdeaCritique, SupportingDoc } from '../../types';

const schema = z.object({
  challenges: z.array(
    z.object({
      id: z.string(),
      critique: z.string(),
      evidenceAsk: z.string(),
    }),
  ).min(3).max(6),
});

type Output = z.infer<typeof schema>;

export const devilsAdvocate: RoleSpec = {
  id: 'devils_advocate',

  systemPrompt: `You are the Devil's Advocate. You attack the work. Your job is to be the voice in the room everyone wishes wasn't there.

You have been given: the raw idea, the detected ambiguities, the synthesized approaches, and any rules already established. You will generate 3-6 uncomfortable critiques the team would prefer to avoid hearing.

For each challenge:
- critique: a single punchy sentence that names a specific, concrete weakness. Attack assumptions, hidden dependencies, audience misreadings, survivor bias, missing failure modes, over-optimistic timelines, untested user desire, concentrated risk. Do NOT be polite. Do NOT soften.
- evidenceAsk: what specific evidence, test, data, or demonstration would rebut this critique. Make the evidence ASK falsifiable — "talk to 3 real users who have X" is better than "do user research."

Rules:
- Generate 3-6 challenges. Each must target a DIFFERENT weakness category.
- No generic concerns ("what about scale?"). Be specific to THIS idea.
- No compliments. No "but overall this is a good idea." Pure adversary.
- If one of the synthesized approaches is obviously the weakest, land extra weight on it.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    const approachesText = idea.briefState.approaches.length > 0
      ? idea.briefState.approaches.map(a => `- [${a.id}] ${a.label}: ${a.summary}`).join('\n')
      : '(no approaches synthesized yet — challenge the idea itself)';
    return `Attack this idea and its approaches.

Idea: "${idea.rawText}"

Current approaches:
${approachesText}

Generate 3-6 sharp critiques with falsifiable evidence-asks.`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export type DevilsAdvocateOutput = Output;

export function buildStandaloneCritiqueTask(args: {
  idea: Idea;
  boardIdeas: Idea[];
  supportingDocs: SupportingDoc[];
  existingCritiques: IdeaCritique[];
}): string {
  const peerIdeas = args.boardIdeas
    .filter(idea => idea.id !== args.idea.id)
    .map(idea => `- [${idea.id}] ${idea.rawText}`)
    .join('\n') || '(no other live ideas)';

  const docs = args.supportingDocs
    .map(doc => {
      const facts = doc.facts.length > 0
        ? doc.facts.map(fact => `  - ${fact}`).join('\n')
        : '  - (no extracted facts)';
      return `- ${doc.title}\n  summary: ${doc.summary ?? '(no summary)'}\n${facts}`;
    })
    .join('\n') || '(no supporting docs)';

  const priorCritiques = args.existingCritiques
    .map(critique => `- ${critique.critique}`)
    .join('\n') || '(none yet)';

  return `Attack this idea in the context of the current brainstorming board.

Target idea:
"${args.idea.rawText}"

Other live ideas on the board:
${peerIdeas}

Supporting context:
${docs}

Critiques already shown to the user:
${priorCritiques}

Generate 3-6 sharp critiques with falsifiable evidence-asks. Prefer weaknesses that are not already covered above.`;
}
