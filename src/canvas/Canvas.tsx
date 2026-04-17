import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Connection, Idea, IdeaGroup, ScoutSuggestion } from '../types';
import IdeaPanel from './IdeaPanel';
import GhostPanel from './GhostPanel';
import { ConnectionOverlay } from './ConnectionOverlay';
import { deriveCanvasFocus } from './canvasFocus';

export const MERGE_HOLD_MS = 2000;
export const GROUP_PROXIMITY_PX = 40;

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

export interface CanvasProps {
  ideas: Idea[];
  groups: IdeaGroup[];
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
  onGroup: (ideaIdA: string, ideaIdB: string) => void;
  onUngroup: (ideaId: string) => void;
  onMerge: (draggedId: string, targetId: string) => void;
  onDiscard?: (ideaId: string) => void;
  suggestions?: ScoutSuggestion[];
  suggestionBusy?: Record<string, 'admit' | 'elaborate' | 'dismiss' | null>;
  onAdmitSuggestion?: (id: string) => void;
  onElaborateSuggestion?: (id: string) => void;
  onDismissSuggestion?: (id: string) => void;
  onExpandSuggestions?: () => void;
  onCollapseSuggestions?: () => void;
}

export default function Canvas({
  ideas,
  groups,
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
  onGroup,
  onUngroup,
  onMerge,
  onDiscard,
  suggestions,
  suggestionBusy,
  onAdmitSuggestion,
  onElaborateSuggestion,
  onDismissSuggestion,
  onExpandSuggestions,
  onCollapseSuggestions,
}: CanvasProps): React.ReactElement {
  const [liveDrag, setLiveDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [mergeCandidate, setMergeCandidate] = useState<string | null>(null);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [hoveredIdeaId, setHoveredIdeaId] = useState<string | null>(null);
  const [flashState, setFlashState] = useState<{ activeIdeaId: string | null; ideaIds: string[] }>({ activeIdeaId: null, ideaIds: [] });
  const mergeStartRef = useRef<number | null>(null);
  const mergeTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const connectionList = connections ?? [];

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

  function handleDragStart(_ideaId: string): void {
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

  useEffect(() => {
    return () => {
      if (mergeTimerRef.current !== null) window.clearInterval(mergeTimerRef.current);
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
      onDragStateChange?.(false);
      onFocusIdeaChange?.(null);
    };
  }, [onDragStateChange, onFocusIdeaChange]);

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

  const activeIdeaId = liveDrag?.id ?? hoveredIdeaId ?? flashState.activeIdeaId;
  const focus = useMemo(
    () => deriveCanvasFocus(ideas.map(idea => idea.id), connectionList, activeIdeaId, flashState.ideaIds),
    [ideas, connectionList, activeIdeaId, flashState],
  );
  const highlightSet = new Set(flashState.ideaIds);

  return (
    <div
      className="relative w-full h-full overflow-auto bg-[radial-gradient(circle,#e5e7eb_1px,transparent_1px)] bg-white"
      style={{
        backgroundSize: '24px 24px',
        minHeight: '100%',
      }}
      aria-label="Idea canvas"
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

      {groups.map(group => {
        const members = ideas.filter(i => i.panel?.groupId === group.id);
        if (members.length === 0) return null;
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
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-700 truncate">
              {group.theme ?? 'Naming…'}
            </p>
            {group.sharedQuestion && (
              <p className="text-[11px] italic text-gray-500 truncate">{group.sharedQuestion}</p>
            )}
          </div>
        );
      })}

      {ideas.map(idea => {
        const isDragging = liveDrag?.id === idea.id;
        const isMergeTarget = mergeCandidate === idea.id;
        const groupColor = idea.panel?.groupId ? colorForGroup(idea.panel.groupId) : undefined;
        return (
          <IdeaPanel
            key={idea.id}
            idea={idea}
            liveX={isDragging ? liveDrag!.x : undefined}
            liveY={isDragging ? liveDrag!.y : undefined}
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
            onOpen={onOpen}
            onOpenDocs={onOpenDocs}
            onDiscard={onDiscard}
          />
        );
      })}

      {suggestions?.map((suggestion, index) => {
        const isLastVisible = index === suggestions.length - 1;
        return (
          <GhostPanel
            key={suggestion.id}
            suggestion={suggestion}
            busy={suggestionBusy?.[suggestion.id] ?? null}
            animated={!!animatedSuggestionIds?.includes(suggestion.id) && !suppressAnimations}
            overflowCount={isLastVisible ? suggestionOverflowCount ?? 0 : 0}
            expandedList={isLastVisible && !!suggestionsExpanded}
            onExpandOverflow={isLastVisible ? onExpandSuggestions : undefined}
            onCollapseOverflow={isLastVisible ? onCollapseSuggestions : undefined}
            onAdmit={onAdmitSuggestion ?? (() => {})}
            onElaborate={onElaborateSuggestion ?? (() => {})}
            onDismiss={onDismissSuggestion ?? (() => {})}
          />
        );
      })}

      {ideas.length === 0 && (!suggestions || suggestions.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-gray-400">
            No ideas yet. Capture your first idea to see it on the canvas.
          </p>
        </div>
      )}
    </div>
  );
}
