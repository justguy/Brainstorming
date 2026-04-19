import React from 'react';
import type { BeatName, BeatRunState } from '../../src/beats/types';
import type { ActivityKind, SoftModeAssessment } from './softMode';

interface RecentAiAction {
  kind: BeatName;
  createdAt: number;
  ideaId?: string;
}

interface DevCompanionCardProps {
  hasApiKey: boolean | null;
  facilitatorPaused: boolean;
  activeBeatRun: BeatRunState | null;
  softModeAssessment: SoftModeAssessment;
  interactionSuppressed: boolean;
  idleMs: number;
  autoIdleMs: number;
  lastAiAction?: RecentAiAction;
  lastScoutRunAt: number | null;
  lastConnectionsRunAt: number | null;
  softModeBusy: boolean;
  lastMeaningfulActivity: { kind: ActivityKind | null; at: number };
  pendingBoardChange: boolean;
  autoRunReady: boolean;
  autoRunCountdownMs: number;
  actionLabel?: string;
  onAction?: () => void;
  onTogglePause: () => void;
}

export function DevCompanionCard(props: DevCompanionCardProps): React.ReactElement {
  const mode = companionMode(props);
  const idleProgress = props.pendingBoardChange
    ? Math.min(1, (props.autoIdleMs - props.autoRunCountdownMs) / props.autoIdleMs)
    : Math.min(1, props.idleMs / props.autoIdleMs);
  const statusLabel = mode.status;
  const headline = mode.headline;
  const detail = mode.detail;
  const triggerLabel = props.activeBeatRun
    ? beatLabel(props.activeBeatRun.beat)
    : props.pendingBoardChange
      ? props.autoRunReady
        ? 'ready now'
        : `${formatDuration(props.autoRunCountdownMs)} to nudge`
      : `${Math.round(idleProgress * 100)}% primed`;

  return (
    <section className="bo-card-surface w-full overflow-hidden rounded-[28px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0" aria-live="polite" aria-atomic="true">
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${mode.dotClass}`} aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Dev Companion
            </p>
          </div>
          <h2 className="mt-2 text-sm font-semibold text-slate-900">{headline}</h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">{detail}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${mode.pillClass}`}>
          {statusLabel}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>{props.activeBeatRun ? 'Beat activity' : 'Idle trigger'}</span>
            <span>{triggerLabel}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-300 ${mode.progressClass}`}
              style={{ width: `${Math.max(10, Math.round((props.activeBeatRun ? 0.82 : idleProgress) * 100))}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
          <InfoPill label="Mode" value={props.softModeAssessment.inferredMode} />
          <InfoPill label="Confidence" value={`${Math.round(props.softModeAssessment.confidence * 100)}%`} />
          <InfoPill label="Last scout" value={formatSince(props.lastScoutRunAt)} />
          <InfoPill label="Last links" value={formatSince(props.lastConnectionsRunAt)} />
        </div>

        {props.lastMeaningfulActivity.kind && (
          <div className="rounded-2xl bg-white/75 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
            Last board change: <span className="font-medium text-slate-800">{activityLabel(props.lastMeaningfulActivity.kind)}</span>{' '}
            {formatSince(props.lastMeaningfulActivity.at)}.
            {props.pendingBoardChange && !props.activeBeatRun && ` Auto beats are ${props.autoRunReady ? 'primed' : 'waiting for idle'}.`}
          </div>
        )}

        {props.lastAiAction && (
          <div className="rounded-2xl bg-white/75 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
            Last visible beat: <span className="font-medium text-slate-800">{beatLabel(props.lastAiAction.kind)}</span>{' '}
            {formatSince(props.lastAiAction.createdAt)}.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {props.actionLabel && props.onAction && !props.facilitatorPaused && (
            <button
              type="button"
              onClick={props.onAction}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-300"
            >
              {props.actionLabel}
            </button>
          )}
          <button
            type="button"
            onClick={props.onTogglePause}
            className="rounded-full border border-slate-300 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-200"
          >
            {props.facilitatorPaused ? 'Resume companion' : 'Pause companion'}
          </button>
        </div>
      </div>
    </section>
  );
}

function InfoPill(props: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-2xl bg-white/75 px-3 py-2 ring-1 ring-slate-200">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{props.label}</div>
      <div className="mt-1 font-medium text-slate-700">{props.value}</div>
    </div>
  );
}

function beatLabel(beat: BeatName): string {
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

function companionMode(props: DevCompanionCardProps): {
  status: string;
  headline: string;
  detail: string;
  dotClass: string;
  pillClass: string;
  progressClass: string;
} {
  if (props.hasApiKey === false) {
    return {
      status: 'needs provider',
      headline: 'Waiting for provider setup',
      detail: 'Add an API key in Options and the companion can start drafting, connecting, and critiquing in place.',
      dotClass: 'bg-amber-400 bo-status-pulse',
      pillClass: 'border-amber-200 bg-amber-50 text-amber-800',
      progressClass: 'bg-gradient-to-r from-amber-300 to-amber-500',
    };
  }

  if (props.facilitatorPaused) {
    return {
      status: 'paused',
      headline: 'Paused until you resume',
      detail: 'The companion is holding position. The board stays editable; automatic beats stay quiet.',
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
        ? 'The companion is running an idle-triggered beat and keeping the board live while it works.'
        : 'The companion is responding to an explicit ask and will surface the result inline on the board.',
      dotClass: 'bg-sky-500 bo-status-pulse',
      pillClass: 'border-sky-200 bg-sky-50 text-sky-700',
      progressClass: 'bg-gradient-to-r from-sky-400 via-cyan-400 to-teal-400',
    };
  }

  if (props.interactionSuppressed) {
    return {
      status: 'watching',
      headline: 'Watching while you edit',
      detail: 'Typing and drag work stay uninterrupted. The companion waits for a clean pause before it nudges the board.',
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
        ? 'The last board change has settled. The companion can launch the next automatic beat without interrupting your flow.'
        : `The latest board change is still settling. The companion waits ${formatDuration(props.autoRunCountdownMs)} of clean idle before nudging the board.`,
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
      detail: 'The companion is already resolving a beat result. The board stays editable while the draft settles.',
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

function activityLabel(kind: ActivityKind): string {
  switch (kind) {
    case 'edit':
      return 'edit';
    case 'group':
      return 'group change';
    case 'doc':
      return 'doc update';
  }
}

function formatSince(timestamp: number | null): string {
  if (!timestamp) return 'not yet';
  const delta = Math.max(0, Date.now() - timestamp);
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return `${Math.round(delta / 3_600_000)}h ago`;
}

function formatDuration(ms: number): string {
  if (ms <= 1_000) return 'about 1s';
  if (ms < 60_000) return `about ${Math.ceil(ms / 1_000)}s`;
  return `about ${Math.ceil(ms / 60_000)}m`;
}
