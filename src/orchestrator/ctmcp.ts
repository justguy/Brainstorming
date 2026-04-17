import { z } from 'zod';
import type { Idea, LlmMessage, CtMcpPayload, BriefState, Ambiguity, ActiveTabToolContext, SupportingDoc } from '../types';

// Zod v4 ships a built-in JSON Schema converter. We target openapi-3.0 so the
// output includes `additionalProperties: false` (required by OpenAI Structured
// Outputs and accepted by Anthropic tool use). Gemini rejects that field, so
// the Gemini provider strips it in its own sanitizer.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function zodToJsonSchema(schema: z.ZodType<any>): object {
  return z.toJSONSchema(schema, { target: 'openapi-3.0' });
}

export interface RoleSpec {
  id: string;
  systemPrompt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
  jsonSchema: object;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildTask(idea: Idea, userInput?: string): string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse(raw: unknown): any;
}

export function buildPayload(
  role: RoleSpec,
  idea: Idea,
  task: string,
  liveToolContext?: ActiveTabToolContext,
  supportingDocs?: SupportingDoc[]
): CtMcpPayload {
  const unresolvedAmbiguities: Ambiguity[] = idea.ambiguities.filter(
    a => a.resolutionMode !== 'defer'
  );

  return {
    roleSystemPrompt: role.systemPrompt,
    briefState: idea.briefState,
    detectedAmbiguities: unresolvedAmbiguities,
    mustStayTrueRules: idea.briefState.mustStayTrueRules,
    task,
    outputJsonSchema: role.jsonSchema,
    liveToolContext: liveToolContext ?? idea.liveToolContext,
    supportingDocs,
  };
}

function formatBriefState(brief: BriefState): string {
  const lines: string[] = ['## Current Brief State'];
  if (brief.problemStatement) lines.push(`**Problem:** ${brief.problemStatement}`);
  if (brief.audience) lines.push(`**Audience:** ${brief.audience}`);
  if (brief.desiredOutcome) lines.push(`**Desired Outcome:** ${brief.desiredOutcome}`);
  if (brief.chosenApproachId) lines.push(`**Chosen Approach ID:** ${brief.chosenApproachId}`);

  if (brief.successCriteria.length > 0) {
    lines.push('**Success Criteria:**');
    brief.successCriteria.forEach(sc => lines.push(`  - ${sc}`));
  }
  if (brief.outOfScope.length > 0) {
    lines.push('**Out of Scope:**');
    brief.outOfScope.forEach(oos => lines.push(`  - ${oos}`));
  }
  if (brief.openQuestions.length > 0) {
    lines.push('**Open Questions:**');
    brief.openQuestions.forEach(oq => lines.push(`  - ${oq}`));
  }
  if (brief.risks.length > 0) {
    lines.push(`**Risks identified:** ${brief.risks.length}`);
  }
  if (brief.approaches.length > 0) {
    lines.push(`**Approaches on table:** ${brief.approaches.map(a => a.label).join(', ')}`);
  }
  return lines.join('\n');
}

function formatAmbiguities(ambiguities: Ambiguity[]): string {
  if (ambiguities.length === 0) return '## Unresolved Ambiguities\nNone detected yet.';
  const lines = ['## Unresolved Ambiguities'];
  ambiguities.forEach(a => {
    lines.push(`- [${a.severity.toUpperCase()}] ${a.plainLanguage} (type: ${a.type}, resolution: ${a.resolutionMode})`);
  });
  return lines.join('\n');
}

function formatRules(rules: string[]): string {
  if (rules.length === 0) return '## Must-Stay-True Rules\nNone established yet.';
  const lines = ['## MUST-STAY-TRUE RULES (HARD CONSTRAINTS — Never violate these)'];
  rules.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  return lines.join('\n');
}

const SUPPORTING_DOC_FACT_CAP = 30;

function formatSupportingDocs(docs: SupportingDoc[]): string {
  const ready = docs.filter(d => d.status === 'ready' && d.facts.length > 0);
  if (ready.length === 0) return '';
  const lines = ['## Supporting Context', '(User-attached reference material. Treat as ground truth. Cite by doc title when relying on a fact.)'];
  let used = 0;
  for (const doc of ready) {
    if (used >= SUPPORTING_DOC_FACT_CAP) break;
    lines.push('');
    lines.push(`### ${doc.title}`);
    if (doc.summary) lines.push(doc.summary);
    const remaining = SUPPORTING_DOC_FACT_CAP - used;
    const take = doc.facts.slice(0, remaining);
    take.forEach(f => lines.push(`- ${f}`));
    used += take.length;
  }
  return lines.join('\n');
}

function formatLiveToolContext(ctx: ActiveTabToolContext): string {
  const lines = [
    `[LIVE TOOL CONTEXT from ${ctx.origin}]`,
    `Tab: "${ctx.title}"`,
    `Available tools (do not invoke — the orchestrator decides when to use):`,
  ];
  for (const tool of ctx.tools) {
    lines.push(`- ${tool.name}: ${tool.description}`);
    const schema = tool.inputSchema as Record<string, unknown>;
    const props = schema.properties as Record<string, unknown> | undefined;
    if (props) {
      const paramNames = Object.keys(props).join(', ');
      if (paramNames) lines.push(`  input params: ${paramNames}`);
    }
  }
  return lines.join('\n');
}

export function payloadToMessages(payload: CtMcpPayload): LlmMessage[] {
  const parts = [
    payload.roleSystemPrompt,
    '',
    '---',
    '',
    formatBriefState(payload.briefState),
    '',
    formatAmbiguities(payload.detectedAmbiguities),
    '',
    formatRules(payload.mustStayTrueRules),
  ];

  if (payload.supportingDocs && payload.supportingDocs.length > 0) {
    const docsSection = formatSupportingDocs(payload.supportingDocs);
    if (docsSection) {
      parts.push('');
      parts.push(docsSection);
    }
  }

  if (payload.liveToolContext && payload.liveToolContext.tools.length > 0) {
    parts.push('');
    parts.push(formatLiveToolContext(payload.liveToolContext));
  }

  parts.push('', '---', '', `## Your Task\n${payload.task}`, '');
  parts.push('Return ONLY valid JSON matching the schema. No prose, no markdown fences.');

  const systemContent = parts.join('\n');

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: payload.task },
  ];
}
