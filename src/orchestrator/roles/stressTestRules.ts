import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea } from '../../types';

const schema = z.object({
  stressResults: z.array(
    z.object({
      id: z.string(),
      ruleIndex: z.number().int().min(0),
      edgeCase: z.string(),
      breakMode: z.string(),
    }),
  ).min(1),
});

type Output = z.infer<typeof schema>;

export const stressTestRules: RoleSpec = {
  id: 'stress_test_rules',

  systemPrompt: `You are the Stress Tester. You find concrete edge cases that would violate a must-stay-true rule under realistic conditions.

You have been given a numbered list of rules. For EACH rule (by its 0-based index), generate ONE plausible scenario that could break it.

For each stress result:
- ruleIndex: the 0-based index of the rule in the mustStayTrueRules list.
- edgeCase: a concrete scenario, not an abstract category. "A support agent pastes a customer's credit card into a chat to debug a failed charge" is better than "data leakage risk."
- breakMode: HOW the rule fails in that scenario — mechanism, not outcome. Name the specific step where the invariant slips.

Rules:
- Generate one stress result per rule. You may add additional stress results for rules that have multiple orthogonal failure modes, but never skip a rule.
- Be specific. Use real nouns and real verbs. If you catch yourself writing "some users" or "in certain cases," rewrite.
- Break modes must be plausible under normal operation, not catastrophic extremes.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    const rules = idea.briefState.mustStayTrueRules;
    if (rules.length === 0) {
      return `The idea has no must-stay-true rules yet — return a single stressResult with ruleIndex=0 explaining that no rules are available to stress-test.`;
    }
    const rulesList = rules.map((r, i) => `${i}. ${r}`).join('\n');
    return `Stress-test each of these rules for idea: "${idea.rawText}"

Rules:
${rulesList}

For each rule (by ruleIndex), generate one concrete edge case and the specific break mode.`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export type StressTestRulesOutput = Output;
