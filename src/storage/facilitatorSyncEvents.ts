import type { ChangeActor } from '../board/types';

const MAX_RECENT_FACILITATOR_EVENTS = 12;

export interface FacilitatorAiAction {
  id: string;
  kind: 'connect' | 'critique' | 'scout';
  at: number;
  clientId?: number | null;
  ideaId?: string;
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
