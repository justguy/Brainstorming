import type { BoardPatchOp, ChangeActor, ChangeSetRecord, IdeaTurnRecord } from '../board/types';
import { DEFAULT_BOARD_ID } from '../board/types';
import type { Idea, BeadReviewFlag, BeadSuggestion } from '../types';
import { normalizeBeadCoordination } from '../orchestrator/beadState';
import { getDb } from './db';
import { getBoardHistoryState } from './boardHistoryState';
import { getIdea } from './ideas';

type IdeaReadiness = Idea['readiness'];
type IdeaPhaseHistoryChangeKind =
  | 'phase'
  | 'readiness'
  | 'ambiguity'
  | 'rule'
  | 'risk'
  | 'stress'
  | 'bead'
  | 'next_step';

interface ChangeSourceTurn {
  seq: number;
  role: IdeaTurnRecord['role'];
  content: string;
  createdAt: number;
}

interface IdeaStateSnapshot {
  phase: number | null;
  readiness: IdeaReadiness | null;
  ambiguities: Idea['ambiguities'];
  mustStayTrueRules: Idea['briefState']['mustStayTrueRules'];
  risks: Idea['briefState']['risks'];
  stressResults: Idea['briefState']['stressResults'];
  beadCoordination: Idea['beadCoordination'];
  nextStep: Idea['briefState']['nextStep'] | null;
}

interface IdeaPhaseHistoryActor {
  type: ChangeActor['type'];
  source: ChangeActor['source'];
  label?: string;
  beat?: ChangeActor['beat'];
}

export interface IdeaPhaseHistoryEvent {
  ideaId: string;
  source: 'change_set' | 'turn_log';
  sourceSeq: number | null;
  sourceId: string | null;
  actor: IdeaPhaseHistoryActor;
  at: number;
  eventKind: IdeaPhaseHistoryChangeKind | 'both';
  changeKinds: IdeaPhaseHistoryChangeKind[];
  fromPhase: number | null;
  toPhase: number | null;
  fromReadiness: IdeaReadiness | null;
  toReadiness: IdeaReadiness | null;
  summary: string;
}

export interface IdeaPhaseHistoryPage {
  ideaId: string;
  events: IdeaPhaseHistoryEvent[];
  cursor: string | null;
  nextCursor: string | null;
  totalEvents: number;
  boundedToSeq: number;
}

interface GetIdeaPhaseHistoryArgs {
  ideaId: string;
  boardId?: string;
  cursor?: string;
  limit?: number;
  fallbackToTurnLog?: boolean;
}

interface ChangeEventBase {
  ideaId: string;
  source: 'change_set';
  sourceSeq: number;
  sourceId: string;
  actor: IdeaPhaseHistoryActor;
  at: number;
}

interface CountDiff {
  added: number;
  removed: number;
  updated: number;
}

interface AmbiguityDiff {
  added: number;
  removed: number;
  resolved: number;
  deferred: number;
  dismissed: number;
  reopened: number;
  noted: number;
  metadataChanged: number;
}

interface StressDiff {
  added: number;
  removed: number;
  handledChanged: number;
  responseChanged: number;
  updated: number;
}

const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

const STEP_TO_NEXT_PHASE: Record<string, number> = {
  '0': 0.5,
  '0.5': 1,
  '1': 2,
  '2': 2.5,
  '2.5': 3,
  '3': 4,
  '4': 4.5,
  '4.5': 5,
  '5': 6,
  '6': 7,
  '7': 8,
  '8': 8,
};

