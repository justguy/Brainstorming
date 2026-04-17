import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea, Ambiguity } from '../../types';

const schema = z.object({
  ambiguities: z.array(
    z.object({
      id: z.string(),
      type: z.enum([
        'terminology', 'goal', 'scope', 'audience', 'ux',
        'data_process', 'integration', 'operational',
        'policy_legal_security', 'ownership',
      ]),
      plainLanguage: z.string(),
      severity: z.enum(['high', 'medium', 'low']),
      resolutionMode: z.enum(['ask', 'assume', 'prototype', 'research', 'defer']),
    })
  ),
});

type Output = z.infer<typeof schema>;

export const ambiguityExtractor: RoleSpec = {
  id: 'ambiguity_extractor',

  systemPrompt: `You are an Ambiguity Extractor.
Your job: read the idea and find all unclear, missing, or conflicting details that could derail execution.

For each ambiguity:
- Write plainLanguage as a simple question or gap statement (no jargon).
- Assign type from the allowed list.
- Rate severity: high = blocks decisions, medium = matters soon, low = can wait.
- Suggest resolutionMode: ask user, assume + state assumption, prototype to learn, research, or defer.

Aim for 3–8 ambiguities. Prioritize high-severity ones. Be concise.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    return `Extract ambiguities from the following idea:\n\n"${idea.rawText}"`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export type AmbiguityExtractorOutput = Output;
export type { Ambiguity };
