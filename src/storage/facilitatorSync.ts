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

const PEER_PREFIX = 'peer:';
const SHARED_PAUSE_KEY = 'sharedPause';
const LAST_AI_ACTION_KEY = 'lastAiAction';
const PEER_STALE_MS = 6_000;

export interface FacilitatorPeerState {
  clientId: number;
  heartbeatAt: number;
  wantsAiHost: boolean;
}

export interface FacilitatorAiAction {
  id: string;
  kind: 'connect' | 'critique' | 'scout';
  at: number;
  ideaId?: string;
}

export interface FacilitatorSnapshot {
  localClientId: number | null;
  hostClientId: number | null;
  isAiHost: boolean;
  sharedPause: boolean;
  lastBoardActivityAt: number;
  lastAiAction: FacilitatorAiAction | null;
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
  }, FACILITATOR_SYNC_ORIGIN);
}

export function setSharedFacilitatorPause(boardId: BoardId, paused: boolean): void {
  transactIdeaSync(boardId, (_innerDoc, facilitatorMap) => {
    facilitatorMap.set(SHARED_PAUSE_KEY, paused);
  }, FACILITATOR_SYNC_ORIGIN);
}

export function recordFacilitatorAiAction(
  boardId: BoardId,
  action: Omit<FacilitatorAiAction, 'at' | 'id'> & { at?: number; id?: string },
): void {
  transactIdeaSync(boardId, (_innerDoc, facilitatorMap) => {
    facilitatorMap.set(LAST_AI_ACTION_KEY, {
      ...action,
      id: action.id ?? crypto.randomUUID(),
      at: action.at ?? Date.now(),
    } satisfies FacilitatorAiAction);
  }, AI_SYNC_ORIGIN);
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
      event.origin === BOOTSTRAP_SYNC_ORIGIN ||
      event.origin === FACILITATOR_SYNC_ORIGIN
    ) {
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
  const hostClientId = sharedPause ? null : peers[0]?.clientId ?? null;
  const lastAiAction = readAiAction(facilitatorMap?.get(LAST_AI_ACTION_KEY));

  return {
    localClientId,
    hostClientId,
    isAiHost: hostClientId !== null && hostClientId === localClientId,
    sharedPause,
    lastBoardActivityAt,
    lastAiAction,
    peers,
  };
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

function readAiAction(value: unknown): FacilitatorAiAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const action = value as Partial<FacilitatorAiAction>;
  if (typeof action.id !== 'string' || action.id.length === 0) return null;
  if (typeof action.at !== 'number') return null;
  if (action.kind !== 'connect' && action.kind !== 'critique' && action.kind !== 'scout') return null;
  return {
    id: action.id,
    kind: action.kind,
    at: action.at,
    ...(typeof action.ideaId === 'string' ? { ideaId: action.ideaId } : {}),
  };
}
