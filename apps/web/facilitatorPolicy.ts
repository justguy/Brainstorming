import type { AutoCooldownState, MeaningfulActivity } from './companionAutomationShared';
import {
  selectCritiqueTarget,
  selectPendingScoutIdeaId,
} from './companionAutomationObserverTargets';
import {
  deriveFacilitatorAutonomyView,
  shouldExecuteForAutonomyMode,
  type FacilitatorAutonomyLabel,
  type FacilitatorAutonomyView,
} from './facilitatorAutonomy';
import type { Idea, IdeaCritique } from '../../src/types';
import type {
  FacilitatorActionExecutionMode,
  FacilitatorAiActionOutcomeRecord,
  FacilitatorAutonomyState,
  FacilitatorInterventionStrength,
  FacilitatorRoleId,
  FacilitatorSessionEvent,
} from '../../src/storage/facilitatorSyncEvents';

export type CompanionAutomationAction = 'connect' | 'critique' | 'scout';
export type FacilitatorVerbClass = 'hard_transition' | 'durable_mutation' | 'soft_signal' | 'read_derived_state';
export type FacilitatorDecisionDisposition = 'block' | FacilitatorActionExecutionMode;

const AUTO_SEQUENCE_GAP_MS = 850;
const AUTO_COOLDOWN_CONNECTION_MS = 30_000;
const AUTO_COOLDOWN_CRITIQUE_MS = 45_000;
const AUTO_COOLDOWN_SCOUT_MS = 45_000;
const CONNECT_BATCH_SIZE = 3;
const CONNECT_STRENGTH_AGGRESSIVE_THRESHOLD = 5;
const FACILITATOR_HISTORY_LOOKBACK = 6;

export const FACILITATION_VERB_CLASSES = {
  list_peers: 'read_derived_state',
  claim_ai_host: 'durable_mutation',
  release_ai_host: 'durable_mutation',
  set_ai_paused: 'durable_mutation',
  advance_phase: 'hard_transition',
  submit_clarifications: 'hard_transition',
  select_approach: 'hard_transition',
  pin_lens: 'durable_mutation',
  dismiss_lens: 'durable_mutation',
  note_lens: 'durable_mutation',
  respond_to_challenge: 'durable_mutation',
  mark_stress_handled: 'durable_mutation',
  choose_next_step: 'durable_mutation',
  list_ambiguities: 'read_derived_state',
  resolve_ambiguity: 'durable_mutation',
  add_rule: 'durable_mutation',
  remove_rule: 'durable_mutation',
  list_risks: 'read_derived_state',
  patch_risk: 'durable_mutation',
  get_phase_history: 'read_derived_state',
  get_bead_state: 'read_derived_state',
  suggest_next_bead: 'soft_signal',
  flag_bead_for_review: 'soft_signal',
} as const satisfies Record<string, FacilitatorVerbClass>;

export const FACILITATOR_TRIGGER_MATRIX = [
  { role: 'synthesizer', action: 'connect', priority: 90, cooldownMs: AUTO_COOLDOWN_CONNECTION_MS, defaultExecutionMode: 'execute', verbClass: 'durable_mutation' },
  { role: 'challenger', action: 'critique', priority: 80, cooldownMs: AUTO_COOLDOWN_CRITIQUE_MS, defaultExecutionMode: 'stage', verbClass: 'durable_mutation' },
  { role: 'scout', action: 'scout', priority: 70, cooldownMs: AUTO_COOLDOWN_SCOUT_MS, defaultExecutionMode: 'execute', verbClass: 'durable_mutation' },
  { role: 'historian', action: null, priority: 40, cooldownMs: 0, defaultExecutionMode: 'stage', verbClass: 'soft_signal' },
  { role: 'facilitator', action: null, priority: 20, cooldownMs: 0, defaultExecutionMode: 'stage', verbClass: 'soft_signal' },
] as const;

type CooldownSnapshot = Pick<
  AutoCooldownState,
  'lastAiActionAt' | 'lastConnectionsAt' | 'lastScoutAt' | 'critiqueByIdea'
>;

