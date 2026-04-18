import { useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { BeatName } from '../../src/beats/types';
import type { Connection, Idea, IdeaCritique } from '../../src/types';
import {
  dismissSoftModeHint,
  inferSoftMode,
  recordActivity,
  shouldShowSoftModeHint,
  type ActivityState,
} from './softMode';

const AUTO_SEQUENCE_GAP_MS = 850;
const AUTO_CRITIQUE_COOLDOWN_MS = 45_000;

export const AUTO_IDLE_MS = 1_500;

type RevealOrigin = 'manual' | 'ai';

interface RecentAiAction {
  kind: Extract<BeatName, 'connect' | 'scout' | 'critique'>;
  createdAt: number;
  ideaId?: string;
}

interface UseCompanionAutomationArgs {
  activity: ActivityState;
  setActivity: Dispatch<SetStateAction<ActivityState>>;
  dragActive: boolean;
  textEntryActive: boolean;
  scouting: boolean;
  findingConnections: boolean;
  critiqueBusyByIdea: Record<string, boolean>;
  visibleIdeas: Idea[];
  connectionsCount: number;
  suggestionsCount: number;
  docCounts: Record<string, number>;
  selectedBoardIdea: Idea | null;
  activeCritiques: IdeaCritique[];
  runScout: (options?: {
    origin?: RevealOrigin;
    limitNew?: number;
    source?: 'canvas' | 'webmcp' | 'beat';
  }) => Promise<unknown[]>;
  runConnectionFinder: (options?: {
    origin?: RevealOrigin;
    limitGenerated?: number;
    source?: 'canvas' | 'webmcp' | 'beat';
  }) => Promise<Connection[]>;
  runCritiqueIdea: (
    ideaId: string,
    options?: { origin?: RevealOrigin; source?: 'canvas' | 'webmcp' | 'beat' },
  ) => Promise<IdeaCritique | null>;
}

export function useCompanionAutomation({
  activity,
  setActivity,
  dragActive,
  textEntryActive,
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
  const [facilitatorPaused, setFacilitatorPaused] = useState(false);
  const [aiActions, setAiActions] = useState<RecentAiAction[]>([]);
  const autoCooldownRef = useRef({
    lastConnectionsAt: 0,
    lastScoutAt: 0,
    lastAiActionAt: 0,
    critiqueByIdea: {} as Record<string, number>,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const idleMs = Math.max(0, clockMs - activity.lastInteractionAt);
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
  const showSoftModeHint = shouldShowSoftModeHint({
    assessment: softModeAssessment,
    idleMs,
    lastDismissedAt: activity.lastDismissedAt,
    now: clockMs,
  }) && !softModeBusy && !interactionSuppressed;

  async function handleSoftModeAction(): Promise<void> {
    setActivity(prev => dismissSoftModeHint(recordActivity(prev, 'edit')));

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
    if (facilitatorPaused || softModeBusy || interactionSuppressed || idleMs < AUTO_IDLE_MS) return;

    let cancelled = false;

    async function runObserver(): Promise<void> {
      const now = Date.now();
      const auto = autoCooldownRef.current;
      if (now - auto.lastAiActionAt < AUTO_SEQUENCE_GAP_MS) return;

      if (visibleIdeas.length >= 3 && connectionsCount === 0 && now - auto.lastConnectionsAt >= 30_000) {
        auto.lastConnectionsAt = now;
        const found = await runConnectionFinder({ origin: 'ai', limitGenerated: 1 });
        if (!cancelled && found.length > 0) {
          recordAiAction(autoCooldownRef, setAiActions, 'connect');
        }
        return;
      }

      const critiqueTarget = selectedBoardIdea ?? visibleIdeas.find(idea => (docCounts[idea.id] ?? 0) > 0) ?? visibleIdeas[0];
      if (critiqueTarget) {
        const critiquesForIdea = activeCritiques.filter(critique => critique.ideaId === critiqueTarget.id);
        const lastCritiqueAt = auto.critiqueByIdea[critiqueTarget.id] ?? 0;
        const critiqueAllowed = critiquesForIdea.length < 2 && now - lastCritiqueAt >= AUTO_CRITIQUE_COOLDOWN_MS;

        if (critiqueAllowed) {
          const critique = await runCritiqueIdea(critiqueTarget.id, { origin: 'ai' }).catch(() => null);
          if (critique) {
            auto.critiqueByIdea[critiqueTarget.id] = now;
            if (!cancelled) {
              recordAiAction(autoCooldownRef, setAiActions, 'critique', critiqueTarget.id);
            }
            return;
          }
        }
      }

      const doclessIdea = visibleIdeas.find(idea => (docCounts[idea.id] ?? 0) === 0);
      if (doclessIdea && suggestionsCount === 0 && now - auto.lastScoutAt >= 45_000) {
        auto.lastScoutAt = now;
        const created = await runScout({ origin: 'ai', limitNew: 1 });
        if (!cancelled && created.length > 0) {
          recordAiAction(autoCooldownRef, setAiActions, 'scout', doclessIdea.id);
        }
      }
    }

    void runObserver();

    return () => {
      cancelled = true;
    };
  }, [
    facilitatorPaused,
    softModeBusy,
    interactionSuppressed,
    idleMs,
    visibleIdeas,
    connectionsCount,
    suggestionsCount,
    docCounts,
    selectedBoardIdea,
    activeCritiques,
    runConnectionFinder,
    runCritiqueIdea,
    runScout,
  ]);

  return {
    facilitatorPaused,
    idleMs,
    softModeAssessment,
    interactionSuppressed,
    softModeBusy,
    showSoftModeHint,
    companionActionLabel,
    handleSoftModeAction,
    toggleFacilitatorPause: () => setFacilitatorPaused(value => !value),
    lastAiAction: aiActions[0],
    dismissHint: () => setActivity(prev => dismissSoftModeHint(prev)),
  };
}

function actionLabelFor(mode: ReturnType<typeof inferSoftMode>['inferredMode'], hasCritiqueTarget: boolean): string | undefined {
  switch (mode) {
    case 'explore':
      return 'Run scout';
    case 'structure':
      return 'Find links';
    case 'stress':
      return hasCritiqueTarget ? 'Stress-test idea' : undefined;
    case 'converge':
    default:
      return undefined;
  }
}

function recordAiAction(
  autoCooldownRef: MutableRefObject<{
    lastConnectionsAt: number;
    lastScoutAt: number;
    lastAiActionAt: number;
    critiqueByIdea: Record<string, number>;
  }>,
  setAiActions: Dispatch<SetStateAction<RecentAiAction[]>>,
  kind: RecentAiAction['kind'],
  ideaId?: string,
): void {
  const action: RecentAiAction = {
    kind,
    createdAt: Date.now(),
    ideaId,
  };
  autoCooldownRef.current.lastAiActionAt = action.createdAt;
  setAiActions(prev => [action, ...prev].slice(0, 5));
}