export async function getIdeaPhaseHistory({
  ideaId,
  boardId,
  cursor,
  limit,
  fallbackToTurnLog = true,
}: GetIdeaPhaseHistoryArgs): Promise<IdeaPhaseHistoryPage> {
  if (typeof ideaId !== 'string' || ideaId.trim().length === 0) {
    throw new Error('getIdeaPhaseHistory requires a non-empty ideaId.');
  }

  const resolvedIdea = await getIdea(ideaId);
  if (!resolvedIdea) {
    throw new Error(`No idea found with id "${ideaId}".`);
  }

  const resolvedBoardId = resolvedIdea.boardId ?? boardId ?? DEFAULT_BOARD_ID;
  const boardHistoryState = await getBoardHistoryState(resolvedBoardId);
  const changeSets = await listBoardChangeSets(resolvedBoardId);
  const cursorIndex = normalizeCursor(cursor);
  const pageLimit = normalizeLimit(limit);

  const eventsFromChangeSets = derivePhaseHistoryFromChangeSets(
    changeSets,
    resolvedBoardId,
    resolvedIdea.id,
    boardHistoryState.cursor,
  );
  let events: IdeaPhaseHistoryEvent[] = [...eventsFromChangeSets];

  if (events.length === 0 && fallbackToTurnLog) {
    const fallbackFromTurns = await derivePhaseHistoryFromTurns(resolvedBoardId, resolvedIdea.id);
    if (fallbackFromTurns.length === 0) {
      events = [createSnapshotEvent(resolvedIdea.id, resolvedIdea.phase, resolvedIdea.readiness, Date.now())];
    } else {
      events = fallbackFromTurns;
    }
  }

  const sorted = [...events].sort((left, right) => left.at - right.at || (left.sourceSeq ?? 0) - (right.sourceSeq ?? 0));
  const total = sorted.length;
  const page = sorted.slice(cursorIndex, cursorIndex + pageLimit);
  const nextCursor = cursorIndex + page.length < total
    ? String(cursorIndex + page.length)
    : null;

  return {
    ideaId: resolvedIdea.id,
    events: page,
    cursor: cursor ?? null,
    nextCursor,
    totalEvents: total,
    boundedToSeq: Math.max(0, boardHistoryState.cursor),
  };
}

async function listBoardChangeSets(boardId: string): Promise<ChangeSetRecord[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('changeSets', 'byBoardId', boardId);
  return all.sort((left: ChangeSetRecord, right: ChangeSetRecord) => left.seq - right.seq);
}

function normalizeCursor(cursor?: string): number {
  const value = Number.parseInt(cursor ?? '0', 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit ?? Number.NaN)) return DEFAULT_LIMIT;
  const clamped = Math.floor(limit as number);
  if (clamped < MIN_LIMIT) return MIN_LIMIT;
  if (clamped > MAX_LIMIT) return MAX_LIMIT;
  return clamped;
}

function derivePhaseHistoryFromChangeSets(
  changeSets: ChangeSetRecord[],
  boardId: string,
  ideaId: string,
  maxSeq: number,
): IdeaPhaseHistoryEvent[] {
  return changeSets
    .filter(changeSet => changeSet.boardId === boardId && changeSet.status === 'committed' && changeSet.seq <= maxSeq)
    .flatMap(changeSet => eventsFromChangeSet(changeSet, ideaId));
}

function eventsFromChangeSet(changeSet: ChangeSetRecord, ideaId: string): IdeaPhaseHistoryEvent[] {
  const forwardPatch = findIdeaPatch(changeSet.forward, ideaId);
  const inversePatch = findIdeaPatch(changeSet.inverse, ideaId);
  if (!forwardPatch && !inversePatch) return [];

  const before = extractIdeaSnapshot(inversePatch);
  const after = extractIdeaSnapshot(forwardPatch);
  const base = createChangeEventBase(changeSet, ideaId);
  const events: IdeaPhaseHistoryEvent[] = [];

  const phaseReadinessEvent = buildPhaseReadinessEvent(base, before, after);
  if (phaseReadinessEvent) events.push(phaseReadinessEvent);

  const ambiguityEvent = buildAmbiguityEvent(base, before, after);
  if (ambiguityEvent) events.push(ambiguityEvent);

  const ruleEvent = buildRuleEvent(base, before, after);
  if (ruleEvent) events.push(ruleEvent);

  const riskEvent = buildRiskEvent(base, before, after);
  if (riskEvent) events.push(riskEvent);

  const stressEvent = buildStressEvent(base, before, after);
  if (stressEvent) events.push(stressEvent);

  const beadEvent = buildBeadEvent(base, before, after);
  if (beadEvent) events.push(beadEvent);

  const nextStepEvent = buildNextStepEvent(base, before, after);
  if (nextStepEvent) events.push(nextStepEvent);

  return events;
}

function createChangeEventBase(changeSet: ChangeSetRecord, ideaId: string): ChangeEventBase {
  return {
    ideaId,
    source: 'change_set',
    sourceSeq: changeSet.seq,
    sourceId: changeSet.id,
    actor: changeSet.actor,
    at: changeSet.committedAt,
  };
}

