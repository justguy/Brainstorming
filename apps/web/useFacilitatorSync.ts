import { useEffect, useState } from 'react';
import type { BoardId } from '../../src/types';
import {
  clearFacilitatorPeer,
  heartbeatFacilitatorPeer,
  observeFacilitatorSnapshot,
  recordFacilitatorAiAction,
  setSharedFacilitatorPause,
  type FacilitatorAiAction,
  type FacilitatorSnapshot,
} from '../../src/storage/facilitatorSync';

const HEARTBEAT_MS = 2_000;

const EMPTY_SNAPSHOT: FacilitatorSnapshot = {
  localClientId: null,
  hostClientId: null,
  isAiHost: false,
  sharedPause: false,
  lastBoardActivityAt: 0,
  lastAiAction: null,
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
  };
}
