import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BoardThemeMode, Connection, Idea, IdeaGroup, ScoutSuggestion } from '../types';
import IdeaPanel from './IdeaPanel';
import GhostPanel from './GhostPanel';
import { ConnectionOverlay } from './ConnectionOverlay';
import { ConnectionComposer } from './ConnectionComposer';
import { deriveCanvasFocus } from './canvasFocus';

export const MERGE_HOLD_MS = 2000;
export const GROUP_PROXIMITY_PX = 40;

type SettledDropRecord = Record<string, { x: number; y: number; expiresAt: number }>;
type CanvasPoint = { x: number; y: number };
type MarqueeRect = { startX: number; startY: number; endX: number; endY: number };
type NormalizedRect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

function colorForGroup(groupId: string): string {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) {
    hash = (hash << 5) - hash + groupId.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

function centersOverlap(a: Idea, b: Idea, aX?: number, aY?: number): boolean {
  const ap = a.panel;
  const bp = b.panel;
  if (!ap || !bp) return false;
  const ax = aX ?? ap.x;
  const ay = aY ?? ap.y;
  const acx = ax + ap.width / 2;
  const acy = ay + ap.height / 2;
  const bcx = bp.x + bp.width / 2;
  const bcy = bp.y + bp.height / 2;
  const threshold = Math.min(ap.width, ap.height, bp.width, bp.height) / 2;
  return Math.abs(acx - bcx) < threshold && Math.abs(acy - bcy) < threshold;
}

function minEdgeDistance(a: Idea, b: Idea, aX?: number, aY?: number): number {
  const ap = a.panel;
  const bp = b.panel;
  if (!ap || !bp) return Infinity;
  const ax = aX ?? ap.x;
  const ay = aY ?? ap.y;
  const aRight = ax + ap.width;
  const aBottom = ay + ap.height;
  const bRight = bp.x + bp.width;
  const bBottom = bp.y + bp.height;
  const dx = Math.max(bp.x - aRight, ax - bRight, 0);
  const dy = Math.max(bp.y - aBottom, ay - bBottom, 0);
  return Math.hypot(dx, dy);
}

function pointFromClient(canvas: HTMLElement, clientX: number, clientY: number): CanvasPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clientX - rect.left + canvas.scrollLeft,
    y: clientY - rect.top + canvas.scrollTop,
  };
}

