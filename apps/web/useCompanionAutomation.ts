import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { BeatRunState } from '../../src/beats/types';
import type {
  FacilitatorAiAction,
  FacilitatorAiActionOutcomeRecord,
  FacilitatorAutonomyState,
  FacilitatorSessionEvent,
} from '../../src/storage/facilitatorSync';
import type {
  FacilitatorActionExecutionMode,
  FacilitatorInterventionStrength,
  FacilitatorRoleId,
} from '../../src/storage/facilitatorSyncEvents';
import type { Connection, Idea, IdeaCritique } from '../../src/types';
import {
  actionLabelFor,
  applySharedAiAction,
  latestMeaningfulActivity,
  recordAiAction,
  type AutoCooldownState,
  type RecentAiAction,
} from './companionAutomationShared';
import {
  dismissSoftModeHint,
  inferSoftMode,
  recordActivity,
  shouldShowSoftModeHint,
  type ActivityState,
} from './softMode';
import {
  consumeSharedObserverWork,
  observerAutomationKey,
  reconcilePendingObserverWork,
} from './companionAutomationObserverTargets';
import {
  buildFacilitatorControlPlaneContext,
  decideCompanionAutomationAction,
} from './facilitatorPolicy';
export const AUTO_IDLE_MS = 1_500;
type RevealOrigin = 'manual' | 'ai';
type AutomatedRunOptions = {
  origin?: RevealOrigin;
  source?: 'canvas' | 'webmcp' | 'beat';
  automationKey?: string;
  executionMode?: FacilitatorActionExecutionMode;
  interventionStrength?: FacilitatorInterventionStrength;
  role?: FacilitatorRoleId;
  policyReason?: string;
};
const createAutoCooldownState = (): AutoCooldownState => ({
  lastConnectionsAt: 0,
  lastScoutAt: 0,
  lastAiActionAt: 0,
  lastObservedBoardChangeAt: 0,
  critiqueByIdea: {},
});

function nextEffectiveModeForBackoff(
  configuredCeiling: FacilitatorAutonomyState['configuredCeiling'],
  rejectedCount: number,
): FacilitatorAutonomyState['effectiveMode'] {
  if (rejectedCount >= 4) return 'shadow';
  switch (configuredCeiling) {
    case 'challenger':
      return 'copilot';
    case 'copilot':
    case 'passive':
    default:
      return 'shadow';
  }
}

function summarizeStagedScout(rawText: string): string {
  return rawText.length <= 90 ? rawText : `${rawText.slice(0, 89)}...`;
}

function summarizeStagedCritique(critique: string): string {
  return critique.length <= 90 ? critique : `${critique.slice(0, 89)}...`;
}
interface UseCompanionAutomationArgs {
  activity: ActivityState;
  setActivity: Dispatch<SetStateAction<ActivityState>>;
  dragActive: boolean;
  textEntryActive: boolean;
  activeBeatRun: BeatRunState | null;
  persistedFacilitatorPaused: boolean;
  persistFacilitatorPaused: (paused: boolean) => Promise<void>;
  sharedFacilitatorPaused: boolean;
  isAiHost: boolean;
  syncBoardChangeAt: number;
  sharedAiAction: FacilitatorAiAction | null;
  setSharedFacilitatorPause: (paused: boolean) => void;
  recordSharedAiAction: (action: Omit<FacilitatorAiAction, 'at' | 'id'> & { at?: number; id?: string }) => void;
  scouting: boolean;
  findingConnections: boolean;
  critiqueBusyByIdea: Record<string, boolean>;
  visibleIdeas: Idea[];
  discardedIdeasCount: number;
  connectionsCount: number;
  suggestionsCount: number;
  docCounts: Record<string, number>;
  selectedBoardIdea: Idea | null;
  activeCritiques: IdeaCritique[];
  recentSessionEvents?: FacilitatorSessionEvent[];
  autonomyState: FacilitatorAutonomyState;
  recentAiActionOutcomes?: FacilitatorAiActionOutcomeRecord[];
  runScout: (options?: AutomatedRunOptions & { limitNew?: number }) => Promise<unknown[]>;
  runConnectionFinder: (options?: AutomatedRunOptions & { limitGenerated?: number }) => Promise<Connection[]>;
  runCritiqueIdea: (ideaId: string, options?: AutomatedRunOptions) => Promise<IdeaCritique | null>;
  setAutonomyEffectiveMode: (effectiveMode: FacilitatorAutonomyState['effectiveMode']) => void;
  setAutonomyBackoffState: (
    backoffStatus: FacilitatorAutonomyState['backoffStatus'],
    backoffUntil: number,
  ) => void;
  recordRecoverySignal: (reason: string) => void;
  addStagedInsight: (insight: {
    id?: string;
    sourceActionId: string;
    summary: string;
    kind?: 'scout' | 'critique' | 'connection' | 'tool_suggestion' | 'generic';
    at?: number;
    source?: string;
    beadId?: string;
    ideaId?: string;
    payload?: Record<string, unknown>;
    status?: 'pending' | 'accepted' | 'rejected';
  }) => void;
}

