/**
 * GhostPanel — a dashed-teal card representing a pending scout suggestion.
 *
 * Lives on the canvas alongside IdeaPanels. Hover (or keyboard focus) reveals
 * Admit / Elaborate / Dismiss actions. Heavier context stays collapsed until
 * the user explicitly opens it in the card itself.
 */

import React, { useState } from 'react';
import type { ScoutSuggestion } from '../types';

export interface GhostPanelProps {
  suggestion: ScoutSuggestion;
  busy?: 'admit' | 'elaborate' | 'dismiss' | null;
  animated?: boolean;
  overflowCount?: number;
  expandedList?: boolean;
  onExpandOverflow?: () => void;
  onCollapseOverflow?: () => void;
  onAdmit: (id: string) => void;
  onElaborate: (id: string) => void;
  onDismiss: (id: string) => void;
}

const DEFAULT_PANEL = { x: 480, y: 60, width: 280, height: 200 } as const;
const ELABORATION_HEADING_RE = /^\*\*(.+?)\*\*:?\s*$/;

interface DetailSection {
  title: string;
  paragraphs: string[];
  items: string[];
}

function parseElaboration(elaboration: string): {
  intro: string[];
  sections: DetailSection[];
} {
  const blocks = elaboration
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean);
  const intro: string[] = [];
  const sections: DetailSection[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const headingMatch = lines[0].match(ELABORATION_HEADING_RE);
    if (!headingMatch) {
      intro.push(lines.join(' '));
      continue;
    }

    const body = lines.slice(1);
    const items = body.filter(line => line.startsWith('- ')).map(line => line.slice(2).trim());
    const paragraphs = body.filter(line => !line.startsWith('- '));
    sections.push({
      title: headingMatch[1].trim(),
      paragraphs,
      items,
    });
  }

  return { intro, sections };
}

export default function GhostPanel({
  suggestion,
  busy,
  animated = false,
  overflowCount = 0,
  expandedList = false,
  onExpandOverflow,
  onCollapseOverflow,
  onAdmit,
  onElaborate,
  onDismiss,
}: GhostPanelProps): React.ReactElement {
  const panel = suggestion.panel ?? DEFAULT_PANEL;
  const [expanded, setExpanded] = useState(false);
  const [hovering, setHovering] = useState(false);

  const hasElaboration = !!suggestion.elaboration;
  const relatedCount = suggestion.relatedIdeaIds?.length ?? 0;
  const details = hasElaboration ? parseElaboration(suggestion.elaboration ?? '') : null;
  const showActions = hovering || expanded || busy !== null;
  const showContext = hovering || expanded || busy === 'elaborate';
  const hasDetailToggle = hasElaboration || relatedCount > 0 || suggestion.rationale.length > 0;
  const canExpandOverflow = overflowCount > 0 && !!onExpandOverflow;
  const canCollapseOverflow = expandedList && !!onCollapseOverflow;

  return (
    <div
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={event => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setHovering(false);
      }}
      style={{
        position: 'absolute',
        left: panel.x,
        top: panel.y,
        width: panel.width,
        minHeight: panel.height,
        zIndex: hovering || expanded || busy ? 6 : 2,
      }}
      className={`rounded-2xl border-2 border-dashed border-teal-400 bg-gradient-to-br from-teal-50/90 via-cyan-50/70 to-white shadow-sm transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        animated ? 'bo-suggestion-enter' : ''
      }`}
      role="group"
      aria-label={`Scout suggestion: ${suggestion.rawText.slice(0, 60)}`}
    >
      <div className="flex h-full flex-col gap-2.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-teal-300 bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">
              Ghost
            </span>
            <span className="rounded-full bg-teal-100/80 px-2 py-0.5 text-[10px] text-teal-800">
              {suggestion.source}
            </span>
          </div>
          {busy && (
            <span className="text-[10px] italic text-teal-700">
              {busy === 'admit' ? 'Admitting…' : busy === 'elaborate' ? 'Elaborating…' : 'Dismissing…'}
            </span>
          )}
        </div>

        <p className={`text-sm font-medium leading-snug text-slate-900 ${expanded ? '' : 'line-clamp-4'}`}>
          {suggestion.rawText}
        </p>

        <div className="flex flex-wrap gap-1.5">
          {relatedCount > 0 && (
            <span className="rounded-full bg-white/85 px-2 py-0.5 text-[10px] text-slate-600 ring-1 ring-slate-200/80">
              in dialogue with {relatedCount} idea{relatedCount === 1 ? '' : 's'}
            </span>
          )}
          {hasElaboration && (
            <span className="rounded-full bg-white/85 px-2 py-0.5 text-[10px] text-teal-700 ring-1 ring-teal-200/90">
              details ready
            </span>
          )}
        </div>

        {showContext && (
          <div className="space-y-2 rounded-xl border border-teal-200/90 bg-white/75 p-2.5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">
                Why It Surfaced
              </p>
              <p className={`mt-1 text-[11px] italic leading-snug text-slate-600 ${expanded ? '' : 'line-clamp-3'}`}>
                {suggestion.rationale}
              </p>
            </div>

            {expanded && details && (
              <div className="space-y-2 border-t border-teal-100 pt-2">
                {details.intro.map((paragraph, index) => (
                  <p key={`intro-${index}`} className="text-[11px] leading-snug text-slate-700">
                    {paragraph}
                  </p>
                ))}

                {details.sections.map(section => (
                  <div key={section.title} className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                      {section.title}
                    </p>
                    {section.paragraphs.map((paragraph, index) => (
                      <p key={`${section.title}-${index}`} className="text-[11px] leading-snug text-slate-700">
                        {paragraph}
                      </p>
                    ))}
                    {section.items.length > 0 && (
                      <ul className="space-y-1 text-[11px] leading-snug text-slate-700">
                        {section.items.map(item => (
                          <li key={item} className="flex gap-1.5">
                            <span className="mt-[2px] text-teal-600">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2">
            {hasDetailToggle ? (
              <button
                type="button"
                onClick={() => setExpanded(value => !value)}
                className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-700 hover:bg-teal-100/80 focus:outline-none focus:ring-2 focus:ring-teal-400"
                aria-expanded={expanded}
              >
                {expanded ? 'Hide details' : hasElaboration ? 'Open details' : 'Why this'}
              </button>
            ) : null}
            {canExpandOverflow && (
              <button
                type="button"
                onClick={onExpandOverflow}
                className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-700 hover:bg-teal-100/80 focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                +{overflowCount} more
              </button>
            )}
            {canCollapseOverflow && !canExpandOverflow && (
              <button
                type="button"
                onClick={onCollapseOverflow}
                className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                Show fewer
              </button>
            )}
          </div>

          {showActions && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onElaborate(suggestion.id)}
                disabled={!!busy || hasElaboration}
                className="rounded-md border border-teal-300 bg-white px-2 py-1 text-[11px] font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-teal-400"
                title={hasElaboration ? 'Already elaborated' : 'Ask the scout to flesh this out'}
              >
                Elaborate
              </button>
              <button
                type="button"
                onClick={() => onAdmit(suggestion.id)}
                disabled={!!busy}
                className="rounded-md bg-teal-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-teal-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                Admit
              </button>
              <button
                type="button"
                onClick={() => onDismiss(suggestion.id)}
                disabled={!!busy}
                className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
