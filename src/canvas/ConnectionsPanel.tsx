import React, { useEffect, useMemo, useState } from 'react';
import type { Connection, ConnectionKind, Idea } from '../types';

export interface ConnectionsPanelProps {
  ideas: Idea[];
  connections: Connection[];
  busy: boolean;
  onRun: () => void;
  onHighlight: (ideaIds: string[]) => void;
  onCreateConnection: (input: {
    fromIdeaId: string;
    toIdeaId: string;
    kind: Connection['kind'];
    rationale: string;
  }) => Promise<Connection>;
  lastRunAt?: number | null;
}

const KIND_OPTIONS: Array<{ value: ConnectionKind; label: string; shortLabel: string; description: string }> = [
  {
    value: 'builds_on',
    label: 'Builds on',
    shortLabel: 'Builds on',
    description: 'One note extends or depends on the other.',
  },
  {
    value: 'contradicts',
    label: 'Contradicts',
    shortLabel: 'Contradicts',
    description: 'The notes pull in opposite directions.',
  },
  {
    value: 'revives_killed',
    label: 'Revives killed',
    shortLabel: 'Revives',
    description: 'A live note brings back something the board already discarded.',
  },
  {
    value: 'shared_theme',
    label: 'Shared theme',
    shortLabel: 'Theme',
    description: 'The notes belong to the same thread or pattern.',
  },
  {
    value: 'depends_on',
    label: 'Depends on',
    shortLabel: 'Depends',
    description: 'One note requires the other to land first.',
  },
  {
    value: 'evidence_for',
    label: 'Evidence for',
    shortLabel: 'Evidence',
    description: 'One note backs the other with data, citation, or example.',
  },
];

const KIND_LABEL: Record<ConnectionKind, string> = {
  builds_on: 'builds on',
  contradicts: 'contradicts',
  revives_killed: 'revives killed',
  shared_theme: 'shared theme',
  depends_on: 'depends on',
  evidence_for: 'evidence for',
};

// Panel chip palette mirrors the canvas line stroke families:
//   builds_on    → teal/emerald (parent-of "Ink" leans teal in this product)
//   contradicts  → rose
//   revives_killed → amber (legacy 6th kind, kept distinct in the panel)
//   shared_theme → sky (AI blue)
//   depends_on   → green (Revives green family — solid arrow on canvas)
//   evidence_for → green (Revives green family — dotted on canvas)
const KIND_COLOR: Record<ConnectionKind, string> = {
  builds_on: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  contradicts: 'border-rose-200 bg-rose-50 text-rose-700',
  revives_killed: 'border-amber-200 bg-amber-50 text-amber-800',
  shared_theme: 'border-sky-200 bg-sky-50 text-sky-700',
  depends_on: 'border-green-200 bg-green-50 text-green-700',
  evidence_for: 'border-green-200 bg-green-50 text-green-700',
};

const STRENGTH_DOTS: Record<Connection['strength'], string> = {
  weak: '.',
  medium: '..',
  strong: '...',
};

const DEFAULT_VISIBLE_CONNECTIONS = 3;