function buildPhaseReadinessEvent(
  base: ChangeEventBase,
  before: IdeaStateSnapshot,
  after: IdeaStateSnapshot,
): IdeaPhaseHistoryEvent | undefined {
  const changedPhase = before.phase !== after.phase;
  const changedReadiness = before.readiness !== after.readiness;
  if (!changedPhase && !changedReadiness) return undefined;

  return {
    ...base,
    eventKind: changedPhase && changedReadiness ? 'both' : changedPhase ? 'phase' : 'readiness',
    changeKinds: changedPhase && changedReadiness ? ['phase', 'readiness'] : [changedPhase ? 'phase' : 'readiness'],
    fromPhase: before.phase,
    toPhase: after.phase,
    fromReadiness: before.readiness,
    toReadiness: after.readiness,
    summary: buildPhaseReadinessSummary(before, after),
  };
}

function buildAmbiguityEvent(
  base: ChangeEventBase,
  before: IdeaStateSnapshot,
  after: IdeaStateSnapshot,
): IdeaPhaseHistoryEvent | undefined {
  const diff = diffAmbiguities(before.ambiguities, after.ambiguities);
  if (!hasAmbiguityDiff(diff)) return undefined;

  return {
    ...base,
    eventKind: 'ambiguity',
    changeKinds: ['ambiguity'],
    fromPhase: before.phase,
    toPhase: after.phase,
    fromReadiness: before.readiness,
    toReadiness: after.readiness,
    summary: buildAmbiguitySummary(diff),
  };
}

function buildRuleEvent(
  base: ChangeEventBase,
  before: IdeaStateSnapshot,
  after: IdeaStateSnapshot,
): IdeaPhaseHistoryEvent | undefined {
  const diff = diffStringList(before.mustStayTrueRules, after.mustStayTrueRules);
  if (!hasCountDiff(diff)) return undefined;

  return {
    ...base,
    eventKind: 'rule',
    changeKinds: ['rule'],
    fromPhase: before.phase,
    toPhase: after.phase,
    fromReadiness: before.readiness,
    toReadiness: after.readiness,
    summary: buildCountSummary('Rules updated', diff),
  };
}

function buildRiskEvent(
  base: ChangeEventBase,
  before: IdeaStateSnapshot,
  after: IdeaStateSnapshot,
): IdeaPhaseHistoryEvent | undefined {
  const diff = diffRisks(before.risks, after.risks);
  if (!hasCountDiff(diff)) return undefined;

  return {
    ...base,
    eventKind: 'risk',
    changeKinds: ['risk'],
    fromPhase: before.phase,
    toPhase: after.phase,
    fromReadiness: before.readiness,
    toReadiness: after.readiness,
    summary: buildCountSummary('Risk register updated', diff),
  };
}

function buildStressEvent(
  base: ChangeEventBase,
  before: IdeaStateSnapshot,
  after: IdeaStateSnapshot,
): IdeaPhaseHistoryEvent | undefined {
  const diff = diffStressResults(before.stressResults, after.stressResults);
  if (!hasStressDiff(diff)) return undefined;

  return {
    ...base,
    eventKind: 'stress',
    changeKinds: ['stress'],
    fromPhase: before.phase,
    toPhase: after.phase,
    fromReadiness: before.readiness,
    toReadiness: after.readiness,
    summary: buildStressSummary(diff),
  };
}

function buildBeadEvent(
  base: ChangeEventBase,
  before: IdeaStateSnapshot,
  after: IdeaStateSnapshot,
): IdeaPhaseHistoryEvent | undefined {
  const summary = buildBeadCoordinationSummary(before.beadCoordination, after.beadCoordination);
  if (!summary) return undefined;

  return {
    ...base,
    eventKind: 'bead',
    changeKinds: ['bead'],
    fromPhase: before.phase,
    toPhase: after.phase,
    fromReadiness: before.readiness,
    toReadiness: after.readiness,
    summary,
  };
}

