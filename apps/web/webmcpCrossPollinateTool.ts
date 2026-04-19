export function createCrossPollinateTool(
  runCrossPollinate: () => Promise<{
    ok?: boolean;
    error?: string;
    suggestion?: {
      id: string;
      rawText: string;
      rationale: string;
      source: string;
      sourceIdeaIds: string[];
      relatedIdeaIds: string[];
      status: string;
    } | null;
  }>,
): ModelContextTool {
  return {
    name: 'cross_pollinate',
    description:
      'Runs the dedicated cross-pollinate role over the live board. It selects two distinct existing ideas and proposes one merged concept as a ghost suggestion with explicit source-idea attribution. ' +
      'This is narrower than scout_ideas: it synthesizes from the current board instead of looking outward for unrelated adjacent ideas.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: false },
    execute: async () => {
      const detail = await runCrossPollinate();
      if (detail.error) {
        return `ERROR: ${detail.error}`;
      }
      if (!detail.suggestion) {
        return 'Cross-pollinate ran — no high-signal fusion candidate surfaced from the current board.';
      }
      return detail.suggestion;
    },
  };
}
