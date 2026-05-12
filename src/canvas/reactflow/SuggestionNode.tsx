import React from 'react';
import type { BoardThemeMode, ScoutSuggestion } from '../../types';
import {
  suggestionNodeStyle,
  suggestionNodeTitle,
  suggestionRotationDeg,
  suggestionSummaryLine,
  type SuggestionNodeRenderState,
} from './reactflowHelpers';

export interface SuggestionNodeData extends SuggestionNodeRenderState, Record<string, unknown> {
  suggestion: ScoutSuggestion;
  boardTheme: BoardThemeMode;
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

type SuggestionTheme = {
  surfaceClass: string;
  selectedClass: string;
  accentTextClass: string;
  badgeClass: string;
  rawTextClass: string;
  calloutClass: string;
  primaryButtonClass: string;
  secondaryButtonClass: string;
  overflowButtonClass: string;
};

const WHITEBOARD_SUGGESTION_THEME: SuggestionTheme = {
  surfaceClass: 'rounded-[18px] border-2 border-dashed border-violet-300 bg-[rgba(255,252,247,0.88)] p-4 shadow-[0_18px_36px_-28px_rgba(71,46,125,0.42)]',
  selectedClass: 'border-violet-500 shadow-[0_24px_44px_-26px_rgba(71,46,125,0.6)]',
  accentTextClass: 'text-violet-500',
  badgeClass: 'rounded-md border border-violet-300/90 bg-white/75 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-500',
  rawTextClass: 'whitespace-pre-line text-[1.04rem] font-semibold leading-7 text-slate-800',
  calloutClass: 'text-[0.92rem] leading-6 text-slate-600',
  primaryButtonClass: 'rounded-[14px] border border-violet-300 bg-violet-50/90 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-60',
  secondaryButtonClass: 'rounded-[14px] border border-slate-300 bg-white/85 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-700 disabled:opacity-60',
  overflowButtonClass: 'rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-500 hover:bg-violet-100/80',
};

const SKETCH_SUGGESTION_THEME: SuggestionTheme = {
  surfaceClass: 'rounded-[6px] border-2 border-dashed border-[#6b5a44] bg-[#fff8e7] p-4 shadow-[3px_4px_0_rgba(26,24,20,0.18),6px_10px_22px_rgba(26,24,20,0.1)]',
  selectedClass: 'border-[#1a1814] shadow-[4px_5px_0_rgba(26,24,20,0.28),8px_12px_26px_rgba(26,24,20,0.16)]',
  accentTextClass: 'text-[#7c5a25]',
  badgeClass: 'rounded-sm border border-[#6b5a44]/70 bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7c5a25]',
  rawTextClass: 'whitespace-pre-line text-[1.18rem] leading-7 text-[#1a1814] font-["Caveat","Gloria_Hallelujah",cursive] font-semibold',
  calloutClass: 'text-[0.96rem] leading-6 text-[#4a4740] font-["Kalam","Patrick_Hand",cursive]',
  primaryButtonClass: 'rounded-[6px] border-2 border-[#7c5a25] bg-[#f5e9c4] px-3 py-1.5 text-xs font-semibold text-[#1a1814] transition hover:bg-[#ebd9a1] disabled:opacity-60',
  secondaryButtonClass: 'rounded-[6px] border-2 border-[#1a1814]/40 bg-[#fff8e7] px-3 py-1.5 text-xs font-medium text-[#1a1814]/80 transition hover:border-[#1a1814]/70 hover:text-[#1a1814] disabled:opacity-60',
  overflowButtonClass: 'rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7c5a25] hover:bg-[#f1e1b3]/80',
};

function suggestionTheme(boardTheme: BoardThemeMode): SuggestionTheme {
  return boardTheme === 'sketch' ? SKETCH_SUGGESTION_THEME : WHITEBOARD_SUGGESTION_THEME;
}

export function SuggestionNode({
  data,
  selected = false,
  dragging = false,
  className,
  style,
}: SuggestionNodeProps): React.ReactElement {
  const { suggestion, boardTheme } = data;
  const callout = suggestionSummaryLine(suggestion);
  const canExpandOverflow = (data.overflowCount ?? 0) > 0 && typeof data.onExpandOverflow === 'function';
  const canCollapseOverflow = !!data.expandedList && typeof data.onCollapseOverflow === 'function';
  const theme = suggestionTheme(boardTheme);
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
      className={[
        'bo-card-surface group w-[248px] transition-[transform,box-shadow] duration-200',
        theme.surfaceClass,
        data.animated ? 'bo-suggestion-enter' : '',
        selected ? theme.selectedClass : '',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
        className ?? '',
      ].filter(Boolean).join(' ')}
      style={nodeStyle}
    >
      <div className="flex min-h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <p className={`text-[10px] font-semibold uppercase tracking-[0.24em] ${theme.accentTextClass}`}>
            Scout
          </p>
          <span className={theme.badgeClass}>
            idea
          </span>
        </div>

        <div className="space-y-2">
          <p className={theme.rawTextClass}>
            {suggestion.rawText}
          </p>
          {callout && (
            <p className={theme.calloutClass}>
              {callout}
            </p>
          )}
        </div>

        <div className="mt-auto pt-1">
          <div className="flex flex-wrap items-center gap-2 cursor-pointer">
            <button
              type="button"
              onPointerDown={event => event.stopPropagation()}
              onClick={event => {
                event.stopPropagation();
                data.onAdmit?.(suggestion.id);
              }}
              disabled={data.busy !== null}
              className={`nodrag nopan ${theme.primaryButtonClass}`}
            >
              {data.busy === 'admit' ? 'keeping…' : 'keep it'}
            </button>
            {data.onElaborate && (
              <button
                type="button"
                onPointerDown={event => event.stopPropagation()}
                onClick={event => {
                  event.stopPropagation();
                  data.onElaborate?.(suggestion.id);
                }}
                disabled={data.busy !== null}
                className={`nodrag nopan ${theme.secondaryButtonClass}`}
              >
                {data.busy === 'elaborate' ? 'thinking…' : 'elaborate'}
              </button>
            )}
            <button
              type="button"
              onPointerDown={event => event.stopPropagation()}
              onClick={event => {
                event.stopPropagation();
                data.onDismiss?.(suggestion.id);
              }}
              disabled={data.busy !== null}
              className={`nodrag nopan ${theme.secondaryButtonClass}`}
            >
              {data.busy === 'dismiss' ? 'dismissing…' : 'dismiss'}
            </button>

            {canExpandOverflow && (
              <button
                type="button"
                onPointerDown={event => event.stopPropagation()}
                onClick={event => {
                  event.stopPropagation();
                  data.onExpandOverflow?.();
                }}
                className={`nodrag nopan ${theme.overflowButtonClass}`}
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
                className={`nodrag nopan ${theme.overflowButtonClass}`}
              >
                Collapse
              </button>
            )}
          </div>
          {data.error && (
            <p
              role="alert"
              className="mt-2 text-[11px] font-medium leading-4 text-rose-600"
            >
              {data.error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
