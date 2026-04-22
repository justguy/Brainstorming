interface SessionPeer {
  clientId: number;
  heartbeatAt: number;
  wantsAiHost: boolean;
}

interface SessionAiAction {
  kind: 'connect' | 'critique' | 'scout';
  at: number;
  ideaId?: string;
}

interface SessionBoardMutation {
  kind: 'connection' | 'critique' | 'doc' | 'suggestion' | 'idea' | 'group';
  at: number;
  actorType: 'user' | 'ai' | 'tool' | 'system';
  clientId: number | null;
}

interface SessionEvent {
  id: string;
  source: 'ai_action' | 'board_mutation';
  at: number;
  kind: SessionAiAction['kind'] | SessionBoardMutation['kind'];
  actorType: 'user' | 'ai' | 'tool' | 'system';
  clientId: number | null;
  summary?: string;
}

export interface CompanionSessionInput {
  localClientId: number | null;
  hostClientId: number | null;
  manualHostClientId: number | null;
  sharedPause: boolean;
  peers: SessionPeer[];
  lastAiAction: SessionAiAction | null;
  lastBoardMutation: SessionBoardMutation | null;
  recentSessionEvents?: SessionEvent[];
  pendingBoardChange: boolean;
  autoRunReady: boolean;
  suggestionCount: number;
}

export interface CompanionSessionSummary {
  visible: boolean;
  status: string;
  statusLabel: string;
  headline: string;
  detail: string;
  peerLabels: string[];
  recentSpeakerLabels: string[];
  consensusSummary: string;
  actionItems: string[];
}

export function buildCompanionSessionSummary(input: CompanionSessionInput): CompanionSessionSummary {
  const peerLabels = input.peers.map(peer => peerLabel(peer.clientId, input));
  const recentSpeakerLabels = recentSpeakers(input);
  if (input.peers.length < 2) {
    return {
      visible: false,
      status: '',
      statusLabel: '',
      headline: '',
      detail: '',
      peerLabels,
      recentSpeakerLabels,
      consensusSummary: '',
      actionItems: [],
    };
  }

  return {
    visible: true,
    status: sessionStatus(input),
    statusLabel: sessionStatusLabel(input),
    headline: sessionHeadline(input),
    detail: sessionDetail(input),
    peerLabels,
    recentSpeakerLabels,
    consensusSummary: consensusSummary(input),
    actionItems: sessionActionItems(input),
  };
}

function sessionStatus(input: CompanionSessionInput): string {
  if (input.sharedPause) return 'shared pause';
  if (input.manualHostClientId !== null) return 'manual host';
  if (input.hostClientId === input.localClientId) return 'hosting here';
  if (input.hostClientId !== null) return 'hosted remotely';
  return 'awaiting host';
}

function sessionStatusLabel(input: CompanionSessionInput): string {
  if (input.sharedPause) return 'Paused for all roles';
  if (input.manualHostClientId !== null) return 'Manual role host';
  if (input.hostClientId === input.localClientId) return 'You are guiding roles';
  if (input.hostClientId !== null) return `Peer ${input.hostClientId} guiding roles`;
  return 'Choosing host role';
}

function sessionHeadline(input: CompanionSessionInput): string {
  const peerCount = `${input.peers.length} peers in session`;
  if (input.sharedPause) return `${peerCount}, role actions are paused for everyone`;
  if (input.hostClientId === input.localClientId) return `${peerCount}, this tab is guiding shared roles`;
  if (input.hostClientId !== null) return `${peerCount}, peer ${input.hostClientId} is guiding shared roles`;
  return `${peerCount}, role host is still settling`;
}

function sessionDetail(input: CompanionSessionInput): string {
  if (input.sharedPause) {
    return 'Shared pause is active; automatic role guidance is muted across the canvas.';
  }
  if (input.lastAiAction) {
    return `Latest role move: ${beatLabel(input.lastAiAction.kind)} ${formatSince(input.lastAiAction.at)}.`;
  }
  if (input.lastBoardMutation) {
    return `Latest shared board move: ${mutationLabel(input.lastBoardMutation)} ${formatSince(input.lastBoardMutation.at)}.`;
  }
  return 'Peers are synchronized; the role host is waiting for the next meaningful board change.';
}