export interface FacilitatorControlPlaneContext {
  now: number;
  workspace: {
    visibleIdeaCount: number;
    discardedIdeaCount: number;
    documentedIdeaCount: number;
    suggestionCount: number;
    activeCritiqueCount: number;
    selectedIdeaId: string | null;
    selectedPhase: number | null;
  };
  activity: {
    idleMs: number;
    pendingBoardChange: boolean;
    autoRunReady: boolean;
    interactionSuppressed: boolean;
    softModeBusy: boolean;
    lastMeaningfulActivity: MeaningfulActivity;
  };
  automation: {
    isAiHost: boolean;
    effectiveFacilitatorPaused: boolean;
    cooldowns: CooldownSnapshot;
    recentAiEvents: FacilitatorSessionEvent[];
    recentAiOutcomeCount: number;
    autonomyState: FacilitatorAutonomyState;
    recentAiActionOutcomes: FacilitatorAiActionOutcomeRecord[];
  };
  triggers: {
    pendingConnectionIdeaIds: string[];
    pendingScoutIdeaIds: string[];
    docCounts: Record<string, number>;
    visibleIdeas: Idea[];
    selectedBoardIdea: Idea | null;
    activeCritiques: IdeaCritique[];
  };
}

export interface CompanionAutomationPolicyDecision {
  shouldAct: boolean;
  disposition: FacilitatorDecisionDisposition;
  executionMode: FacilitatorActionExecutionMode;
  role: FacilitatorRoleId;
  action: CompanionAutomationAction | null;
  verbClass: FacilitatorVerbClass;
  targetIdeaId?: string;
  interventionStrength: FacilitatorInterventionStrength;
  configuredCeiling: FacilitatorAutonomyLabel;
  effectiveMode: FacilitatorAutonomyLabel;
  confidenceScore: number;
  autonomyStatusLine?: string;
  reason: string;
  cooldownRemainingMs?: number;
  consumePendingChange: boolean;
}

export interface BuildFacilitatorContextArgs {
  now: number;
  idleMs: number;
  pendingBoardChange: boolean;
  autoRunReady: boolean;
  interactionSuppressed: boolean;
  softModeBusy: boolean;
  isAiHost: boolean;
  effectiveFacilitatorPaused: boolean;
  cooldowns: CooldownSnapshot;
  autonomyState: FacilitatorAutonomyState;
  recentAiActionOutcomes?: FacilitatorAiActionOutcomeRecord[];
  pendingConnectionIdeaIds: string[];
  pendingScoutIdeaIds: string[];
  docCounts: Record<string, number>;
  visibleIdeas: Idea[];
  discardedIdeaCount: number;
  suggestionCount: number;
  selectedBoardIdea: Idea | null;
  activeCritiques: IdeaCritique[];
  lastMeaningfulActivity: MeaningfulActivity;
  recentSessionEvents?: FacilitatorSessionEvent[];
}

export function buildFacilitatorControlPlaneContext(
  args: BuildFacilitatorContextArgs,
): FacilitatorControlPlaneContext {
  const recentAiEvents = (args.recentSessionEvents ?? [])
    .filter(event => event.actorType === 'ai')
    .slice(0, FACILITATOR_HISTORY_LOOKBACK);
  const documentedIdeaCount = Object.values(args.docCounts).filter(count => count > 0).length;

  return {
    now: args.now,
    workspace: {
      visibleIdeaCount: args.visibleIdeas.length,
      discardedIdeaCount: args.discardedIdeaCount,
      documentedIdeaCount,
      suggestionCount: args.suggestionCount,
      activeCritiqueCount: args.activeCritiques.length,
      selectedIdeaId: args.selectedBoardIdea?.id ?? null,
      selectedPhase: args.selectedBoardIdea?.phase ?? null,
    },
    activity: {
      idleMs: args.idleMs,
      pendingBoardChange: args.pendingBoardChange,
      autoRunReady: args.autoRunReady,
      interactionSuppressed: args.interactionSuppressed,
      softModeBusy: args.softModeBusy,
      lastMeaningfulActivity: args.lastMeaningfulActivity,
    },
    automation: {
      isAiHost: args.isAiHost,
      effectiveFacilitatorPaused: args.effectiveFacilitatorPaused,
      cooldowns: args.cooldowns,
      recentAiEvents,
      recentAiOutcomeCount: recentAiEvents.length,
      autonomyState: args.autonomyState,
      recentAiActionOutcomes: args.recentAiActionOutcomes ?? [],
    },
    triggers: {
      pendingConnectionIdeaIds: args.pendingConnectionIdeaIds,
      pendingScoutIdeaIds: args.pendingScoutIdeaIds,
      docCounts: args.docCounts,
      visibleIdeas: args.visibleIdeas,
      selectedBoardIdea: args.selectedBoardIdea,
      activeCritiques: args.activeCritiques,
    },
  };
}

