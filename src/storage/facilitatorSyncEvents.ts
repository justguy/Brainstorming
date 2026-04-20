import type { ChangeActor } from '../board/types';

const MAX_RECENT_FACILITATOR_EVENTS = 12;
const MAX_RECENT_AI_ACTION_OUTCOMES = 10;
const MAX_PENDING_STAGED_INSIGHTS = 12;

export type FacilitatorActionExecutionMode = 'execute' | 'stage';
export type FacilitatorInterventionStrength = 'gentle' | 'balanced' | 'aggressive';
export type FacilitatorRoleId = 'scout' | 'synthesizer' | 'challenger' | 'historian' | 'facilitator';
export type FacilitatorAutonomyCeiling = 'passive' | 'copilot' | 'challenger';
export type FacilitatorAutonomyMode = FacilitatorAutonomyCeiling | 'shadow';
export type FacilitatorBackoffStatus = 'clear' | 'cooldown' | 'shadow';
export type FacilitatorAiActionOutcome = 'pending' | 'accepted' | 'rejected' | 'ignored';

export interface FacilitatorAutonomyState {
  configuredCeiling: FacilitatorAutonomyCeiling;
  effectiveMode: FacilitatorAutonomyMode;
  backoffStatus: FacilitatorBackoffStatus;
  backoffUntil: number;
}

export interface FacilitatorAiAction {
  id: string;
  kind: 'connect' | 'critique' | 'scout';
  at: number;
  clientId?: number | null;
  ideaId?: string;
  role?: FacilitatorRoleId;
  executionMode?: FacilitatorActionExecutionMode;
  interventionStrength?: FacilitatorInterventionStrength;
  policyReason?: string;
  confidenceScore?: number;
  entityIds?: string[];
  pendingInsightIds?: string[];
}

export interface FacilitatorAiActionOutcomeRecord {
  id: string;
  kind: FacilitatorAiAction['kind'];
  at: number;
  startedAt: number;
  outcome: FacilitatorAiActionOutcome;
  ideaId?: string;
  sourceClientId?: number | null;
  summary?: string;
  role?: FacilitatorRoleId;
  executionMode?: FacilitatorActionExecutionMode;
  interventionStrength?: FacilitatorInterventionStrength;
  policyReason?: string;
  confidenceScore?: number;
  entityIds?: string[];
  pendingInsightIds?: string[];
  outcomeAt?: number;
}

export interface FacilitatorBoardMutation {
  id: string;
  kind: 'connection' | 'critique' | 'doc' | 'suggestion' | 'idea' | 'group';
  at: number;
  actorType: ChangeActor['type'];
  clientId: number | null;
  entityId?: string;
  ideaId?: string;
  summary?: string;
}

export interface FacilitatorSessionEvent {
  id: string;
  source: 'ai_action' | 'board_mutation';
  at: number;
  kind: FacilitatorAiAction['kind'] | FacilitatorBoardMutation['kind'];
  actorType: ChangeActor['type'];
  clientId: number | null;
  entityId?: string;
  ideaId?: string;
  summary?: string;
  role?: FacilitatorRoleId;
  executionMode?: FacilitatorActionExecutionMode;
  interventionStrength?: FacilitatorInterventionStrength;
  policyReason?: string;
}

export interface FacilitatorStagedInsight {
  id: string;
  at: number;
  kind: 'scout' | 'critique' | 'connection' | 'tool_suggestion' | 'generic';
  sourceActionId: string;
  summary: string;
  source?: string;
  beadId?: string;
  ideaId?: string;
  payload?: Record<string, unknown>;
  status?: 'pending' | 'accepted' | 'rejected';
}

export function readAutonomyState(value: unknown): FacilitatorAutonomyState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      configuredCeiling: 'copilot',
      effectiveMode: 'copilot',
      backoffStatus: 'clear',
      backoffUntil: 0,
    };
  }
  const raw = value as Partial<FacilitatorAutonomyState>;
  const configuredCeiling = isAutonomyCeiling(raw.configuredCeiling)
    ? raw.configuredCeiling
    : 'copilot';
  return {
    configuredCeiling,
    effectiveMode: isAutonomyMode(raw.effectiveMode) ? raw.effectiveMode : configuredCeiling,
    backoffStatus: isBackoffStatus(raw.backoffStatus) ? raw.backoffStatus : 'clear',
    backoffUntil: typeof raw.backoffUntil === 'number' ? raw.backoffUntil : 0,
  };
}

