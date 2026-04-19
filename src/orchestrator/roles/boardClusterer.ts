import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea } from '../../types';

const clusterHintSchema = z.object({
  clusterIndex: z.number().int().min(1).max(8),
  theme: z.string().min(3).max(60),
  sharedQuestion: z.string().min(8).max(140),
});

const schema = z.object({
  hints: z.array(clusterHintSchema).max(4),
});

type Output = z.infer<typeof schema>;

export const boardClusterer: RoleSpec = {
  id: 'board_clusterer',
  systemPrompt: `You are the Board Clusterer. The board already has candidate clusters derived from shared-theme links.

Your job is to name the real thread inside each candidate cluster and state the question the user is working on there.

Rules:
- Return only hints for clusters that have a real shared thread.
- clusterIndex must match one of the candidate cluster numbers in the task payload.
- theme: 2-6 words. Concrete and specific.
- sharedQuestion: one interrogative sentence that captures the unresolved question inside the cluster.
- Do not invent idea ids or new clusters.`,
  schema,
  jsonSchema: zodToJsonSchema(schema),
  buildTask(idea: Idea): string {
    return `Cluster this board idea (fallback call — prefer buildBoardClustererTask):\n\n"${idea.rawText}"`;
  },
  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

export function buildBoardClustererTask(clusters: Idea[][]): string {
  const clusterBlocks = clusters
    .slice(0, 4)
    .map((ideas, index) => {
      const lines = ideas
        .map((idea, ideaIndex) => `${ideaIndex + 1}. [${idea.id}] ${idea.rawText.slice(0, 200)}`)
        .join('\n');
      return `Cluster ${index + 1}\n${lines}`;
    })
    .join('\n\n');

  return (
    `The board has these candidate clusters from shared-theme connections:\n\n${clusterBlocks}\n\n` +
    'Return hints only for clusters that deserve a board-level grouping proposal.'
  );
}

export type BoardClustererOutput = Output;
