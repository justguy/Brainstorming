import React from 'react';
import {
  buildCompanionSessionSummary,
  type CompanionSessionInput,
} from './companionSessionSummary';

interface CollaborativeSessionCardProps {
  session: CompanionSessionInput;
}

export function CollaborativeSessionCard({
  session,
}: CollaborativeSessionCardProps): React.ReactElement | null {
  const summary = buildCompanionSessionSummary(session);
  const [expanded, setExpanded] = React.useState(() => summary.status === 'shared pause' || summary.status === 'awaiting host');
  if (!summary.visible) return null;
  const peerPreview = expanded ? summary.peerLabels : summary.peerLabels.slice(0, 3);
  const hiddenPeerCount = summary.peerLabels.length - peerPreview.length;

  return (
    <section className="bo-card-surface w-full overflow-hidden rounded-[28px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${statusDot(summary.status)}`} aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Shared facilitator
            </p>
          </div>
          <h2 className="mt-2 text-sm font-semibold text-slate-900">{summary.headline}</h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">{summary.detail}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusPill(summary.status)}`}>
          {summary.status}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-2xl bg-white/75 px-3 py-3 ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Session pulse</div>
              <p className="mt-2 text-xs leading-5 text-slate-600">{summary.consensusSummary}</p>
              {summary.actionItems[0] && (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Next: <span className="font-medium text-slate-700">{summary.actionItems[0]}</span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setExpanded(value => !value)}
              className="shrink-0 rounded-full border border-slate-300 bg-white/85 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-200"
              aria-expanded={expanded}
            >
              {expanded ? 'Hide details' : 'Session details'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-white/75 px-3 py-3 ring-1 ring-slate-200">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Active peers</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {peerPreview.map(label => (
              <span
                key={label}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700"
              >
                {label}
              </span>
            ))}
            {hiddenPeerCount > 0 && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                +{hiddenPeerCount} more
              </span>
            )}
          </div>
        </div>

        {expanded && summary.recentSpeakerLabels.length > 0 && (
          <div className="rounded-2xl bg-white/75 px-3 py-3 ring-1 ring-slate-200">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Recent floor</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {summary.recentSpeakerLabels.map(label => (
                <span
                  key={label}
                  className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {expanded && summary.actionItems.length > 0 && (
          <div className="rounded-2xl bg-white/75 px-3 py-3 ring-1 ring-slate-200">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Session actions</div>
            <ul className="mt-2 space-y-2">
              {summary.actionItems.map(item => (
                <li key={item} className="flex gap-2 text-xs leading-5 text-slate-600">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function statusDot(status: string): string {
  switch (status) {
    case 'shared pause':
      return 'bg-amber-400';
    case 'manual host':
      return 'bg-violet-500';
    case 'hosting here':
      return 'bg-emerald-500';
    case 'hosted remotely':
      return 'bg-sky-500';
    default:
      return 'bg-slate-400';
  }
}

function statusPill(status: string): string {
  switch (status) {
    case 'shared pause':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'manual host':
      return 'border-violet-200 bg-violet-50 text-violet-700';
    case 'hosting here':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'hosted remotely':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    default:
      return 'border-slate-300 bg-slate-100 text-slate-700';
  }
}
