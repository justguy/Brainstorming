import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Connection, Idea } from '../../types';

const schema = z.object({
  summary: z.string().min(12).max(180),
  relatedIdeaIds: z.array(z.string()).max(6).optional(),
  relatedGroupIds: z.array(z.string()).max(4).optional(),
});

type Output = z.infer<typeof schema>;

export const boardSummariser: RoleSpec = {
  id: 'board_summariser',
  systemPrompt: `You are the Board Summariser. Read the current brainstorm board and produce a one-line takeaway.

Rules:
- summary: one sentence, concrete, no fluff, max 180 chars.
- relatedIdeaIds: optional. Include up to 6 ids that most strongly support the takeaway.
- relatedGroupIds: optional. Include up to 4 group ids when an existing board theme or shared question grounds the takeaway.
- Do not invent ideas or ids that are not in the board payload.
- Prefer a tension, pattern, or through-line over a generic recap.`,
  schema,
  jsonSchema: zodToJsonSchema(schema),
  buildTask(idea: Idea): string {
    return `Summarise this idea in the context of the board:\n\n"${idea.rawText}"`;
  },
  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export function buildBoardSummariserTask(args: {
  boardTitle?: string;
  ideas: Array<Pick<Idea, 'id' | 'rawText'>>;
  groups: Array<{
    id: string;
    theme?: string;
    sharedQuestion?: string;
    ideaIds: string[];
  }>;
  connections: Array<Pick<Connection, 'kind' | 'ideaIds' | 'rationale'>>;
}): string {
  const title = args.boardTitle?.trim() ? args.boardTitle.trim() : 'Untitled board';
  const ideaLines = args.ideas
    .slice(0, 20)
    .map((idea, index) => `${index + 1}. [${idea.id}] ${idea.rawText.slice(0, 220)}`)
    .join('\n') || '(none)';
  const groupLines = args.groups
    .slice(0, 8)
    .map((group, index) => {
      const theme = group.theme?.trim() || 'unthemed';
      const sharedQuestion = group.sharedQuestion?.trim() || 'no shared question';
      return `${index + 1}. [${group.id}] theme="${theme}" question="${sharedQuestion}" ideas=${group.ideaIds.join(', ')}`;
    })
    .join('\n') || '(none)';
  const connectionLines = args.connections
    .slice(0, 12)
    .map((connection, index) => (
      `${index + 1}. ${connection.kind} ${connection.ideaIds.join(' -> ')} :: ${connection.rationale.slice(0, 180)}`
    ))
    .join('\n') || '(none)';

  return (
    `Board title: ${title}\n\n` +
    `Ideas:\n${ideaLines}\n\n` +
    `Current groups:\n${groupLines}\n\n` +
    `Connections:\n${connectionLines}\n\n` +
    'Produce one high-signal takeaway for the current state of the board.'
  );
}

export type BoardSummariserOutput = Output;
