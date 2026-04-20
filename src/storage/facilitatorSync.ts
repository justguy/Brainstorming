import type { BoardId } from '../types';
import {
  AI_SYNC_ORIGIN,
  BOOTSTRAP_SYNC_ORIGIN,
  FACILITATOR_SYNC_ORIGIN,
  getIdeaSyncDoc,
  getIdeaSyncFacilitatorMap,
  observeIdeaSyncUpdates,
  startIdeaSync,
  transactIdeaSync,
} from './ideaSync';
import {
  appendRecentFacilitatorEvent,
  appendFacilitatorStagedInsight,
  appendRecentAiActionOutcome,
  createAutonomyStatePatch,
  createFacilitatorAiActionOutcomeRecord,
  createFacilitatorEventFromAiAction,
  createFacilitatorEventFromBoardMutation,
  createFacilitatorStagedInsight,
  readAiActionOutcomes,
  readAutonomyState,
  readAiAction,
  readBoardMutation,
  readRecentFacilitatorEvents,
  readFacilitatorStagedInsights,
  removeFacilitatorStagedInsight,
  markAiActionOutcome,
  markAiActionOutcomeByEntityId,
  markAiActionOutcomeByPendingInsightId,
  type FacilitatorAiActionOutcome,
  type FacilitatorAiActionOutcomeRecord,
  type FacilitatorAiAction,
  type FacilitatorBoardMutation,
  type FacilitatorAutonomyState,
  type FacilitatorStagedInsight,
  type FacilitatorSessionEvent,
} from './facilitatorSyncEvents';
export type {
  FacilitatorAiAction,
  FacilitatorBoardMutation,
  FacilitatorSessionEvent,
  FacilitatorAutonomyState,
  FacilitatorAiActionOutcomeRecord,
  FacilitatorAiActionOutcome,
  FacilitatorStagedInsight,
} from './facilitatorSyncEvents';

const PEER_PREFIX = 'peer:';
const SHARED_PAUSE_KEY = 'sharedPause';
const MANUAL_HOST_KEY = 'manualHostClientId';
const LAST_AI_ACTION_KEY = 'lastAiAction';
const LAST_BOARD_MUTATION_KEY = 'lastBoardMutation';
const RECENT_SESSION_EVENTS_KEY = 'recentSessionEvents';
const AUTONOMY_STATE_KEY = 'autonomyState';
const AI_ACTION_OUTCOMES_KEY = 'recentAiActionOutcomes';
const STAGED_INSIGHTS_KEY = 'stagedInsights';
const PEER_STALE_MS = 6_000;

export interface FacilitatorPeerState {
  clientId: number;
  heartbeatAt: number;
  wantsAiHost: boolean;
}

export interface FacilitatorSnapshot {
  localClientId: number | null;
  hostClientId: number | null;
  manualHostClientId: number | null;
  isAiHost: boolean;
  sharedPause: boolean;
  autonomyState: FacilitatorAutonomyState;
  lastBoardActivityAt: number;
  lastAiAction: FacilitatorAiAction | null;
  lastBoardMutation: FacilitatorBoardMutation | null;
  recentSessionEvents?: FacilitatorSessionEvent[];
  recentAiActionOutcomes?: FacilitatorAiActionOutcomeRecord[];
  stagedInsights?: FacilitatorStagedInsight[];
  peers: FacilitatorPeerState[];
}

interface FacilitatorController {
  boardId: BoardId;
  lastBoardActivityAt: number;
  listeners: Set<(snapshot: FacilitatorSnapshot) => void>;
  unobserveSync: () => void;
}

const controllers = new Map<BoardId, FacilitatorController>();

export function observeFacilitatorSnapshot(
  boardId: BoardId,
  listener: (snapshot: FacilitatorSnapshot) => void,
): () => void {
  const controller = getFacilitatorController(boardId);
  controller.listeners.add(listener);
  listener(buildFacilitatorSnapshot(boardId, controller.lastBoardActivityAt));
  return () => {
    controller.listeners.delete(listener);
  };
}

export function getFacilitatorSnapshot(boardId: BoardId): FacilitatorSnapshot {
  const controller = getFacilitatorController(boardId);
  return buildFacilitatorSnapshot(boardId, controller.lastBoardActivityAt);
}

export function heartbeatFacilitatorPeer(
  boardId: BoardId,
  wantsAiHost: boolean,
): void {
  const doc = getIdeaSyncDoc(boardId);
  if (!doc) return;
  transactIdeaSync(boardId, (_innerDoc, facilitatorMap) => {
    facilitatorMap.set(`${PEER_PREFIX}${doc.clientID}`, {
      clientId: doc.clientID,
      heartbeatAt: Date.now(),
      wantsAiHost,
    } satisfies FacilitatorPeerState);
  }, FACILITATOR_SYNC_ORIGIN);
}

