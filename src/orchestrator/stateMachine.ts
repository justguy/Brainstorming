import type {
  Idea,
  LlmMessage,
  BriefState,
  ProviderId,
  ActiveTabToolContext,
  LensEntry,
  ChallengeEntry,
  StressResult,
  AmbiguityResolutionStatus,
} from '../types';
import { buildPayload, payloadToMessages } from './ctmcp';
import { getSettings } from '../storage/settings';
import { callWithRetry } from './retryAndFallback';
import { queryActiveTabTools } from '../webmcp/contextBridge';
import { SUB_PHASES, findSubPhase, nextPhaseNumber } from './subPhases';
import { listDocsForIdea } from '../storage/docs';

// Merge a briefUpdate (Partial<BriefState>) into the existing briefState
function mergeBriefState(existing: BriefState, update: Partial<BriefState>): BriefState {
  return {
    ...existing,
    ...update,
    mustStayTrueRules:
      update.mustStayTrueRules && update.mustStayTrueRules.length > 0
        ? update.mustStayTrueRules
        : existing.mustStayTrueRules,
    approaches:
      update.approaches && update.approaches.length > 0
        ? update.approaches
        : existing.approaches,
    rejectedApproaches: [
      ...existing.rejectedApproaches,
      ...(update.rejectedApproaches ?? []),
    ],
    risks:
      update.risks && update.risks.length > 0 ? update.risks : existing.risks,
    successCriteria:
      update.successCriteria && update.successCriteria.length > 0
        ? update.successCriteria
        : existing.successCriteria,
    outOfScope:
      update.outOfScope && update.outOfScope.length > 0
        ? update.outOfScope
        : existing.outOfScope,
    openQuestions:
      update.openQuestions && update.openQuestions.length > 0
        ? update.openQuestions
        : existing.openQuestions,
    lenses: update.lenses ?? existing.lenses,
    challenges: update.challenges ?? existing.challenges,
    stressResults: update.stressResults ?? existing.stressResults,
  };
}

export interface AmbiguityResolutionInput {
  ambiguityId: string;
  status: Exclude<AmbiguityResolutionStatus, 'open'> | 'open';
  note?: string;
  resolvedBy?: string;
  resolvedAt?: number;
}

export function applyAmbiguityResolution(
  idea: Idea,
  input: AmbiguityResolutionInput,
): Idea {
  const now = input.resolvedAt ?? Date.now();
  let updated = false;
  const nextAmbiguities = idea.ambiguities.map(ambiguity => {
    if (ambiguity.id !== input.ambiguityId) {
      return ambiguity;
    }
    updated = true;
    return {
      ...ambiguity,
      resolution: {
        status: input.status,
        note: input.note,
        resolvedBy: input.resolvedBy,
        resolvedAt: now,
      },
    };
  });

  if (!updated) {
    throw new Error(`No ambiguity found with id "${input.ambiguityId}"`);
  }

  return {
    ...idea,
    ambiguities: nextAmbiguities,
  };
}

function normalizeAmbiguity(ambiguity: Idea['ambiguities'][number]): Idea['ambiguities'][number] {
  if (ambiguity.resolution?.status) return ambiguity;
  return {
    ...ambiguity,
    resolution: {
      status: 'open',
    },
  };
}

/**
 * Advance the idea through its current sub-phase. If `skip=true`, move to the
 * next sub-phase without running the LLM role (only valid for skippable micros).
 */
