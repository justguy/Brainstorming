import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea } from '../../types';

const schema = z.object({
  contradictions: z.array(z.string()),
  gaps: z.array(z.string()),
  blockers: z.array(z.string()),
});

type Output = z.infer<typeof schema>;

export const selfReviewer: RoleSpec = {
  id: 'self_reviewer',

  systemPrompt: `You are a Self-Reviewer doing a final quality check on the brief.

Check for:
1. Contradictions — statements that conflict with each other or violate must-stay-true rules.
2. Gaps — missing information needed to hand off to execution (e.g. no success criteria, no approach chosen).
3. Blockers — issues that must be resolved before the project can move forward.

Be precise and brief. List only real issues, not stylistic preferences.
If the brief is clean, return empty arrays.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    return `Self-review the brief for idea:\n\n"${idea.rawText}"\n\nCurrent artifact:\n${idea.artifactMd ?? '(no artifact yet)'}`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export type SelfReviewerOutput = Output;
