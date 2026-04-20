import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { BeatRunState } from '../../src/beats/types';
import type { FacilitatorAiAction } from '../../src/storage/facilitatorSync';
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
  selectCritiqueTarget,
  selectPendingScoutIdeaId,
} from './companionAutomationObserverTargets';
const AUTO_SEQUENCE_GAP_MS = 850;
const AUTO_CRITIQUE_COOLDOWN_MS = 45_000;
export const AUTO_IDLE_MS = 1_500;
type RevealOrigin = 'manual' | 'ai';
const createAutoCooldownState = (): AutoCooldownState => ({
  lastConnectionsAt: 0,
  lastScoutAt: 0,
  lastAiActionAt: 0,
  lastObservedBoardChangeAt: 0,
  critiqueByIdea: {},
});
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
  connectionsCount: number;
  suggestionsCount: number;
  docCounts: Record<string, number>;
  selectedBoardIdea: Idea | null;
  activeCritiques: IdeaCritique[];
  runScout: (options?: { origin?: RevealOrigin; limitNew?: number; source?: 'canvas' | 'webmcp' | 'beat'; automationKey?: string }) => Promise<unknown[]>;
  runConnectionFinder: (options?: { origin?: RevealOrigin; limitGenerated?: number; source?: 'canvas' | 'webmcp' | 'beat' }) => Promise<Connection[]>;
  runCritiqueIdea: (ideaId: string, options?: { origin?: RevealOrigin; source?: 'canvas' | 'webmcp' | 'beat'; automationKey?: string }) => Promise<IdeaCritique | null>;
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
  connectionsCount,
  suggestionsCount,
  docCounts,
  selectedBoardIdea,
  activeCritiques,
  runScout,
  runConnectionFinder,
  runCritiqueIdea,
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
    if (
      effectiveFacilitatorPaused ||
      !isAiHost ||
      softModeBusy ||
      interactionSuppressed ||
      !pendingBoardChange ||
      idleSinceBoardChangeMs < AUTO_IDLE_MS
    ) return;
    let cancelled = false;

    async function runObserver(): Promise<void> {
      const now = Date.now();
      const auto = autoCooldownRef.current;
      if (now - auto.lastAiActionAt < AUTO_SEQUENCE_GAP_MS) return;
      auto.lastObservedBoardChangeAt = latestSyncedBoardChangeAt;

      if (pendingConnectionIdeaIdsRef.current.length >= 3 && now - auto.lastConnectionsAt >= 30_000) {
        auto.lastConnectionsAt = now;
        pendingConnectionIdeaIdsRef.current = [];
        const found = await runConnectionFinder({ origin: 'ai', limitGenerated: 1 });
        if (!cancelled && found.length > 0) {
          recordAiAction(autoCooldownRef, setAiActions, 'connect', undefined, now);
          recordSharedAiAction({ kind: 'connect', at: now });
        }
        return;
      }

      const critiqueTarget = selectCritiqueTarget({ visibleIdeas, selectedBoardIdea, activeCritiques });
      if (critiqueTarget) {
        const lastCritiqueAt = auto.critiqueByIdea[critiqueTarget.id] ?? 0;
        const critiqueAllowed = now - lastCritiqueAt >= AUTO_CRITIQUE_COOLDOWN_MS;
        if (critiqueAllowed) {
          auto.critiqueByIdea[critiqueTarget.id] = now;
          const critique = await runCritiqueIdea(critiqueTarget.id, {
            origin: 'ai',
            automationKey: observerAutomationKey('critique', critiqueTarget.id),
          }).catch(() => null);
          if (critique) {
            if (!cancelled) {
              recordAiAction(autoCooldownRef, setAiActions, 'critique', critiqueTarget.id, now);
              recordSharedAiAction({ kind: 'critique', ideaId: critiqueTarget.id, at: now });
            }
            return;
          }
        }
      }
      const doclessIdeaId = selectPendingScoutIdeaId(pendingScoutIdeaIdsRef.current, docCounts);
      if (doclessIdeaId && now - auto.lastScoutAt >= 45_000) {
        auto.lastScoutAt = now;
        pendingScoutIdeaIdsRef.current = pendingScoutIdeaIdsRef.current.filter(id => id !== doclessIdeaId);
        const created = await runScout({
          origin: 'ai',
          limitNew: 1,
          automationKey: observerAutomationKey('scout', doclessIdeaId),
        });
        if (!cancelled && created.length > 0) {
          recordAiAction(autoCooldownRef, setAiActions, 'scout', doclessIdeaId, now);
          recordSharedAiAction({ kind: 'scout', ideaId: doclessIdeaId, at: now });
        }
      }
    }
    void runObserver();
    return () => {
      cancelled = true;
    };
  }, [
    effectiveFacilitatorPaused,
    isAiHost,
    softModeBusy,
    interactionSuppressed,
    pendingBoardChange,
    idleSinceBoardChangeMs,
    latestSyncedBoardChangeAt,
    visibleIdeas,
    docCounts,
    selectedBoardIdea,
    activeCritiques,
    runConnectionFinder,
    runCritiqueIdea,
    runScout,
    recordSharedAiAction,
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
