/**
 * IdeaPanel — a single floating, draggable card representing one idea on the canvas.
 *
 * Interactions:
 *   - pointer down + move > 4px   → drag
 *   - pointer down + release     → click (opens workspace via onOpen)
 *   - hold over another panel 2s → merge candidate (visual feedback handled in parent)
 *
 * The panel reports drag deltas via onDrag so the parent canvas can:
 *   - do collision / proximity detection in real time
 *   - show merge-hold progress
 *   - persist final position on release
 */

import React, { useRef, useState, useEffect } from 'react';
import type { Idea } from '../types';
import Badge from '../ui/Badge';
import type { IdeaTone } from './canvasFocus';

export interface IdeaPanelProps {
  idea: Idea;
  /** Live x override during drag (ignores idea.panel.x while dragging). */
  liveX?: number;
  liveY?: number;
  groupColor?: string;       // border color if part of a group
  mergePartnerId?: string | null;   // if this panel is hovering over another, signal visual state
  mergeProgress?: number;    // 0..1 — how far through the 2s hold
  beingMergedInto?: boolean; // we are the drop target, not the dragger
  tone?: IdeaTone;
  highlight?: boolean;       // briefly flash the panel (e.g., from Connections click)
  docCount?: number;         // number of supporting docs attached (shown as a pill)
  onDragStart?: (ideaId: string) => void;
  onDrag?: (ideaId: string, x: number, y: number) => void;
  onDragEnd?: (ideaId: string, x: number, y: number) => void;
  onHoverChange?: (ideaId: string | null) => void;
  onOpen?: (ideaId: string) => void;
  onOpenDocs?: (ideaId: string) => void;
  onDiscard?: (ideaId: string) => void;
  linkModeEnabled?: boolean;
  linkModeAnchor?: boolean;
  onLinkStart?: (ideaId: string) => void;
  onLinkComplete?: (ideaId: string) => void;
}