export async function advance(idea: Idea, userInput?: string, skip = false): Promise<Idea> {
  const spec = findSubPhase(idea.phase);
  if (!spec) {
    return { ...idea, status: 'ready_for_handoff' };
  }

  // Handle skip: only permitted on skippable micro steps. Advance without running.
  if (skip) {
    if (!spec.skippable) {
      throw new Error(`Sub-phase ${spec.id} (${spec.number}) is not skippable.`);
    }
    const now = Date.now();
    return {
      ...idea,
      phase: nextPhaseNumber(idea.phase),
      updatedAt: now,
      lastTurnAt: now,
      turnLog: [
        ...idea.turnLog,
        { role: 'system', content: `[Step ${spec.number}] Skipped ${spec.id}` },
      ],
    };
  }

  // Terminal step (number 8) has no role — just flip status.
  if (!spec.role) {
    return { ...idea, status: 'ready_for_handoff', phase: 8 };
  }

  const role = spec.role;

  let activeProvider: ProviderId = 'gemini';
  let activeModel = 'gemini-2.5-pro';
  try {
    const settings = await getSettings();
    activeProvider = settings.activeProvider;
    activeModel = settings.activeModel;
  } catch (e) {
    console.warn('[stateMachine] Could not load settings, using defaults:', e);
  }

  // Query active tab for WebMCP tools on early phases only.
  let liveToolContext: ActiveTabToolContext | undefined = idea.liveToolContext;
  const mainPhase = Math.floor(idea.phase);
  if ((mainPhase === 0 || mainPhase === 1) && !idea.liveToolContext) {
    try {
      const ctx = await queryActiveTabTools();
      if (ctx && ctx.tools.length > 0) liveToolContext = ctx;
    } catch (e) {
      console.debug('[stateMachine] WebMCP query failed (non-fatal):', e);
    }
  }

  // Load user-attached supporting docs for this idea so the role can reference
  // the refined facts. Failures here are non-fatal — we just skip the section.
  let supportingDocs: Awaited<ReturnType<typeof listDocsForIdea>> = [];
  try {
    supportingDocs = await listDocsForIdea(idea.id);
  } catch (e) {
    console.debug('[stateMachine] Could not load supporting docs (non-fatal):', e);
  }

  const task = role.buildTask(idea, userInput);
  const payload = buildPayload(role, idea, task, liveToolContext, supportingDocs);
  const messages = payloadToMessages(payload);

  const outgoingLog: LlmMessage[] = [
    { role: 'system', content: `[Step ${spec.number}] Running role: ${role.id}` },
    { role: 'user', content: task },
  ];

  const { result, usedFallback } = await callWithRetry({
    providerId: activeProvider,
    model: activeModel,
    messages,
    jsonSchema: role.jsonSchema,
    maxTokens: 4096,
    schema: role.schema,
    onFallback: () => console.warn(`[stateMachine] Fallback triggered for ${role.id}`),
  });

  if (usedFallback || result === null) {
    const now = Date.now();
    const sentinelLog: LlmMessage = {
      role: 'assistant',
      content: `[FALLBACK] Role ${role.id} failed after retries. Manual input required.`,
    };
    return {
      ...idea,
      readiness: spec.kind === 'micro' ? idea.readiness : 'yellow',
      updatedAt: now,
      lastTurnAt: now,
      turnLog: [...idea.turnLog, ...outgoingLog, sentinelLog],
    };
  }

  const now = Date.now();
  const baseUpdate: Idea = {
    ...idea,
    updatedAt: now,
    lastTurnAt: now,
    providerUsed: activeProvider,
    turnLog: [
      ...idea.turnLog,
      ...outgoingLog,
      { role: 'assistant', content: JSON.stringify(result) },
    ],
  };

  const nextPhase = nextPhaseNumber(idea.phase);
  let updated: Idea = baseUpdate;

  switch (spec.id) {
    case 'ambiguity': {
      updated = {
        ...baseUpdate,
        ambiguities: (result.ambiguities ?? []).map(normalizeAmbiguity),
        phase: nextPhase,
        status: 'in_progress',
        ...(liveToolContext && !idea.liveToolContext ? { liveToolContext } : {}),
      };
      break;
    }

    case 'lens': {
      const incoming: LensEntry[] = (result.lenses ?? []).map((l: Omit<LensEntry, 'verdict'>) => ({
        ...l,
        verdict: 'pending' as const,
      }));
      updated = {
        ...baseUpdate,
        briefState: {
          ...idea.briefState,
          lenses: [...idea.briefState.lenses, ...incoming],
        },
        phase: nextPhase,
      };
      break;
    }

    case 'clarify': {
      const existingIds = new Set(idea.clarifications.map(c => c.id));
      const newQuestions = (result.questions ?? []).filter(
        (q: { id: string }) => !existingIds.has(q.id),
      );
      updated = {
        ...baseUpdate,
        clarifications: [...idea.clarifications, ...newQuestions],
        phase: nextPhase,
      };
      break;
    }

    case 'approach': {
      const approaches = result.approaches ?? [];
      const chosen = approaches.find((a: { rejectionReason?: string }) => !a.rejectionReason);
      const rejected = approaches.filter((a: { rejectionReason?: string }) => !!a.rejectionReason);
      updated = {
        ...baseUpdate,
        briefState: {
          ...idea.briefState,
          approaches: chosen ? [chosen] : approaches,
          rejectedApproaches: [...idea.briefState.rejectedApproaches, ...rejected],
          chosenApproachId: chosen?.id ?? idea.briefState.chosenApproachId,
        },
        phase: nextPhase,
      };
      break;
    }

    case 'devils': {
      const incoming: ChallengeEntry[] = (result.challenges ?? []).map((c: Omit<ChallengeEntry, 'stance'>) => ({
        ...c,
        stance: 'pending' as const,
      }));
      updated = {
        ...baseUpdate,
        briefState: {
          ...idea.briefState,
          challenges: [...idea.briefState.challenges, ...incoming],
        },
        phase: nextPhase,
      };
      break;
    }

    case 'rules': {
      updated = {
        ...baseUpdate,
        briefState: {
          ...idea.briefState,
          mustStayTrueRules: result.rules ?? idea.briefState.mustStayTrueRules,
        },
        phase: nextPhase,
      };
      break;
    }

    case 'premortem': {
      updated = {
        ...baseUpdate,
        briefState: {
          ...idea.briefState,
          risks: result.risks ?? idea.briefState.risks,
          openQuestions: [
            ...idea.briefState.openQuestions,
            ...(result.failureModes ?? []),
          ],
        },
        phase: nextPhase,
      };
      break;
    }

    case 'stress': {
      const incoming: StressResult[] = (result.stressResults ?? []).map((s: Omit<StressResult, 'handled'>) => ({
        ...s,
        handled: false,
      }));
      updated = {
        ...baseUpdate,
        briefState: {
          ...idea.briefState,
          stressResults: [...idea.briefState.stressResults, ...incoming],
        },
        phase: nextPhase,
      };
      break;
    }

    case 'brief': {
      updated = {
        ...baseUpdate,
        briefState: mergeBriefState(idea.briefState, result.briefUpdate ?? {}),
        artifactMd: result.artifactMd ?? idea.artifactMd,
        phase: nextPhase,
      };
      break;
    }

    case 'review': {
      const reviewIssues: string[] = [
        ...(result.contradictions ?? []).map((s: string) => `[CONTRADICTION] ${s}`),
        ...(result.gaps ?? []).map((s: string) => `[GAP] ${s}`),
        ...(result.blockers ?? []).map((s: string) => `[BLOCKER] ${s}`),
      ];
      updated = {
        ...baseUpdate,
        briefState: {
          ...idea.briefState,
          openQuestions: [...idea.briefState.openQuestions, ...reviewIssues],
        },
        phase: nextPhase,
        readiness: result.blockers?.length > 0 ? 'yellow' : idea.readiness,
      };
      break;
    }

    case 'readiness': {
      updated = {
        ...baseUpdate,
        briefState: {
          ...idea.briefState,
          nextStep: result.recommendedNext ?? idea.briefState.nextStep,
          openQuestions: result.ready
            ? idea.briefState.openQuestions
            : [...idea.briefState.openQuestions, ...(result.blockers ?? [])],
        },
        readiness: result.ready ? 'green' : 'yellow',
        status: result.ready ? 'ready_for_handoff' : 'in_progress',
        phase: nextPhase,
      };
      break;
    }

    default:
      updated = { ...baseUpdate, phase: nextPhase };
      break;
  }

  return updated;
}

export function derivePhase(idea: Idea): number {
  return idea.phase;
}

export { SUB_PHASES };