export function classifyFacilitatorVerb(toolName: string): FacilitatorVerbClass | null {
  return FACILITATION_VERB_CLASSES[toolName as keyof typeof FACILITATION_VERB_CLASSES] ?? null;
}

export function decideCompanionAutomationAction(
  context: FacilitatorControlPlaneContext,
): CompanionAutomationPolicyDecision {
  const autonomy = deriveFacilitatorAutonomyView({
    sharedPause: context.automation.effectiveFacilitatorPaused,
    autonomyState: context.automation.autonomyState,
    recentAiActionOutcomes: context.automation.recentAiActionOutcomes,
    now: context.now,
  });
  if (context.automation.effectiveFacilitatorPaused) {
    return blockDecision('facilitator', 'Automatic actions are paused.', autonomy);
  }
  if (!context.automation.isAiHost) {
    return blockDecision('facilitator', 'This tab is not the active facilitator host.', autonomy);
  }
  if (context.activity.interactionSuppressed || context.activity.softModeBusy) {
    return blockDecision('facilitator', 'Waiting for a clear, non-busy collaboration window.', autonomy);
  }
  if (!context.activity.pendingBoardChange) {
    return blockDecision('facilitator', 'No pending board change is waiting for review.', autonomy);
  }
  if (!context.activity.autoRunReady) {
    return blockDecision('facilitator', 'Board activity is still settling.', autonomy);
  }
  const sequenceGapRemainingMs = Math.max(
    0,
    AUTO_SEQUENCE_GAP_MS - (context.now - context.automation.cooldowns.lastAiActionAt),
  );
  if (sequenceGapRemainingMs > 0) {
    return blockDecision('facilitator', `Waiting ${Math.ceil(sequenceGapRemainingMs / 1000)}s before the next facilitator action.`, autonomy);
  }
  if (context.triggers.pendingConnectionIdeaIds.length >= CONNECT_BATCH_SIZE) {
    return decideConnectionAction(context, autonomy);
  }
  const critiqueTarget = selectCritiqueTarget({
    visibleIdeas: context.triggers.visibleIdeas,
    selectedBoardIdea: context.triggers.selectedBoardIdea,
    activeCritiques: context.triggers.activeCritiques,
  });
  if (critiqueTarget) {
    return decideCritiqueAction(context, critiqueTarget.id, autonomy);
  }
  const doclessIdeaId = selectPendingScoutIdeaId(
    context.triggers.pendingScoutIdeaIds,
    context.triggers.docCounts,
  );
  if (doclessIdeaId) {
    return decideScoutAction(context, doclessIdeaId, autonomy);
  }
  if (context.workspace.discardedIdeaCount > 0 && context.activity.idleMs >= 5_000) {
    return stageDecision('historian', 'soft_signal', 'A discarded thread may be worth revisiting before the board drifts further.', {
      configuredCeiling: autonomy.configuredCeiling,
      effectiveMode: autonomy.effectiveMode,
      confidenceScore: 0.2,
      autonomyStatusLine: autonomy.statusLine ?? undefined,
    });
  }
  if (context.workspace.selectedPhase !== null && context.workspace.selectedPhase >= 7) {
    return stageDecision('facilitator', 'soft_signal', 'The active idea is near handoff; stage a next-step prompt instead of mutating automatically.', {
      configuredCeiling: autonomy.configuredCeiling,
      effectiveMode: autonomy.effectiveMode,
      confidenceScore: 0.24,
      autonomyStatusLine: autonomy.statusLine ?? undefined,
    });
  }
  if (context.workspace.suggestionCount > 0) {
    return stageDecision('facilitator', 'soft_signal', 'Existing staged suggestions are still waiting on human intake; avoid piling on more AI motion.', {
      configuredCeiling: autonomy.configuredCeiling,
      effectiveMode: autonomy.effectiveMode,
      confidenceScore: 0.18,
      autonomyStatusLine: autonomy.statusLine ?? undefined,
    });
  }
  return stageDecision('facilitator', 'soft_signal', 'No automation trigger is strong enough to justify a mutation right now.', {
    configuredCeiling: autonomy.configuredCeiling,
    effectiveMode: autonomy.effectiveMode,
    confidenceScore: 0,
    autonomyStatusLine: autonomy.statusLine ?? undefined,
  });
}