function sessionActionItems(input: CompanionSessionInput): string[] {
  const items: string[] = [];
  const recentHumanSpeakers = recentSpeakerLabels(input);

  if (input.sharedPause) {
    items.push('Resume the shared role host when the group wants automation back.');
  } else if (input.hostClientId === null) {
    items.push('Keep one role-enabled peer active long enough for host election to settle.');
  } else if (input.hostClientId === input.localClientId) {
    items.push('Keep this tab open while the group relies on this role host.');
  } else {
    items.push(`Keep peer ${input.hostClientId} active if you want that browser to continue role guidance.`);
  }

  if (input.manualHostClientId !== null) {
    items.push(`Manual host override is pinned to peer ${input.manualHostClientId}; clear it to return to auto host election.`);
  }

  if (input.pendingBoardChange) {
    items.push(
      input.autoRunReady
        ? 'The latest shared edit settled. The host can run a role pass now.'
        : 'Recent shared edits are still settling. Give the host a clean idle window before next role action.',
    );
  }

  if (input.suggestionCount > 0) {
    items.push(`Review ${input.suggestionCount} pending scout suggestion${input.suggestionCount === 1 ? '' : 's'} before scouting again.`);
  }

  if (items.length < 3 && recentHumanSpeakers.length >= 2 && input.pendingBoardChange && !input.sharedPause) {
    items.push('Let active speakers settle before the host publishes the next shared role action.');
  }

  return items.slice(0, 3);
}

function consensusSummary(input: CompanionSessionInput): string {
  const events = recentEvents(input);
  if (events.length === 0) {
    return 'The session is synchronized, but it has not produced enough shared movement for a role readout yet.';
  }

  const counts = countKinds(events);
  const humanSpeakers = recentSpeakerLabels(input);

  if (counts.critique > 0) {
    return 'The group is pressure-testing stronger threads before making the next role move.';
  }
  if (counts.connection + counts.group > 0) {
    return 'The session is converging: peers are turning loose threads into shared structure.';
  }
  if (counts.doc > 0) {
    return 'The group is grounding the discussion in supporting evidence instead of free-floating speculation.';
  }
  if (counts.suggestion > 0 && counts.idea > 0) {
    return 'Fresh ideas are landing and the role host is immediately widening adjacent options.';
  }
  if (counts.suggestion > 0) {
    return 'The role host is broadening the conversation with adjacent suggestions.';
  }
  if (counts.idea > 0 && humanSpeakers.length >= 2) {
    return 'Multiple peers are still shaping the board, so the role host should wait for a cleaner idle window before synthesizing.';
  }
  return 'The session is active, and the role host is tracking the latest shared thread.';
}

function recentSpeakers(input: CompanionSessionInput): string[] {
  return recentSpeakerLabels(input).map(clientId => peerLabel(clientId, input));
}

function recentSpeakerLabels(input: CompanionSessionInput): number[] {
  const seen = new Set<number>();
  const labels: number[] = [];
  for (const event of recentEvents(input)) {
    if (event.actorType === 'ai' || event.clientId === null || seen.has(event.clientId)) continue;
    seen.add(event.clientId);
    labels.push(event.clientId);
    if (labels.length === 3) break;
  }
  return labels;
}

function recentEvents(input: CompanionSessionInput): SessionEvent[] {
  const cutoff = Date.now() - 10 * 60_000;
  return (input.recentSessionEvents ?? [])
    .filter(event => event.at >= cutoff)
    .sort((left, right) => right.at - left.at);
}

function countKinds(events: SessionEvent[]): Record<SessionEvent['kind'], number> {
  return events.reduce<Record<SessionEvent['kind'], number>>((acc, event) => {
    acc[event.kind] += 1;
    return acc;
  }, {
    connect: 0,
    critique: 0,
    scout: 0,
    connection: 0,
    doc: 0,
    suggestion: 0,
    idea: 0,
    group: 0,
  });
}

function peerLabel(clientId: number, input: CompanionSessionInput): string {
  const labels = [`peer ${clientId}`];
  if (clientId === input.localClientId) labels.push('you');
  if (clientId === input.hostClientId) labels.push('host');
  if (clientId === input.manualHostClientId) labels.push('manual');
  return labels.join(' • ');
}

function beatLabel(kind: SessionAiAction['kind']): string {
  switch (kind) {
    case 'connect':
      return 'Connector';
    case 'critique':
      return 'Challenger';
    case 'scout':
      return 'Scout';
  }
}

function mutationLabel(mutation: SessionBoardMutation): string {
  const actor = mutation.actorType === 'ai' ? 'AI' : mutation.actorType;
  return `${actor} ${mutation.kind}`;
}

function formatSince(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return `${Math.round(delta / 3_600_000)}h ago`;
}
