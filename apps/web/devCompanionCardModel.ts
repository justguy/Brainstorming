import type { BeatName, BeatRunState } from '../../src/beats/types';
import type {
  FacilitatorAiActionOutcomeRecord,
  FacilitatorAutonomyState,
} from '../../src/storage/facilitatorSync';
import { autonomyLabel, deriveFacilitatorAutonomyView } from './facilitatorAutonomy';
import type { ActivityKind, SoftModeAssessment } from './softMode';

export interface CompanionCardModelInput {
  hasApiKey: boolean | null;
  facilitatorPaused: boolean;
  activeBeatRun: BeatRunState | null;
  softModeAssessment: SoftModeAssessment;
  interactionSuppressed: boolean;
  autoIdleMs: number;
  lastAiAction?: {
    kind: BeatName;
    createdAt: number;
    ideaId?: string;
  };
  lastScoutRunAt: number | null;
  lastConnectionsRunAt: number | null;
  softModeBusy: boolean;
  lastMeaningfulActivity: { kind: ActivityKind | null; at: number };
  pendingBoardChange: boolean;
  autoRunReady: boolean;
  autoRunCountdownMs: number;
  autonomy?: {
    sharedPause: boolean;
    autonomyState: FacilitatorAutonomyState;
    recentAiActionOutcomes?: FacilitatorAiActionOutcomeRecord[];
    stagedInsightCount?: number;
  };
}

export interface CompanionModeModel {
  status: string;
  headline: string;
  detail: string;
  dotClass: string;
  pillClass: string;
  progressClass: string;
}

export interface FacilitatorLeadModel {
  eyebrow: string;
  title: string;
  detail: string;
  panelClass: string;
}

export interface CompanionRoleModel {
  roleLabel: string;
  stateLabel: string;
  nextActionLabel: string;
  roleTag: string;
  panelClass: string;
}

export interface CompanionAutonomyReadout {
  configuredCeiling: string;
  effectiveMode: string;
  backoffLabel: string;
  capLabel: string;
  backoffToneClass: string;
  capToneClass: string;
}

export function beatLabel(beat: BeatName): string {
  switch (beat) {
    case 'scout':
      return 'Scout';
    case 'connect':
      return 'Connector';
    case 'critique':
      return 'Challenger';
    case 'cluster':
      return 'Cluster';
    case 'summarise':
      return 'Synthesiser';
  }
}

export function activityLabel(kind: ActivityKind): string {
  switch (kind) {
    case 'edit':
      return 'edit';
    case 'group':
      return 'group move';
    case 'doc':
      return 'doc update';
  }
}

export function formatSince(timestamp: number | null): string {
  if (!timestamp) return 'not yet';
  const delta = Math.max(0, Date.now() - timestamp);
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return `${Math.round(delta / 3_600_000)}h ago`;
}

export function formatDuration(ms: number): string {
  if (ms <= 1_000) return 'about 1s';
  if (ms < 60_000) return `about ${Math.ceil(ms / 1_000)}s`;
  return `about ${Math.ceil(ms / 60_000)}m`;
}