function decideConnectionAction(
  context: FacilitatorControlPlaneContext,
  autonomy: FacilitatorAutonomyView,
): CompanionAutomationPolicyDecision {
  const cooldownRemainingMs = Math.max(
    0,
    AUTO_COOLDOWN_CONNECTION_MS - (context.now - context.automation.cooldowns.lastConnectionsAt),
  );
  const interventionStrength = context.triggers.pendingConnectionIdeaIds.length >= CONNECT_STRENGTH_AGGRESSIVE_THRESHOLD
    ? 'aggressive'
    : 'balanced';
  const confidenceScore = interventionStrength === 'aggressive' ? 0.78 : 0.64;
  if (cooldownRemainingMs > 0) {
    return stageDecision('synthesizer', 'durable_mutation', `Connection scan is cooling down for ${Math.round(cooldownRemainingMs / 1000)}s.`, {
      interventionStrength,
      cooldownRemainingMs,
      configuredCeiling: autonomy.configuredCeiling,
      effectiveMode: autonomy.effectiveMode,
      confidenceScore,
      autonomyStatusLine: autonomy.statusLine ?? undefined,
    });
  }
  return modeFilteredActionDecision(context, autonomy, 'synthesizer', 'connect', 'durable_mutation', 'Connection candidates accumulated; prioritizing structural linking.', confidenceScore, {
    interventionStrength,
  });
}

function decideCritiqueAction(
  context: FacilitatorControlPlaneContext,
  ideaId: string,
  autonomy: FacilitatorAutonomyView,
): CompanionAutomationPolicyDecision {
  const lastCritiqueAt = context.automation.cooldowns.critiqueByIdea[ideaId] ?? 0;
  const cooldownRemainingMs = Math.max(0, AUTO_COOLDOWN_CRITIQUE_MS - (context.now - lastCritiqueAt));
  const confidenceScore = 0.52;
  if (cooldownRemainingMs > 0) {
    return stageDecision('challenger', 'durable_mutation', `Critique cooldown active for ${Math.round(cooldownRemainingMs / 1000)}s.`, {
      targetIdeaId: ideaId,
      interventionStrength: 'balanced',
      cooldownRemainingMs,
      configuredCeiling: autonomy.configuredCeiling,
      effectiveMode: autonomy.effectiveMode,
      confidenceScore,
      autonomyStatusLine: autonomy.statusLine ?? undefined,
    });
  }
  return modeFilteredActionDecision(context, autonomy, 'challenger', 'critique', 'durable_mutation', 'A later-phase idea lacks fresh challenge coverage; run bounded critique.', confidenceScore, {
    targetIdeaId: ideaId,
    interventionStrength: 'balanced',
  });
}

function decideScoutAction(
  context: FacilitatorControlPlaneContext,
  ideaId: string,
  autonomy: FacilitatorAutonomyView,
): CompanionAutomationPolicyDecision {
  const cooldownRemainingMs = Math.max(
    0,
    AUTO_COOLDOWN_SCOUT_MS - (context.now - context.automation.cooldowns.lastScoutAt),
  );
  const confidenceScore = 0.47;
  if (cooldownRemainingMs > 0) {
    return stageDecision('scout', 'durable_mutation', `Scout cadence is cooling down for ${Math.round(cooldownRemainingMs / 1000)}s.`, {
      targetIdeaId: ideaId,
      cooldownRemainingMs,
      configuredCeiling: autonomy.configuredCeiling,
      effectiveMode: autonomy.effectiveMode,
      confidenceScore,
      autonomyStatusLine: autonomy.statusLine ?? undefined,
    });
  }
  return modeFilteredActionDecision(context, autonomy, 'scout', 'scout', 'durable_mutation', 'A doc-less idea is available for adjacent expansion.', confidenceScore, {
    targetIdeaId: ideaId,
  });
}

