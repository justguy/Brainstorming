import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea } from '../../types';

const schema = z.object({
  ready: z.boolean(),
  blockers: z.array(z.string()),
  recommendedNext: z.enum([
    'planning', 'prototyping', 'research', 'stakeholder_review', 'defer',
  ]),
});

type Output = z.infer<typeof schema>;

export const readinessJudge: RoleSpec = {
  id: 'readiness_judge',

  systemPrompt: `You are a Readiness Judge.
Your job: determine if this idea's brief is ready for handoff to execution.

Ready means:
- Problem statement is clear and agreed.
- At least one approach is chosen.
- Must-stay-true rules are defined.
- Success criteria exist.
- No critical blockers remain from the self-review.

If not ready, list the specific blockers.
Always recommend the best next step after handoff.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    const blockers = idea.briefState.openQuestions;
    return `Judge readiness for handoff of:\n\n"${idea.rawText}"\n\nOpen questions: ${blockers.length > 0 ? blockers.join('; ') : 'none'}`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export type ReadinessJudgeOutput = Output;