function buildNextStepEvent(
  base: ChangeEventBase,
  before: IdeaStateSnapshot,
  after: IdeaStateSnapshot,
): IdeaPhaseHistoryEvent | undefined {
  if (before.nextStep === after.nextStep) return undefined;

  const summary = after.nextStep
    ? before.nextStep
      ? `Next step changed from ${before.nextStep} to ${after.nextStep}.`
      : `Next step set to ${after.nextStep}.`
    : `Next step cleared from ${before.nextStep ?? 'unknown'}.`;

  return {
    ...base,
    eventKind: 'next_step',
    changeKinds: ['next_step'],
    fromPhase: before.phase,
    toPhase: after.phase,
    fromReadiness: before.readiness,
    toReadiness: after.readiness,
    summary,
  };
}

function derivePhaseHistoryFromTurns(boardId: string, ideaId: string): Promise<IdeaPhaseHistoryEvent[]> {
  return listIdeaTurns(boardId, ideaId).then(rows =>
    rows
      .flatMap(entry => eventsFromTurnEntry(entry, ideaId))
      .filter((value): value is IdeaPhaseHistoryEvent => Boolean(value)),
  );
}

function eventsFromTurnEntry(entry: ChangeSourceTurn, ideaId: string): IdeaPhaseHistoryEvent[] {
  const content = entry.content;
  const stepMatch = content.match(/\[Step\s+([0-9]+(?:\.[0-5])?)\]/i);
  const explicitPhaseMatch = content.match(/phase\s+(?:changed\s+from\s+([0-9]+(?:\.[0-5])?)\s+to\s+([0-9]+(?:\.[0-5])?))/i);
  const readinessMatch = content.match(/\b(readiness)\s+(?:changed\s+from\s+)?(red|yellow|green)(?:\s+to\s+(red|yellow|green))?/i);

  const events: IdeaPhaseHistoryEvent[] = [];

  if (stepMatch) {
    const step = Number.parseFloat(stepMatch[1] ?? '');
    const fromPhase = Number.isFinite(step) ? step : null;
    const toPhase = Number.isFinite(step) ? STEP_TO_NEXT_PHASE[String(step)] ?? null : null;
    if (toPhase !== null) {
      const details = fromPhase === null
        ? `Advanced from phase log step ${stepMatch[1]} to ${toPhase}.`
        : `Advanced from phase ${fromPhase} to ${toPhase} via ${content}.`;
      events.push({
        ideaId,
        source: 'turn_log',
        sourceSeq: entry.seq,
        sourceId: null,
        actor: actorFromTurnRole(entry.role),
        at: entry.createdAt,
        eventKind: 'phase',
        changeKinds: ['phase'],
        fromPhase,
        toPhase,
        fromReadiness: null,
        toReadiness: null,
        summary: details,
      });
    }
  }

  if (explicitPhaseMatch) {
    const beforeText = explicitPhaseMatch[1];
    const afterText = explicitPhaseMatch[2];
    const fromPhase = textToPhase(beforeText);
    const toPhase = textToPhase(afterText);
    if (toPhase !== null) {
      events.push({
        ideaId,
        source: 'turn_log',
        sourceSeq: entry.seq,
        sourceId: null,
        actor: actorFromTurnRole(entry.role),
        at: entry.createdAt,
        eventKind: 'phase',
        changeKinds: ['phase'],
        fromPhase,
        toPhase,
        fromReadiness: null,
        toReadiness: null,
        summary: `Phase changed from ${fromPhase ?? 'unknown'} to ${toPhase}.`,
      });
    }
  }

  if (readinessMatch) {
    const from = parseReadiness(readinessMatch[2]);
    const to = parseReadiness(readinessMatch[3]);
    if (from && to && from !== to) {
      events.push({
        ideaId,
        source: 'turn_log',
        sourceSeq: entry.seq,
        sourceId: null,
        actor: actorFromTurnRole(entry.role),
        at: entry.createdAt,
        eventKind: 'readiness',
        changeKinds: ['readiness'],
        fromPhase: null,
        toPhase: null,
        fromReadiness: from,
        toReadiness: to,
        summary: `Readiness changed from ${from} to ${to}.`,
      });
    }
  }

  return events;
}

async function listIdeaTurns(boardId: string, ideaId: string): Promise<ChangeSourceTurn[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('turns', 'byIdeaId', ideaId);
  return all
    .filter((row: IdeaTurnRecord) => row.boardId === boardId)
    .sort((left: IdeaTurnRecord, right: IdeaTurnRecord) => left.sequence - right.sequence)
    .map(row => ({
      seq: row.sequence,
      role: row.role,
      content: row.content,
      createdAt: row.createdAt,
    }));
}

