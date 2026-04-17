import { z } from 'zod';
import { zodToJsonSchema } from '../ctmcp';
import type { RoleSpec } from '../ctmcp';
import type { Idea } from '../../types';

const schema = z.object({
  summary: z.string().min(8).max(280),
  facts: z.array(z.string().min(4).max(200)).min(1).max(10),
});

type Output = z.infer<typeof schema>;

/**
 * docFactExtractor — refines a pasted supporting document into a terse summary
 * plus a short list of facts the orchestrator can inject into future phase
 * prompts.
 *
 * This is NOT ideation. The doc is raw context (wiki excerpt, PRD slice, meeting
 * notes). The goal is to distill it into a handful of load-bearing statements —
 * entities, constraints, numbers, verbatim quotes — the user can lean on later
 * without re-reading the full text.
 *
 * Invoked ad-hoc via runAdhocRole; does not touch idea.phase or idea.turnLog.
 */
export const docFactExtractor: RoleSpec = {
  id: 'doc_fact_extractor',

  systemPrompt: `You are the Doc Fact Extractor. The user just pasted a supporting document attached to an idea. It is reference material — not a new idea. Your job is to make it cheap to use later.

Rules:
- summary: 1-2 plain sentences. What is this document and what does it contain? No marketing, no opinion.
- facts: 3-10 concrete, standalone statements pulled from the text. Each fact must be useful in isolation (a reader who has not seen the doc should understand it). Prefer:
  • named entities (people, teams, products, systems)
  • constraints ("must support offline", "cannot store PII")
  • numbers and dates ("launches 2026-05-01", "expects 10k DAU")
  • verbatim quotes for subjective claims (wrap in double quotes)
  • explicit decisions already made
- Do NOT invent facts the doc does not state. If the doc is vague, return fewer facts rather than filler.
- Do NOT include meta-commentary about the document itself ("this document describes…").
- No consultant-speak. No "strategic," "leverage," "synergize," "holistic."`,

  schema,
  jsonSchema: zodToJsonSchema(schema),

  buildTask(_idea: Idea): string {
    // Fallback only — callers should use buildDocFactExtractorTask.
    return 'Extract a summary and facts from the attached document. (No document provided.)';
  },

  parse(raw: unknown): Output {
    return schema.parse(raw);
  },
};

/**
 * Ad-hoc task builder. Caps the raw text length to keep prompts bounded
 * regardless of what the user pastes in.
 */
export function buildDocFactExtractorTask(title: string, rawText: string): string {
  const MAX_CHARS = 8000;
  const capped = rawText.length > MAX_CHARS
    ? rawText.slice(0, MAX_CHARS) + '\n\n[...truncated for length]'
    : rawText;
  return `Document title: ${title}\n\n---\n${capped}\n---\n\nProduce a summary and the 3-10 most load-bearing facts a reader would want when discussing this idea later.`;
}

export type DocFactExtractorOutput = Output;
