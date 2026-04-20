import type { BeatName, BeatRunState } from '../../src/beats/types';
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

export function beatLabel(beat: BeatName): string {
  switch (beat) {
    case 'scout':
      return 'Scout';
    case 'connect':
      return 'Connect';
    case 'critique':
      return 'Critique';
    case 'cluster':
      return 'Cluster';
    case 'summarise':
      return 'Summarise';
  }
}

export function activityLabel(kind: ActivityKind): string {
  switch (kind) {
    case 'edit':
      return 'edit';
    case 'group':
      return 'group change';
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
      headline: 'Waiting for provider setup',
      detail: 'Add an API key in Options and the facilitator can start drafting, connecting, and critiquing in place.',
      dotClass: 'bg-amber-400 bo-status-pulse',
      pillClass: 'border-amber-200 bg-amber-50 text-amber-800',
      progressClass: 'bg-gradient-to-r from-amber-300 to-amber-500',
    };
  }

  if (props.facilitatorPaused) {
    return {
      status: 'paused',
      headline: 'Paused until you resume',
      detail: 'The facilitator is holding position. The board stays editable; automatic beats stay quiet.',
      dotClass: 'bg-slate-400',
      pillClass: 'border-slate-300 bg-slate-100 text-slate-700',
      progressClass: 'bg-gradient-to-r from-slate-300 to-slate-500',
    };
  }

  if (props.activeBeatRun) {
    return {
      status: props.activeBeatRun.size === 'big' ? 'big beat' : 'drafting',
      headline: activeBeatHeadline(props.activeBeatRun.beat),
      detail: props.activeBeatRun.trigger === 'automatic'
        ? 'The facilitator is running an idle-triggered beat and keeping the board live while it works.'
        : 'The facilitator is responding to an explicit ask and will surface the result inline on the board.',
      dotClass: 'bg-sky-500 bo-status-pulse',
      pillClass: 'border-sky-200 bg-sky-50 text-sky-700',
      progressClass: 'bg-gradient-to-r from-sky-400 via-cyan-400 to-teal-400',
    };
  }

  if (props.interactionSuppressed) {
    return {
      status: 'watching',
      headline: 'Watching while you edit',
      detail: 'Typing and drag work stay uninterrupted. The facilitator waits for a clean pause before it nudges the board.',
      dotClass: 'bg-teal-500',
      pillClass: 'border-teal-200 bg-teal-50 text-teal-700',
      progressClass: 'bg-gradient-to-r from-teal-300 to-cyan-400',
    };
  }

  if (props.pendingBoardChange) {
    return {
      status: props.autoRunReady ? 'primed' : 'watching',
      headline: props.autoRunReady ? readyHeadline(props.softModeAssessment.inferredMode) : 'Watching the latest board change',
      detail: props.autoRunReady
        ? 'The last board change has settled. The facilitator can launch the next automatic beat without interrupting your flow.'
        : `The latest board change is still settling. The facilitator waits ${formatDuration(props.autoRunCountdownMs)} of clean idle before nudging the board.`,
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
      headline: 'Finishing the current pass',
      detail: 'The facilitator is already resolving a beat result. The board stays editable while the draft settles.',
      dotClass: 'bg-sky-500 bo-status-pulse',
      pillClass: 'border-sky-200 bg-sky-50 text-sky-700',
      progressClass: 'bg-gradient-to-r from-sky-400 via-cyan-400 to-teal-400',
    };
  }

  return {
    status: 'watching',
    headline: idleHeadline(props.softModeAssessment.inferredMode),
    detail: props.softModeAssessment.reason,
    dotClass: 'bg-emerald-500',
    pillClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    progressClass: 'bg-gradient-to-r from-emerald-300 to-lime-400',
  };
}

export function facilitatorLead(props: CompanionCardModelInput): FacilitatorLeadModel {
  if (props.hasApiKey === false) {
    return {
      eyebrow: 'Blocked',
      title: 'Connect a provider to bring the facilitator onto the canvas',
      detail: 'Once a provider is ready, the facilitator can scout, connect, and critique in place.',
      panelClass: 'bg-gradient-to-br from-amber-500 via-amber-500 to-orange-600',
    };
  }

  if (props.facilitatorPaused) {
    return {
      eyebrow: 'Paused',
      title: 'Automatic guidance is paused until you resume it',
      detail: 'You can keep editing freely; resume when you want the facilitator to start nudging the board again.',
      panelClass: 'bg-gradient-to-br from-slate-500 via-slate-600 to-slate-700',
    };
  }

  if (props.activeBeatRun) {
    return {
      eyebrow: 'Working now',
      title: activeBeatHeadline(props.activeBeatRun.beat),
      detail: props.activeBeatRun.trigger === 'automatic'
        ? 'This pass started from the board settling into an idle window, so the facilitator is guiding the next move without leaving the canvas.'
        : 'This pass started from an explicit ask, and the result will land back on the board inline.',
      panelClass: 'bg-gradient-to-br from-slate-950 via-slate-900 to-teal-700',
    };
  }

  if (props.pendingBoardChange && props.autoRunReady) {
    return {
      eyebrow: 'On deck',
      title: readyHeadline(props.softModeAssessment.inferredMode),
      detail: 'The last board change has settled. The facilitator can launch the next automatic beat as soon as you want it.',
      panelClass: 'bg-gradient-to-br from-cyan-600 via-sky-700 to-slate-900',
    };
  }

  if (props.interactionSuppressed || props.pendingBoardChange) {
    return {
      eyebrow: 'Watching',
      title: 'Reading the active thread without interrupting you',
      detail: props.pendingBoardChange
        ? `The facilitator is waiting for about ${formatDuration(props.autoRunCountdownMs)} of clean idle before it nudges the board.`
        : 'The facilitator is intentionally staying quiet while the board is still in motion.',
      panelClass: 'bg-gradient-to-br from-teal-700 via-cyan-700 to-slate-900',
    };
  }

  if (props.softModeBusy) {
    return {
      eyebrow: 'Settling',
      title: 'Finishing the current pass on the canvas',
      detail: 'The facilitator is resolving the current result and keeping the board editable while it lands.',
      panelClass: 'bg-gradient-to-br from-sky-700 via-cyan-700 to-slate-900',
    };
  }

  return {
    eyebrow: 'Listening',
    title: idleHeadline(props.softModeAssessment.inferredMode),
    detail: 'The facilitator is reading the board and waiting for a clear opening to guide the next move.',
    panelClass: 'bg-gradient-to-br from-emerald-700 via-teal-700 to-slate-900',
  };
}

function activeBeatHeadline(beat: BeatName): string {
  switch (beat) {
    case 'scout':
      return 'Drafting adjacent ideas';
    case 'connect':
      return 'Tracing sharper links';
    case 'critique':
      return 'Stress-testing the focus idea';
    case 'cluster':
      return 'Searching for natural clusters';
    case 'summarise':
      return 'Distilling the board';
  }
}

function idleHeadline(mode: SoftModeAssessment['inferredMode']): string {
  switch (mode) {
    case 'explore':
      return 'Watching for fresh angles';
    case 'structure':
      return 'Watching for structure';
    case 'stress':
      return 'Watching for weak spots';
    case 'converge':
      return 'Watching for a takeaway';
  }
}

function readyHeadline(mode: SoftModeAssessment['inferredMode']): string {
  switch (mode) {
    case 'explore':
      return 'Ready to draft adjacent ideas';
    case 'structure':
      return 'Ready to trace sharper links';
    case 'stress':
      return 'Ready to stress-test the focus idea';
    case 'converge':
      return 'Ready to distill a takeaway';
  }
}