function findIdeaPatch(ops: readonly BoardPatchOp[], ideaId: string): BoardPatchOp | undefined {
  return ops.find(op => op.path === `/stores/ideas/${ideaId}` && ['add', 'replace', 'remove'].includes(op.op));
}

function extractIdeaSnapshot(op: BoardPatchOp | undefined): IdeaStateSnapshot {
  if (!op || op.op === 'remove' || !op.value || typeof op.value !== 'object') {
    return emptyIdeaSnapshot();
  }

  const value = op.value as Partial<Idea>;
  const briefState = value.briefState && typeof value.briefState === 'object'
    ? value.briefState as Idea['briefState']
    : undefined;

  return {
    phase: parsePhase(value.phase),
    readiness: parseReadiness(value.readiness),
    ambiguities: Array.isArray(value.ambiguities) ? value.ambiguities : [],
    mustStayTrueRules: Array.isArray(briefState?.mustStayTrueRules) ? briefState.mustStayTrueRules : [],
    risks: Array.isArray(briefState?.risks) ? briefState.risks : [],
    stressResults: Array.isArray(briefState?.stressResults) ? briefState.stressResults : [],
    beadCoordination: normalizeBeadCoordination(value.beadCoordination),
    nextStep: parseNextStep(briefState?.nextStep),
  };
}

function emptyIdeaSnapshot(): IdeaStateSnapshot {
  return {
    phase: null,
    readiness: null,
    ambiguities: [],
    mustStayTrueRules: [],
    risks: [],
    stressResults: [],
    beadCoordination: normalizeBeadCoordination(undefined),
    nextStep: null,
  };
}

