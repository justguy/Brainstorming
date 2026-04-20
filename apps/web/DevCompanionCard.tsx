import React from 'react';
import type { BeatRunState } from '../../src/beats/types';
import type { ActivityKind, SoftModeAssessment } from './softMode';
import {
  activityLabel,
  beatLabel,
  companionMode,
  companionRoleModel,
  companionAutonomyReadout,
  formatDuration,
  formatSince,
  type CompanionCardModelInput,
} from './devCompanionCardModel';

interface DevCompanionCardProps extends CompanionCardModelInput {
  idleMs: number;
  activeBeatRun: BeatRunState | null;
  actionLabel?: string;
  onAction?: () => void;
  undoRobotLabel?: string;
  onUndoRobot?: () => void;
  onTogglePause: () => void;
}

export function DevCompanionCard(props: DevCompanionCardProps): React.ReactElement {
  const mode = companionMode(props);
  const roleModel = companionRoleModel(props);
  const idleProgress = props.pendingBoardChange
    ? Math.min(1, (props.autoIdleMs - props.autoRunCountdownMs) / props.autoIdleMs)
    : Math.min(1, props.idleMs / props.autoIdleMs);
  const triggerLabel = props.activeBeatRun
    ? roleModel.roleLabel
    : props.pendingBoardChange
      ? props.autoRunReady
        ? 'ready'
        : `${formatDuration(props.autoRunCountdownMs)}`
      : `${Math.round(idleProgress * 100)}% watch`;
  const statChips = [
    { label: 'Auto role', value: roleModel.roleLabel },
    { label: 'State', value: props.softModeAssessment.inferredMode },
    { label: 'Scout', value: formatSince(props.lastScoutRunAt) },
    { label: 'Links', value: formatSince(props.lastConnectionsRunAt) },
  ];
  const hasReadout = Boolean(props.lastMeaningfulActivity.kind || props.lastAiAction);

  return (
    <section className="bo-card-surface w-full overflow-hidden rounded-[20px] border border-slate-200/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0" aria-live="polite" aria-atomic="true">
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${mode.dotClass}`} aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Role dock
            </p>
          </div>
          <h2 className="mt-2 text-sm font-semibold text-slate-900">{mode.headline}</h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">{mode.detail}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${mode.pillClass}`}>
          {mode.status}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        <div className={`rounded-[18px] px-3 py-2 ${roleModel.panelClass}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">
            Active role
          </p>
          <p className="mt-1 text-sm font-semibold leading-5 text-white">
            {roleModel.roleLabel}
          </p>
          <p className="mt-1 text-xs leading-5 text-white/80">
            {roleModel.nextActionLabel} · {roleModel.stateLabel}
          </p>
        </div>

        <AutonomyReadout {...props} />

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
          {props.undoRobotLabel && props.onUndoRobot && (
            <button
              type="button"
              onClick={props.onUndoRobot}
              className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:border-amber-400 hover:bg-amber-100 focus:outline-none focus:ring-4 focus:ring-amber-200"
              title={props.undoRobotLabel}
            >
              Undo role output
            </button>
          )}
          <button
            type="button"
            onClick={props.onTogglePause}
            className="rounded-full border border-slate-300 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-200"
          >
            {props.facilitatorPaused ? 'Resume role automation' : 'Pause role automation'}
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white/90 p-2 text-[11px] text-slate-600">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-slate-500">
            <span>{props.activeBeatRun ? 'Role action' : 'Ready indicator'}</span>
            <span>{triggerLabel}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-300 ${mode.progressClass}`}
              style={{ width: `${Math.max(10, Math.round((props.activeBeatRun ? 0.82 : idleProgress) * 100))}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
          {statChips.map(chip => (
            <span
              key={chip.label}
              className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1"
            >
              <span className="text-slate-400">{chip.label}</span> {chip.value}
            </span>
          ))}
        </div>

        {hasReadout && (
          <div className="rounded-xl border border-slate-200 bg-white/80 p-2.5 text-xs text-slate-600">
            {props.lastMeaningfulActivity.kind && (
              <div>
                Last board move:{' '}
                <span className="font-medium text-slate-800">{activityLabel(props.lastMeaningfulActivity.kind)}</span>{' '}
                {formatSince(props.lastMeaningfulActivity.at)}.
                {!props.activeBeatRun && ` ${props.pendingBoardChange ? 'Waiting for role pause.' : ''}`}
              </div>
            )}
            {props.lastAiAction && (
              <div className="mt-1">
                Last role output:{' '}
                <span className="font-medium text-slate-800">{beatLabel(props.lastAiAction.kind)}</span>{' '}
                {formatSince(props.lastAiAction.createdAt)}.
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function AutonomyReadout(props: CompanionCardModelInput): React.ReactElement {
  const readout = companionAutonomyReadout(props);

  return (
    <article className="space-y-2 rounded-[16px] border border-slate-200 bg-white/90 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <p>
          <span className="font-semibold text-slate-700">Configured</span>
          <span className="ml-1 block text-slate-600 sm:inline sm:ml-1.5">{readout.configuredCeiling}</span>
        </p>
        <p>
          <span className="font-semibold text-slate-700">Active</span>
          <span className="ml-1 block text-slate-600 sm:inline sm:ml-1.5">{readout.effectiveMode}</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className={`rounded-full border px-2 py-1 ${readout.backoffToneClass}`}>
          Backoff: {readout.backoffLabel}
        </span>
        <span className={`rounded-full border px-2 py-1 ${readout.capToneClass}`}>
          Cap: {readout.capLabel}
        </span>
      </div>
    </article>
  );
}
