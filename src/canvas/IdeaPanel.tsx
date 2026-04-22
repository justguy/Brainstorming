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
import type { BoardThemeMode, Idea } from '../types';
import Badge from '../ui/Badge';
import type { IdeaTone } from './canvasFocus';

const NOTE_CLIP_PATHS = [
  'polygon(0 0, 97% 0, 100% 11%, 100% 94%, 97% 100%, 0 100%, 0 0)',
  'polygon(0 0, 99% 2%, 100% 7%, 100% 95%, 93% 100%, 0 100%, 1% 88%, 0 0)',
  'polygon(0 0, 100% 0, 100% 100%, 92% 100%, 100% 90%, 100% 11%, 5% 0)',
  'polygon(0 0, 100% 2%, 98% 12%, 100% 22%, 100% 100%, 0 100%, 3% 84%, 0 14%)',
  'polygon(0 0, 100% 0, 100% 99%, 83% 100%, 78% 88%, 0 89%, 0 12%)',
];

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickPaperClip(id: string): string {
  const index = hashSeed(id) % NOTE_CLIP_PATHS.length;
  return NOTE_CLIP_PATHS[index];
}

function paperRotationDeg(id: string): number {
  return ((hashSeed(id) % 18) - 9) / 7;
}

type NotePalette = {
  borderColor: string;
  backgroundColor: string;
  inkColor: string;
  shadow: string;
};

const WHITEBOARD_NOTE_PALETTES: Record<string, NotePalette> = {
  blue: { borderColor: '#7a9ae2', backgroundColor: '#f7fbff', inkColor: '#5570b8', shadow: '0 18px 34px -30px rgba(78, 110, 181, 0.24)' },
  yellow: { borderColor: '#d3b64c', backgroundColor: '#fffdf2', inkColor: '#bb9a21', shadow: '0 18px 34px -30px rgba(176, 146, 46, 0.22)' },
  pink: { borderColor: '#d28998', backgroundColor: '#fff7fa', inkColor: '#b45b75', shadow: '0 18px 34px -30px rgba(173, 92, 118, 0.22)' },
  peach: { borderColor: '#d3a06a', backgroundColor: '#fff8f1', inkColor: '#b77b3d', shadow: '0 18px 34px -30px rgba(179, 123, 64, 0.22)' },
  lavender: { borderColor: '#8e7ed6', backgroundColor: '#faf8ff', inkColor: '#6f5bbb', shadow: '0 18px 34px -30px rgba(101, 80, 176, 0.22)' },
  green: { borderColor: '#88b56b', backgroundColor: '#f6fcf3', inkColor: '#5d9445', shadow: '0 18px 34px -30px rgba(89, 144, 58, 0.22)' },
};

const SKETCH_NOTE_PALETTES: Record<string, NotePalette> = {
  blue: { borderColor: '#4d9cdd', backgroundColor: '#bfe4fa', inkColor: '#23384d', shadow: '0 18px 34px -28px rgba(47, 101, 155, 0.5)' },
  yellow: { borderColor: '#efb736', backgroundColor: '#ffe986', inkColor: '#3a2f18', shadow: '0 18px 34px -28px rgba(164, 124, 32, 0.5)' },
  pink: { borderColor: '#ea7b9d', backgroundColor: '#f8bfd1', inkColor: '#442534', shadow: '0 18px 34px -28px rgba(152, 68, 98, 0.45)' },
  peach: { borderColor: '#df955e', backgroundColor: '#ffd0ad', inkColor: '#432b1f', shadow: '0 18px 34px -28px rgba(153, 95, 43, 0.46)' },
  lavender: { borderColor: '#8f79d3', backgroundColor: '#d9c7fb', inkColor: '#33294d', shadow: '0 18px 34px -28px rgba(88, 67, 153, 0.45)' },
  green: { borderColor: '#7ab85e', backgroundColor: '#cdeca0', inkColor: '#243d1d', shadow: '0 18px 34px -28px rgba(78, 129, 53, 0.45)' },
};

function paletteSet(boardTheme: BoardThemeMode): Record<string, NotePalette> {
  return boardTheme === 'sketch' ? SKETCH_NOTE_PALETTES : WHITEBOARD_NOTE_PALETTES;
}

function notePaletteFromTags(tags: string[], boardTheme: BoardThemeMode): NotePalette | null {
  const palettes = paletteSet(boardTheme);
  if (tags.includes('paper-blue')) {
    return palettes.blue;
  }
  if (tags.includes('paper-yellow')) {
    return palettes.yellow;
  }
  if (tags.includes('paper-pink')) {
    return palettes.pink;
  }
  if (tags.includes('paper-peach')) {
    return palettes.peach;
  }
  if (tags.includes('paper-lavender')) {
    return palettes.lavender;
  }
  if (tags.includes('paper-green')) {
    return palettes.green;
  }
  return null;
}

