/**
 * ConnectionsPanel — collapsible drawer pinned to the canvas top-right.
 *
 * Lists connections produced by the connectionFinder LLM role. Each connection
 * shows its kind, strength, and rationale, plus a click target that flashes
 * the involved panels on the canvas. The latest board connection set is
 * persisted so the canvas survives refresh, and re-running refreshes it.
 */

import React, { useState } from 'react';
import type { Connection, ConnectionKind } from '../types';

export interface ConnectionsPanelProps {
  connections: Connection[];
  busy: boolean;
  onRun: () => void;
  onHighlight: (ideaIds: string[]) => void;
  /** Wall-clock ms of the last successful run, for stale-hint. */
  lastRunAt?: number | null;
}

const KIND_LABEL: Record<ConnectionKind, string> = {
  builds_on: 'builds on',
  contradicts: 'contradicts',
  revives_killed: 'revives killed',
  shared_theme: 'shared theme',
};

const KIND_COLOR: Record<ConnectionKind, string> = {
  builds_on: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  contradicts: 'bg-rose-50 text-rose-700 border-rose-200',
  revives_killed: 'bg-amber-50 text-amber-800 border-amber-200',
  shared_theme: 'bg-sky-50 text-sky-700 border-sky-200',
};

const STRENGTH_DOTS: Record<Connection['strength'], string> = {
  weak: '·',
  medium: '··',
  strong: '···',
};

export default function ConnectionsPanel({
  connections,
  busy,
  onRun,
  onHighlight,
  lastRunAt,
}: ConnectionsPanelProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const count = connections.length;

  return (
    <div className="pointer-events-auto relative flex w-full max-w-[360px] flex-col items-end">
      {open && (
        <div
          className="mb-2 w-full max-h-[70vh] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl flex flex-col"
          role="region"
          aria-label="Connections"
        >
          <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              Connections ({count})
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRun}
                disabled={busy}
                className="text-[11px] font-semibold text-violet-700 hover:text-violet-900 underline disabled:text-gray-400 disabled:no-underline focus:outline-none focus:ring-2 focus:ring-violet-400 rounded"
              >
                {busy ? 'Finding…' : count === 0 ? 'Find' : 'Refresh'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-sm leading-none focus:outline-none focus:ring-2 focus:ring-violet-400 rounded"
                aria-label="Collapse connections panel"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {count === 0 && !busy && (
              <p className="text-xs text-gray-500 italic px-3 py-4">
                No connections yet. Click <strong>Find</strong> above to ask the model to surface
                links across live ideas, the discard pile, and attached docs.
              </p>
            )}
            {busy && count === 0 && (
              <p className="text-xs text-gray-500 italic px-3 py-4">Reading the board…</p>
            )}
            <ul>
              {connections.map(conn => (
                <li
                  key={conn.id}
                  className="border-b border-gray-100 last:border-b-0 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  onClick={() => onHighlight(conn.ideaIds)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onHighlight(conn.ideaIds);
                    }
                  }}
                  aria-label={`${KIND_LABEL[conn.kind]} (${conn.strength}): ${conn.rationale.slice(0, 80)}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${KIND_COLOR[conn.kind]}`}
                    >
                      {KIND_LABEL[conn.kind]}
                    </span>
                    <span className="text-[10px] text-gray-500" title={`strength: ${conn.strength}`}>
                      {STRENGTH_DOTS[conn.strength]}
                    </span>
                    <span className="text-[10px] text-gray-400 ml-auto">
                      {conn.ideaIds.length} idea{conn.ideaIds.length === 1 ? '' : 's'}
                      {conn.supportingDocIds && conn.supportingDocIds.length > 0
                        ? ` · ${conn.supportingDocIds.length} doc${conn.supportingDocIds.length === 1 ? '' : 's'}`
                        : ''}
                    </span>
                  </div>
                  <p className="text-xs text-gray-800 mt-1 leading-snug line-clamp-3">
                    {conn.rationale}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          {lastRunAt && (
            <div className="shrink-0 px-3 py-1.5 border-t border-gray-100 text-[10px] text-gray-400 bg-gray-50">
              Last run {formatAge(lastRunAt)}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 rounded-full border border-gray-300 bg-white px-3 py-2 text-sm shadow hover:shadow-md focus:outline-none focus:ring-4 focus:ring-violet-300"
        aria-label={open ? 'Close connections panel' : `Open connections panel (${count} items)`}
      >
        <span>🔗</span>
        <span className="font-semibold text-gray-700">Connections</span>
        {count > 0 && (
          <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-1.5 py-0.5">{count}</span>
        )}
        {busy && (
          <span className="text-[10px] text-violet-600" aria-hidden>
            ⟳
          </span>
        )}
      </button>
    </div>
  );
}

function formatAge(ms: number): string {
  const delta = Math.max(0, Date.now() - ms);
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return `${Math.round(delta / 3_600_000)}h ago`;
}
