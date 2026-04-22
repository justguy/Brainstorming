import { DEFAULT_BOARD_ID } from '../../src/board/types';
import {
  claimFacilitatorAiHost,
  getFacilitatorSnapshot,
  releaseFacilitatorAiHost,
  setAutonomyConfiguredCeiling,
  setSharedFacilitatorPause,
  type FacilitatorSnapshot,
} from '../../src/storage/facilitatorSync';

const nullableNumberSchema = {
  anyOf: [
    { type: 'number' },
    { type: 'null' },
  ],
};

function mapSnapshot(snapshot: FacilitatorSnapshot) {
  return {
    localClientId: snapshot.localClientId,
    hostClientId: snapshot.hostClientId,
    manualHostClientId: snapshot.manualHostClientId,
    sharedPause: snapshot.sharedPause,
    autonomyState: snapshot.autonomyState,
    lastBoardActivityAt: snapshot.lastBoardActivityAt,
    stagedInsightCount: snapshot.stagedInsights?.length ?? 0,
    recentAiActionCount: snapshot.recentAiActionOutcomes?.length ?? 0,
    peerCount: snapshot.peers.length,
    peers: snapshot.peers.map(peer => ({
      clientId: peer.clientId,
      heartbeatAt: peer.heartbeatAt,
      wantsAiHost: peer.wantsAiHost,
    })),
  };
}

function mapAutonomyModeToStoredValue(mode: unknown): FacilitatorSnapshot['autonomyState']['configuredCeiling'] | null {
  switch (mode) {
    case 'passive_observer':
    case 'passive':
      return 'passive';
    case 'guided_copilot':
    case 'copilot':
      return 'copilot';
    case 'active_challenger':
    case 'challenger':
      return 'challenger';
    default:
      return null;
  }
}

function mapStoredModeToApiValue(mode: FacilitatorSnapshot['autonomyState']['configuredCeiling'] | FacilitatorSnapshot['autonomyState']['effectiveMode']) {
  switch (mode) {
    case 'passive':
      return 'passive_observer';
    case 'copilot':
      return 'guided_copilot';
    case 'challenger':
      return 'active_challenger';
    case 'shadow':
      return 'shadow';
  }
}

export const listPeersTool: ModelContextTool = {
  name: 'list_peers',
  description:
    'Returns the active facilitator peers currently visible to this board, including the local client id, ' +
    'the elected AI host, any manual host override, and the shared pause state.',
  inputSchema: { type: 'object', properties: {} },
  outputSchema: {
    type: 'object',
    properties: {
      localClientId: nullableNumberSchema,
      hostClientId: nullableNumberSchema,
      manualHostClientId: nullableNumberSchema,
      sharedPause: { type: 'boolean' },
      lastBoardActivityAt: { type: 'number' },
      peerCount: { type: 'number' },
      peers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            clientId: { type: 'number' },
            heartbeatAt: { type: 'number' },
            wantsAiHost: { type: 'boolean' },
          },
        },
      },
    },
  },
  annotations: { readOnlyHint: true },
  execute: async () => mapSnapshot(getFacilitatorSnapshot(DEFAULT_BOARD_ID)),
};

export const claimAiHostTool: ModelContextTool = {
  name: 'claim_ai_host',
  description:
    'Requests a manual AI-host override for the current peer. Shared pause still wins; if this peer is not ' +
    'currently eligible to host, the tool refuses the claim.',
  inputSchema: { type: 'object', properties: {} },
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string' },
      message: { type: 'string' },
      snapshot: { type: 'object' },
    },
  },
  annotations: { readOnlyHint: false },
  execute: async () => {
    const snapshot = getFacilitatorSnapshot(DEFAULT_BOARD_ID);
    if (snapshot.localClientId === null) {
      return 'ERROR: facilitator sync is unavailable in this browser context.';
    }
    if (!snapshot.peers.some(peer => peer.clientId === snapshot.localClientId)) {
      return 'ERROR: this peer is not currently eligible to host. Resume the local facilitator first, then try again.';
    }
    const nextSnapshot = claimFacilitatorAiHost(DEFAULT_BOARD_ID);
    if (!nextSnapshot) {
      return 'ERROR: failed to claim AI host for this peer.';
    }
    return {
      status: 'ok',
      message: `Manual AI-host override now points at client ${nextSnapshot.localClientId}.`,
      snapshot: mapSnapshot(nextSnapshot),
    };
  },
};

