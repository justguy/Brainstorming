import { useEffect, useState } from 'react';
import type { BoardId } from '../../src/types';
import {
  clearFacilitatorPeer,
  heartbeatFacilitatorPeer,
  addFacilitatorStagedInsight,
  recordFacilitatorRecoverySignal,
  removeFacilitatorStagedInsightRecord,
  setAutonomyBackoffState,
  setAutonomyConfiguredCeiling,
  setAutonomyEffectiveMode,
  markFacilitatorAiActionOutcome,
  markFacilitatorAiActionOutcomeForEntity,
  markFacilitatorAiActionOutcomeForPendingInsight,
  observeFacilitatorSnapshot,
  recordFacilitatorAiAction,
  type FacilitatorAiActionOutcome,
  setSharedFacilitatorPause,
  type FacilitatorAiAction,
  type FacilitatorStagedInsight,
  type FacilitatorSnapshot,
} from '../../src/storage/facilitatorSync';

const HEARTBEAT_MS = 2_000;

const EMPTY_SNAPSHOT: FacilitatorSnapshot = {
  localClientId: null,
  hostClientId: null,
  manualHostClientId: null,
  isAiHost: false,
  sharedPause: false,
  autonomyState: {
    configuredCeiling: 'copilot',
    effectiveMode: 'copilot',
    backoffStatus: 'clear',
    backoffUntil: 0,
  },
  lastBoardActivityAt: 0,
  lastAiAction: null,
  lastBoardMutation: null,
  recentAiActionOutcomes: [],
  stagedInsights: [],
  peers: [],
};

export function useFacilitatorSync(boardId: BoardId, localPaused: boolean) {
  const [snapshot, setSnapshot] = useState<FacilitatorSnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => observeFacilitatorSnapshot(boardId, setSnapshot), [boardId]);

  useEffect(() => {
    const heartbeat = () => heartbeatFacilitatorPeer(boardId, !localPaused);
    heartbeat();
    const timer = window.setInterval(heartbeat, HEARTBEAT_MS);
    return () => {
      window.clearInterval(timer);
      clearFacilitatorPeer(boardId);
    };
  }, [boardId, localPaused]);

  return {
    ...snapshot,
    setSharedPause: (paused: boolean) => setSharedFacilitatorPause(boardId, paused),
    recordAiAction: (action: Omit<FacilitatorAiAction, 'at' | 'id'> & { at?: number; id?: string }) => {
      recordFacilitatorAiAction(boardId, action);
    },
    setAutonomyConfiguredCeiling: (configuredCeiling: FacilitatorSnapshot['autonomyState']['configuredCeiling']) => {
      setAutonomyConfiguredCeiling(boardId, configuredCeiling);
    },
    setAutonomyEffectiveMode: (effectiveMode: FacilitatorSnapshot['autonomyState']['effectiveMode']) => {
      setAutonomyEffectiveMode(boardId, effectiveMode);
    },
    setAutonomyBackoffState: (
      backoffStatus: FacilitatorSnapshot['autonomyState']['backoffStatus'],
      backoffUntil: number,
    ) => {
      setAutonomyBackoffState(boardId, backoffStatus, backoffUntil);
    },
    setAiActionOutcome: (
      action: Pick<FacilitatorAiAction, 'id'>,
      outcome: FacilitatorAiActionOutcome,
    ) => {
      markFacilitatorAiActionOutcome(boardId, action.id, outcome);
    },
    setAiActionOutcomeForEntity: (
      entityId: string,
      outcome: FacilitatorAiActionOutcome,
    ) => {
      markFacilitatorAiActionOutcomeForEntity(boardId, entityId, outcome);
    },
    setAiActionOutcomeForPendingInsight: (
      insightId: string,
      outcome: FacilitatorAiActionOutcome,
    ) => {
      markFacilitatorAiActionOutcomeForPendingInsight(boardId, insightId, outcome);
    },
    recordRecoverySignal: (reason: string) => {
      recordFacilitatorRecoverySignal(boardId, reason);
    },
    addStagedInsight: (insight: {
      id?: string;
      sourceActionId: string;
      summary: string;
      kind?: FacilitatorStagedInsight['kind'];
      at?: number;
      source?: string;
      beadId?: string;
      ideaId?: string;
      payload?: Record<string, unknown>;
      status?: 'pending' | 'accepted' | 'rejected';
    }) => {
      addFacilitatorStagedInsight(boardId, {
        ...insight,
        kind: insight.kind ?? 'generic',
      });
    },
    removeStagedInsight: (insightId: string) => {
      removeFacilitatorStagedInsightRecord(boardId, insightId);
    },
  };
}