function normalizeRect(rect: MarqueeRect): NormalizedRect {
  const left = Math.min(rect.startX, rect.endX);
  const right = Math.max(rect.startX, rect.endX);
  const top = Math.min(rect.startY, rect.endY);
  const bottom = Math.max(rect.startY, rect.endY);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function panelFrame(
  idea: Idea,
  settledDropByIdeaId: SettledDropRecord,
): { left: number; top: number; right: number; bottom: number } | null {
  const panel = idea.panel;
  if (!panel) return null;
  const settledDrop = settledDropByIdeaId[idea.id];
  const left = settledDrop?.x ?? panel.x;
  const top = settledDrop?.y ?? panel.y;
  return {
    left,
    top,
    right: left + panel.width,
    bottom: top + panel.height,
  };
}

function ideaIntersectsRect(
  idea: Idea,
  rect: NormalizedRect,
  settledDropByIdeaId: SettledDropRecord,
): boolean {
  const frame = panelFrame(idea, settledDropByIdeaId);
  if (!frame) return false;
  return !(
    frame.right < rect.left ||
    frame.left > rect.right ||
    frame.bottom < rect.top ||
    frame.top > rect.bottom
  );
}

function selectionBounds(
  ideas: Idea[],
  selectedIds: string[],
  settledDropByIdeaId: SettledDropRecord,
): NormalizedRect | null {
  const frames = selectedIds
    .map(id => ideas.find(idea => idea.id === id))
    .filter((idea): idea is Idea => !!idea)
    .map(idea => panelFrame(idea, settledDropByIdeaId))
    .filter((frame): frame is { left: number; top: number; right: number; bottom: number } => !!frame);

  if (frames.length === 0) return null;

  const left = Math.min(...frames.map(frame => frame.left));
  const top = Math.min(...frames.map(frame => frame.top));
  const right = Math.max(...frames.map(frame => frame.right));
  const bottom = Math.max(...frames.map(frame => frame.bottom));
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export interface CanvasProps {
  boardTheme: BoardThemeMode;
  ideas: Idea[];
  groups: IdeaGroup[];
  selectedIdeaId?: string | null;
  connections?: Connection[];
  overlayContent?: React.ReactNode;
  docCounts?: Record<string, number>;
  highlightIds?: string[];
  animatedConnectionIds?: string[];
  animatedSuggestionIds?: string[];
  suppressAnimations?: boolean;
  suggestionOverflowCount?: number;
  suggestionsExpanded?: boolean;
  onConnectionClick?: (ideaIds: string[]) => void;
  onFocusIdeaChange?: (ideaId: string | null) => void;
  onDragStateChange?: (dragging: boolean) => void;
  onMove: (ideaId: string, x: number, y: number) => void;
  onOpen: (ideaId: string) => void;
  onOpenDocs?: (ideaId: string) => void;
  linkModeEnabled?: boolean;
  onGroup: (ideaIdA: string, ideaIdB: string) => void;
  onGroupSelection?: (ideaIds: string[]) => Promise<void> | void;
  onUngroup: (ideaId: string) => void;
  onMerge: (draggedId: string, targetId: string) => void;
  onDiscard?: (ideaId: string) => void;
  onCreateConnection?: (input: {
    fromIdeaId: string;
    toIdeaId: string;
    kind: Connection['kind'];
    rationale: string;
  }) => Promise<Connection>;
  suggestions?: ScoutSuggestion[];
  suggestionBusy?: Record<string, 'admit' | 'elaborate' | 'dismiss' | null>;
  onMoveSuggestion?: (suggestionId: string, x: number, y: number) => void;
  onAdmitSuggestion?: (id: string) => void;
  onElaborateSuggestion?: (id: string) => void;
  onDismissSuggestion?: (id: string) => void;
  onExpandSuggestions?: () => void;
  onCollapseSuggestions?: () => void;
}

export default function Canvas({
  boardTheme,
  ideas,
  groups,
  selectedIdeaId = null,
  connections,
  overlayContent,
  docCounts,
  highlightIds,
  animatedConnectionIds,
  animatedSuggestionIds,
  suppressAnimations,
  suggestionOverflowCount,
  suggestionsExpanded,
  onConnectionClick,
  onFocusIdeaChange,
  onDragStateChange,
  onMove,
  onOpen,
  onOpenDocs,
  linkModeEnabled = false,
  onGroup,
  onGroupSelection,
  onUngroup,
  onMerge,
  onDiscard,
  onCreateConnection,
  suggestions,
  suggestionBusy,
  onMoveSuggestion,
  onAdmitSuggestion,
  onElaborateSuggestion,
  onDismissSuggestion,
  onExpandSuggestions,
  onCollapseSuggestions,
}: CanvasProps): React.ReactElement {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [liveDrag, setLiveDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [settledDropByIdeaId, setSettledDropByIdeaId] = useState<SettledDropRecord>({});
  const [liveSuggestionDrag, setLiveSuggestionDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [settledDropBySuggestionId, setSettledDropBySuggestionId] = useState<Record<string, { x: number; y: number; expiresAt: number }>>({});
  const [mergeCandidate, setMergeCandidate] = useState<string | null>(null);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [hoveredIdeaId, setHoveredIdeaId] = useState<string | null>(null);
  const [flashState, setFlashState] = useState<{ activeIdeaId: string | null; ideaIds: string[] }>({ activeIdeaId: null, ideaIds: [] });
  const [linkAnchorId, setLinkAnchorId] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<{
    fromIdeaId: string;
    toIdeaId: string;
    kind: Connection['kind'];
    rationale: string;
  } | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const [marqueeSelectedIds, setMarqueeSelectedIds] = useState<string[]>([]);
  const [groupSelectionBusy, setGroupSelectionBusy] = useState(false);
  const mergeStartRef = useRef<number | null>(null);
  const mergeTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const marqueeStartRef = useRef<CanvasPoint | null>(null);
  const connectionList = connections ?? [];
  const canCreateConnections = Boolean(onCreateConnection);

  function setHoveredIdea(nextIdeaId: string | null): void {
    setHoveredIdeaId(nextIdeaId);
    onFocusIdeaChange?.(nextIdeaId);
  }

  function clearMergeHold(): void {
    if (mergeTimerRef.current !== null) {
      window.clearInterval(mergeTimerRef.current);
      mergeTimerRef.current = null;
    }
    mergeStartRef.current = null;
    setMergeCandidate(null);
    setMergeProgress(0);
  }

  function handleDragStart(ideaId: string): void {
    setMarqueeSelectedIds([]);
    setMarqueeRect(null);
    setSettledDropByIdeaId(current => {
      if (!current[ideaId]) return current;
      const next = { ...current };
      delete next[ideaId];
      return next;
    });
    setHoveredIdea(null);
    onDragStateChange?.(true);
    clearMergeHold();
  }

  function handleDrag(ideaId: string, x: number, y: number): void {
    setLiveDrag({ id: ideaId, x, y });

    const dragged = ideas.find(i => i.id === ideaId);
    if (!dragged) return;

    const hovering = ideas.find(
      other => other.id !== ideaId && centersOverlap(dragged, other, x, y),
    );

    if (hovering && hovering.id !== mergeCandidate) {
      clearMergeHold();
      setMergeCandidate(hovering.id);
      mergeStartRef.current = Date.now();
      mergeTimerRef.current = window.setInterval(() => {
        const start = mergeStartRef.current;
        if (start == null) return;
        const elapsed = Date.now() - start;
        const progress = Math.min(1, elapsed / MERGE_HOLD_MS);
        setMergeProgress(progress);
        if (progress >= 1) {
          const targetId = hovering.id;
          clearMergeHold();
          onMerge(ideaId, targetId);
        }
      }, 50);
    } else if (!hovering && mergeCandidate) {
      clearMergeHold();
    }
  }

  function handleDragEnd(ideaId: string, x: number, y: number): void {
    const wasHovering = mergeCandidate;
    clearMergeHold();
    setLiveDrag(null);
    setSettledDropByIdeaId(current => ({
      ...current,
      [ideaId]: { x, y, expiresAt: Date.now() + 1_500 },
    }));
    onDragStateChange?.(false);

    onMove(ideaId, x, y);
    if (wasHovering) return;

    const dropped = ideas.find(i => i.id === ideaId);
    if (!dropped) return;
    const neighbor = ideas.find(other => {
      if (other.id === ideaId) return false;
      return minEdgeDistance(dropped, other, x, y) < GROUP_PROXIMITY_PX;
    });

    if (neighbor) {
      onGroup(ideaId, neighbor.id);
    } else if (dropped.panel?.groupId) {
      onUngroup(ideaId);
    }
  }

  function handleSuggestionDragStart(suggestionId: string): void {
    setSettledDropBySuggestionId(current => {
      if (!current[suggestionId]) return current;
      const next = { ...current };
      delete next[suggestionId];
      return next;
    });
    onDragStateChange?.(true);
  }

  function handleSuggestionDrag(suggestionId: string, x: number, y: number): void {
    setLiveSuggestionDrag({ id: suggestionId, x, y });
  }

  function handleSuggestionDragEnd(suggestionId: string, x: number, y: number): void {
    setLiveSuggestionDrag(null);
    setSettledDropBySuggestionId(current => ({
      ...current,
      [suggestionId]: { x, y, expiresAt: Date.now() + 1_500 },
    }));
    onDragStateChange?.(false);
    onMoveSuggestion?.(suggestionId, x, y);
  }

  function updateMarqueeSelection(nextRect: MarqueeRect): void {
    setMarqueeRect(nextRect);
    const bounds = normalizeRect(nextRect);
    if (bounds.width < 8 && bounds.height < 8) {
      setMarqueeSelectedIds([]);
      return;
    }
    setMarqueeSelectedIds(
      ideas
        .filter(idea => idea.status !== 'archived' && idea.status !== 'discarded')
        .filter(idea => ideaIntersectsRect(idea, bounds, settledDropByIdeaId))
        .map(idea => idea.id),
    );
  }

  function finishMarqueeSelection(): void {
    const activeRect = marqueeRect;
    marqueeStartRef.current = null;
    if (!activeRect) return;
    const bounds = normalizeRect(activeRect);
    setMarqueeRect(null);
    if (bounds.width < 8 && bounds.height < 8) {
      setMarqueeSelectedIds([]);
    }
  }

  function handleCanvasPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    if (event.target !== event.currentTarget) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = pointFromClient(canvas, event.clientX, event.clientY);
    marqueeStartRef.current = point;
    updateMarqueeSelection({ startX: point.x, startY: point.y, endX: point.x, endY: point.y });
    setLinkAnchorId(null);
    setLinkDraft(null);
    setLinkError(null);
    setHoveredIdea(null);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function handleCanvasPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (!marqueeStartRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = pointFromClient(canvas, event.clientX, event.clientY);
    updateMarqueeSelection({
      startX: marqueeStartRef.current.x,
      startY: marqueeStartRef.current.y,
      endX: point.x,
      endY: point.y,
    });
    event.preventDefault();
  }

  function handleCanvasPointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (!marqueeStartRef.current) return;
    finishMarqueeSelection();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleCanvasPointerCancel(): void {
    if (!marqueeStartRef.current) return;
    finishMarqueeSelection();
  }

  useEffect(() => {
    return () => {
      if (mergeTimerRef.current !== null) window.clearInterval(mergeTimerRef.current);
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
      onDragStateChange?.(false);
      onFocusIdeaChange?.(null);
    };
  }, [onDragStateChange, onFocusIdeaChange]);

  useEffect(() => {
    if (Object.keys(settledDropByIdeaId).length === 0) return;

    const now = Date.now();
    let changed = false;
    const nextEntries: Record<string, { x: number; y: number; expiresAt: number }> = {};

    for (const [ideaId, pending] of Object.entries(settledDropByIdeaId)) {
      const idea = ideas.find(entry => entry.id === ideaId);
      const panel = idea?.panel;

      if (!idea || !panel) {
        changed = true;
        continue;
      }

      if (panel.x === pending.x && panel.y === pending.y) {
        changed = true;
        continue;
      }

      if (pending.expiresAt <= now) {
        changed = true;
        continue;
      }

      nextEntries[ideaId] = pending;
    }

    if (changed) {
      setSettledDropByIdeaId(nextEntries);
      return;
    }

    const nextExpiry = Math.min(...Object.values(settledDropByIdeaId).map(entry => entry.expiresAt));
    const timeout = window.setTimeout(() => {
      setSettledDropByIdeaId(current => {
        const currentNow = Date.now();
        const remainingEntries = Object.entries(current).filter(([, pending]) => pending.expiresAt > currentNow);
        return Object.fromEntries(remainingEntries);
      });
    }, Math.max(0, nextExpiry - now));

    return () => window.clearTimeout(timeout);
  }, [ideas, settledDropByIdeaId]);

  useEffect(() => {
    if (Object.keys(settledDropBySuggestionId).length === 0) return;

    const now = Date.now();
    let changed = false;
    const nextEntries: Record<string, { x: number; y: number; expiresAt: number }> = {};

    for (const [suggestionId, pending] of Object.entries(settledDropBySuggestionId)) {
      const suggestion = suggestions?.find(entry => entry.id === suggestionId);
      const panel = suggestion?.panel;

      if (!suggestion || !panel) {
        changed = true;
        continue;
      }

      if (panel.x === pending.x && panel.y === pending.y) {
        changed = true;
        continue;
      }

      if (pending.expiresAt <= now) {
        changed = true;
        continue;
      }

      nextEntries[suggestionId] = pending;
    }

    if (changed) {
      setSettledDropBySuggestionId(nextEntries);
      return;
    }

    const nextExpiry = Math.min(...Object.values(settledDropBySuggestionId).map(entry => entry.expiresAt));
    const timeout = window.setTimeout(() => {
      setSettledDropBySuggestionId(current => {
        const currentNow = Date.now();
        const remainingEntries = Object.entries(current).filter(([, pending]) => pending.expiresAt > currentNow);
        return Object.fromEntries(remainingEntries);
      });
    }, Math.max(0, nextExpiry - now));

    return () => window.clearTimeout(timeout);
  }, [suggestions, settledDropBySuggestionId]);

  function triggerFlash(ideaIds: string[]): void {
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    setFlashState({ activeIdeaId: ideaIds[0] ?? null, ideaIds });
    flashTimerRef.current = window.setTimeout(() => {
      setFlashState({ activeIdeaId: null, ideaIds: [] });
      flashTimerRef.current = null;
    }, 900);
  }

  const highlightKey = (highlightIds ?? []).join('\u0001');

  useEffect(() => {
    if (!highlightKey) return;
    triggerFlash(highlightKey.split('\u0001'));
  }, [highlightKey]);

  function handleConnectionClick(ideaIds: string[]): void {
    triggerFlash(ideaIds);
    onConnectionClick?.(ideaIds);
  }

  function handleLinkStart(ideaId: string): void {
    if (!canCreateConnections) return;
    setMarqueeSelectedIds([]);
    setLinkDraft(null);
    setLinkError(null);
    setLinkAnchorId(prev => (prev === ideaId ? null : ideaId));
  }

  function handleLinkComplete(ideaId: string): void {
    if (!canCreateConnections) return;
    if (!linkAnchorId) {
      setLinkDraft(null);
      setLinkError(null);
      setLinkAnchorId(ideaId);
      return;
    }
    if (linkAnchorId === ideaId) {
      setLinkAnchorId(null);
      return;
    }
    if (!onCreateConnection) {
      setLinkAnchorId(null);
      return;
    }
    const nextDraft: {
      fromIdeaId: string;
      toIdeaId: string;
      kind: Connection['kind'];
      rationale: string;
    } = {
      fromIdeaId: linkAnchorId,
      toIdeaId: ideaId,
      kind: 'builds_on',
      rationale: linkModeEnabled ? '' : 'Connected on canvas.',
    };
    setLinkError(null);
    setLinkAnchorId(null);
    if (!linkModeEnabled) {
      void saveQuickLink(nextDraft);
      return;
    }
    setLinkDraft(nextDraft);
  }

  async function saveQuickLink(nextDraft: {
    fromIdeaId: string;
    toIdeaId: string;
    kind: Connection['kind'];
    rationale: string;
  }): Promise<void> {
    if (!onCreateConnection) return;
    setLinkBusy(true);
    setLinkError(null);
    try {
      await onCreateConnection(nextDraft);
    } catch (err) {
      setLinkDraft(nextDraft);
      setLinkError(err instanceof Error ? err.message : 'Failed to save link.');
    } finally {
      setLinkBusy(false);
    }
  }

  async function handleSaveLink(): Promise<void> {
    if (!linkDraft || !onCreateConnection) return;
    const rationale = linkDraft.rationale.trim();
    if (!rationale) {
      setLinkError('Add a short rationale before saving the link.');
      return;
    }

    setLinkBusy(true);
    setLinkError(null);
    try {
      await onCreateConnection({
        fromIdeaId: linkDraft.fromIdeaId,
        toIdeaId: linkDraft.toIdeaId,
        kind: linkDraft.kind,
        rationale,
      });
      setLinkDraft(null);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Failed to save link.');
    } finally {
      setLinkBusy(false);
    }
  }

  const activeIdeaId = liveDrag?.id ?? hoveredIdeaId ?? flashState.activeIdeaId;
  const focus = useMemo(
    () => deriveCanvasFocus(ideas.map(idea => idea.id), connectionList, activeIdeaId, flashState.ideaIds),
    [ideas, connectionList, activeIdeaId, flashState],
  );
  const highlightSet = new Set(flashState.ideaIds);
  const linkingActive = linkModeEnabled || linkAnchorId !== null || linkDraft !== null || linkBusy;
  const showConnectionHint = canCreateConnections && connectionList.length === 0 && ideas.length >= 2 && liveDrag === null && !linkingActive;
  const linkSourceIdea = linkDraft ? ideas.find(idea => idea.id === linkDraft.fromIdeaId) ?? null : null;
  const linkTargetIdea = linkDraft ? ideas.find(idea => idea.id === linkDraft.toIdeaId) ?? null : null;
  const marqueeBounds = marqueeRect ? normalizeRect(marqueeRect) : null;
  const marqueeSelectionBounds = selectionBounds(ideas, marqueeSelectedIds, settledDropByIdeaId);
  const marqueeActionTop = marqueeSelectionBounds
    ? marqueeSelectionBounds.top > 56
      ? marqueeSelectionBounds.top - 44
      : marqueeSelectionBounds.bottom + 8
    : 0;

  async function handleGroupSelectedIdeas(): Promise<void> {
    if (!onGroupSelection || marqueeSelectedIds.length < 2 || groupSelectionBusy) return;
    setGroupSelectionBusy(true);
    try {
      await onGroupSelection(marqueeSelectedIds);
      setMarqueeSelectedIds([]);
      setMarqueeRect(null);
    } finally {
      setGroupSelectionBusy(false);
    }
  }

  return (
    <div
      ref={canvasRef}
      className="bo-canvas relative h-full w-full overflow-auto"
      style={{
        minHeight: '100%',
      }}
      aria-label="Idea canvas"
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onPointerCancel={handleCanvasPointerCancel}
    >
      <ConnectionOverlay
        ideas={ideas}
        connections={connectionList}
        liveDrag={liveDrag}
        activeIdeaId={focus.activeIdeaId}
        activePathIdeaIds={[...focus.activePathIdeaIds]}
        animatedConnectionIds={animatedConnectionIds}
        suppressAnimations={suppressAnimations}
        onConnectionClick={onConnectionClick ? handleConnectionClick : undefined}
      />
      {overlayContent}
      {linkingActive && canCreateConnections && (
        <div className="pointer-events-none absolute right-4 top-[6.75rem] z-20 max-w-[18rem] rounded-[22px] border border-sky-200/90 bg-white/92 px-3 py-2.5 shadow-sm backdrop-blur sm:top-[6.25rem]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700">
            Link mode
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-900">
            Pick a source note, then a target note. Toggle link mode when you want to set the reason and relation type before saving.
          </p>
        </div>
      )}
      {showConnectionHint && (
        <div className="pointer-events-none absolute right-4 top-[6.75rem] z-20 max-w-[18rem] rounded-[22px] border border-sky-200/90 bg-white/92 px-3 py-2.5 shadow-sm backdrop-blur sm:top-[6.25rem]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700">
            Connections
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-900">
            Use the note arrows to connect fast, or toggle link mode to add a reason and relation type before saving.
          </p>
        </div>
      )}

      {marqueeBounds && (
        <div
          className="pointer-events-none absolute z-[26] rounded-[24px] border border-sky-400/90 bg-sky-200/10 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.32)]"
          style={{
            left: marqueeBounds.left,
            top: marqueeBounds.top,
            width: marqueeBounds.width,
            height: marqueeBounds.height,
          }}
          aria-hidden="true"
        />
      )}

      {marqueeSelectionBounds && marqueeSelectedIds.length > 1 && onGroupSelection && (
        <div
          className="absolute z-[31] flex items-center gap-2"
          style={{
            left: Math.max(12, marqueeSelectionBounds.left),
            top: Math.max(12, marqueeActionTop),
          }}
        >
          <button
            type="button"
            onClick={() => { void handleGroupSelectedIdeas(); }}
            disabled={groupSelectionBusy}
            className="bo-shell-action bo-shell-action--primary"
          >
            {groupSelectionBusy ? 'Grouping…' : `Group ${marqueeSelectedIds.length} notes`}
          </button>
          <button
            type="button"
            onClick={() => setMarqueeSelectedIds([])}
            className="bo-shell-action"
          >
            Clear
          </button>
        </div>
      )}

      {groups.map(group => {
        const members = ideas.filter(i => i.panel?.groupId === group.id);
        if (members.length === 0) return null;
        const theme = group.theme?.trim() ?? '';
        const sharedQuestion = group.sharedQuestion?.trim() ?? '';
        if (!theme && !sharedQuestion) return null;
        const minX = Math.min(...members.map(m => m.panel!.x));
        const minY = Math.min(...members.map(m => m.panel!.y));
        return (
          <div
            key={group.id}
            style={{
              position: 'absolute',
              left: minX,
              top: Math.max(0, minY - 28),
              borderLeft: `3px solid ${colorForGroup(group.id)}`,
              paddingLeft: 6,
              zIndex: 0,
            }}
            className="pointer-events-none max-w-[280px]"
          >
            {theme && (
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-700 truncate">
                {theme}
              </p>
            )}
            {sharedQuestion && (
              <p className="text-[11px] italic text-gray-500 truncate">{sharedQuestion}</p>
            )}
          </div>
        );
      })}

      {ideas.map(idea => {
        const isDragging = liveDrag?.id === idea.id;
        const isMergeTarget = mergeCandidate === idea.id;
        const groupColor = idea.panel?.groupId ? colorForGroup(idea.panel.groupId) : undefined;
        const settledDrop = !isDragging ? settledDropByIdeaId[idea.id] : undefined;
        const isMarqueeSelected = marqueeSelectedIds.includes(idea.id);
        return (
          <IdeaPanel
            key={idea.id}
            boardTheme={boardTheme}
            idea={idea}
            selected={selectedIdeaId === idea.id || isMarqueeSelected}
            liveX={isDragging ? liveDrag!.x : settledDrop?.x}
            liveY={isDragging ? liveDrag!.y : settledDrop?.y}
            groupColor={groupColor}
            mergeProgress={isDragging ? mergeProgress : 0}
            beingMergedInto={isMergeTarget}
            tone={focus.toneByIdeaId.get(idea.id) ?? 'idle'}
            highlight={highlightSet.has(idea.id)}
            docCount={docCounts?.[idea.id] ?? 0}
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            onHoverChange={setHoveredIdea}
            onOpen={ideaId => {
              setMarqueeSelectedIds([]);
              onOpen(ideaId);
            }}
            onOpenDocs={onOpenDocs}
            onDiscard={onDiscard}
            linkModeEnabled={linkingActive}
            linkModeAnchor={linkAnchorId === idea.id}
            linkModePending={linkAnchorId !== null && linkAnchorId !== idea.id}
            onLinkStart={canCreateConnections ? handleLinkStart : undefined}
            onLinkComplete={canCreateConnections ? handleLinkComplete : undefined}
          />
        );
      })}

      {linkDraft && linkSourceIdea && linkTargetIdea && (
        <ConnectionComposer
          sourceIdea={linkSourceIdea}
          targetIdea={linkTargetIdea}
          draftKind={linkDraft.kind}
          draftRationale={linkDraft.rationale}
          busy={linkBusy}
          error={linkError}
          onKindChange={kind => {
            setLinkDraft(current => (current ? { ...current, kind } : current));
          }}
          onRationaleChange={rationale => {
            setLinkDraft(current => (current ? { ...current, rationale } : current));
          }}
          onSubmit={() => {
            void handleSaveLink();
          }}
          onCancel={() => {
            setLinkDraft(null);
            setLinkError(null);
          }}
        />
      )}

      {suggestions?.map((suggestion, index) => {
        const isLastVisible = index === suggestions.length - 1;
        const isDragging = liveSuggestionDrag?.id === suggestion.id;
        const settledDrop = !isDragging ? settledDropBySuggestionId[suggestion.id] : undefined;
        return (
          <GhostPanel
            key={suggestion.id}
            suggestion={suggestion}
            liveX={isDragging ? liveSuggestionDrag!.x : settledDrop?.x}
            liveY={isDragging ? liveSuggestionDrag!.y : settledDrop?.y}
            busy={suggestionBusy?.[suggestion.id] ?? null}
            animated={!!animatedSuggestionIds?.includes(suggestion.id) && !suppressAnimations}
            overflowCount={isLastVisible ? suggestionOverflowCount ?? 0 : 0}
            expandedList={isLastVisible && !!suggestionsExpanded}
            onExpandOverflow={isLastVisible ? onExpandSuggestions : undefined}
            onCollapseOverflow={isLastVisible ? onCollapseSuggestions : undefined}
            onDragStart={handleSuggestionDragStart}
            onDrag={handleSuggestionDrag}
            onDragEnd={handleSuggestionDragEnd}
            onAdmit={onAdmitSuggestion ?? (() => {})}
            onElaborate={onElaborateSuggestion ?? (() => {})}
            onDismiss={onDismissSuggestion ?? (() => {})}
          />
        );
      })}

      {ideas.length === 0 && (!suggestions || suggestions.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="bo-empty-state max-w-md rounded-[28px] border px-6 py-6 text-center shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Empty board
            </p>
            <h2 className="mt-3 text-lg font-semibold text-slate-900">
              Add the first note.
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use <span className="font-semibold text-slate-800">New note</span> to place a card on the canvas. Then use <span className="font-semibold text-slate-800">Link mode</span> to connect notes and the <span className="font-semibold text-slate-800">role dock</span> to scout or challenge the board.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