function defaultNotePalette(id: string, boardTheme: BoardThemeMode): NotePalette {
  const palettes = Object.values(paletteSet(boardTheme));
  return palettes[hashSeed(id) % palettes.length];
}

export interface IdeaPanelProps {
  idea: Idea;
  selected?: boolean;
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
  linkModePending?: boolean;
  onLinkStart?: (ideaId: string) => void;
  onLinkComplete?: (ideaId: string) => void;
  boardTheme: BoardThemeMode;
}

export default function IdeaPanel({
  idea,
  selected = false,
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
  linkModePending = false,
  onLinkStart,
  onLinkComplete,
  boardTheme,
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
    ? 'ring-4 ring-sky-400'
    : highlight
    ? 'ring-2 ring-sky-300 bo-highlight-flash'
    : selected
    ? 'ring-4 ring-slate-900/15'
    : groupColor
    ? `ring-2`
    : '';
  const scale = dragging ? 1.02 : tone === 'active' ? 1.02 : tone === 'related' ? 1.005 : 1;
  const panelOpacity = tone === 'muted' ? 0.9 : tone === 'related' ? 0.98 : 1;
  const panelFilter = tone === 'muted' ? 'saturate(0.78)' : tone === 'active' ? 'saturate(1.04)' : undefined;
  const surfaceClass = tone === 'active'
    ? 'border-sky-300/85 shadow-[0_26px_60px_-36px_rgba(49,87,129,0.24)]'
    : tone === 'related'
    ? 'border-slate-300/85 shadow-[0_18px_42px_-34px_rgba(49,87,129,0.16)]'
    : tone === 'muted'
    ? 'border-slate-200/80 shadow-[0_12px_28px_-28px_rgba(49,87,129,0.14)]'
    : 'border-slate-300/80 shadow-[0_16px_40px_-32px_rgba(49,87,129,0.16)]';
  const insightCount = idea.insights?.length ?? 0;
  const linkStartEnabled = typeof onLinkStart === 'function';
  const linkCompleteEnabled = typeof onLinkComplete === 'function';
  const showLinkAffordance = linkModeEnabled || linkStartEnabled || linkCompleteEnabled;
  const docPillLabel = docCount > 0 ? `${docCount}` : '0';
  const docPillAria = docCount > 0 ? `${docCount} supporting docs` : 'Open supporting docs';
  const paperSeed = `${idea.id}:${idea.panel?.x ?? ''}:${idea.panel?.y ?? ''}:${panel.height}`;
  const notePalette = notePaletteFromTags(idea.tags, boardTheme) ?? defaultNotePalette(idea.id, boardTheme);
  const paperRotation = paperRotationDeg(paperSeed);
  const noteRotation = dragging ? paperRotation + 0.8 : paperRotation * 0.25;
  const noteBorderColor = selected ? '#223448' : notePalette.borderColor;
  const noteBorderWidth = selected ? 3.4 : 1.8;
  const noteBackgroundColor = notePalette.backgroundColor;
  const noteShadow = selected
    ? `0 0 0 2px rgba(255, 255, 255, 0.92), 0 22px 42px -30px rgba(24, 36, 52, 0.42), ${notePalette.shadow}`
    : notePalette.shadow;
  const noteFilter = panelFilter;
  const noteZIndex = dragging ? 50 : beingMergedInto ? 40 : selected ? 28 : tone === 'active' ? 20 : tone === 'related' ? 10 : 8;

  return (
    <div
      data-artifact-surface="idea-note"
      data-artifact-tone={tone}
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
        zIndex: noteZIndex,
        touchAction: 'none',
        opacity: panelOpacity,
        filter: noteFilter,
        transform: `rotate(${noteRotation}deg) scale(${scale})`,
        borderWidth: noteBorderWidth,
        borderColor: noteBorderColor,
        backgroundColor: noteBackgroundColor,
        boxShadow: noteShadow,
        ...(groupColor && !selected ? { borderColor: groupColor } : {}),
      }}
      className={`bo-note-artifact relative select-none overflow-hidden cursor-grab rounded-[20px] border transition-[transform,box-shadow,filter] duration-200 ${dragging ? 'cursor-grabbing' : ''} ${surfaceClass} ${ringClass}`}
      aria-label={`Idea: ${title}`}
    >
      <div
        className="pointer-events-none absolute -top-2 left-4 h-4 w-14 rounded-sm"
        style={{
          transform: `rotate(${paperRotation * -1.6}deg)`,
          background: 'linear-gradient(90deg, rgba(255, 255, 255, 0.84), rgba(214, 228, 242, 0.76), rgba(255, 255, 255, 0.45))',
          opacity: 0.92,
          boxShadow: 'inset 0 -1px 0 rgba(106, 134, 163, 0.24)',
        }}
        aria-hidden="true"
      />
      <div className="absolute inset-y-0 -left-2 flex items-center">
        {showLinkAffordance && (
          <button
            type="button"
            onPointerDown={e => {
              e.preventDefault();
              e.stopPropagation();
              onLinkStart?.(idea.id);
            }}
            className={`w-4.5 h-9 rounded-l-full border px-1 text-[9px] font-semibold tracking-[0.18em] uppercase transition-opacity ${
              linkModeAnchor
                ? 'border-[#2f5f86] bg-[#d9edff]/96 text-[#204866]'
                : 'border-[#a8bed2]/80 bg-[#f8fbff]/94 text-[#597185]'
            } ${
              linkStartEnabled ? 'cursor-pointer hover:bg-[#edf5fb]/95 hover:border-[#6e91b1]' : 'opacity-55'
            }`}
            title={linkStartEnabled ? 'Connect from this note' : 'Connection handle'}
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
            className={`w-4.5 h-9 rounded-r-full border px-1 text-[9px] font-semibold tracking-[0.18em] uppercase transition-opacity ${
              linkModePending
                ? 'border-[#2f5f86] bg-[#d9edff]/96 text-[#204866]'
                : 'border-[#a8bed2]/80 bg-[#f8fbff]/94 text-[#597185]'
            } ${
              linkCompleteEnabled ? 'cursor-pointer hover:bg-[#edf5fb]/95 hover:border-[#6e91b1]' : 'opacity-55'
            }`}
            title={linkCompleteEnabled ? 'Connect to this note' : 'Connection handle'}
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
          className="bo-note-doc-chip absolute top-1.5 right-1.5 z-10 flex items-center gap-1 border border-[#9fb2c5]/75 bg-[#f8fbff]/88 px-1.5 py-0.5 text-[10px] font-medium text-[#54697c] focus:outline-none focus:ring-2 focus:ring-sky-400 hover:bg-[#edf5fb]/88"
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
        <p
          className="bo-note-title text-sm font-semibold leading-snug line-clamp-3 pr-10"
          style={{ color: notePalette.inkColor }}
        >
          {title}
        </p>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge color={idea.readiness}>{idea.readiness}</Badge>
          <span className="text-xs text-[#5f503b]">Step {idea.phase}/8</span>
          {insightCount > 0 && (
            <span className="rounded-full border border-emerald-200/80 bg-emerald-50/80 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              Insight {insightCount}
            </span>
          )}
        </div>

        {idea.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {idea.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-[10px] rounded-full border border-[#bfd0de]/75 bg-white/70 px-1.5 py-0.5 text-[#586c7d]">
                {tag}
              </span>
            ))}
            {idea.tags.length > 3 && (
              <span className="text-[10px] text-[#73869a]">+{idea.tags.length - 3}</span>
            )}
          </div>
        )}

        {idea.mergedFrom && idea.mergedFrom.length > 0 && (
          <div className="mt-auto pt-2">
            <span className="text-[10px] border border-violet-300/70 bg-violet-50/80 rounded px-1.5 py-0.5 font-semibold text-violet-700">
              Merged from {idea.mergedFrom.length}
            </span>
          </div>
        )}

        {/* Merge-hold progress bar (only visible when hovering to merge) */}
        {mergeProgress > 0 && !beingMergedInto && (
          <div className="absolute inset-x-2 bottom-2 h-1 rounded bg-[#cad9e7]/70 overflow-hidden">
            <div
              className="h-full bg-[#4f93d1] transition-all"
              style={{ width: `${mergeProgress * 100}%` }}
            />
          </div>
        )}

        {beingMergedInto && (
          <div className="absolute inset-0 flex items-center justify-center bg-sky-50/86 pointer-events-none">
            <span className="bo-note-merge-overlay text-[10px] font-semibold uppercase tracking-wide text-sky-900">
              Hold to merge
            </span>
          </div>
        )}

        {linkModeAnchor && (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-[#b49352]/70 bg-[#fff4d8]/92 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#6d5431]">
            Link start
          </div>
        )}
      </div>

      {/* Right-click context menu — rendered fixed to the viewport. */}
      {menu && onDiscard && (
        <div
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 60 }}
          className="min-w-[140px] rounded-md border border-[#b7cade]/75 bg-[#fbfdff] text-sm shadow-lg"
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
            className="bo-note-menu-item w-full text-left px-3 py-2 text-gray-800 focus:outline-none focus:bg-[#edf5fb] rounded-md"
          >
            🗑 Discard idea
          </button>
        </div>
      )}
    </div>
  );
}
