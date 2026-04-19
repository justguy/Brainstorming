import type { Idea, Phase } from '../types';
import type { ActiveTabToolContext, WebMcpToolDescriptor } from './types';

export interface PhaseTransitionSnapshot {
  phase: Phase;
  nextStep?: Idea['briefState']['nextStep'];
}

export interface PhaseTransitionWritebackTrigger {
  kind: 'phase_changed' | 'next_step_changed';
  headline: string;
  detail: string;
}

export interface PhaseTransitionWritebackDraft {
  trigger: PhaseTransitionWritebackTrigger;
  toolName: string;
  input: Record<string, unknown>;
}

type JsonSchemaLike = {
  type?: unknown;
  properties?: Record<string, unknown>;
  items?: unknown;
  enum?: unknown[];
};

const WRITE_KEYWORDS = ['create', 'update', 'write', 'append', 'publish', 'sync', 'submit', 'save', 'ticket', 'issue', 'story', 'task', 'card', 'doc', 'document', 'page', 'spec', 'prd', 'roadmap', 'notion', 'linear', 'jira'];
const READ_KEYWORDS = ['list', 'get', 'read', 'search', 'find', 'query', 'fetch', 'inspect', 'preview', 'view'];

export function listPhaseTransitionWriteTools(
  context: ActiveTabToolContext | undefined,
): WebMcpToolDescriptor[] {
  if (!context) return [];
  return context.tools.filter(isPhaseTransitionWriteTool);
}

export function buildPhaseTransitionWritebackDraft(args: {
  idea: Idea;
  previous: PhaseTransitionSnapshot;
  current: PhaseTransitionSnapshot;
  tool: WebMcpToolDescriptor;
}): PhaseTransitionWritebackDraft | null {
  const trigger = detectPhaseTransitionWriteback(args.previous, args.current);
  if (!trigger) return null;
  return {
    trigger,
    toolName: args.tool.name,
    input: buildPhaseTransitionWritebackInput(args.idea, trigger, args.tool),
  };
}

export function buildPhaseTransitionWritebackInput(
  idea: Idea,
  trigger: PhaseTransitionWritebackTrigger,
  tool: WebMcpToolDescriptor,
): Record<string, unknown> {
  return buildWritebackInput(idea, trigger, tool);
}

export function detectPhaseTransitionWriteback(
  previous: PhaseTransitionSnapshot,
  current: PhaseTransitionSnapshot,
): PhaseTransitionWritebackTrigger | null {
  if (previous.phase !== current.phase) {
    if (current.phase === 8) {
      return {
        kind: 'phase_changed',
        headline: 'Idea reached handoff-ready state',
        detail: `Phase moved from ${previous.phase} to ${current.phase}.`,
      };
    }
    return {
      kind: 'phase_changed',
      headline: 'Idea changed phase',
      detail: `Phase moved from ${previous.phase} to ${current.phase}.`,
    };
  }

  if (previous.nextStep !== current.nextStep && current.nextStep) {
    return {
      kind: 'next_step_changed',
      headline: 'Next step changed',
      detail: `Next step is now "${current.nextStep}".`,
    };
  }

  return null;
}

function isPhaseTransitionWriteTool(tool: WebMcpToolDescriptor): boolean {
  if (tool.annotations?.readOnlyHint === true) return false;

  const toolText = normalizeSearchText(`${tool.name} ${tool.description}`);
  if (hasKeyword(toolText, WRITE_KEYWORDS)) return true;
  if (hasKeyword(toolText, READ_KEYWORDS)) return false;

  const schema = asSchema(tool.inputSchema);
  const properties = schema?.properties ? Object.keys(schema.properties) : [];
  return properties.some(name => hasKeyword(normalizeSearchText(name), WRITE_KEYWORDS));
}

function buildWritebackInput(
  idea: Idea,
  trigger: PhaseTransitionWritebackTrigger,
  tool: WebMcpToolDescriptor,
): Record<string, unknown> {
  const schema = asSchema(tool.inputSchema);
  const properties = schema?.properties;
  const fallback = buildFallbackPayload(idea, trigger);
  if (!properties || Object.keys(properties).length === 0) return fallback;

  const drafted: Record<string, unknown> = {};

  for (const [key, property] of Object.entries(properties)) {
    const value = mapPropertyValue(key, property, idea, trigger, fallback);
    if (value !== undefined) {
      drafted[key] = value;
    }
  }

  return Object.keys(drafted).length > 0 ? drafted : fallback;
}

