import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea } from '../../types';

const briefUpdateSchema = z.object({
  problemStatement: z.optional(z.string()),
  audience: z.optional(z.string()),
  desiredOutcome: z.optional(z.string()),
  mustStayTrueRules: z.array(z.string()),
  chosenApproachId: z.optional(z.string()),
  successCriteria: z.array(z.string()),
  outOfScope: z.array(z.string()),
  openQuestions: z.array(z.string()),
  nextStep: z.optional(
    z.enum(['planning', 'prototyping', 'research', 'stakeholder_review', 'defer'])
  ),
});

const schema = z.object({
  briefUpdate: briefUpdateSchema,
  artifactMd: z.string(),
});

type Output = z.infer<typeof schema>;

export const briefComposer: RoleSpec = {
  id: 'brief_composer',

  systemPrompt: `You are a Brief Composer.
Your job: synthesise everything from this session into:
1. A briefUpdate — the updated brief state fields.
2. An artifactMd — a Markdown handoff document.

The artifactMd must include these sections (use ## headings):
- Problem Statement
- Audience
- Desired Outcome
- Chosen Approach (with rationale)
- Must-Stay-True Rules
- Success Criteria
- Out of Scope
- Risks & Mitigation
- Open Questions
- Recommended Next Step

Keep it tight. Plain language primary. Include an expert annex section (### Expert Annex)
for technical details if relevant. Respect all must-stay-true rules throughout.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    return `Compose the final brief and artifact markdown for:\n\n"${idea.rawText}"\n\nIncorporate all ambiguities, clarifications, approach scores, and risk analysis from the session.`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export type BriefComposerOutput = Output;
