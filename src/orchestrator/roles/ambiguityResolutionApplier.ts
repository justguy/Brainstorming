import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Ambiguity, ClarificationQuestion, Idea } from '../../types';

const nextStepSchema = z.enum([
  'planning',
  'prototyping',
  'research',
  'stakeholder_review',
  'defer',
]);

const schema = z.object({
  status: z.enum(['resolved', 'deferred']),
  resolutionNote: z.string().min(12).max(260),
  action: z.enum(['resolve_only', 'add_rule', 'choose_next_step']),
  rule: z.union([z.string().min(8).max(180), z.null()]),
  nextStep: z.union([nextStepSchema, z.null()]),
  userSummary: z.string().min(12).max(220),
});

type Output = z.infer<typeof schema>;

export const ambiguityResolutionApplier: RoleSpec = {
  id: 'ambiguity_resolution_applier',

  systemPrompt: `You are the Ambiguity Resolution Applier.
The user has chosen how to resolve one ambiguity on a brainstorming idea. Convert that choice into the smallest durable board update that moves the idea forward.

Available writes:
- resolve_only: mark the ambiguity with a final resolution note
- add_rule: add one new must-stay-true rule
- choose_next_step: update the idea's nextStep

Rules:
- status must be "resolved" when the ambiguity is now settled, or "deferred" when the resolution still depends on outside confirmation.
- resolutionNote must record the final chosen resolution clearly.
- Choose add_rule only when the resolution reveals a stable invariant.
- Choose choose_next_step only when the resolution changes the best immediate next move.
- Otherwise choose resolve_only.
- Never repeat an existing rule verbatim.
- Never choose choose_next_step if the current next step is already correct.
- rule must be null unless action is add_rule.
- nextStep must be null unless action is choose_next_step.
- userSummary must describe the durable change in one sentence.
- Return only JSON matching the schema.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    return `Apply an ambiguity resolution to this idea.\n\nIdea:\n${idea.rawText}`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export function buildAmbiguityResolutionApplyTask(args: {
  idea: Idea;
  ambiguity: Ambiguity;
  clarifications: ClarificationQuestion[];
  chosenResolution: string;
  sourceMode: 'suggested' | 'custom';
}): string {
  const { idea, ambiguity, clarifications, chosenResolution, sourceMode } = args;
  const rules = idea.briefState.mustStayTrueRules.length > 0
    ? idea.briefState.mustStayTrueRules.map((rule, index) => `${index + 1}. ${rule}`).join('\n')
    : '(none)';
  const openQuestions = idea.briefState.openQuestions.length > 0
    ? idea.briefState.openQuestions.map(question => `- ${question}`).join('\n')
    : '- none';
  const linkedQuestions = clarifications.length > 0
    ? clarifications.map(question => `- ${question.question}${question.answer ? ` Answer: ${question.answer}` : ''}`).join('\n')
    : '- none';

  return `Ambiguity resolution apply

Idea text:
${idea.rawText}

Current phase: ${idea.phase}
Current next step: ${idea.briefState.nextStep ?? 'none'}

Existing rules:
${rules}

Open questions:
${openQuestions}

Ambiguity:
- id: ${ambiguity.id}
- type: ${ambiguity.type}
- severity: ${ambiguity.severity}
- resolution mode: ${ambiguity.resolutionMode}
- plain language: ${ambiguity.plainLanguage}

Linked clarification questions:
${linkedQuestions}

Chosen resolution source: ${sourceMode}
Chosen resolution text:
${chosenResolution}

Turn this into the smallest durable board change that actually moves the idea forward.`;
}

export type AmbiguityResolutionApplyOutput = Output;