function buildFallbackPayload(
  idea: Idea,
  trigger: PhaseTransitionWritebackTrigger,
): Record<string, unknown> {
  return {
    source: 'brainstorming-orchestrator',
    trigger: trigger.headline,
    triggerDetail: trigger.detail,
    ideaId: idea.id,
    boardId: idea.boardId ?? 'default',
    title: idea.rawText,
    summary: idea.rawText,
    phase: idea.phase,
    readiness: idea.readiness,
    nextStep: idea.briefState.nextStep ?? null,
    tags: idea.tags,
    markdown: buildMarkdownPayload(idea, trigger),
  };
}

function buildMarkdownPayload(
  idea: Idea,
  trigger: PhaseTransitionWritebackTrigger,
): string {
  const lines = [
    `# ${idea.rawText}`,
    '',
    `- Trigger: ${trigger.headline}`,
    `- Detail: ${trigger.detail}`,
    `- Idea ID: ${idea.id}`,
    `- Phase: ${idea.phase}`,
    `- Readiness: ${idea.readiness}`,
    `- Next step: ${idea.briefState.nextStep ?? 'unset'}`,
  ];

  if (idea.tags.length > 0) {
    lines.push(`- Tags: ${idea.tags.join(', ')}`);
  }

  if (idea.artifactMd) {
    lines.push('', idea.artifactMd);
  }

  return lines.join('\n');
}

function mapPropertyValue(
  rawKey: string,
  property: unknown,
  idea: Idea,
  trigger: PhaseTransitionWritebackTrigger,
  fallback: Record<string, unknown>,
): unknown {
  const schema = asSchema(property);

  if (matchesKey(rawKey, ['title', 'name', 'subject', 'summary'])) {
    return applyEnum(schema, idea.rawText);
  }

  if (matchesKey(rawKey, ['description', 'body', 'content', 'markdown', 'document', 'doc', 'details', 'spec', 'prd'])) {
    return applyEnum(schema, buildMarkdownPayload(idea, trigger));
  }

  if (matchesKey(rawKey, ['status', 'state'])) {
    return applyEnum(schema, idea.phase === 8 ? 'ready_for_handoff' : `phase_${idea.phase}`);
  }

  if (matchesKey(rawKey, ['next step'])) {
    return applyEnum(schema, idea.briefState.nextStep ?? undefined);
  }

  if (matchesKey(rawKey, ['phase'])) {
    return idea.phase;
  }

  if (matchesKey(rawKey, ['readiness'])) {
    return applyEnum(schema, idea.readiness);
  }

  if (matchesKey(rawKey, ['idea id', 'external id'])) {
    return idea.id;
  }

  if (matchesKey(rawKey, ['board id'])) {
    return idea.boardId ?? 'default';
  }

  if (matchesKey(rawKey, ['origin', 'source'])) {
    return applyEnum(schema, 'brainstorming-orchestrator');
  }

  if (matchesKey(rawKey, ['labels', 'tags'])) {
    return Array.isArray(idea.tags) ? idea.tags : undefined;
  }

  if (matchesKey(rawKey, ['label', 'tag'])) {
    return idea.tags[0] ?? undefined;
  }

  if (matchesKey(rawKey, ['metadata', 'context', 'payload'])) {
    return fallback;
  }

  if (schema?.type === 'boolean' && matchesKey(rawKey, ['ready', 'confirmed', 'publish'])) {
    return true;
  }

  return undefined;
}

function matchesKey(rawKey: string, candidates: string[]): boolean {
  const normalized = normalizeSearchText(rawKey);
  return candidates.some(candidate => normalized === candidate || normalized.includes(candidate));
}

function applyEnum(schema: JsonSchemaLike | null, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (!schema?.enum || schema.enum.length === 0) return value;
  return schema.enum.includes(value) ? value : undefined;
}

function asSchema(value: unknown): JsonSchemaLike | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonSchemaLike;
}

function normalizeSearchText(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasKeyword(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.split(' ').includes(keyword));
}