function blockDecision(
  role: FacilitatorRoleId,
  reason: string,
  autonomy: FacilitatorAutonomyView,
): CompanionAutomationPolicyDecision {
  return {
    shouldAct: false,
    disposition: 'block',
    executionMode: 'stage',
    role,
    action: null,
    verbClass: 'soft_signal',
    interventionStrength: 'gentle',
    configuredCeiling: autonomy.configuredCeiling,
    effectiveMode: autonomy.effectiveMode,
    confidenceScore: 0,
    autonomyStatusLine: autonomy.statusLine ?? undefined,
    reason,
    consumePendingChange: false,
  };
}

type PolicyDecisionOverrides = Partial<Pick<
  CompanionAutomationPolicyDecision,
  'action' | 'targetIdeaId' | 'interventionStrength' | 'cooldownRemainingMs' | 'configuredCeiling' | 'effectiveMode' | 'confidenceScore' | 'autonomyStatusLine'
>>;

function stageDecision(
  role: FacilitatorRoleId,
  verbClass: FacilitatorVerbClass,
  reason: string,
  overrides: PolicyDecisionOverrides = {},
): CompanionAutomationPolicyDecision {
  return {
    shouldAct: true,
    disposition: 'stage',
    executionMode: 'stage',
    role,
    action: overrides.action ?? null,
    verbClass,
    interventionStrength: overrides.interventionStrength ?? 'gentle',
    configuredCeiling: overrides.configuredCeiling ?? 'guided_copilot',
    effectiveMode: overrides.effectiveMode ?? 'guided_copilot',
    confidenceScore: overrides.confidenceScore ?? 0,
    autonomyStatusLine: overrides.autonomyStatusLine,
    reason,
    cooldownRemainingMs: overrides.cooldownRemainingMs,
    targetIdeaId: overrides.targetIdeaId,
    consumePendingChange: true,
  };
}

function executeDecision(
  role: FacilitatorRoleId,
  action: CompanionAutomationAction,
  verbClass: FacilitatorVerbClass,
  reason: string,
  overrides: PolicyDecisionOverrides = {},
): CompanionAutomationPolicyDecision {
  return {
    shouldAct: true,
    disposition: 'execute',
    executionMode: 'execute',
    role,
    action,
    verbClass,
    interventionStrength: overrides.interventionStrength ?? 'gentle',
    configuredCeiling: overrides.configuredCeiling ?? 'guided_copilot',
    effectiveMode: overrides.effectiveMode ?? 'guided_copilot',
    confidenceScore: overrides.confidenceScore ?? 0,
    autonomyStatusLine: overrides.autonomyStatusLine,
    reason,
    cooldownRemainingMs: overrides.cooldownRemainingMs,
    targetIdeaId: overrides.targetIdeaId,
    consumePendingChange: true,
  };
}

function modeFilteredActionDecision(
  context: FacilitatorControlPlaneContext,
  autonomy: FacilitatorAutonomyView,
  role: FacilitatorRoleId,
  action: CompanionAutomationAction,
  verbClass: FacilitatorVerbClass,
  reason: string,
  confidenceScore: number,
  overrides: PolicyDecisionOverrides = {},
): CompanionAutomationPolicyDecision {
  if (shouldExecuteForAutonomyMode(autonomy.effectiveMode, confidenceScore, context.activity.autoRunReady)) {
    return executeDecision(role, action, verbClass, reason, {
      ...overrides,
      configuredCeiling: autonomy.configuredCeiling,
      effectiveMode: autonomy.effectiveMode,
      confidenceScore,
      autonomyStatusLine: autonomy.statusLine ?? undefined,
    });
  }
  return stageDecision(role, verbClass, reason, {
    ...overrides,
    action,
    configuredCeiling: autonomy.configuredCeiling,
    effectiveMode: autonomy.effectiveMode,
    confidenceScore,
    autonomyStatusLine: autonomy.statusLine ?? undefined,
  });
}