export function companionMode(props: CompanionCardModelInput): CompanionModeModel {
  if (props.hasApiKey === false) {
    return {
      status: 'needs provider',
      headline: 'Role engine unavailable',
      detail: 'Add an API key in Options to enable role actions on the board.',
      dotClass: 'bg-amber-400 bo-status-pulse',
      pillClass: 'border-amber-200 bg-amber-50 text-amber-800',
      progressClass: 'bg-gradient-to-r from-amber-300 to-amber-500',
    };
  }

  if (props.facilitatorPaused) {
    return {
      status: 'paused',
      headline: 'Role guidance paused',
      detail: 'The role engine is paused. The board stays fully editable.',
      dotClass: 'bg-slate-400',
      pillClass: 'border-slate-300 bg-slate-100 text-slate-700',
      progressClass: 'bg-gradient-to-r from-slate-300 to-slate-500',
    };
  }

  if (props.activeBeatRun) {
    return {
      status: props.activeBeatRun.size === 'big' ? 'role active' : 'drafting',
      headline: activeRoleHeadline(props.activeBeatRun.beat),
      detail: props.activeBeatRun.trigger === 'automatic'
        ? 'Role output is running from an idle window and will apply inline.'
        : 'Role output is running from your request and will apply inline.',
      dotClass: 'bg-sky-500 bo-status-pulse',
      pillClass: 'border-sky-200 bg-sky-50 text-sky-700',
      progressClass: 'bg-gradient-to-r from-sky-400 via-cyan-400 to-teal-400',
    };
  }

  if (props.interactionSuppressed) {
    return {
      status: 'watching',
      headline: 'Role watching your edit flow',
      detail: 'The role holds while you edit and reads the board during clean pauses.',
      dotClass: 'bg-teal-500',
      pillClass: 'border-teal-200 bg-teal-50 text-teal-700',
      progressClass: 'bg-gradient-to-r from-teal-300 to-cyan-400',
    };
  }

  if (props.pendingBoardChange) {
    return {
      status: props.autoRunReady ? 'ready' : 'waiting',
      headline: props.autoRunReady
        ? `${modeToPreferredRole(props.softModeAssessment.inferredMode)} ready`
        : 'Waiting for board pause',
      detail: props.autoRunReady
        ? 'A role action can run now if enabled.'
        : `The board is still settling. Waiting ${formatDuration(props.autoRunCountdownMs)} of clean idle before a role action.`,
      dotClass: props.autoRunReady ? 'bg-cyan-500 bo-status-pulse' : 'bg-emerald-500',
      pillClass: props.autoRunReady
        ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700',
      progressClass: props.autoRunReady
        ? 'bg-gradient-to-r from-cyan-400 to-sky-500'
        : 'bg-gradient-to-r from-emerald-300 to-lime-400',
    };
  }

  if (props.softModeBusy) {
    return {
      status: 'drafting',
      headline: 'Resolving active role output',
      detail: 'A role result is settling and board updates will follow.',
      dotClass: 'bg-sky-500 bo-status-pulse',
      pillClass: 'border-sky-200 bg-sky-50 text-sky-700',
      progressClass: 'bg-gradient-to-r from-sky-400 via-cyan-400 to-teal-400',
    };
  }

  return {
    status: 'watching',
    headline: `${idleHeadline(props.softModeAssessment.inferredMode)} mode`,
    detail: `Role idle: ${props.softModeAssessment.reason}`,
    dotClass: 'bg-emerald-500',
    pillClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    progressClass: 'bg-gradient-to-r from-emerald-300 to-lime-400',
  };
}

export function facilitatorLead(props: CompanionCardModelInput): FacilitatorLeadModel {
  if (props.hasApiKey === false) {
    return {
      eyebrow: 'Blocked',
      title: 'No role provider configured',
      detail: 'Enable an API provider to activate scaffolded role actions.',
      panelClass: 'bg-gradient-to-br from-amber-500 via-amber-500 to-orange-600',
    };
  }

  if (props.facilitatorPaused) {
    return {
      eyebrow: 'Paused',
      title: 'Role guidance is paused',
      detail: 'Resume to allow role actions to resume auto-run.',
      panelClass: 'bg-gradient-to-br from-slate-500 via-slate-600 to-slate-700',
    };
  }

  if (props.activeBeatRun) {
    return {
      eyebrow: 'Working now',
      title: activeRoleHeadline(props.activeBeatRun.beat),
      detail: props.activeBeatRun.trigger === 'automatic'
        ? 'This role was auto-queued after board pause.'
        : 'This role was explicitly requested and is writing inline.',
      panelClass: 'bg-gradient-to-br from-slate-950 via-slate-900 to-teal-700',
    };
  }

  if (props.pendingBoardChange && props.autoRunReady) {
    return {
      eyebrow: 'On deck',
      title: `${modeToPreferredRole(props.softModeAssessment.inferredMode)} role ready`,
      detail: 'The board pause cleared. A role action is ready to move.',
      panelClass: 'bg-gradient-to-br from-cyan-600 via-sky-700 to-slate-900',
    };
  }

  if (props.interactionSuppressed || props.pendingBoardChange) {
    return {
      eyebrow: 'Watching',
      title: 'Role is observing your thread',
      detail: props.pendingBoardChange
        ? `Waiting ${formatDuration(props.autoRunCountdownMs)} before any role action.`
        : 'The role stays quiet while the board is still in motion.',
      panelClass: 'bg-gradient-to-br from-teal-700 via-cyan-700 to-slate-900',
    };
  }

  if (props.softModeBusy) {
    return {
      eyebrow: 'Settling',
      title: 'Role output is settling',
      detail: 'The role is resolving the current draft and leaving the board editable.',
      panelClass: 'bg-gradient-to-br from-sky-700 via-cyan-700 to-slate-900',
    };
  }

  return {
    eyebrow: 'Listening',
    title: `${modeToPreferredRole(props.softModeAssessment.inferredMode)} role`,
    detail: `${modeToPreferredRole(props.softModeAssessment.inferredMode)} is on standby for the next clean pause.`,
    panelClass: 'bg-gradient-to-br from-emerald-700 via-teal-700 to-slate-900',
  };
}

