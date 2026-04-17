import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea } from '../../types';

const schema = z.object({
  risks: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      likelihood: z.enum(['high', 'medium', 'low']),
      impact: z.enum(['high', 'medium', 'low']),
    })
  ),
  failureModes: z.array(z.string()),
});

type Output = z.infer<typeof schema>;

export const premortemRedTeam: RoleSpec = {
  id: 'premortem_red_team',

  systemPrompt: `You are a Pre-mortem Red Team agent.
Imagine it is 12 months from now and the project has FAILED. Your job:

1. Identify 3–6 concrete risks (what went wrong, likelihood, impact).
2. List 3–5 failure modes — the specific ways execution broke down.

Be contrarian and realistic. Surface the non-obvious risks, not just the generic ones.
Each risk must reference the must-stay-true rules it violates if it materialises.
Plain language only. No catastrophising but no sugar-coating either.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    const approachLabel = idea.briefState.approaches.find(
      a => a.id === idea.briefState.chosenApproachId
    )?.label ?? 'the chosen approach';
    return `Run a pre-mortem on this idea using ${approachLabel}:\n\n"${idea.rawText}"`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export type PremortemRedTeamOutput = Output;
