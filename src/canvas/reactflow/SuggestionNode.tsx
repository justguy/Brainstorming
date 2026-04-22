import React, { useState } from 'react';
import type { ScoutSuggestion } from '../../types';
import {
  suggestionNodeStyle,
  suggestionNodeTitle,
  suggestionRotationDeg,
  suggestionSummaryLine,
  type SuggestionNodeRenderState,
} from './reactflowHelpers';

export interface SuggestionNodeData extends SuggestionNodeRenderState, Record<string, unknown> {
  suggestion: ScoutSuggestion;
  onAdmit?: (id: string) => void;
  onElaborate?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onExpandOverflow?: () => void;
  onCollapseOverflow?: () => void;
}

export interface SuggestionNodeProps {
  id: string;
  data: SuggestionNodeData;
  selected?: boolean;
  dragging?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function SuggestionNode({
  data,
  selected = false,
  dragging = false,
  className,
  style,
}: SuggestionNodeProps): React.ReactElement {
  const { suggestion } = data;
  const [hovering, setHovering] = useState(false);
  const callout = suggestionSummaryLine(suggestion);
  const showActions = hovering || data.busy !== null || dragging || selected;
  const canExpandOverflow = (data.overflowCount ?? 0) > 0 && typeof data.onExpandOverflow === 'function';
  const canCollapseOverflow = !!data.expandedList && typeof data.onCollapseOverflow === 'function';
  const nodeStyle = {
    transform: `rotate(${suggestionRotationDeg(suggestion.id)}deg)`,
    ...suggestionNodeStyle(data.animated),
    ...style,
  };

  return (
    <div
      data-artifact-surface="suggestion-card"
      role="group"
      aria-label={`Scout suggestion: ${suggestionNodeTitle(suggestion)}`}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={event => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setHovering(false);
      }}
      className={[
        'bo-card-surface w-[248px] rounded-[18px] border-2 border-dashed border-violet-300 bg-[rgba(255,252,247,0.88)] p-4 shadow-[0_18px_36px_-28px_rgba(71,46,125,0.42)] transition-[transform,box-shadow] duration-200',
        data.animated ? 'bo-suggestion-enter' : '',
        selected ? 'border-violet-500 shadow-[0_24px_44px_-26px_rgba(71,46,125,0.6)]' : '',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
        className ?? '',
      ].filter(Boolean).join(' ')}
      style={nodeStyle}
    >
      <div className="flex min-h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-violet-500">
            Scout
          </p>
          <span className="rounded-md border border-violet-300/90 bg-white/75 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-500">
            idea
          </span>
        </div>

        <div className="space-y-2">
          <p className="whitespace-pre-line text-[1.04rem] font-semibold leading-7 text-slate-800">
            {suggestion.rawText}
          </p>
          {callout && (
            <p className="text-[0.92rem] leading-6 text-slate-600">
              {callout}
            </p>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {showActions && (
            <>
              <button
                type="button"
                onPointerDown={event => event.stopPropagation()}
                onClick={event => {
                  event.stopPropagation();
                  data.onAdmit?.(suggestion.id);
                }}
                disabled={data.busy !== null}
                className="nodrag nopan rounded-[14px] border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
              >
                {data.busy === 'admit' ? 'keeping…' : 'keep it'}
              </button>
              <button
                type="button"
                onPointerDown={event => event.stopPropagation()}
                onClick={event => {
                  event.stopPropagation();
                  data.onElaborate?.(suggestion.id);
                }}
                disabled={data.busy !== null}
                className="nodrag nopan rounded-[14px] border border-slate-300 bg-white/92 px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-60"
              >
                {data.busy === 'elaborate' ? 'thinking…' : 'elaborate'}
              </button>
              <button
                type="button"
                onPointerDown={event => event.stopPropagation()}
                onClick={event => {
                  event.stopPropagation();
                  data.onDismiss?.(suggestion.id);
                }}
                disabled={data.busy !== null}
                className="nodrag nopan rounded-[14px] border border-slate-300 bg-white/92 px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-60"
              >
                {data.busy === 'dismiss' ? 'dismissing…' : 'dismiss'}
              </button>
            </>
          )}

          {!showActions && (
            <div className="text-[10px] uppercase tracking-[0.18em] text-violet-400">
              Review on hover
            </div>
          )}

          {canExpandOverflow && (
            <button
              type="button"
              onPointerDown={event => event.stopPropagation()}
              onClick={event => {
                event.stopPropagation();
                data.onExpandOverflow?.();
              }}
              className="nodrag nopan rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-500 hover:bg-violet-100/80"
            >
              +{data.overflowCount} more
            </button>
          )}

          {canCollapseOverflow && (
            <button
              type="button"
              onPointerDown={event => event.stopPropagation()}
              onClick={event => {
                event.stopPropagation();
                data.onCollapseOverflow?.();
              }}
              className="nodrag nopan rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-500 hover:bg-violet-100/80"
            >
              Collapse
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