export function companionRoleModel(props: CompanionCardModelInput): CompanionRoleModel {
  if (props.hasApiKey === false) {
    return {
      roleLabel: 'Role engine offline',
      stateLabel: 'no provider',
      nextActionLabel: 'configure provider',
      roleTag: 'Offline',
      panelClass: 'bg-gradient-to-br from-amber-500 via-amber-500 to-orange-600',
    };
  }

  if (props.facilitatorPaused) {
    return {
      roleLabel: 'Role set',
      stateLabel: 'paused',
      nextActionLabel: 'Resume to continue role nudges',
      roleTag: 'Paused',
      panelClass: 'bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800',
    };
  }

  if (props.activeBeatRun) {
    return {
      roleLabel: activeRoleHeadline(props.activeBeatRun.beat),
      stateLabel: props.activeBeatRun.trigger === 'automatic' ? 'auto queued' : 'manual requested',
      nextActionLabel: props.activeBeatRun.trigger === 'automatic'
        ? 'Applying role output inline now'
        : 'Applying requested role output inline now',
      roleTag: 'Active',
      panelClass: 'bg-gradient-to-br from-slate-950 via-slate-900 to-teal-700',
    };
  }

  if (props.pendingBoardChange && props.autoRunReady) {
    return {
      roleLabel: `${modeToPreferredRole(props.softModeAssessment.inferredMode)} role`,
      stateLabel: 'ready',
      nextActionLabel: 'One idle window away from action',
      roleTag: 'Ready',
      panelClass: 'bg-gradient-to-br from-cyan-600 via-sky-700 to-slate-900',
    };
  }

  if (props.interactionSuppressed || props.pendingBoardChange) {
    return {
      roleLabel: modeToPreferredRole(props.softModeAssessment.inferredMode),
      stateLabel: 'waiting',
      nextActionLabel: props.pendingBoardChange
        ? `Wait ${formatDuration(props.autoRunCountdownMs)}`
        : 'Hold current edits for a cleaner read',
      roleTag: 'Watching',
      panelClass: props.interactionSuppressed
        ? 'bg-gradient-to-br from-teal-700 via-cyan-700 to-slate-900'
        : 'bg-gradient-to-br from-emerald-700 via-teal-700 to-slate-900',
    };
  }

  if (props.softModeBusy) {
    return {
      roleLabel: modeToPreferredRole(props.softModeAssessment.inferredMode),
      stateLabel: 'resolving',
      nextActionLabel: 'Role result is resolving inline',
      roleTag: 'Settling',
      panelClass: 'bg-gradient-to-br from-sky-700 via-cyan-700 to-slate-900',
    };
  }

  return {
    roleLabel: modeToPreferredRole(props.softModeAssessment.inferredMode),
    stateLabel: 'idle',
    nextActionLabel: `${idleRoleNextAction(props.softModeAssessment.inferredMode)}.`,
    roleTag: 'Idle',
    panelClass: 'bg-gradient-to-br from-emerald-700 via-teal-700 to-slate-900',
  };
}

function activeRoleHeadline(beat: BeatName): string {
  switch (beat) {
    case 'scout':
      return 'Scout role';
    case 'connect':
      return 'Connector role';
    case 'critique':
      return 'Challenger role';
    case 'cluster':
      return 'Clustering role';
    case 'summarise':
      return 'Synthesiser role';
  }
}

function idleHeadline(mode: SoftModeAssessment['inferredMode']): string {
  switch (mode) {
    case 'explore':
      return 'Explore';
    case 'structure':
      return 'Structure';
    case 'stress':
      return 'Challenge';
    case 'converge':
      return 'Converge';
  }
}

function modeToPreferredRole(mode: SoftModeAssessment['inferredMode']): string {
  switch (mode) {
    case 'explore':
      return 'Scout';
    case 'structure':
      return 'Connector';
    case 'stress':
      return 'Challenger';
    case 'converge':
      return 'Synthesiser';
  }
}