export function createAutonomyStatePatch(
  current: FacilitatorAutonomyState,
  next: Partial<FacilitatorAutonomyState>,
): FacilitatorAutonomyState {
  return {
    configuredCeiling: isAutonomyCeiling(next.configuredCeiling) ? next.configuredCeiling : current.configuredCeiling,
    effectiveMode: isAutonomyMode(next.effectiveMode) ? next.effectiveMode : current.effectiveMode,
    backoffStatus: isBackoffStatus(next.backoffStatus) ? next.backoffStatus : current.backoffStatus,
    backoffUntil: typeof next.backoffUntil === 'number' ? next.backoffUntil : current.backoffUntil,
  };
}

export function createFacilitatorAiActionOutcomeRecord(
  action: FacilitatorAiAction,
): FacilitatorAiActionOutcomeRecord {
  return {
    id: action.id,
    at: action.at,
    startedAt: action.at,
    kind: action.kind,
    outcome: 'pending',
    ideaId: action.ideaId,
    sourceClientId: action.clientId ?? null,
    ...(typeof action.policyReason === 'string' ? { summary: action.policyReason } : {}),
    ...(isKnownRole(action.role) ? { role: action.role } : {}),
    ...(isKnownExecutionMode(action.executionMode) ? { executionMode: action.executionMode } : {}),
    ...(isKnownInterventionStrength(action.interventionStrength)
      ? { interventionStrength: action.interventionStrength }
      : {}),
    ...(typeof action.policyReason === 'string' ? { policyReason: action.policyReason } : {}),
    ...(typeof action.confidenceScore === 'number' ? { confidenceScore: action.confidenceScore } : {}),
    ...(Array.isArray(action.entityIds) ? { entityIds: action.entityIds.filter(isNonEmptyString) } : {}),
    ...(Array.isArray(action.pendingInsightIds)
      ? { pendingInsightIds: action.pendingInsightIds.filter(isNonEmptyString) }
      : {}),
  };
}

export function readAiActionOutcomes(value: unknown): FacilitatorAiActionOutcomeRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(readFacilitatorAiActionOutcome)
    .filter((outcome): outcome is FacilitatorAiActionOutcomeRecord => Boolean(outcome))
    .sort((left, right) => right.at - left.at)
    .slice(0, MAX_RECENT_AI_ACTION_OUTCOMES);
}

export function appendRecentAiActionOutcome(
  currentValue: unknown,
  nextOutcome: FacilitatorAiActionOutcomeRecord,
): FacilitatorAiActionOutcomeRecord[] {
  const outcomes = readAiActionOutcomes(currentValue);
  return [nextOutcome, ...outcomes.filter(outcome => outcome.id !== nextOutcome.id)]
    .sort((left, right) => right.at - left.at)
    .slice(0, MAX_RECENT_AI_ACTION_OUTCOMES);
}

export function markAiActionOutcome(
  currentValue: unknown,
  id: string,
  outcome: FacilitatorAiActionOutcome,
): FacilitatorAiActionOutcomeRecord[] {
  const outcomes = readAiActionOutcomes(currentValue);
  return outcomes.some(outcomeRecord => outcomeRecord.id === id)
    ? outcomes.map(item => item.id === id ? { ...item, outcome, outcomeAt: Date.now() } : item).sort((left, right) => right.at - left.at)
    : outcomes;
}

export function markAiActionOutcomeByEntityId(
  currentValue: unknown,
  entityId: string,
  outcome: FacilitatorAiActionOutcome,
): FacilitatorAiActionOutcomeRecord[] {
  return readAiActionOutcomes(currentValue).map(item => (
    item.entityIds?.includes(entityId)
      ? { ...item, outcome, outcomeAt: Date.now() }
      : item
  ));
}

export function markAiActionOutcomeByPendingInsightId(
  currentValue: unknown,
  insightId: string,
  outcome: FacilitatorAiActionOutcome,
): FacilitatorAiActionOutcomeRecord[] {
  return readAiActionOutcomes(currentValue).map(item => (
    item.pendingInsightIds?.includes(insightId)
      ? { ...item, outcome, outcomeAt: Date.now() }
      : item
  ));
}

export function createFacilitatorStagedInsight(
  insight: Omit<FacilitatorStagedInsight, 'id' | 'at'> & { id?: string; at?: number },
): FacilitatorStagedInsight {
  return {
    id: insight.id ?? crypto.randomUUID(),
    at: insight.at ?? Date.now(),
    kind: isInsightKind(insight.kind) ? insight.kind : 'generic',
    sourceActionId: insight.sourceActionId ?? crypto.randomUUID(),
    summary: insight.summary,
    ...(typeof insight.source === 'string' ? { source: insight.source } : {}),
    ...(typeof insight.beadId === 'string' ? { beadId: insight.beadId } : {}),
    ...(typeof insight.ideaId === 'string' ? { ideaId: insight.ideaId } : {}),
    ...(isRecordObject(insight.payload) ? { payload: insight.payload } : {}),
    ...(insight.status === 'pending' || insight.status === 'accepted' || insight.status === 'rejected'
      ? { status: insight.status }
      : {}),
  };
}

