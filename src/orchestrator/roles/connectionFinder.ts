import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea, SupportingDoc } from '../../types';

const connectionKind = z.enum(['builds_on', 'contradicts', 'revives_killed', 'shared_theme']);
const connectionStrength = z.enum(['weak', 'medium', 'strong']);

const connectionSchema = z.object({
  kind: connectionKind,
  ideaIds: z.array(z.string()).min(2).max(6),
  supportingDocIds: z.array(z.string()).max(5).optional(),
  rationale: z.string().min(20).max(500),
  strength: connectionStrength,
});

const schema = z.object({
  connections: z.array(connectionSchema).max(10),
});

type Output = z.infer<typeof schema>;
export type ConnectionFinderItem = z.infer<typeof connectionSchema>;

/**
 * connectionFinder — reads the whole board (live ideas, discarded ideas, and
 * any attached supporting docs) and surfaces non-obvious relationships that the
 * user probably hasn't noticed. This runs ad-hoc — not tied to a phase — and
 * its output feeds the Connections panel UI, where each link can be explored,
 * acted on, or dismissed.
 *
 * The role is intentionally pessimistic about output volume: it's better to
 * return 2-3 sharp links than 10 mushy ones. "shared_theme" is only valuable
 * when the theme isn't already encoded in tags or group membership — we
 * already have grouping for the obvious case.
 */
export const connectionFinder: RoleSpec = {
  id: 'connection_finder',

  systemPrompt: `You are the Connection Finder. The user has a board of ideas — some live, some discarded — and optionally supporting documents. Your job is to spot connections the user probably hasn't made explicit yet.

You return up to 10 connections, but FEWER IS BETTER. Return 2-4 high-signal links rather than 10 weak ones.

Valid connection kinds:
- builds_on: idea B would extend / complete / strengthen idea A. Rationale must name the specific mechanism.
- contradicts: idea A and idea B can't both be true in the same world, OR pursuing A meaningfully undermines B. Name the actual contradiction, not a surface clash.
- revives_killed: a live idea is essentially re-treading a discarded one (or vice versa — a discarded idea is actually answered by a live one). This is important; the user should decide to restore, adjust, or confirm the kill.
- shared_theme: two or more ideas share a deep constraint, assumption, or target that ISN'T already captured as a tag or a group. If the link is already obvious from tags or grouping, SKIP IT.

Rules:
- Every ideaId you return MUST appear in the input list. If you're tempted to reference something outside the input, stop.
- supportingDocIds: include only when a doc actually carried the signal. No citation inflation.
- rationale: 1-3 sentences. Concrete. Name the idea(s) and the mechanism. Not "these are related" — say HOW.
- strength: weak = one plausible reading; medium = hard to dismiss; strong = the user should act on this.
- Do not fabricate connections for variety. If only one connection is real, return exactly one. Returning nothing is allowed — return \`connections: []\`.`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(idea: Idea): string {
    return `Find connections (fallback call — prefer the ad-hoc buildConnectionFinderTask helper):\n\n"${idea.rawText}"`;
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

/**
 * Ad-hoc task builder. Serialises each idea/doc with a bounded character budget
 * so the prompt stays under provider limits even for large boards.
 */
export function buildConnectionFinderTask({
  boardIdeas,
  discardedIdeas,
  supportingDocs = [],
  ideaCharCap = 240,
  docCharCap = 400,
  maxIdeas = 30,
  maxDiscarded = 20,
  maxDocs = 10,
}: {
  boardIdeas: Idea[];
  discardedIdeas: Idea[];
  supportingDocs?: SupportingDoc[];
  ideaCharCap?: number;
  docCharCap?: number;
  maxIdeas?: number;
  maxDiscarded?: number;
  maxDocs?: number;
}): string {
  const renderIdea = (i: Idea) => {
    const tags = i.tags.length > 0 ? ` [tags: ${i.tags.slice(0, 5).join(', ')}]` : '';
    const group = i.panel?.groupId ? ` [group: ${i.panel.groupId.slice(0, 8)}]` : '';
    const body = i.rawText.slice(0, ideaCharCap) + (i.rawText.length > ideaCharCap ? '…' : '');
    return `- id=${i.id}${tags}${group}\n  "${body}"`;
  };

  const renderDoc = (d: SupportingDoc) => {
    const facts = d.facts.length > 0 ? `\n  facts: ${d.facts.slice(0, 4).join(' | ')}` : '';
    const summary = d.summary
      ? `\n  summary: ${d.summary.slice(0, docCharCap)}`
      : `\n  raw (truncated): ${d.rawText.slice(0, docCharCap)}`;
    return `- id=${d.id} ideaId=${d.ideaId} title="${d.title}"${summary}${facts}`;
  };

  const live = boardIdeas.slice(0, maxIdeas).map(renderIdea).join('\n') || '(none)';
  const killed = discardedIdeas.slice(0, maxDiscarded).map(renderIdea).join('\n') || '(none)';
  const docs = supportingDocs.slice(0, maxDocs).map(renderDoc).join('\n') || '(none)';

  return (
    `# Board\n` +
    `## Live ideas (${boardIdeas.length} total, showing ${Math.min(boardIdeas.length, maxIdeas)})\n${live}\n\n` +
    `## Discarded ideas (${discardedIdeas.length} total, showing ${Math.min(discardedIdeas.length, maxDiscarded)})\n${killed}\n\n` +
    `## Supporting docs (${supportingDocs.length} total, showing ${Math.min(supportingDocs.length, maxDocs)})\n${docs}\n\n` +
    `Find the highest-signal connections across all of these. Remember: fewer, sharper links beat a long weak list. Every ideaId/supportingDocId in your output must appear above.`
  );
}

export type ConnectionFinderOutput = Output;