export const releaseAiHostTool: ModelContextTool = {
  name: 'release_ai_host',
  description:
    'Releases the current peer\'s manual AI-host override and returns host selection to the normal automatic election.',
  inputSchema: { type: 'object', properties: {} },
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string' },
      message: { type: 'string' },
      snapshot: { type: 'object' },
    },
  },
  annotations: { readOnlyHint: false },
  execute: async () => {
    const snapshot = getFacilitatorSnapshot(DEFAULT_BOARD_ID);
    if (snapshot.localClientId === null) {
      return 'ERROR: facilitator sync is unavailable in this browser context.';
    }
    if (snapshot.manualHostClientId !== null && snapshot.manualHostClientId !== snapshot.localClientId) {
      return `ERROR: manual AI-host override belongs to client ${snapshot.manualHostClientId}, not this peer.`;
    }
    const nextSnapshot = releaseFacilitatorAiHost(DEFAULT_BOARD_ID);
    if (!nextSnapshot) {
      return 'ERROR: failed to release AI host for this peer.';
    }
    return {
      status: 'ok',
      message: 'Manual AI-host override cleared. Automatic election is active again.',
      snapshot: mapSnapshot(nextSnapshot),
    };
  },
};

export const setAiPausedTool: ModelContextTool = {
  name: 'set_ai_paused',
  description:
    'Sets the shared facilitator pause state for this board. When paused, no peer should run the automated observer.',
  inputSchema: {
    type: 'object',
    properties: {
      paused: {
        type: 'boolean',
        description: 'True to pause shared facilitator automation, false to resume it.',
      },
    },
    required: ['paused'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string' },
      message: { type: 'string' },
      snapshot: { type: 'object' },
    },
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { paused } = input as { paused: boolean };
    if (typeof paused !== 'boolean') {
      return 'ERROR: `paused` must be a boolean.';
    }
    setSharedFacilitatorPause(DEFAULT_BOARD_ID, paused);
    const snapshot = getFacilitatorSnapshot(DEFAULT_BOARD_ID);
    return {
      status: 'ok',
      message: paused ? 'Shared AI facilitator is paused.' : 'Shared AI facilitator is resumed.',
      snapshot: mapSnapshot(snapshot),
    };
  },
};

export const getAiAutonomyStateTool: ModelContextTool = {
  name: 'get_ai_autonomy_state',
  description:
    'Returns the configured facilitator ceiling, current effective mode, backoff timing, and staged insight counts.',
  inputSchema: { type: 'object', properties: {} },
  outputSchema: {
    type: 'object',
    properties: {
      configuredCeiling: { type: 'string' },
      effectiveMode: { type: 'string' },
      backoffStatus: { type: 'string' },
      backoffUntil: { type: 'number' },
      sharedPause: { type: 'boolean' },
      stagedInsightCount: { type: 'number' },
      recentAiActionCount: { type: 'number' },
    },
  },
  annotations: { readOnlyHint: true },
  execute: async () => {
    const snapshot = getFacilitatorSnapshot(DEFAULT_BOARD_ID);
    return {
      configuredCeiling: mapStoredModeToApiValue(snapshot.autonomyState.configuredCeiling),
      effectiveMode: mapStoredModeToApiValue(snapshot.autonomyState.effectiveMode),
      backoffStatus: snapshot.autonomyState.backoffStatus,
      backoffUntil: snapshot.autonomyState.backoffUntil,
      sharedPause: snapshot.sharedPause,
      stagedInsightCount: snapshot.stagedInsights?.length ?? 0,
      recentAiActionCount: snapshot.recentAiActionOutcomes?.length ?? 0,
    };
  },
};

export const setAiAutonomyModeTool: ModelContextTool = {
  name: 'set_ai_autonomy_mode',
  description:
    'Sets the configured facilitator ceiling. Accepted values are passive_observer, guided_copilot, and active_challenger.',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['passive_observer', 'guided_copilot', 'active_challenger'],
      },
    },
    required: ['mode'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string' },
      message: { type: 'string' },
      snapshot: { type: 'object' },
    },
  },
  annotations: { readOnlyHint: false },
  execute: async input => {
    const { mode } = input as { mode: string };
    const nextMode = mapAutonomyModeToStoredValue(mode);
    if (!nextMode) {
      return 'ERROR: `mode` must be one of passive_observer, guided_copilot, or active_challenger.';
    }
    setAutonomyConfiguredCeiling(DEFAULT_BOARD_ID, nextMode);
    const snapshot = getFacilitatorSnapshot(DEFAULT_BOARD_ID);
    return {
      status: 'ok',
      message: `Configured facilitator ceiling set to ${mapStoredModeToApiValue(snapshot.autonomyState.configuredCeiling)}.`,
      snapshot: mapSnapshot(snapshot),
    };
  },
};
