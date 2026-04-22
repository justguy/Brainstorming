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
  onDragStart?: (id: string) => void;
  onDrag?: (id: string, x: number, y: number) => void;
  onDragEnd?: (id: string, x: number, y: number) => void;
  liveX?: number;
  liveY?: number;
  onAdmit: (id: string) => void;
  onElaborate: (id: string) => void;
  onDismiss: (id: string) => void;
}

const DEFAULT_PANEL = { x: 480, y: 60, width: 248, height: 172 } as const;

function hashRotation(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) | 0;
  }
  return ((Math.abs(hash) % 12) - 6) / 3;
}

function summaryLine(suggestion: ScoutSuggestion): string | null {
  const rationale = suggestion.rationale.trim();
  if (!rationale) return null;
  return rationale.length > 82 ? `${rationale.slice(0, 79)}…` : rationale;
}

export default function GhostPanel({
  suggestion,
  busy,
  animated = false,
  overflowCount = 0,
  expandedList = false,
  onExpandOverflow,
  onCollapseOverflow,
  onDragStart,
  onDrag,
  onDragEnd,
  liveX,
  liveY,
  onAdmit,
  onDismiss,
}: GhostPanelProps): React.ReactElement {
  const panel = suggestion.panel ?? DEFAULT_PANEL;
  const x = liveX ?? panel.x;
  const y = liveY ?? panel.y;
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const showActions = hovering || busy !== null;
  const canExpandOverflow = overflowCount > 0 && !!onExpandOverflow;
  const canCollapseOverflow = expandedList && !!onCollapseOverflow;
  const callout = summaryLine(suggestion);
  const dragState = React.useRef<{ px: number; py: number; wx: number; wy: number } | null>(null);
  const movedRef = React.useRef(false);
  const draggingRef = React.useRef(false);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragState.current = { px: e.clientX, py: e.clientY, wx: panel.x, wy: panel.y };
    movedRef.current = false;
    e.stopPropagation();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.px;
    const dy = e.clientY - dragState.current.py;
    if (!movedRef.current && Math.hypot(dx, dy) > 4) {
      movedRef.current = true;
      draggingRef.current = true;
      setDragging(true);
      onDragStart?.(suggestion.id);
    }
    if (draggingRef.current) {
      onDrag?.(
        suggestion.id,
        Math.max(0, dragState.current.wx + dx),
        Math.max(0, dragState.current.wy + dy),
      );
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.px;
    const dy = e.clientY - dragState.current.py;
    const wasDragging = draggingRef.current;
    const finalX = Math.max(0, dragState.current.wx + dx);
    const finalY = Math.max(0, dragState.current.wy + dy);
    dragState.current = null;
    draggingRef.current = false;
    setDragging(false);
    if (wasDragging) onDragEnd?.(suggestion.id, finalX, finalY);
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
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
        left: x,
        top: y,
        width: panel.width,
        minHeight: panel.height,
        transform: `rotate(${hashRotation(suggestion.id)}deg)`,
        zIndex: dragging ? 28 : hovering || busy ? 14 : 4,
        touchAction: 'none',
      }}
      className={`rounded-[18px] border-2 border-dashed border-violet-300 bg-[rgba(255,252,247,0.88)] p-4 shadow-[0_18px_36px_-28px_rgba(71,46,125,0.42)] transition-[transform,box-shadow] duration-200 ${
        animated ? 'bo-suggestion-enter' : ''
      } ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      role="group"
      aria-label={`Scout suggestion: ${suggestion.rawText.slice(0, 60)}`}
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
                onPointerDown={e => e.stopPropagation()}
                onClick={() => onAdmit(suggestion.id)}
                disabled={busy !== null}
                className="rounded-[14px] border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
              >
                {busy === 'admit' ? 'keeping…' : 'keep it'}
              </button>
              <button
                type="button"
                onPointerDown={e => e.stopPropagation()}
                onClick={() => onDismiss(suggestion.id)}
                disabled={busy !== null}
                className="rounded-[14px] border border-slate-300 bg-white/92 px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-60"
              >
                {busy === 'dismiss' ? 'dismissing…' : 'dismiss'}
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
                onPointerDown={e => e.stopPropagation()}
                onClick={onExpandOverflow}
                className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-500 hover:bg-violet-100/80"
              >
              +{overflowCount} more
            </button>
          )}
          {canCollapseOverflow && (
              <button
                type="button"
                onPointerDown={e => e.stopPropagation()}
                onClick={onCollapseOverflow}
                className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-500 hover:bg-violet-100/80"
              >
              Collapse
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
