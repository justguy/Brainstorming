import React from 'react';
import type { BeatRunState } from '../../src/beats/types';
import type { ActivityKind, SoftModeAssessment } from './softMode';
import {
  activityLabel,
  beatLabel,
  companionMode,
  facilitatorLead,
  formatDuration,
  formatSince,
  type CompanionCardModelInput,
} from './devCompanionCardModel';

interface DevCompanionCardProps extends CompanionCardModelInput {
  idleMs: number;
  activeBeatRun: BeatRunState | null;
  actionLabel?: string;
  onAction?: () => void;
  onTogglePause: () => void;
}

export function DevCompanionCard(props: DevCompanionCardProps): React.ReactElement {
  const mode = companionMode(props);
  const lead = facilitatorLead(props);
  const idleProgress = props.pendingBoardChange
    ? Math.min(1, (props.autoIdleMs - props.autoRunCountdownMs) / props.autoIdleMs)
    : Math.min(1, props.idleMs / props.autoIdleMs);
  const triggerLabel = props.activeBeatRun
    ? beatLabel(props.activeBeatRun.beat)
    : props.pendingBoardChange
      ? props.autoRunReady
        ? 'ready now'
        : `${formatDuration(props.autoRunCountdownMs)} to nudge`
      : `${Math.round(idleProgress * 100)}% primed`;
  const statChips = [
    { label: 'Mode', value: props.softModeAssessment.inferredMode },
    { label: 'Confidence', value: `${Math.round(props.softModeAssessment.confidence * 100)}%` },
    { label: 'Scout', value: formatSince(props.lastScoutRunAt) },
    { label: 'Links', value: formatSince(props.lastConnectionsRunAt) },
  ];
  const hasReadout = Boolean(props.lastMeaningfulActivity.kind || props.lastAiAction);

  return (
    <section className="bo-card-surface w-full overflow-hidden rounded-[28px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0" aria-live="polite" aria-atomic="true">
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${mode.dotClass}`} aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              AI Facilitator
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
        <div className={`rounded-[24px] px-4 py-3 ${lead.panelClass}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">
            {lead.eyebrow}
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            {lead.title}
          </p>
          <p className="mt-1 text-xs leading-5 text-white/78">
            {lead.detail}
          </p>
        </div>

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
            {props.facilitatorPaused ? 'Resume facilitator' : 'Pause facilitator'}
          </button>
        </div>

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
          <details className="rounded-2xl bg-white/75 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
            <summary className="cursor-pointer list-none font-medium text-slate-700">
              Facilitator readout
            </summary>
            <div className="mt-2 space-y-2">
              {props.lastMeaningfulActivity.kind && (
                <div>
                  Last board change:{' '}
                  <span className="font-medium text-slate-800">{activityLabel(props.lastMeaningfulActivity.kind)}</span>{' '}
                  {formatSince(props.lastMeaningfulActivity.at)}.
                  {props.pendingBoardChange && !props.activeBeatRun && ` Auto beats are ${props.autoRunReady ? 'primed' : 'waiting for idle'}.`}
                </div>
              )}
              {props.lastAiAction && (
                <div>
                  Last visible beat:{' '}
                  <span className="font-medium text-slate-800">{beatLabel(props.lastAiAction.kind)}</span>{' '}
                  {formatSince(props.lastAiAction.createdAt)}.
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