export function clearFacilitatorPeer(boardId: BoardId): void {
  const doc = getIdeaSyncDoc(boardId);
  if (!doc) return;
  transactIdeaSync(boardId, (_innerDoc, facilitatorMap) => {
    facilitatorMap.delete(`${PEER_PREFIX}${doc.clientID}`);
    if (facilitatorMap.get(MANUAL_HOST_KEY) === doc.clientID) {
      facilitatorMap.delete(MANUAL_HOST_KEY);
    }
  }, FACILITATOR_SYNC_ORIGIN);
}

export function setSharedFacilitatorPause(boardId: BoardId, paused: boolean): void {
  transactIdeaSync(boardId, (_innerDoc, facilitatorMap) => {
    facilitatorMap.set(SHARED_PAUSE_KEY, paused);
  }, FACILITATOR_SYNC_ORIGIN);
}

export function updateAutonomyState(
  boardId: BoardId,
  nextState: Partial<FacilitatorAutonomyState>,
): void {
  transactIdeaSync(boardId, (_innerDoc, facilitatorMap) => {
    const current = readAutonomyState(facilitatorMap.get(AUTONOMY_STATE_KEY));
    facilitatorMap.set(AUTONOMY_STATE_KEY, createAutonomyStatePatch(current, nextState));
  }, FACILITATOR_SYNC_ORIGIN);
}

export function setAutonomyConfiguredCeiling(
  boardId: BoardId,
  configuredCeiling: FacilitatorAutonomyState['configuredCeiling'],
): void {
  updateAutonomyState(boardId, { configuredCeiling });
}

export function setAutonomyEffectiveMode(
  boardId: BoardId,
  effectiveMode: FacilitatorAutonomyState['effectiveMode'],
): void {
  updateAutonomyState(boardId, { effectiveMode });
}

export function setAutonomyBackoffState(
  boardId: BoardId,
  backoffStatus: FacilitatorAutonomyState['backoffStatus'],
  backoffUntil: number,
): void {
  updateAutonomyState(boardId, { backoffStatus, backoffUntil });
}

export function clearAutonomyBackoff(
  boardId: BoardId,
): void {
  updateAutonomyState(boardId, { backoffStatus: 'clear', backoffUntil: 0 });
}

export function recordFacilitatorRecoverySignal(
  boardId: BoardId,
  reason: string,
): void {
  transactIdeaSync(boardId, (_innerDoc, facilitatorMap) => {
    const current = readAutonomyState(facilitatorMap.get(AUTONOMY_STATE_KEY));
    facilitatorMap.set(AUTONOMY_STATE_KEY, createAutonomyStatePatch(current, {
      backoffStatus: 'clear',
      backoffUntil: 0,
      ...(reason ? { effectiveMode: current.configuredCeiling } : {}),
    }));
  }, FACILITATOR_SYNC_ORIGIN);
}

export function markFacilitatorAiActionOutcome(
  boardId: BoardId,
  actionId: string,
  outcome: FacilitatorAiActionOutcome,
): void {
  transactIdeaSync(boardId, (_innerDoc, facilitatorMap) => {
    const currentOutcomes = readAiActionOutcomes(facilitatorMap.get(AI_ACTION_OUTCOMES_KEY));
    const nextOutcomeRecords = markAiActionOutcome(currentOutcomes, actionId, outcome);
    facilitatorMap.set(AI_ACTION_OUTCOMES_KEY, nextOutcomeRecords);
  }, FACILITATOR_SYNC_ORIGIN);
}

export function markFacilitatorAiActionOutcomeForEntity(
  boardId: BoardId,
  entityId: string,
  outcome: FacilitatorAiActionOutcome,
): void {
  transactIdeaSync(boardId, (_innerDoc, facilitatorMap) => {
    facilitatorMap.set(
      AI_ACTION_OUTCOMES_KEY,
      markAiActionOutcomeByEntityId(facilitatorMap.get(AI_ACTION_OUTCOMES_KEY), entityId, outcome),
    );
  }, FACILITATOR_SYNC_ORIGIN);
}

export function markFacilitatorAiActionOutcomeForPendingInsight(
  boardId: BoardId,
  insightId: string,
  outcome: FacilitatorAiActionOutcome,
): void {
  transactIdeaSync(boardId, (_innerDoc, facilitatorMap) => {
    facilitatorMap.set(
      AI_ACTION_OUTCOMES_KEY,
      markAiActionOutcomeByPendingInsightId(facilitatorMap.get(AI_ACTION_OUTCOMES_KEY), insightId, outcome),
    );
  }, FACILITATOR_SYNC_ORIGIN);
  if (outcome !== 'pending') {
    removeFacilitatorStagedInsightRecord(boardId, insightId);
  }
}

