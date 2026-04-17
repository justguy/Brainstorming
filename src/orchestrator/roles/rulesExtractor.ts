import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea } from '../../types';

const schema = z.object({
  rules: z.array(z.string()),
});

type Output = z.infer<typeof schema>;

export const rulesExtractor: RoleSpec = {
  id: 'rules_extractor',

  systemPrompt: `You are a Rules Extractor.
Your job: distill 3–7 must-stay-true rules from what we know so far.

Rules are non-negotiable constraints the solution must honour in every phase.
Examples: "Must work offline", "No PII stored on servers", "Must ship in 6 weeks".

Rules must:
- Be short, concrete, and falsifiable (testable).
- Be derived from the idea, clarifications, and the chosen approach (if any).
- Not repeat things already in brief state as obvious facts.

Output exactly 3–7 rules.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    const chosenApproach = idea.briefState.approaches.find(
      a => a.id === idea.briefState.chosenApproachId
    );
    const approachDesc = chosenApproach
      ? `Chosen approach: ${chosenApproach.label} — ${chosenApproach.summary}`
      : 'No approach chosen yet.';
    return `Extract 3–7 must-stay-true rules for:\n\n"${idea.rawText}"\n\n${approachDesc}`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export type RulesExtractorOutput = Output;