export function readFacilitatorStagedInsights(value: unknown): FacilitatorStagedInsight[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(readFacilitatorStagedInsight)
    .filter((insight): insight is FacilitatorStagedInsight => Boolean(insight))
    .sort((left, right) => right.at - left.at)
    .slice(0, MAX_PENDING_STAGED_INSIGHTS);
}

export function appendFacilitatorStagedInsight(
  currentValue: unknown,
  nextInsight: FacilitatorStagedInsight,
): FacilitatorStagedInsight[] {
  const insights = readFacilitatorStagedInsights(currentValue);
  return [nextInsight, ...insights.filter(insight => insight.id !== nextInsight.id)]
    .sort((left, right) => right.at - left.at)
    .slice(0, MAX_PENDING_STAGED_INSIGHTS);
}

export function removeFacilitatorStagedInsight(
  currentValue: unknown,
  id: string,
): FacilitatorStagedInsight[] {
  return readFacilitatorStagedInsights(currentValue).filter(insight => insight.id !== id);
}

export function appendRecentFacilitatorEvent(
  currentValue: unknown,
  nextEvent: FacilitatorSessionEvent,
): FacilitatorSessionEvent[] {
  return [nextEvent, ...readRecentFacilitatorEvents(currentValue).filter(event => event.id !== nextEvent.id)]
    .sort((left, right) => right.at - left.at)
    .slice(0, MAX_RECENT_FACILITATOR_EVENTS);
}

export function createFacilitatorEventFromAiAction(action: FacilitatorAiAction): FacilitatorSessionEvent {
  return {
    id: action.id,
    source: 'ai_action',
    at: action.at,
    kind: action.kind,
    actorType: 'ai',
    clientId: action.clientId ?? null,
    ...(typeof action.ideaId === 'string' ? { ideaId: action.ideaId } : {}),
    summary: summarizeAiAction(action),
    ...(isKnownRole(action.role) ? { role: action.role } : {}),
    ...(isKnownExecutionMode(action.executionMode) ? { executionMode: action.executionMode } : {}),
    ...(isKnownInterventionStrength(action.interventionStrength)
      ? { interventionStrength: action.interventionStrength }
      : {}),
    ...(typeof action.policyReason === 'string' ? { policyReason: action.policyReason } : {}),
  };
}

export function createFacilitatorEventFromBoardMutation(
  mutation: FacilitatorBoardMutation,
): FacilitatorSessionEvent {
  return {
    id: mutation.id,
    source: 'board_mutation',
    at: mutation.at,
    kind: mutation.kind,
    actorType: mutation.actorType,
    clientId: mutation.clientId ?? null,
    ...(typeof mutation.entityId === 'string' ? { entityId: mutation.entityId } : {}),
    ...(typeof mutation.ideaId === 'string' ? { ideaId: mutation.ideaId } : {}),
    ...(typeof mutation.summary === 'string' ? { summary: mutation.summary } : {}),
  };
}

export function readAiAction(value: unknown): FacilitatorAiAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const action = value as Partial<FacilitatorAiAction>;
  if (typeof action.id !== 'string' || action.id.length === 0) return null;
  if (typeof action.at !== 'number') return null;
  if (action.kind !== 'connect' && action.kind !== 'critique' && action.kind !== 'scout') return null;
  const clientId = normalizeClientId(action.clientId);
  if (action.clientId !== undefined && action.clientId !== null && clientId === null) return null;
  return {
    id: action.id,
    kind: action.kind,
    at: action.at,
    clientId,
    ...(typeof action.ideaId === 'string' ? { ideaId: action.ideaId } : {}),
    ...(isKnownRole(action.role) ? { role: action.role } : {}),
    ...(isKnownExecutionMode(action.executionMode) ? { executionMode: action.executionMode } : {}),
    ...(isKnownInterventionStrength(action.interventionStrength) ? { interventionStrength: action.interventionStrength } : {}),
    ...(typeof action.policyReason === 'string' ? { policyReason: action.policyReason } : {}),
    ...(typeof action.confidenceScore === 'number' ? { confidenceScore: action.confidenceScore } : {}),
    ...(Array.isArray(action.entityIds) ? { entityIds: action.entityIds.filter(isNonEmptyString) } : {}),
    ...(Array.isArray(action.pendingInsightIds)
      ? { pendingInsightIds: action.pendingInsightIds.filter(isNonEmptyString) }
      : {}),
  };
}