export function addFacilitatorStagedInsight(
  boardId: BoardId,
  insight: Omit<FacilitatorStagedInsight, 'id' | 'at'> & { id?: string; at?: number },
): void {
  transactIdeaSync(boardId, (_innerDoc, facilitatorMap) => {
    const nextInsight = createFacilitatorStagedInsight(insight);
    facilitatorMap.set(
      STAGED_INSIGHTS_KEY,
      appendFacilitatorStagedInsight(facilitatorMap.get(STAGED_INSIGHTS_KEY), nextInsight),
    );
  }, FACILITATOR_SYNC_ORIGIN);
}

export function removeFacilitatorStagedInsightRecord(boardId: BoardId, insightId: string): void {
  transactIdeaSync(boardId, (_innerDoc, facilitatorMap) => {
    facilitatorMap.set(
      STAGED_INSIGHTS_KEY,
      removeFacilitatorStagedInsight(facilitatorMap.get(STAGED_INSIGHTS_KEY), insightId),
    );
  }, FACILITATOR_SYNC_ORIGIN);
}

export function claimFacilitatorAiHost(boardId: BoardId): FacilitatorSnapshot | null {
  const snapshot = getFacilitatorSnapshot(boardId);
  if (snapshot.localClientId === null) return null;
  if (!snapshot.peers.some(peer => peer.clientId === snapshot.localClientId)) {
    return null;
  }
  transactIdeaSync(boardId, (_innerDoc, facilitatorMap) => {
    facilitatorMap.set(MANUAL_HOST_KEY, snapshot.localClientId);
  }, FACILITATOR_SYNC_ORIGIN);
  return getFacilitatorSnapshot(boardId);
}

export function releaseFacilitatorAiHost(boardId: BoardId): FacilitatorSnapshot | null {
  const snapshot = getFacilitatorSnapshot(boardId);
  if (snapshot.localClientId === null) return null;
  if (snapshot.manualHostClientId !== null && snapshot.manualHostClientId !== snapshot.localClientId) {
    return null;
  }
  transactIdeaSync(boardId, (_innerDoc, facilitatorMap) => {
    facilitatorMap.delete(MANUAL_HOST_KEY);
  }, FACILITATOR_SYNC_ORIGIN);
  return getFacilitatorSnapshot(boardId);
}

export function recordFacilitatorAiAction(
  boardId: BoardId,
  action: Omit<FacilitatorAiAction, 'at' | 'id' | 'clientId'> & { at?: number; id?: string },
): void {
  transactIdeaSync(boardId, (doc, facilitatorMap) => {
    const nextAction = {
      ...action,
      id: action.id ?? crypto.randomUUID(),
      at: action.at ?? Date.now(),
      clientId: doc.clientID,
    } satisfies FacilitatorAiAction;
    facilitatorMap.set(LAST_AI_ACTION_KEY, nextAction);
    facilitatorMap.set(
      AI_ACTION_OUTCOMES_KEY,
      appendRecentAiActionOutcome(
        facilitatorMap.get(AI_ACTION_OUTCOMES_KEY),
        createFacilitatorAiActionOutcomeRecord(nextAction),
      ),
    );
    facilitatorMap.set(
      RECENT_SESSION_EVENTS_KEY,
      appendRecentFacilitatorEvent(
        facilitatorMap.get(RECENT_SESSION_EVENTS_KEY),
        createFacilitatorEventFromAiAction(nextAction),
      ),
    );
  }, AI_SYNC_ORIGIN);
}

export function recordFacilitatorBoardMutation(
  boardId: BoardId,
  mutation: Omit<FacilitatorBoardMutation, 'at' | 'id' | 'clientId'> & { at?: number; id?: string },
): void {
  transactIdeaSync(boardId, (doc, facilitatorMap) => {
    const nextMutation = {
      ...mutation,
      id: mutation.id ?? crypto.randomUUID(),
      at: mutation.at ?? Date.now(),
      clientId: doc.clientID,
    } satisfies FacilitatorBoardMutation;
    facilitatorMap.set(LAST_BOARD_MUTATION_KEY, nextMutation);
    facilitatorMap.set(
      RECENT_SESSION_EVENTS_KEY,
      appendRecentFacilitatorEvent(
        facilitatorMap.get(RECENT_SESSION_EVENTS_KEY),
        createFacilitatorEventFromBoardMutation(nextMutation),
      ),
    );
  }, mutation.actorType === 'ai' ? AI_SYNC_ORIGIN : FACILITATOR_SYNC_ORIGIN);
}

