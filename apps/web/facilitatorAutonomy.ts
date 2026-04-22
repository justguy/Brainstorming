import type {
  FacilitatorAiActionOutcomeRecord,
  FacilitatorAutonomyState,
} from '../../src/storage/facilitatorSync';

export type FacilitatorAutonomyLabel = 'paused' | 'passive_observer' | 'guided_copilot' | 'active_challenger' | 'shadow';

export interface FacilitatorAutonomyView {
  configuredCeiling: FacilitatorAutonomyLabel;
  effectiveMode: FacilitatorAutonomyLabel;
  backoffActive: boolean;
  backoffUntil: number;
  recentActionCount: number;
  recentAcceptedCount: number;
  recentRejectedCount: number;
  recentPendingCount: number;
  differsFromCeiling: boolean;
  caption: string | null;
  statusLine: string | null;
}

const RECENT_WINDOW = 5;

export function deriveFacilitatorAutonomyView(input: {
  sharedPause: boolean;
  autonomyState: FacilitatorAutonomyState;
  recentAiActionOutcomes?: FacilitatorAiActionOutcomeRecord[];
  now: number;
}): FacilitatorAutonomyView {
  if (input.sharedPause) {
    return {
      configuredCeiling: normalizeAutonomyMode(input.autonomyState.configuredCeiling),
      effectiveMode: 'paused',
      backoffActive: false,
      backoffUntil: 0,
      recentActionCount: 0,
      recentAcceptedCount: 0,
      recentRejectedCount: 0,
      recentPendingCount: 0,
      differsFromCeiling: true,
      caption: 'Shared pause is on.',
      statusLine: 'Automatic facilitator work is paused.',
    };
  }

  const recentWindow = (input.recentAiActionOutcomes ?? []).slice(0, RECENT_WINDOW);
  const recentAcceptedCount = recentWindow.filter(item => item.outcome === 'accepted').length;
  const recentRejectedCount = recentWindow.filter(item => item.outcome === 'rejected').length;
  const recentPendingCount = recentWindow.filter(item => item.outcome === 'pending').length;
  const configuredCeiling = normalizeAutonomyMode(input.autonomyState.configuredCeiling);
  const effectiveFromState = normalizeAutonomyMode(input.autonomyState.effectiveMode);
  const backoffActive = input.autonomyState.backoffStatus === 'cooldown' || input.autonomyState.backoffStatus === 'shadow';
  const coolingDown = input.autonomyState.backoffUntil > input.now;
  const effectiveMode = backoffActive && coolingDown && effectiveFromState !== 'paused'
    ? effectiveFromState === 'shadow'
      ? 'shadow'
      : effectiveFromState
    : effectiveFromState;
  const differsFromCeiling = effectiveMode !== configuredCeiling;

  return {
    configuredCeiling,
    effectiveMode,
    backoffActive: backoffActive && coolingDown,
    backoffUntil: coolingDown ? input.autonomyState.backoffUntil : 0,
    recentActionCount: recentWindow.length,
    recentAcceptedCount,
    recentRejectedCount,
    recentPendingCount,
    differsFromCeiling,
    caption: differsFromCeiling
      ? `Ceiling: ${autonomyLabel(configuredCeiling)} -> Effective: ${autonomyLabel(effectiveMode)}`
      : null,
    statusLine: backoffActive && coolingDown
      ? (input.autonomyState.backoffStatus === 'shadow'
        ? 'Reading the room. Holding thoughts in notes.'
        : 'Reading the room. Stepping back for a calmer pass.')
      : null,
  };
}

export function normalizeAutonomyMode(value: unknown): FacilitatorAutonomyLabel {
  switch (value) {
    case 'paused':
      return 'paused';
    case 'passive':
    case 'passive_observer':
      return 'passive_observer';
    case 'copilot':
    case 'guided_copilot':
      return 'guided_copilot';
    case 'challenger':
    case 'active_challenger':
      return 'active_challenger';
    case 'shadow':
      return 'shadow';
    default:
      return 'guided_copilot';
  }
}

export function autonomyLabel(value: FacilitatorAutonomyLabel): string {
  switch (value) {
    case 'paused':
      return 'Paused';
    case 'passive_observer':
      return 'Passive Observer';
    case 'guided_copilot':
      return 'Guided Co-Pilot';
    case 'active_challenger':
      return 'Active Challenger';
    case 'shadow':
      return 'Shadow';
  }
}

export function shouldExecuteForAutonomyMode(
  mode: FacilitatorAutonomyLabel,
  confidenceScore: number,
  idleReady: boolean,
): boolean {
  switch (mode) {
    case 'paused':
    case 'shadow':
    case 'passive_observer':
      return false;
    case 'guided_copilot':
      return idleReady && confidenceScore >= 0.55;
    case 'active_challenger':
      return confidenceScore >= 0.3;
  }
}