export function readBoardMutation(value: unknown): FacilitatorBoardMutation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const mutation = value as Partial<FacilitatorBoardMutation>;
  if (typeof mutation.id !== 'string' || mutation.id.length === 0) return null;
  if (typeof mutation.at !== 'number') return null;
  if (
    mutation.kind !== 'connection' &&
    mutation.kind !== 'critique' &&
    mutation.kind !== 'doc' &&
    mutation.kind !== 'suggestion' &&
    mutation.kind !== 'idea' &&
    mutation.kind !== 'group'
  ) {
    return null;
  }
  if (!isActorType(mutation.actorType)) return null;
  const clientId = normalizeClientId(mutation.clientId);
  if (mutation.clientId !== undefined && mutation.clientId !== null && clientId === null) return null;
  return {
    id: mutation.id,
    at: mutation.at,
    kind: mutation.kind,
    actorType: mutation.actorType,
    clientId,
    ...(typeof mutation.entityId === 'string' ? { entityId: mutation.entityId } : {}),
    ...(typeof mutation.ideaId === 'string' ? { ideaId: mutation.ideaId } : {}),
    ...(typeof mutation.summary === 'string' ? { summary: mutation.summary } : {}),
  };
}

export function readRecentFacilitatorEvents(value: unknown): FacilitatorSessionEvent[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(readFacilitatorEvent)
    .filter((event): event is FacilitatorSessionEvent => Boolean(event))
    .sort((left, right) => right.at - left.at)
    .slice(0, MAX_RECENT_FACILITATOR_EVENTS);
}

function readFacilitatorAiActionOutcome(value: unknown): FacilitatorAiActionOutcomeRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const outcome = value as Partial<FacilitatorAiActionOutcomeRecord>;
  if (typeof outcome.id !== 'string' || outcome.id.length === 0) return null;
  if (!isAiActionKind(outcome.kind)) return null;
  if (typeof outcome.at !== 'number') return null;
  if (!isOutcome(outcome.outcome)) return null;
  if (outcome.sourceClientId !== undefined && typeof outcome.sourceClientId !== 'number' && outcome.sourceClientId !== null) return null;
  if (outcome.summary !== undefined && typeof outcome.summary !== 'string') return null;
  return {
    id: outcome.id,
    kind: outcome.kind,
    at: outcome.at,
    startedAt: typeof outcome.startedAt === 'number' ? outcome.startedAt : outcome.at,
    outcome: outcome.outcome,
    ...(typeof outcome.ideaId === 'string' ? { ideaId: outcome.ideaId } : {}),
    ...(typeof outcome.sourceClientId === 'number' || outcome.sourceClientId === null
      ? { sourceClientId: outcome.sourceClientId }
      : {}),
    ...(typeof outcome.summary === 'string' ? { summary: outcome.summary } : {}),
    ...(isKnownRole(outcome.role) ? { role: outcome.role } : {}),
    ...(isKnownExecutionMode(outcome.executionMode) ? { executionMode: outcome.executionMode } : {}),
    ...(isKnownInterventionStrength(outcome.interventionStrength)
      ? { interventionStrength: outcome.interventionStrength }
      : {}),
    ...(typeof outcome.policyReason === 'string' ? { policyReason: outcome.policyReason } : {}),
    ...(typeof outcome.confidenceScore === 'number' ? { confidenceScore: outcome.confidenceScore } : {}),
    ...(Array.isArray(outcome.entityIds) ? { entityIds: outcome.entityIds.filter(isNonEmptyString) } : {}),
    ...(Array.isArray(outcome.pendingInsightIds)
      ? { pendingInsightIds: outcome.pendingInsightIds.filter(isNonEmptyString) }
      : {}),
    ...(typeof outcome.outcomeAt === 'number' ? { outcomeAt: outcome.outcomeAt } : {}),
  };
}

