import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea } from '../../types';

const schema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      ambiguityId: z.string(),
      question: z.string(),
    })
  ),
});

type Output = z.infer<typeof schema>;

export const clarificationAuthor: RoleSpec = {
  id: 'clarification_author',

  systemPrompt: `You are a Clarification Author.
Your job: write the most important questions to ask the user to resolve the top ambiguities.

Rules:
- Maximum 3 questions.
- Each question must map to an ambiguityId from the detected ambiguities list.
- Questions must be plain-language, single-sentence, directly answerable.
- Prioritize high-severity ambiguities first.
- Do not ask about things already answered in the brief state.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    const topAmbiguities = idea.ambiguities
      .filter(a => a.resolutionMode === 'ask')
      .slice(0, 5)
      .map(a => `[${a.id}] ${a.plainLanguage}`)
      .join('\n');
    return `Write up to 3 clarification questions for these ambiguities:\n${topAmbiguities || 'See ambiguities list above.'}`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export type ClarificationAuthorOutput = Output;
