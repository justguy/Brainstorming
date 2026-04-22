import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea, IdeaCritique } from '../../types';

const schema = z.object({
  action: z.enum(['choose_next_step', 'add_rule', 'suggest_next_bead']),
  nextStep: z.enum([
    'planning',
    'prototyping',
    'research',
    'stakeholder_review',
    'defer',
  ]),
  rule: z.union([z.string().min(8).max(180), z.null()]),
  forwardReason: z.string().min(12).max(220),
});

type Output = z.infer<typeof schema>;

export const critiqueAcceptancePlanner: RoleSpec = {
  id: 'critique_acceptance_planner',

  systemPrompt: `You are the Critique Acceptance Planner.
The user accepted a critique card on a brainstorming idea. That means the critique is directionally correct and should cause one concrete board mutation right now.

Available durable writes:
- choose_next_step: set the nextStep field
- add_rule: add one new must-stay-true rule
- suggest_next_bead: add a forward nudge toward the next future bead

Rules:
- action must name the single best write to apply now.
- nextStep must always recommend the best next step, even if action is not choose_next_step.
- rule must be one short, specific invariant only when the critique reveals a missing hard constraint. Otherwise return null.
- forwardReason must explain the concrete forward move in one sentence.
- Never repeat an existing rule verbatim.
- Never choose choose_next_step if the current next step is already correct.
- Prefer the smallest durable write that materially changes the idea.
- Do not argue with the critique. Incorporate it.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    return `Plan the best durable follow-up write for this accepted critique.\n\nIdea:\n${idea.rawText}`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export function buildCritiqueAcceptanceTask(idea: Idea, critique: IdeaCritique): string {
  const nextStep = idea.briefState.nextStep ?? 'none';
  const rules = idea.briefState.mustStayTrueRules.length > 0
    ? idea.briefState.mustStayTrueRules.map((rule, index) => `${index + 1}. ${rule}`).join('\n')
    : '(none)';
  const openQuestions = idea.briefState.openQuestions.length > 0
    ? idea.briefState.openQuestions.map(question => `- ${question}`).join('\n')
    : '- none';

  return `Accepted critique planning

Idea text:
${idea.rawText}

Current phase: ${idea.phase}
Current readiness: ${idea.readiness}
Current next step: ${nextStep}

Existing must-stay-true rules:
${rules}

Open questions:
${openQuestions}

Accepted critique:
${critique.critique}

Evidence ask:
${critique.evidenceAsk}

Choose the single best durable write to apply now so the idea actually moves forward.`;
}

export type CritiqueAcceptancePlannerOutput = Output;