function idleRoleNextAction(mode: SoftModeAssessment['inferredMode']): string {
  switch (mode) {
    case 'explore':
      return 'Scout pass will open when the board pauses';
    case 'structure':
      return 'Connector pass will open when the board pauses';
    case 'stress':
      return 'Challenger pass will open when the board pauses';
    case 'converge':
      return 'Synthesiser pass will open when the board pauses';
  }
}

export function normalizeAutonomyMode(rawMode?: string): string {
  const cleanMode = typeof rawMode === 'string' ? rawMode.trim() : '';
  if (!cleanMode) return 'Guided Co-Pilot';
  if (/active/i.test(cleanMode)) return 'Active Challenger';
  if (/guided|co.?pilot|co-pilot/i.test(cleanMode)) return 'Guided Co-Pilot';
  if (/passive|observer|shadow/i.test(cleanMode)) return 'Passive Observer';
  if (/pause|paused|off/i.test(cleanMode)) return 'Paused';
  if (/inactive|disabled/i.test(cleanMode)) return 'Inactive';
  return cleanMode;
}

export function companionAutonomyReadout(props: CompanionCardModelInput): CompanionAutonomyReadout {
  const autonomyView = props.autonomy
    ? deriveFacilitatorAutonomyView({
      sharedPause: props.autonomy.sharedPause,
      autonomyState: props.autonomy.autonomyState,
      recentAiActionOutcomes: props.autonomy.recentAiActionOutcomes,
      now: Date.now(),
    })
    : null;
  const configuredMode = autonomyView
    ? autonomyLabel(autonomyView.configuredCeiling)
    : normalizeAutonomyMode(props.facilitatorPaused ? 'Paused' : props.hasApiKey === false ? 'Inactive' : 'Guided Co-Pilot');
  const effectiveMode = autonomyView
    ? autonomyLabel(autonomyView.effectiveMode)
    : normalizeAutonomyMode(resolveEffectiveMode({
      facilitated: props.facilitatorPaused,
      hasApiKey: props.hasApiKey,
      activeBeatRun: props.activeBeatRun,
      interactionSuppressed: props.interactionSuppressed,
      softModeBusy: props.softModeBusy,
      pendingBoardChange: props.pendingBoardChange,
      autoRunReady: props.autoRunReady,
    }));
  const backoffRemainingMs = autonomyView?.backoffUntil
    ? Math.max(0, autonomyView.backoffUntil - Date.now())
    : (!props.autoRunReady && props.pendingBoardChange ? props.autoRunCountdownMs : 0);
  const backoffSeconds = backoffRemainingMs > 0 ? Math.max(1, Math.ceil(backoffRemainingMs / 1000)) : 0;
  const hasBackoff = backoffRemainingMs > 0;
  const backoffLabel = hasBackoff
    ? `${backoffSeconds}s`
    : 'ready';
  const capLabel = autonomyView?.statusLine
    ? autonomyView.statusLine
    : (props.autonomy?.stagedInsightCount ?? 0) > 0
      ? `Holding ${props.autonomy?.stagedInsightCount ?? 0} thought${(props.autonomy?.stagedInsightCount ?? 0) === 1 ? '' : 's'} in notes`
      : (hasBackoff ? 'Cooldown and staged-only execution' : 'No active cap');

  return {
    configuredCeiling: configuredMode,
    effectiveMode,
    backoffLabel: hasBackoff && autonomyView?.caption
      ? `${backoffLabel} (${autonomyView.caption})`
      : backoffLabel,
    capLabel,
    backoffToneClass: hasBackoff
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700',
    capToneClass: capLabel === 'No active cap'
      ? 'border-slate-200 bg-slate-50 text-slate-700'
      : 'border-cyan-200 bg-cyan-50 text-cyan-700',
  };
}

function resolveEffectiveMode(args: {
  facilitated: boolean;
  hasApiKey: boolean | null;
  activeBeatRun: BeatRunState | null;
  interactionSuppressed: boolean;
  softModeBusy: boolean;
  pendingBoardChange: boolean;
  autoRunReady: boolean;
}): string {
  if (args.hasApiKey === false) return 'Inactive';
  if (args.facilitated) return 'Paused';
  if (args.activeBeatRun) return 'Active Challenger';
  if (args.interactionSuppressed || args.softModeBusy) return 'Passive Observer';
  if (args.pendingBoardChange && !args.autoRunReady) return 'Passive Observer';
  return 'Guided Co-Pilot';
}