function parsePhase(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function parseReadiness(value: unknown): IdeaReadiness | null {
  if (value === 'red' || value === 'yellow' || value === 'green') return value;
  return null;
}

function parseNextStep(value: unknown): Idea['briefState']['nextStep'] | null {
  if (
    value === 'planning'
    || value === 'prototyping'
    || value === 'research'
    || value === 'stakeholder_review'
    || value === 'defer'
  ) {
    return value;
  }
  return null;
}

function textToPhase(value: string | undefined): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildPhaseReadinessSummary(before: IdeaStateSnapshot, after: IdeaStateSnapshot): string {
  const changedPhase = before.phase !== after.phase;
  const changedReadiness = before.readiness !== after.readiness;

  if (changedPhase && changedReadiness) {
    return `Changed phase ${before.phase} -> ${after.phase} and readiness ${before.readiness} -> ${after.readiness}.`;
  }

  if (changedPhase) {
    return `Changed phase ${before.phase} -> ${after.phase}.`;
  }

  return `Changed readiness ${before.readiness} -> ${after.readiness}.`;
}

function diffStringList(before: string[], after: string[]): CountDiff {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added = after.filter(item => !beforeSet.has(item)).length;
  const removed = before.filter(item => !afterSet.has(item)).length;
  const updated = before.length === after.length && added === 0 && removed === 0 ? 0 : 0;
  return { added, removed, updated };
}

function diffAmbiguities(before: Idea['ambiguities'], after: Idea['ambiguities']): AmbiguityDiff {
  const beforeById = new Map(before.map(entry => [entry.id, entry]));
  const afterById = new Map(after.map(entry => [entry.id, entry]));
  const diff: AmbiguityDiff = {
    added: 0,
    removed: 0,
    resolved: 0,
    deferred: 0,
    dismissed: 0,
    reopened: 0,
    noted: 0,
    metadataChanged: 0,
  };

  for (const [id, entry] of afterById) {
    const previous = beforeById.get(id);
    if (!previous) {
      diff.added += 1;
      continue;
    }

    const previousStatus = previous.resolution?.status ?? 'open';
    const nextStatus = entry.resolution?.status ?? 'open';
    if (previousStatus !== nextStatus) {
      if (nextStatus === 'resolved') diff.resolved += 1;
      if (nextStatus === 'deferred') diff.deferred += 1;
      if (nextStatus === 'dismissed') diff.dismissed += 1;
      if (nextStatus === 'open') diff.reopened += 1;
    }

    const previousNote = previous.resolution?.note ?? '';
    const nextNote = entry.resolution?.note ?? '';
    if (previousNote !== nextNote) {
      diff.noted += 1;
    }

    if (
      previous.plainLanguage !== entry.plainLanguage
      || previous.severity !== entry.severity
      || previous.resolutionMode !== entry.resolutionMode
      || previous.type !== entry.type
    ) {
      diff.metadataChanged += 1;
    }
  }

  for (const id of beforeById.keys()) {
    if (!afterById.has(id)) {
      diff.removed += 1;
    }
  }

  return diff;
}

function diffRisks(before: Idea['briefState']['risks'], after: Idea['briefState']['risks']): CountDiff {
  const beforeById = new Map(before.map(entry => [entry.id, entry]));
  const afterById = new Map(after.map(entry => [entry.id, entry]));
  let added = 0;
  let removed = 0;
  let updated = 0;

  for (const [id, entry] of afterById) {
    const previous = beforeById.get(id);
    if (!previous) {
      added += 1;
      continue;
    }
    if (
      previous.description !== entry.description
      || previous.likelihood !== entry.likelihood
      || previous.impact !== entry.impact
      || (previous.userNote ?? '') !== (entry.userNote ?? '')
      || (previous.sourceQuestionId ?? '') !== (entry.sourceQuestionId ?? '')
      || (previous.sourceQuestion ?? '') !== (entry.sourceQuestion ?? '')
    ) {
      updated += 1;
    }
  }

  for (const id of beforeById.keys()) {
    if (!afterById.has(id)) {
      removed += 1;
    }
  }

  return { added, removed, updated };
}

function diffStressResults(
  before: Idea['briefState']['stressResults'],
  after: Idea['briefState']['stressResults'],
): StressDiff {
  const beforeById = new Map(before.map(entry => [entry.id, entry]));
  const afterById = new Map(after.map(entry => [entry.id, entry]));
  const diff: StressDiff = {
    added: 0,
    removed: 0,
    handledChanged: 0,
    responseChanged: 0,
    updated: 0,
  };

  for (const [id, entry] of afterById) {
    const previous = beforeById.get(id);
    if (!previous) {
      diff.added += 1;
      continue;
    }

    if (previous.handled !== entry.handled) {
      diff.handledChanged += 1;
    }
    if ((previous.userResponse ?? '') !== (entry.userResponse ?? '')) {
      diff.responseChanged += 1;
    }
    if (
      previous.edgeCase !== entry.edgeCase
      || previous.breakMode !== entry.breakMode
      || previous.ruleIndex !== entry.ruleIndex
    ) {
      diff.updated += 1;
    }
  }

  for (const id of beforeById.keys()) {
    if (!afterById.has(id)) {
      diff.removed += 1;
    }
  }

  return diff;
}

function buildBeadCoordinationSummary(
  before: Idea['beadCoordination'],
  after: Idea['beadCoordination'],
): string | null {
  const beforeState = normalizeBeadCoordination(before);
  const afterState = normalizeBeadCoordination(after);
  const parts: string[] = [];

  const beforeSuggestion = beforeState.suggestedNext ?? null;
  const afterSuggestion = afterState.suggestedNext ?? null;
  if (!sameSuggestion(beforeSuggestion, afterSuggestion)) {
    if (afterSuggestion && !beforeSuggestion) {
      parts.push(`Suggested bead ${afterSuggestion.phase}.`);
    } else if (!afterSuggestion && beforeSuggestion) {
      parts.push(`Cleared suggestion for bead ${beforeSuggestion.phase}.`);
    } else if (afterSuggestion && beforeSuggestion) {
      parts.push(`Changed suggestion from bead ${beforeSuggestion.phase} to ${afterSuggestion.phase}.`);
    }
  }

  const reviewDiff = diffBeadReviewFlags(beforeState.reviewFlags, afterState.reviewFlags);
  if (reviewDiff.added > 0 || reviewDiff.removed > 0 || reviewDiff.updated > 0) {
    parts.push(buildCountSummary('Bead review flags updated', reviewDiff));
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

function sameSuggestion(
  left: BeadSuggestion | null,
  right: BeadSuggestion | null,
): boolean {
  return (
    (left?.phase ?? null) === (right?.phase ?? null)
    && (left?.reason ?? '') === (right?.reason ?? '')
    && (left?.actorType ?? '') === (right?.actorType ?? '')
    && (left?.actorSource ?? '') === (right?.actorSource ?? '')
    && (left?.actorLabel ?? '') === (right?.actorLabel ?? '')
  );
}

function diffBeadReviewFlags(
  before: BeadReviewFlag[],
  after: BeadReviewFlag[],
): CountDiff {
  const beforeById = new Map(before.map(entry => [entry.id, entry]));
  const afterById = new Map(after.map(entry => [entry.id, entry]));
  const diff: CountDiff = { added: 0, removed: 0, updated: 0 };

  for (const [id, entry] of afterById) {
    const previous = beforeById.get(id);
    if (!previous) {
      diff.added += 1;
      continue;
    }
    if (
      previous.phase !== entry.phase
      || previous.reason !== entry.reason
      || previous.actorType !== entry.actorType
      || previous.actorSource !== entry.actorSource
      || (previous.actorLabel ?? '') !== (entry.actorLabel ?? '')
    ) {
      diff.updated += 1;
    }
  }

  for (const id of beforeById.keys()) {
    if (!afterById.has(id)) diff.removed += 1;
  }

  return diff;
}

function hasCountDiff(diff: CountDiff): boolean {
  return diff.added > 0 || diff.removed > 0 || diff.updated > 0;
}

function hasAmbiguityDiff(diff: AmbiguityDiff): boolean {
  return (
    diff.added > 0
    || diff.removed > 0
    || diff.resolved > 0
    || diff.deferred > 0
    || diff.dismissed > 0
    || diff.reopened > 0
    || diff.noted > 0
    || diff.metadataChanged > 0
  );
}

function hasStressDiff(diff: StressDiff): boolean {
  return diff.added > 0 || diff.removed > 0 || diff.handledChanged > 0 || diff.responseChanged > 0 || diff.updated > 0;
}

function buildCountSummary(prefix: string, diff: CountDiff): string {
  const parts = formatCountParts([
    ['added', diff.added],
    ['removed', diff.removed],
    ['updated', diff.updated],
  ]);
  return parts.length > 0 ? `${prefix}: ${parts.join(', ')}.` : `${prefix}.`;
}

function buildAmbiguitySummary(diff: AmbiguityDiff): string {
  const parts = formatCountParts([
    ['added', diff.added],
    ['removed', diff.removed],
    ['resolved', diff.resolved],
    ['deferred', diff.deferred],
    ['dismissed', diff.dismissed],
    ['reopened', diff.reopened],
    ['noted', diff.noted],
    ['updated', diff.metadataChanged],
  ]);
  return parts.length > 0 ? `Ambiguity state updated: ${parts.join(', ')}.` : 'Ambiguity state updated.';
}

function buildStressSummary(diff: StressDiff): string {
  const parts = formatCountParts([
    ['added', diff.added],
    ['removed', diff.removed],
    ['handled changed', diff.handledChanged],
    ['responses updated', diff.responseChanged],
    ['details updated', diff.updated],
  ]);
  return parts.length > 0 ? `Stress state updated: ${parts.join(', ')}.` : 'Stress state updated.';
}

function formatCountParts(parts: Array<[string, number]>): string[] {
  return parts
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${count} ${label}`);
}

function actorFromTurnRole(role: IdeaTurnRecord['role']): IdeaPhaseHistoryActor {
  if (role === 'user') {
    return { type: 'user', source: 'workspace', label: 'turn-log' };
  }
  if (role === 'assistant') {
    return { type: 'ai', source: 'system', label: 'turn-log' };
  }
  return { type: 'system', source: 'system', label: 'turn-log' };
}

function createSnapshotEvent(
  ideaId: string,
  phase: number,
  readiness: IdeaReadiness,
  at: number,
): IdeaPhaseHistoryEvent {
  return {
    ideaId,
    source: 'change_set',
    sourceSeq: null,
    sourceId: null,
    actor: { type: 'system', source: 'system', label: 'derived-snapshot' },
    at,
    eventKind: 'both',
    changeKinds: ['phase', 'readiness'],
    fromPhase: null,
    toPhase: phase,
    fromReadiness: null,
    toReadiness: readiness,
    summary: `Current snapshot: phase ${phase}, readiness ${readiness}.`,
  };
}
