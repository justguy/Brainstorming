/**
 * GhostPanel — a dashed-teal card representing a pending scout suggestion.
 *
 * Lives on the canvas alongside IdeaPanels. Hover (or keyboard focus) reveals
 * Admit / Elaborate / Dismiss actions. If the user has elaborated it, the
 * extra context renders below the rawText inside a collapsible expander.
 */

import React, { useState } from 'react';
import type { ScoutSuggestion } from '../types';

export interface GhostPanelProps {
  suggestion: ScoutSuggestion;
  busy?: 'admit' | 'elaborate' | 'dismiss' | null;
  onAdmit: (id: string) => void;
  onElaborate: (id: string) => void;
  onDismiss: (id: string) => void;
}

const DEFAULT_PANEL = { x: 480, y: 60, width: 280, height: 200 } as const;

export default function GhostPanel({
  suggestion,
  busy,
  onAdmit,
  onElaborate,
  onDismiss,
}: GhostPanelProps): React.ReactElement {
  const panel = suggestion.panel ?? DEFAULT_PANEL;
  const [expanded, setExpanded] = useState(false);
  const [hovering, setHovering] = useState(false);

  const hasElaboration = !!suggestion.elaboration;
  const showActions = hovering || busy !== null;

  return (
    <div
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      style={{
        position: 'absolute',
        left: panel.x,
        top: panel.y,
        width: panel.width,
        minHeight: panel.height,
        zIndex: 2,
      }}
      className="bg-teal-50/60 border-2 border-dashed border-teal-400 rounded-lg shadow-sm hover:shadow-md transition-shadow"
      role="group"
      aria-label={`Scout suggestion: ${suggestion.rawText.slice(0, 60)}`}
    >
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-teal-700 bg-teal-100 border border-teal-300 rounded px-1.5 py-0.5">
            ghost · {suggestion.source}
          </span>
          {busy && (
            <span className="text-[10px] text-teal-700 italic">
              {busy === 'admit' ? 'Admitting…' : busy === 'elaborate' ? 'Elaborating…' : 'Dismissing…'}
            </span>
          )}
        </div>

        <p className="text-sm text-gray-900 leading-snug">{suggestion.rawText}</p>

        <p className="text-[11px] text-gray-600 italic leading-snug">{suggestion.rationale}</p>

        {hasElaboration && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="self-start text-[10px] text-teal-700 hover:text-teal-900 underline focus:outline-none focus:ring-2 focus:ring-teal-400 rounded"
            aria-expanded={expanded}
          >
            {expanded ? 'Hide elaboration' : 'Show elaboration'}
          </button>
        )}

        {hasElaboration && expanded && (
          <div className="rounded bg-white/70 border border-teal-200 p-2 text-[11px] text-gray-800 whitespace-pre-wrap leading-snug">
            {suggestion.elaboration}
          </div>
        )}

        {showActions && (
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={() => onAdmit(suggestion.id)}
              disabled={!!busy}
              className="text-[11px] font-semibold px-2 py-1 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              Admit
            </button>
            <button
              type="button"
              onClick={() => onElaborate(suggestion.id)}
              disabled={!!busy || hasElaboration}
              className="text-[11px] font-semibold px-2 py-1 bg-white text-teal-700 border border-teal-300 rounded hover:bg-teal-50 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-teal-400"
              title={hasElaboration ? 'Already elaborated' : 'Ask the scout to flesh this out'}
            >
              Elaborate
            </button>
            <button
              type="button"
              onClick={() => onDismiss(suggestion.id)}
              disabled={!!busy}
              className="text-[11px] font-semibold px-2 py-1 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded ml-auto"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
