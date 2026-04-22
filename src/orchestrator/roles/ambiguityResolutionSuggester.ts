import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Ambiguity, ClarificationQuestion, Idea } from '../../types';

const schema = z.object({
  suggestedStatus: z.enum(['resolved', 'deferred']),
  suggestionLabel: z.string().min(4).max(48),
  suggestedResolution: z.string().min(12).max(240),
  rationale: z.string().min(12).max(220),
  userInputPrompt: z.string().min(8).max(140),
});

type Output = z.infer<typeof schema>;

export const ambiguityResolutionSuggester: RoleSpec = {
  id: 'ambiguity_resolution_suggester',

  systemPrompt: `You are the Ambiguity Resolution Suggester.
One ambiguity was detected on a brainstorming idea. Your job is to produce one concrete resolution option the user can either accept as-is or edit.

Rules:
- suggestedStatus must be "resolved" when the ambiguity can be settled now, or "deferred" when it still needs outside confirmation.
- suggestionLabel must be short and scannable.
- suggestedResolution must be concrete, plain-language, and ready to store as the ambiguity resolution note.
- rationale must explain what would change if this resolution is adopted.
- userInputPrompt must help the user write their own alternative resolution in one short sentence.
- Do not ask multiple questions.
- Do not return markdown. Return only JSON matching the schema.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    return `Suggest one ambiguity resolution for this idea.\n\nIdea:\n${idea.rawText}`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export function buildAmbiguityResolutionSuggestionTask(
  idea: Idea,
  ambiguity: Ambiguity,
  clarifications: ClarificationQuestion[],
): string {
  const rules = idea.briefState.mustStayTrueRules.length > 0
    ? idea.briefState.mustStayTrueRules.map((rule, index) => `${index + 1}. ${rule}`).join('\n')
    : '(none)';
  const linkedQuestions = clarifications.length > 0
    ? clarifications.map(question => `- ${question.question}${question.answer ? ` Answer: ${question.answer}` : ''}`).join('\n')
    : '- none';

  return `Ambiguity resolution suggestion

Idea text:
${idea.rawText}

Current phase: ${idea.phase}
Current next step: ${idea.briefState.nextStep ?? 'none'}

Existing rules:
${rules}

Ambiguity:
- id: ${ambiguity.id}
- type: ${ambiguity.type}
- severity: ${ambiguity.severity}
- resolution mode: ${ambiguity.resolutionMode}
- plain language: ${ambiguity.plainLanguage}

Linked clarification questions:
${linkedQuestions}

Produce one concrete resolution option the user can accept or edit.`;
}

export type AmbiguityResolutionSuggestionOutput = Output;