function readFacilitatorStagedInsight(value: unknown): FacilitatorStagedInsight | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const insight = value as Partial<FacilitatorStagedInsight>;
  if (typeof insight.id !== 'string' || insight.id.length === 0) return null;
  if (typeof insight.sourceActionId !== 'string' || insight.sourceActionId.length === 0) return null;
  if (typeof insight.at !== 'number') return null;
  if (typeof insight.summary !== 'string' || insight.summary.length === 0) return null;
  if (!isInsightKind(insight.kind)) return null;
  return {
    id: insight.id,
    at: insight.at,
    kind: insight.kind,
    sourceActionId: insight.sourceActionId,
    summary: insight.summary,
    ...(typeof insight.source === 'string' ? { source: insight.source } : {}),
    ...(typeof insight.beadId === 'string' ? { beadId: insight.beadId } : {}),
    ...(typeof insight.ideaId === 'string' ? { ideaId: insight.ideaId } : {}),
    ...(isRecordObject(insight.payload) ? { payload: insight.payload } : {}),
    ...(insight.status === 'pending' || insight.status === 'accepted' || insight.status === 'rejected'
      ? { status: insight.status }
      : {}),
  };
}

function readFacilitatorEvent(value: unknown): FacilitatorSessionEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const event = value as Partial<FacilitatorSessionEvent>;
  if (typeof event.id !== 'string' || event.id.length === 0) return null;
  if (typeof event.at !== 'number') return null;
  if (event.source !== 'ai_action' && event.source !== 'board_mutation') return null;
  if (!isActorType(event.actorType)) return null;
  const clientId = normalizeClientId(event.clientId);
  if (event.clientId !== undefined && event.clientId !== null && clientId === null) return null;
  if (!isKnownEventKind(event.kind)) return null;
  return {
    id: event.id,
    source: event.source,
    at: event.at,
    kind: event.kind,
    actorType: event.actorType,
    clientId,
    ...(typeof event.entityId === 'string' ? { entityId: event.entityId } : {}),
    ...(typeof event.ideaId === 'string' ? { ideaId: event.ideaId } : {}),
    ...(typeof event.summary === 'string' ? { summary: event.summary } : {}),
    ...(isKnownRole(event.role) ? { role: event.role } : {}),
    ...(isKnownExecutionMode(event.executionMode) ? { executionMode: event.executionMode } : {}),
    ...(isKnownInterventionStrength(event.interventionStrength) ? { interventionStrength: event.interventionStrength } : {}),
    ...(typeof event.policyReason === 'string' ? { policyReason: event.policyReason } : {}),
  };
}

function summarizeAiAction(action: FacilitatorAiAction): string {
  switch (action.kind) {
    case 'connect':
      return 'AI ran connection finder';
    case 'critique':
      return action.ideaId ? `AI critiqued idea ${action.ideaId}` : 'AI created a critique';
    case 'scout':
      return action.ideaId ? `AI scouted around idea ${action.ideaId}` : 'AI ran scout';
    default:
      return 'AI acted';
  }
}

function normalizeClientId(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function isActorType(value: unknown): value is ChangeActor['type'] {
  return value === 'user' || value === 'ai' || value === 'tool' || value === 'system';
}

function isKnownEventKind(value: unknown): value is FacilitatorSessionEvent['kind'] {
  return (
    value === 'connect' ||
    value === 'critique' ||
    value === 'scout' ||
    value === 'connection' ||
    value === 'doc' ||
    value === 'suggestion' ||
    value === 'idea' ||
    value === 'group'
  );
}

function isKnownRole(value: unknown): value is FacilitatorRoleId {
  return (
    value === 'scout' ||
    value === 'synthesizer' ||
    value === 'challenger' ||
    value === 'historian' ||
    value === 'facilitator'
  );
}

function isKnownExecutionMode(
  value: unknown,
): value is FacilitatorSessionEvent['executionMode'] {
  return value === 'execute' || value === 'stage';
}

function isKnownInterventionStrength(
  value: unknown,
) : value is FacilitatorSessionEvent['interventionStrength'] {
  return value === 'gentle' || value === 'balanced' || value === 'aggressive';
}

function isAiActionKind(value: unknown): value is FacilitatorAiAction['kind'] {
  return value === 'connect' || value === 'critique' || value === 'scout';
}

function isOutcome(value: unknown): value is FacilitatorAiActionOutcome {
  return value === 'pending' || value === 'accepted' || value === 'rejected' || value === 'ignored';
}

function isAutonomyCeiling(value: unknown): value is FacilitatorAutonomyCeiling {
  return value === 'passive' || value === 'copilot' || value === 'challenger';
}

function isAutonomyMode(value: unknown): value is FacilitatorAutonomyMode {
  return value === 'passive' || value === 'copilot' || value === 'challenger' || value === 'shadow';
}

function isBackoffStatus(value: unknown): value is FacilitatorBackoffStatus {
  return value === 'clear' || value === 'cooldown' || value === 'shadow';
}

function isInsightKind(value: unknown): value is FacilitatorStagedInsight['kind'] {
  return value === 'scout' || value === 'critique' || value === 'connection' || value === 'tool_suggestion'
    || value === 'generic';
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