export default function IdeaPanel({
  idea,
  liveX,
  liveY,
  groupColor,
  mergeProgress = 0,
  beingMergedInto = false,
  tone = 'idle',
  highlight = false,
  docCount = 0,
  onDragStart,
  onDrag,
  onDragEnd,
  onHoverChange,
  onOpen,
  onOpenDocs,
  onDiscard,
  linkModeEnabled = true,
  linkModeAnchor = false,
  onLinkStart,
  onLinkComplete,
}: IdeaPanelProps): React.ReactElement {
  const panel = idea.panel ?? { x: 0, y: 0, width: 260, height: 180 };
  const x = liveX ?? panel.x;
  const y = liveY ?? panel.y;

  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  // Pointer start position (client coords) and panel start position (world coords)
  const startRef = useRef<{ px: number; py: number; wx: number; wy: number } | null>(null);
  // Track whether the pointer actually moved enough to count as a drag
  const movedRef = useRef(false);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    startRef.current = { px: e.clientX, py: e.clientY, wx: panel.x, wy: panel.y };
    movedRef.current = false;
    e.stopPropagation();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.px;
    const dy = e.clientY - startRef.current.py;
    if (!movedRef.current && Math.hypot(dx, dy) > 4) {
      movedRef.current = true;
      draggingRef.current = true;
      setDragging(true);
      onDragStart?.(idea.id);
    }
    if (draggingRef.current) {
      const nx = Math.max(0, startRef.current.wx + dx);
      const ny = Math.max(0, startRef.current.wy + dy);
      onDrag?.(idea.id, nx, ny);
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.px;
    const dy = e.clientY - startRef.current.py;
    const wasDrag = draggingRef.current;
    const finalX = Math.max(0, startRef.current.wx + dx);
    const finalY = Math.max(0, startRef.current.wy + dy);
    startRef.current = null;
    draggingRef.current = false;
    setDragging(false);
    if (wasDrag) {
      onDragEnd?.(idea.id, finalX, finalY);
    } else if (!movedRef.current) {
      onOpen?.(idea.id);
    }
  }

  // Safety: if the pointer leaves the window, release drag.
  useEffect(() => {
    if (!dragging) return;
    const handler = () => {
      const finalX = liveX ?? panel.x;
      const finalY = liveY ?? panel.y;
      startRef.current = null;
      draggingRef.current = false;
      setDragging(false);
      onHoverChange?.(null);
      onDragEnd?.(idea.id, finalX, finalY);
    };
    window.addEventListener('pointercancel', handler);
    return () => window.removeEventListener('pointercancel', handler);
  }, [dragging, idea.id, liveX, liveY, onDragEnd, onHoverChange, panel.x, panel.y]);

  // Close the context menu on any outside click / escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const title = idea.rawText.slice(0, 80) + (idea.rawText.length > 80 ? '…' : '');
  const ringClass = beingMergedInto
    ? 'ring-4 ring-amber-400'
    : highlight
    ? 'ring-2 ring-sky-300 bo-highlight-flash'
    : groupColor
    ? `ring-2`
    : '';
  const scale = dragging ? 1.02 : tone === 'active' ? 1.02 : tone === 'related' ? 1.005 : 1;
  const panelOpacity = tone === 'muted' ? 0.9 : tone === 'related' ? 0.98 : 1;
  const panelFilter = tone === 'muted' ? 'saturate(0.78)' : tone === 'active' ? 'saturate(1.04)' : undefined;
  const surfaceClass = tone === 'active'
    ? 'border-sky-300 shadow-xl'
    : tone === 'related'
    ? 'border-slate-200 shadow-md'
    : tone === 'muted'
    ? 'border-gray-200 shadow-sm'
    : 'border-gray-200 shadow-md hover:shadow-lg';
  const insightCount = idea.insights?.length ?? 0;
  const linkStartEnabled = typeof onLinkStart === 'function';
  const linkCompleteEnabled = typeof onLinkComplete === 'function';
  const showLinkAffordance = linkModeEnabled || linkStartEnabled || linkCompleteEnabled;
  const docPillLabel = docCount > 0 ? `${docCount}` : '0';
  const docPillAria = docCount > 0 ? `${docCount} supporting docs` : 'Open supporting docs';

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerEnter={() => onHoverChange?.(idea.id)}
      onPointerLeave={() => onHoverChange?.(null)}
      onContextMenu={e => {
        if (!onDiscard) return;
        e.preventDefault();
        e.stopPropagation();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen?.(idea.id);
        }
      }}
      onFocus={() => onHoverChange?.(idea.id)}
      onBlur={() => onHoverChange?.(null)}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: panel.width,
        height: panel.height,
        zIndex: dragging ? 50 : beingMergedInto ? 40 : tone === 'active' ? 20 : tone === 'related' ? 10 : 1,
        touchAction: 'none',
        opacity: panelOpacity,
        filter: panelFilter,
        transform: `scale(${scale})`,
        ...(groupColor ? { borderColor: groupColor, borderWidth: 2 } : {}),
      }}
      className={`select-none cursor-grab ${dragging ? 'cursor-grabbing shadow-2xl' : ''} bg-white rounded-lg border transition-[opacity,transform,box-shadow,border-color] duration-200 ${surfaceClass} ${ringClass}`}
      aria-label={`Idea: ${title}`}
    >
      <div className="absolute inset-y-0 -left-2 flex items-center">
        {showLinkAffordance && (
          <button
            type="button"
            onPointerDown={e => {
              e.preventDefault();
              e.stopPropagation();
              onLinkStart?.(idea.id);
            }}
            className={`w-4 h-7 rounded-l-full border border-gray-300/80 bg-white/95 px-1 text-[10px] font-semibold tracking-[0.14em] text-gray-500 uppercase transition-opacity ${
              linkStartEnabled ? 'cursor-pointer hover:border-sky-400 hover:text-sky-700' : 'opacity-60'
            }`}
            title={linkStartEnabled ? 'Start link mode from this idea' : 'Link mode affordance'}
            aria-label="Start linking from this idea"
          >
            ⇄
          </button>
        )}
      </div>
      <div className="absolute inset-y-0 -right-2 flex items-center">
        {showLinkAffordance && (
          <button
            type="button"
            onPointerDown={e => {
              e.preventDefault();
              e.stopPropagation();
              onLinkComplete?.(idea.id);
            }}
            className={`w-4 h-7 rounded-r-full border border-gray-300/80 bg-white/95 px-1 text-[10px] font-semibold tracking-[0.14em] text-gray-500 uppercase transition-opacity ${
              linkCompleteEnabled ? 'cursor-pointer hover:border-sky-400 hover:text-sky-700' : 'opacity-60'
            }`}
            title={linkCompleteEnabled ? 'Finish link mode on this idea' : 'Link mode affordance'}
            aria-label="Complete linking to this idea"
          >
            ➜
          </button>
        )}
      </div>

      {/* Docs pill — stops pointer events so it doesn't start a drag */}
      {onOpenDocs && (
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            onOpenDocs(idea.id);
          }}
          className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 border border-gray-300 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-sky-400 hover:bg-slate-100"
          aria-label={docPillAria}
          title={docPillAria}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5.25 5.25 8.9 1.6a2.75 2.75 0 1 1 3.9 3.9L7.55 10.75a3.5 3.5 0 1 1-4.95-4.95l5.1-5.1" />
          </svg>
          <span>{docPillLabel}</span>
        </button>
      )}

      <div className="h-full flex flex-col p-3 overflow-hidden">
        <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-3 pr-10">{title}</p>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge color={idea.readiness}>{idea.readiness}</Badge>
          <span className="text-xs text-gray-500">Step {idea.phase}/8</span>
          {insightCount > 0 && (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              Insight {insightCount}
            </span>
          )}
        </div>

        {idea.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {idea.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
            {idea.tags.length > 3 && (
              <span className="text-[10px] text-gray-400">+{idea.tags.length - 3}</span>
            )}
          </div>
        )}

        {idea.mergedFrom && idea.mergedFrom.length > 0 && (
          <div className="mt-auto pt-2">
            <span className="text-[10px] text-violet-700 bg-violet-50 rounded px-1.5 py-0.5 font-semibold">
              Merged from {idea.mergedFrom.length}
            </span>
          </div>
        )}

        {linkModeAnchor && (
          <div className="mt-2 text-[10px] text-gray-500">
            Anchor selected for linking
          </div>
        )}

        {/* Merge-hold progress bar (only visible when hovering to merge) */}
        {mergeProgress > 0 && !beingMergedInto && (
          <div className="absolute inset-x-2 bottom-2 h-1 bg-gray-200 rounded overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${mergeProgress * 100}%` }}
            />
          </div>
        )}

        {beingMergedInto && (
          <div className="absolute inset-0 flex items-center justify-center bg-amber-50/80 rounded-lg pointer-events-none">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">
              Hold to merge
            </span>
          </div>
        )}
      </div>

      {/* Right-click context menu — rendered fixed to the viewport. */}
      {menu && onDiscard && (
        <div
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 60 }}
          className="min-w-[140px] rounded-md border border-gray-200 bg-white shadow-lg text-sm"
          onPointerDown={e => e.stopPropagation()}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={e => {
              e.stopPropagation();
              setMenu(null);
              onDiscard(idea.id);
            }}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-800 focus:outline-none focus:bg-gray-100 rounded-md"
          >
            🗑 Discard idea
          </button>
        </div>
      )}
    </div>
  );
}