function getFacilitatorController(boardId: BoardId): FacilitatorController {
  startIdeaSync(boardId);
  const existing = controllers.get(boardId);
  if (existing) return existing;

  const controller: FacilitatorController = {
    boardId,
    lastBoardActivityAt: 0,
    listeners: new Set(),
    unobserveSync: () => {},
  };
  controller.unobserveSync = observeIdeaSyncUpdates(boardId, event => {
    if (
      event.origin === AI_SYNC_ORIGIN ||
      event.origin === BOOTSTRAP_SYNC_ORIGIN
    ) {
      notifyFacilitatorListeners(controller);
      return;
    }
    if (event.origin === FACILITATOR_SYNC_ORIGIN) {
      const sharedBoardMutation = readBoardMutation(getIdeaSyncFacilitatorMap(boardId)?.get(LAST_BOARD_MUTATION_KEY));
      if (sharedBoardMutation && sharedBoardMutation.actorType !== 'ai') {
        controller.lastBoardActivityAt = Math.max(controller.lastBoardActivityAt, sharedBoardMutation.at);
      }
      notifyFacilitatorListeners(controller);
      return;
    }
    controller.lastBoardActivityAt = Math.max(controller.lastBoardActivityAt, event.updatedAt);
    notifyFacilitatorListeners(controller);
  });
  controllers.set(boardId, controller);
  return controller;
}

function notifyFacilitatorListeners(controller: FacilitatorController): void {
  if (controller.listeners.size === 0) return;
  const snapshot = buildFacilitatorSnapshot(controller.boardId, controller.lastBoardActivityAt);
  controller.listeners.forEach(listener => listener(snapshot));
}

function buildFacilitatorSnapshot(
  boardId: BoardId,
  lastBoardActivityAt: number,
): FacilitatorSnapshot {
  startIdeaSync(boardId);
  const doc = getIdeaSyncDoc(boardId);
  const facilitatorMap = getIdeaSyncFacilitatorMap(boardId);
  const localClientId = doc?.clientID ?? null;
  const peers = readFreshPeers(facilitatorMap);
  const sharedPause = facilitatorMap?.get(SHARED_PAUSE_KEY) === true;
  const manualHostClientId = readManualHostClientId(facilitatorMap?.get(MANUAL_HOST_KEY), peers);
  const hostClientId = sharedPause ? null : manualHostClientId ?? peers[0]?.clientId ?? null;
  const lastAiAction = readAiAction(facilitatorMap?.get(LAST_AI_ACTION_KEY));
  const lastBoardMutation = readBoardMutation(facilitatorMap?.get(LAST_BOARD_MUTATION_KEY));
  const recentSessionEvents = readRecentFacilitatorEvents(facilitatorMap?.get(RECENT_SESSION_EVENTS_KEY));
  const autonomyState = readAutonomyState(facilitatorMap?.get(AUTONOMY_STATE_KEY));
  const recentAiActionOutcomes = readAiActionOutcomes(facilitatorMap?.get(AI_ACTION_OUTCOMES_KEY));
  const stagedInsights = readFacilitatorStagedInsights(facilitatorMap?.get(STAGED_INSIGHTS_KEY));
  const boardActivityAt = lastBoardMutation && lastBoardMutation.actorType !== 'ai'
    ? lastBoardMutation.at
    : 0;

  return {
    localClientId,
    hostClientId,
    manualHostClientId,
    isAiHost: hostClientId !== null && hostClientId === localClientId,
    sharedPause,
    autonomyState,
    lastBoardActivityAt: Math.max(lastBoardActivityAt, boardActivityAt),
    lastAiAction,
    lastBoardMutation,
    recentSessionEvents,
    recentAiActionOutcomes,
    stagedInsights,
    peers,
  };
}

function readManualHostClientId(
  value: unknown,
  peers: FacilitatorPeerState[],
): number | null {
  if (typeof value !== 'number') return null;
  return peers.some(peer => peer.clientId === value) ? value : null;
}

function readFreshPeers(
  facilitatorMap: ReturnType<typeof getIdeaSyncFacilitatorMap>,
): FacilitatorPeerState[] {
  if (!facilitatorMap) return [];
  const now = Date.now();
  const peers: FacilitatorPeerState[] = [];
  facilitatorMap.forEach((value, key) => {
    if (!String(key).startsWith(PEER_PREFIX)) return;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const peer = value as Partial<FacilitatorPeerState>;
    if (typeof peer.clientId !== 'number') return;
    if (typeof peer.heartbeatAt !== 'number') return;
    if (!peer.wantsAiHost) return;
    if (now - peer.heartbeatAt > PEER_STALE_MS) return;
    peers.push({
      clientId: peer.clientId,
      heartbeatAt: peer.heartbeatAt,
      wantsAiHost: true,
    });
  });
  return peers.sort((left, right) => left.clientId - right.clientId);
}