export default function ConnectionsPanel({
  ideas,
  connections,
  busy,
  onRun,
  onHighlight,
  onCreateConnection,
  lastRunAt,
}: ConnectionsPanelProps): React.ReactElement {
  const [composerOpen, setComposerOpen] = useState(() => connections.length === 0 && ideas.length >= 2);
  const [showAllConnections, setShowAllConnections] = useState(false);
  const [fromIdeaId, setFromIdeaId] = useState('');
  const [toIdeaId, setToIdeaId] = useState('');
  const [kind, setKind] = useState<ConnectionKind>('builds_on');
  const [rationale, setRationale] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const ideaOptions = useMemo(
    () => ideas.map(idea => ({ id: idea.id, label: ideaLabel(idea) })),
    [ideas],
  );
  const ideaLabelById = useMemo(
    () => new Map(ideaOptions.map(option => [option.id, option.label])),
    [ideaOptions],
  );
  const manualCount = connections.filter(connection => connection.id.startsWith('manual-')).length;
  const facilitatedCount = Math.max(0, connections.length - manualCount);
  const orderedConnections = useMemo(
    () => [...connections].sort((left, right) => {
      const leftManual = left.id.startsWith('manual-');
      const rightManual = right.id.startsWith('manual-');
      if (leftManual !== rightManual) return leftManual ? -1 : 1;
      return right.createdAt - left.createdAt;
    }),
    [connections],
  );
  const hasOverflowConnections = orderedConnections.length > DEFAULT_VISIBLE_CONNECTIONS;
  const visibleConnections = showAllConnections
    ? orderedConnections
    : orderedConnections.slice(0, DEFAULT_VISIBLE_CONNECTIONS);

  useEffect(() => {
    if (connections.length === 0) {
      setComposerOpen(ideas.length >= 2);
    }
  }, [connections.length, ideas.length]);

  useEffect(() => {
    if (ideaOptions.length === 0) {
      setFromIdeaId('');
      setToIdeaId('');
      return;
    }

    const validIdeaIds = new Set(ideaOptions.map(option => option.id));
    const nextFrom = validIdeaIds.has(fromIdeaId) ? fromIdeaId : ideaOptions[0]?.id ?? '';
    const nextTo = validIdeaIds.has(toIdeaId) && toIdeaId !== nextFrom
      ? toIdeaId
      : ideaOptions.find(option => option.id !== nextFrom)?.id ?? '';

    if (nextFrom !== fromIdeaId) setFromIdeaId(nextFrom);
    if (nextTo !== toIdeaId) setToIdeaId(nextTo);
  }, [fromIdeaId, ideaOptions, toIdeaId]);

  useEffect(() => {
    if (!feedback || feedback.tone !== 'success') return undefined;
    const timer = window.setTimeout(() => {
      setFeedback(current => (current === feedback ? null : current));
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const canAuthor = ideaOptions.length >= 2;
  const selectedKind = KIND_OPTIONS.find(option => option.value === kind) ?? KIND_OPTIONS[0];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      await onCreateConnection({
        fromIdeaId,
        toIdeaId,
        kind,
        rationale,
      });
      const fromLabel = ideaLabelById.get(fromIdeaId) ?? 'First note';
      const toLabel = ideaLabelById.get(toIdeaId) ?? 'Second note';
      setRationale('');
      setComposerOpen(false);
      setFeedback({
        tone: 'success',
        message: `Saved "${fromLabel}" ${KIND_LABEL[kind]} "${toLabel}".`,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not save the connection.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bo-card-surface rounded-[28px] bg-[linear-gradient(180deg,rgba(255,252,245,0.98),rgba(255,255,255,0.98))] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
            Connections
          </p>
          <h3 className="mt-1.5 text-sm font-semibold text-slate-900">
            Add links without leaving the board
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Add one yourself, or ask the facilitator to scan the notes already on the canvas.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="rounded-full border border-amber-200 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
            {connections.length} saved
          </div>
          {lastRunAt && (
            <p className="mt-1 text-[10px] text-slate-400">
              Updated {formatAge(lastRunAt)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-[20px] border border-slate-200 bg-white/80 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Manual</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{manualCount}</p>
        </div>
        <div className="rounded-[20px] border border-slate-200 bg-white/80 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Facilitator</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{facilitatedCount}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setComposerOpen(current => !current)}
          disabled={!canAuthor}
          className="rounded-full bg-slate-900 px-3.5 py-2 text-[11px] font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {composerOpen ? 'Close manual add' : 'Add connection manually'}
        </button>
        <button
          type="button"
          onClick={onRun}
          disabled={busy}
          className="rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-[11px] font-semibold text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 focus:outline-none focus:ring-4 focus:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Facilitator scanning...' : 'Ask facilitator to find links'}
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-5 text-slate-500">
        Manual links stay durable on the board. Facilitator scans refresh the suggested layer around them.
      </p>

      {!canAuthor && (
        <p className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
          Capture at least two notes to add a durable connection manually.
        </p>
      )}

      {feedback && (
        <p
          className={`mt-3 rounded-2xl px-3 py-2 text-[11px] leading-5 ${
            feedback.tone === 'error'
              ? 'border border-rose-200 bg-rose-50 text-rose-700'
              : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {feedback.message}
        </p>
      )}

      {composerOpen && canAuthor && (
        <form className="mt-3 rounded-[24px] border border-amber-100 bg-white/90 p-3" onSubmit={handleSubmit}>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-[11px] font-medium text-slate-700">
              From
              <select
                value={fromIdeaId}
                onChange={event => setFromIdeaId(event.target.value)}
                disabled={!canAuthor || saving}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-300 focus:outline-none focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                {ideaOptions.length === 0 && <option value="">Capture a note first</option>}
                {ideaOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-[11px] font-medium text-slate-700">
              To
              <select
                value={toIdeaId}
                onChange={event => setToIdeaId(event.target.value)}
                disabled={!canAuthor || saving}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-300 focus:outline-none focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                {ideaOptions.length <= 1 && <option value="">Capture one more note</option>}
                {ideaOptions.map(option => (
                  <option key={option.id} value={option.id} disabled={option.id === fromIdeaId}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3">
            <p className="text-[11px] font-medium text-slate-700">Relationship</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {KIND_OPTIONS.map(option => {
                const active = option.value === kind;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setKind(option.value)}
                    disabled={saving}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition focus:outline-none focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {option.shortLabel}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">{selectedKind.description}</p>
          </div>

          <label className="mt-3 grid gap-1 text-[11px] font-medium text-slate-700">
            Why does this link matter?
            <textarea
              value={rationale}
              onChange={event => setRationale(event.target.value)}
              rows={2}
              disabled={!canAuthor || saving}
              placeholder="Describe the relationship in board language."
              className="resize-none rounded-[20px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-teal-300 focus:outline-none focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-50"
            />
          </label>

          {!canAuthor && (
            <p className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">
              Capture at least two visible notes before creating a connection.
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] leading-5 text-slate-500">
              Saving will flash the linked notes on the canvas.
            </p>
            <button
              type="submit"
              disabled={!canAuthor || saving || !fromIdeaId || !toIdeaId || !rationale.trim()}
              className="shrink-0 rounded-full bg-slate-900 px-3.5 py-2 text-[11px] font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {saving ? 'Saving...' : 'Save to board'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-900">Saved connections</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Click any saved link to flash the related notes on the board.
            </p>
          </div>
          {hasOverflowConnections && (
            <button
              type="button"
              onClick={() => setShowAllConnections(current => !current)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 focus:outline-none focus:ring-4 focus:ring-slate-100"
            >
              {showAllConnections ? 'Show less' : `Show all ${orderedConnections.length}`}
            </button>
          )}
        </div>

        {orderedConnections.length === 0 ? (
          <p className="mt-3 rounded-[22px] border border-dashed border-slate-200 bg-white/80 px-3 py-3 text-xs leading-5 text-slate-500">
            No connections yet. Add one manually, or ask the facilitator to scan the board and suggest links.
          </p>
        ) : (
          <ul className={`mt-3 grid gap-2 ${showAllConnections ? 'max-h-64 overflow-y-auto pr-1' : ''}`}>
            {visibleConnections.map(connection => {
              const manual = connection.id.startsWith('manual-');
              return (
                <li key={connection.id}>
                  <button
                    type="button"
                    onClick={() => onHighlight(connection.ideaIds)}
                    className="flex w-full flex-col rounded-[22px] border border-slate-200 bg-white/90 px-3 py-3 text-left transition hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-4 focus:ring-amber-100"
                    aria-label={`${manual ? 'Manual' : 'Facilitator'} connection: ${connectionParticipants(connection.ideaIds, ideaLabelById)}.`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${KIND_COLOR[connection.kind]}`}>
                        {KIND_LABEL[connection.kind]}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {manual ? 'manual' : 'facilitator'}
                      </span>
                      <span className="text-[10px] text-slate-400" title={`strength: ${connection.strength}`}>
                        {STRENGTH_DOTS[connection.strength]}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-medium leading-5 text-slate-800">
                      {connectionParticipants(connection.ideaIds, ideaLabelById)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                      {connection.rationale}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function ideaLabel(idea: Idea): string {
  const firstLine = idea.rawText
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean);
  return firstLine ?? 'Untitled note';
}

function connectionParticipants(ideaIds: string[], labels: Map<string, string>): string {
  return ideaIds
    .map(ideaId => labels.get(ideaId) ?? 'Board note')
    .join(' <-> ');
}

function formatAge(ms: number): string {
  const delta = Math.max(0, Date.now() - ms);
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return `${Math.round(delta / 3_600_000)}h ago`;
}