export function useCompanionAutomation({
  activity,
  setActivity,
  dragActive,
  textEntryActive,
  activeBeatRun,
  persistedFacilitatorPaused,
  persistFacilitatorPaused,
  sharedFacilitatorPaused,
  isAiHost,
  syncBoardChangeAt,
  sharedAiAction,
  setSharedFacilitatorPause,
  recordSharedAiAction,
  scouting,
  findingConnections,
  critiqueBusyByIdea,
  visibleIdeas,
  discardedIdeasCount,
  connectionsCount,
  suggestionsCount,
  docCounts,
  selectedBoardIdea,
  activeCritiques,
  recentSessionEvents,
  autonomyState,
  recentAiActionOutcomes,
  runScout,
  runConnectionFinder,
  runCritiqueIdea,
  setAutonomyEffectiveMode,
  setAutonomyBackoffState,
  recordRecoverySignal,
  addStagedInsight,
}: UseCompanionAutomationArgs) {
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [facilitatorPaused, setFacilitatorPaused] = useState(persistedFacilitatorPaused);
  const [aiActions, setAiActions] = useState<RecentAiAction[]>([]);
  const autoCooldownRef = useRef<AutoCooldownState>(createAutoCooldownState());
  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setFacilitatorPaused(persistedFacilitatorPaused);
  }, [persistedFacilitatorPaused]);
  const previousVisibleIdeaIdsRef = useRef<Set<string>>(new Set());
  const pendingConnectionIdeaIdsRef = useRef<string[]>([]);
  const pendingScoutIdeaIdsRef = useRef<string[]>([]);
  const idleMs = Math.max(0, clockMs - activity.lastInteractionAt);
  const lastMeaningfulActivity = latestMeaningfulActivity(activity);
  const effectiveFacilitatorPaused = facilitatorPaused || sharedFacilitatorPaused;
  const latestSyncedBoardChangeAt = syncBoardChangeAt;
  const idleSinceBoardChangeMs = latestSyncedBoardChangeAt > 0
    ? Math.max(0, clockMs - latestSyncedBoardChangeAt)
    : 0;
  const softModeAssessment = inferSoftMode({
    ideaCount: visibleIdeas.length,
    editCount: activity.recentEdits.length,
    groupingCount: activity.recentGroups.length,
    idleMs,
    docIdeasCount: Object.values(docCounts).filter(count => count > 0).length,
    connectionCount: connectionsCount,
    activeCritiqueCount: activeCritiques.length,
  });
  const interactionSuppressed = dragActive || textEntryActive;
  const softModeBusy = scouting || findingConnections || Object.values(critiqueBusyByIdea).some(Boolean);
  const pendingBoardChange = latestSyncedBoardChangeAt > autoCooldownRef.current.lastObservedBoardChangeAt;
  const autoRunReady = pendingBoardChange && idleSinceBoardChangeMs >= AUTO_IDLE_MS;
  const showSoftModeHint = shouldShowSoftModeHint({
    assessment: softModeAssessment,
    idleMs,
    lastDismissedAt: activity.lastDismissedAt,
    now: clockMs,
  }) && !softModeBusy && !interactionSuppressed;

  function buildPolicyContext(now: number) {
    return buildFacilitatorControlPlaneContext({
      now,
      idleMs,
      pendingBoardChange,
      autoRunReady,
      interactionSuppressed,
      softModeBusy,
      isAiHost,
      effectiveFacilitatorPaused,
      cooldowns: autoCooldownRef.current,
      pendingConnectionIdeaIds: pendingConnectionIdeaIdsRef.current,
      pendingScoutIdeaIds: pendingScoutIdeaIdsRef.current,
      docCounts,
      visibleIdeas,
      discardedIdeaCount: discardedIdeasCount,
      suggestionCount: suggestionsCount,
      selectedBoardIdea,
      activeCritiques,
      lastMeaningfulActivity,
      recentSessionEvents,
      autonomyState,
      recentAiActionOutcomes,
    });
  }

  const policyDecision = decideCompanionAutomationAction(buildPolicyContext(clockMs));
  const previousPhaseRef = useRef<{ ideaId: string | null; phase: number | null }>({ ideaId: null, phase: null });

  useEffect(() => {
    const recentWindow = (recentAiActionOutcomes ?? []).slice(0, 5);
    const rejectedCount = recentWindow.filter(item => item.outcome === 'rejected').length;
    const acceptedCount = recentWindow.filter(item => item.outcome === 'accepted').length;
    const now = Date.now();

    if (acceptedCount > 0 && autonomyState.backoffStatus !== 'clear') {
      recordRecoverySignal('A recent acceptance reopened the lane.');
      return;
    }

    if (rejectedCount >= 3) {
      const nextBackoffStatus = rejectedCount >= 4 ? 'shadow' : 'cooldown';
      const nextEffectiveMode = nextEffectiveModeForBackoff(autonomyState.configuredCeiling, rejectedCount);
      if (
        autonomyState.backoffStatus !== nextBackoffStatus
        || autonomyState.backoffUntil <= now
        || autonomyState.effectiveMode !== nextEffectiveMode
      ) {
        setAutonomyEffectiveMode(nextEffectiveMode);
        setAutonomyBackoffState(nextBackoffStatus, now + 2 * 60_000);
      }
      return;
    }

    if (autonomyState.backoffStatus !== 'clear' && autonomyState.backoffUntil <= now) {
      recordRecoverySignal('Backoff expired.');
      return;
    }

    if (autonomyState.backoffStatus === 'clear' && autonomyState.effectiveMode !== autonomyState.configuredCeiling) {
      setAutonomyEffectiveMode(autonomyState.configuredCeiling);
    }
  }, [
    autonomyState.backoffStatus,
    autonomyState.backoffUntil,
    autonomyState.configuredCeiling,
    autonomyState.effectiveMode,
    recentAiActionOutcomes,
    recordRecoverySignal,
    setAutonomyBackoffState,
    setAutonomyEffectiveMode,
  ]);

  useEffect(() => {
    const previous = previousPhaseRef.current;
    const nextIdeaId = selectedBoardIdea?.id ?? null;
    const nextPhase = selectedBoardIdea?.phase ?? null;
    if (previous.ideaId === nextIdeaId && previous.phase !== null && nextPhase !== null && nextPhase > previous.phase) {
      recordRecoverySignal(`Idea ${nextIdeaId} advanced to phase ${nextPhase}.`);
    }
    previousPhaseRef.current = { ideaId: nextIdeaId, phase: nextPhase };
  }, [recordRecoverySignal, selectedBoardIdea?.id, selectedBoardIdea?.phase]);

  useEffect(() => {
    const pendingWork = reconcilePendingObserverWork({
      visibleIdeas,
      previousVisibleIdeaIds: previousVisibleIdeaIdsRef.current,
      pendingWork: { connectionIdeaIds: pendingConnectionIdeaIdsRef.current, scoutIdeaIds: pendingScoutIdeaIdsRef.current },
      docCounts,
      trackNewIdeas: latestSyncedBoardChangeAt > 0,
    });
    pendingConnectionIdeaIdsRef.current = pendingWork.connectionIdeaIds;
    pendingScoutIdeaIdsRef.current = pendingWork.scoutIdeaIds;
    previousVisibleIdeaIdsRef.current = new Set(visibleIdeas.map(idea => idea.id));
  }, [docCounts, latestSyncedBoardChangeAt, visibleIdeas]);
  async function handleSoftModeAction(): Promise<void> {
    setActivity(prev => dismissSoftModeHint(recordActivity(prev, 'edit')));
    recordRecoverySignal('Explicit pull from the facilitator dock.');
    if (latestSyncedBoardChangeAt > 0) {
      autoCooldownRef.current.lastObservedBoardChangeAt = Math.max(
        autoCooldownRef.current.lastObservedBoardChangeAt,
        latestSyncedBoardChangeAt,
      );
    }
    if (softModeAssessment.inferredMode === 'explore') {
      await runScout();
      return;
    }
    if (softModeAssessment.inferredMode === 'structure') {
      await runConnectionFinder();
      return;
    }
    if (softModeAssessment.inferredMode === 'stress') {
      const targetIdeaId = selectedBoardIdea?.id ?? visibleIdeas[0]?.id;
      if (targetIdeaId) await runCritiqueIdea(targetIdeaId);
    }
  }
  const companionActionLabel = actionLabelFor(softModeAssessment.inferredMode, !!(selectedBoardIdea || visibleIdeas[0]));
  useEffect(() => {
    if (!activeBeatRun || latestSyncedBoardChangeAt === 0) return;
    autoCooldownRef.current.lastObservedBoardChangeAt = Math.max(
      autoCooldownRef.current.lastObservedBoardChangeAt,
      latestSyncedBoardChangeAt,
    );
  }, [activeBeatRun, latestSyncedBoardChangeAt]);

  useEffect(() => {
    applySharedAiAction(autoCooldownRef, sharedAiAction);
    const pendingWork = consumeSharedObserverWork(
      { connectionIdeaIds: pendingConnectionIdeaIdsRef.current, scoutIdeaIds: pendingScoutIdeaIdsRef.current },
      sharedAiAction,
    );
    pendingConnectionIdeaIdsRef.current = pendingWork.connectionIdeaIds;
    pendingScoutIdeaIdsRef.current = pendingWork.scoutIdeaIds;
  }, [sharedAiAction]);
  useEffect(() => {
    if (!pendingBoardChange) return;
    let cancelled = false;

    async function runObserver(): Promise<void> {
      const now = Date.now();
      const auto = autoCooldownRef.current;
      const decision = decideCompanionAutomationAction(buildPolicyContext(now));
      if (decision.consumePendingChange) {
        auto.lastObservedBoardChangeAt = latestSyncedBoardChangeAt;
      }
      if (!decision.action) return;

      if (decision.action === 'connect') {
        auto.lastConnectionsAt = now;
        pendingConnectionIdeaIdsRef.current = [];
        const found = await runConnectionFinder({
          origin: 'ai',
          limitGenerated: 1,
          executionMode: decision.executionMode,
          interventionStrength: decision.interventionStrength,
          role: decision.role,
          policyReason: decision.reason,
        });
        if (!cancelled && found.length > 0) {
          recordAiAction(autoCooldownRef, setAiActions, 'connect', undefined, now);
          const actionId = crypto.randomUUID();
          if (decision.disposition === 'stage') {
            const insightId = crypto.randomUUID();
            addStagedInsight({
              id: insightId,
              at: now,
              sourceActionId: actionId,
              kind: 'connection',
              summary: `Connection draft: ${found[0]?.rationale ?? 'New structural link'}`,
              source: 'Synthesizer',
              payload: {
                drafts: found.map(connection => ({
                  ideaIds: connection.ideaIds,
                  kind: connection.kind,
                  rationale: connection.rationale,
                  strength: connection.strength,
                  supportingDocIds: connection.supportingDocIds,
                })),
              },
              status: 'pending',
            });
            recordSharedAiAction({
              id: actionId,
              kind: 'connect',
              at: now,
              role: decision.role,
              executionMode: decision.executionMode,
              interventionStrength: decision.interventionStrength,
              policyReason: decision.reason,
              confidenceScore: decision.confidenceScore,
              pendingInsightIds: [insightId],
            });
            return;
          }
          recordSharedAiAction({
            id: actionId,
            kind: 'connect',
            at: now,
            role: decision.role,
            executionMode: decision.executionMode,
            interventionStrength: decision.interventionStrength,
            policyReason: decision.reason,
            confidenceScore: decision.confidenceScore,
            entityIds: found.map(connection => connection.id),
          });
        }
        return;
      }

      if (decision.action === 'critique' && decision.targetIdeaId) {
        auto.critiqueByIdea[decision.targetIdeaId] = now;
        const critique = await runCritiqueIdea(decision.targetIdeaId, {
          origin: 'ai',
          automationKey: observerAutomationKey('critique', decision.targetIdeaId),
          executionMode: decision.executionMode,
          interventionStrength: decision.interventionStrength,
          role: decision.role,
          policyReason: decision.reason,
        }).catch(() => null);
        if (!cancelled && critique) {
          recordAiAction(autoCooldownRef, setAiActions, 'critique', decision.targetIdeaId, now);
          const actionId = crypto.randomUUID();
          if (decision.disposition === 'stage') {
            const insightId = crypto.randomUUID();
            addStagedInsight({
              id: insightId,
              at: now,
              sourceActionId: actionId,
              kind: 'critique',
              ideaId: decision.targetIdeaId,
              summary: summarizeStagedCritique(critique.critique),
              source: 'Challenger',
              payload: {
                ideaId: critique.ideaId,
                critique: critique.critique,
                evidenceAsk: critique.evidenceAsk,
              },
              status: 'pending',
            });
            recordSharedAiAction({
              id: actionId,
              kind: 'critique',
              ideaId: decision.targetIdeaId,
              at: now,
              role: decision.role,
              executionMode: decision.executionMode,
              interventionStrength: decision.interventionStrength,
              policyReason: decision.reason,
              confidenceScore: decision.confidenceScore,
              pendingInsightIds: [insightId],
            });
            return;
          }
          recordSharedAiAction({
            id: actionId,
            kind: 'critique',
            ideaId: decision.targetIdeaId,
            at: now,
            role: decision.role,
            executionMode: decision.executionMode,
            interventionStrength: decision.interventionStrength,
            policyReason: decision.reason,
            confidenceScore: decision.confidenceScore,
            entityIds: [critique.id],
          });
        }
        return;
      }

      if (decision.action === 'scout' && decision.targetIdeaId) {
        auto.lastScoutAt = now;
        pendingScoutIdeaIdsRef.current = pendingScoutIdeaIdsRef.current.filter(id => id !== decision.targetIdeaId);
        const created = await runScout({
          origin: 'ai',
          limitNew: 1,
          automationKey: observerAutomationKey('scout', decision.targetIdeaId),
          executionMode: decision.executionMode,
          interventionStrength: decision.interventionStrength,
          role: decision.role,
          policyReason: decision.reason,
        });
        if (!cancelled && created.length > 0) {
          recordAiAction(autoCooldownRef, setAiActions, 'scout', decision.targetIdeaId, now);
          const actionId = crypto.randomUUID();
          if (decision.disposition === 'stage') {
            const insightId = crypto.randomUUID();
            addStagedInsight({
              id: insightId,
              at: now,
              sourceActionId: actionId,
              kind: 'scout',
              ideaId: decision.targetIdeaId,
              summary: summarizeStagedScout((created[0] as { rawText?: string }).rawText ?? 'Scout draft'),
              source: 'Scout',
              payload: {
                drafts: created.map(candidate => ({
                  rawText: (candidate as { rawText?: string }).rawText ?? '',
                  rationale: (candidate as { rationale?: string }).rationale ?? '',
                  source: (candidate as { source?: string }).source ?? 'Scout draft',
                  sourceIdeaIds: (candidate as { sourceIdeaIds?: string[] }).sourceIdeaIds,
                  relatedIdeaIds: (candidate as { relatedIdeaIds?: string[] }).relatedIdeaIds,
                })),
              },
              status: 'pending',
            });
            recordSharedAiAction({
              id: actionId,
              kind: 'scout',
              ideaId: decision.targetIdeaId,
              at: now,
              role: decision.role,
              executionMode: decision.executionMode,
              interventionStrength: decision.interventionStrength,
              policyReason: decision.reason,
              confidenceScore: decision.confidenceScore,
              pendingInsightIds: [insightId],
            });
            return;
          }
          recordSharedAiAction({
            id: actionId,
            kind: 'scout',
            ideaId: decision.targetIdeaId,
            at: now,
            role: decision.role,
            executionMode: decision.executionMode,
            interventionStrength: decision.interventionStrength,
            policyReason: decision.reason,
            confidenceScore: decision.confidenceScore,
            entityIds: created
              .map(candidate => (candidate as { id?: string }).id)
              .filter((id): id is string => typeof id === 'string'),
          });
        }
      }
    }
    void runObserver();
    return () => {
      cancelled = true;
    };
  }, [
    pendingBoardChange,
    latestSyncedBoardChangeAt,
    idleMs,
    visibleIdeas,
    discardedIdeasCount,
    docCounts,
    selectedBoardIdea,
    activeCritiques,
    recentSessionEvents,
    runConnectionFinder,
    runCritiqueIdea,
    runScout,
    recordSharedAiAction,
    addStagedInsight,
    effectiveFacilitatorPaused,
    isAiHost,
    softModeBusy,
    interactionSuppressed,
    autoRunReady,
    lastMeaningfulActivity,
    recordRecoverySignal,
    recentAiActionOutcomes,
    autonomyState,
    setAutonomyBackoffState,
    setAutonomyEffectiveMode,
  ]);

  return {
    facilitatorPaused: effectiveFacilitatorPaused,
    idleMs,
    softModeAssessment,
    interactionSuppressed,
    softModeBusy,
    lastMeaningfulActivity,
    pendingBoardChange,
    autoRunReady,
    autoRunCountdownMs: pendingBoardChange ? Math.max(0, AUTO_IDLE_MS - idleSinceBoardChangeMs) : AUTO_IDLE_MS,
    showSoftModeHint,
    companionActionLabel,
    policyDecision,
    handleSoftModeAction,
    toggleFacilitatorPause: async () => {
      const previousLocalPause = facilitatorPaused;
      const next = !effectiveFacilitatorPaused;
      setFacilitatorPaused(next);
      try {
        await persistFacilitatorPaused(next);
        setSharedFacilitatorPause(next);
      } catch {
        setFacilitatorPaused(previousLocalPause);
      }
    },
    lastAiAction: aiActions[0],
    dismissHint: () => setActivity(prev => dismissSoftModeHint(prev)),
  };
}
