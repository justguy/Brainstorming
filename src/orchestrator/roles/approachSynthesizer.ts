import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea } from '../../types';

const scoresSchema = z.object({
  speed: z.number(),
  cost: z.number(),
  complexity: z.number(),
  maintainability: z.number(),
  teamBurden: z.number(),
  userValue: z.number(),
  operationalLoad: z.number(),
  adoptionRisk: z.number(),
  reversibility: z.number(),
  complianceRisk: z.number(),
});

const schema = z.object({
  approaches: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      summary: z.string(),
      scores: scoresSchema,
      rejectionReason: z.optional(z.string()),
    })
  ),
});

type Output = z.infer<typeof schema>;

export const approachSynthesizer: RoleSpec = {
  id: 'approach_synthesizer',

  systemPrompt: `You are an Approach Synthesizer.
Your job: generate 2–3 distinct implementation approaches for the idea.

For each approach:
- Give a short label and a 1–2 sentence summary.
- Score each dimension 1–10 (1 = worst, 10 = best):
  speed, cost, complexity, maintainability, teamBurden, userValue,
  operationalLoad, adoptionRisk, reversibility, complianceRisk.
- If an approach is clearly inferior, include it with a rejectionReason.

Approaches must be meaningfully different (e.g. buy vs build, simple vs scalable).
Every score must respect the must-stay-true rules.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    const answeredClarifications = idea.clarifications
      .filter(c => c.answer)
      .map(c => `Q: ${c.question}\nA: ${c.answer}`)
      .join('\n\n');
    return `Synthesize 2–3 approaches for:\n\n"${idea.rawText}"\n\n${answeredClarifications ? `User clarifications:\n${answeredClarifications}` : ''}`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export type ApproachSynthesizerOutput = Output;
