import '@xyflow/react/dist/style.css';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';

import type {
  BoardThemeMode,
  Connection,
  Idea,
  IdeaGroup,
  ScoutSuggestion,
} from '../types';
import { deriveCanvasFocus } from './canvasFocus';
import { ConnectionComposer } from './ConnectionComposer';
import type { LiveDragState } from './connectionOverlayGeometry';
import { ConnectionEdge } from './reactflow/ConnectionEdge';
import {
  IDEA_FLOW_NODE_TYPE,
  ideaFlowNodeTypes,
  type IdeaFlowNodeCallbacks,
  type FlowBoardEdge as BoardEdge,
  type FlowBoardNode as BoardNode,
} from './reactflow';
import {
  CONNECTION_FLOW_EDGE_TYPE,
  SUGGESTION_FLOW_NODE_TYPE,
  applyFlowPositionsToIdeas,
  applyFlowPositionsToSuggestions,
  centersOverlap,
  colorForGroup,
  estimateBoardBounds,
  groupLabelLayout,
  ideaNodeId,
  minEdgeDistance,
  parseIdeaId,
  parseSuggestionId,
  projectConnectionEdges,
  projectIdeaNodes,
  projectSuggestionNodes,
  selectedIdeaBounds,
} from './reactflow/flowProjection';
import { SuggestionNode } from './reactflow/SuggestionNode';

export const MERGE_HOLD_MS = 2000;
export const GROUP_PROXIMITY_PX = 40;

type LinkDraft = {
  fromIdeaId: string;
  toIdeaId: string;
  kind: Connection['kind'];
  rationale: string;
};

type SuggestionBusy = Record<string, 'admit' | 'elaborate' | 'dismiss' | null>;

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
  onMove: (ideaId: string, x: number, y: number) => Promise<void> | void;
  onOpen: (ideaId: string) => void;
  onOpenSuggestion?: (suggestionId: string) => void;
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
  suggestionBusy?: SuggestionBusy;
  onMoveSuggestion?: (suggestionId: string, x: number, y: number) => Promise<void> | void;
  onAdmitSuggestion?: (id: string) => void;
  onElaborateSuggestion?: (id: string) => void;
  onDismissSuggestion?: (id: string) => void;
  onExpandSuggestions?: () => void;
  onCollapseSuggestions?: () => void;
}

const edgeTypes = {
  [CONNECTION_FLOW_EDGE_TYPE]: ConnectionEdge,
};

const nodeTypes = {
  ...ideaFlowNodeTypes,
  [SUGGESTION_FLOW_NODE_TYPE]: SuggestionNode,
};

function clearTimer(timerRef: React.MutableRefObject<number | null>): void {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

function reconcileNodes(
  current: BoardNode[],
  projected: BoardNode[],
  draggingNodeId: string | null,
): BoardNode[] {
  const currentById = new Map(current.map(node => [node.id, node] as const));
  let changed = current.length !== projected.length;

  const result = projected.map(node => {
    const existing = currentById.get(node.id);
    if (!existing) {
      changed = true;
      return node;
    }
    const desiredPosition = draggingNodeId === node.id ? existing.position : node.position;
    const desiredSelected = existing.selected ?? node.selected;
    // Reuse the existing node object when every observable field matches.
    // Without this, every projection cycle creates fresh node references,
    // which feeds back through effectiveSuggestions/projectedSuggestionNodes
    // and re-fires the projection useEffect — a self-sustaining render loop
    // that re-applies inline styles to every DOM node every render.
    if (
      existing.data === node.data &&
      existing.position.x === desiredPosition.x &&
      existing.position.y === desiredPosition.y &&
      existing.selected === desiredSelected &&
      existing.type === node.type &&
      existing.zIndex === node.zIndex
    ) {
      return existing;
    }
    changed = true;
    return {
      ...node,
      position: desiredPosition,
      selected: desiredSelected,
    };
  });

  return changed ? result : current;
}

export default function ReactFlowCanvas({
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
  onOpenSuggestion,
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
  const boardSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [flowNodes, setFlowNodes] = useState<BoardNode[]>([]);
  const [flowEdges, setFlowEdges] = useState<BoardEdge[]>([]);
  const [selectedFlowNodeIds, setSelectedFlowNodeIds] = useState<string[]>([]);
  const [hoveredIdeaId, setHoveredIdeaId] = useState<string | null>(null);
  const [liveDrag, setLiveDrag] = useState<LiveDragState | null>(null);
  const [mergeCandidateId, setMergeCandidateId] = useState<string | null>(null);
  const [flashState, setFlashState] = useState<{ activeIdeaId: string | null; ideaIds: string[] }>({
    activeIdeaId: null,
    ideaIds: [],
  });
  const [linkAnchorId, setLinkAnchorId] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [groupSelectionBusy, setGroupSelectionBusy] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const mergeTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const draggingNodeIdRef = useRef<string | null>(null);
  const marqueeStartRef = useRef<{
    pointerId: number;
    screenX: number;
    screenY: number;
    boardX: number;
    boardY: number;
  } | null>(null);
  const flowInstanceRef = useRef<{
    zoomIn: () => Promise<boolean>;
    zoomOut: () => Promise<boolean>;
    fitView: (options?: { duration?: number; padding?: number }) => Promise<boolean>;
  } | null>(null);

  const effectiveIdeas = useMemo(() => applyFlowPositionsToIdeas(ideas, flowNodes), [ideas, flowNodes]);
  const effectiveSuggestions = useMemo(
    () => applyFlowPositionsToSuggestions(suggestions ?? [], flowNodes),
    [flowNodes, suggestions],
  );
  const connectionList = useMemo(() => connections ?? [], [connections]);
  const activeIdeaId = liveDrag?.id ?? hoveredIdeaId ?? flashState.activeIdeaId;
  const ideaIds = useMemo(() => ideas.map(idea => idea.id), [ideas]);
  const focus = useMemo(
    () => deriveCanvasFocus(ideaIds, connectionList, activeIdeaId, flashState.ideaIds),
    [ideaIds, connectionList, activeIdeaId, flashState.ideaIds],
  );
  const selectedIdeaIds = useMemo(
    () => flowNodes.flatMap(node => {
      if (!node.selected || node.type !== IDEA_FLOW_NODE_TYPE) return [];
      return [node.data.idea.id];
    }),
    [flowNodes],
  );

  const linkAnchorIdRef = useRef<string | null>(null);
  const linkModeEnabledRef = useRef(linkModeEnabled);
  const onCreateConnectionRef = useRef(onCreateConnection);
  useEffect(() => { linkAnchorIdRef.current = linkAnchorId; }, [linkAnchorId]);
  useEffect(() => { linkModeEnabledRef.current = linkModeEnabled; }, [linkModeEnabled]);
  useEffect(() => { onCreateConnectionRef.current = onCreateConnection; }, [onCreateConnection]);

  const handleStartLink = useCallback((ideaId: string) => {
    if (!onCreateConnectionRef.current) return;
    clearFlowSelection();
    setLinkDraft(null);
    setLinkError(null);
    setLinkAnchorId(prev => (prev === ideaId ? null : ideaId));
  }, []);
  const handleCompleteLink = useCallback((ideaId: string) => {
    if (!onCreateConnectionRef.current) return;
    setLinkError(null);
    const anchor = linkAnchorIdRef.current;
    if (!anchor) {
      setLinkAnchorId(ideaId);
      return;
    }
    if (anchor === ideaId) {
      setLinkAnchorId(null);
      return;
    }
    const nextDraft = {
      fromIdeaId: anchor,
      toIdeaId: ideaId,
      kind: 'builds_on' as const,
      rationale: linkModeEnabledRef.current ? '' : 'Connected on canvas.',
    };
    setLinkAnchorId(null);
    if (!linkModeEnabledRef.current) {
      void saveQuickLink(nextDraft);
      return;
    }
    setLinkDraft(nextDraft);
  }, []);

  // Parent components routinely pass inline arrow functions for onOpen,
  // onOpenDocs, etc. Memoizing on those identities means a 1-second clock tick
  // upstream re-creates `ideaCallbacks`, which invalidates `projectedIdeaNodes`
  // and forces React Flow to restyle every node. Instead, latch the latest
  // callbacks in a ref and expose stable wrapper functions whose identity
  // never changes.
  const ideaCallbacksRef = useRef({
    onOpen,
    onOpenDocs,
    onDiscard,
    handleStartLink,
    handleCompleteLink,
  });
  useEffect(() => {
    ideaCallbacksRef.current = {
      onOpen,
      onOpenDocs,
      onDiscard,
      handleStartLink,
      handleCompleteLink,
    };
  }, [onOpen, onOpenDocs, onDiscard, handleStartLink, handleCompleteLink]);
  const ideaCallbacks = useMemo<IdeaFlowNodeCallbacks & { onDiscardIdea?: (ideaId: string) => void }>(() => ({
    onOpenIdea: (ideaId: string) => ideaCallbacksRef.current.onOpen?.(ideaId),
    onOpenDocs: (ideaId: string) => ideaCallbacksRef.current.onOpenDocs?.(ideaId),
    onDiscardIdea: (ideaId: string) => ideaCallbacksRef.current.onDiscard?.(ideaId),
    onStartLink: (ideaId: string) => ideaCallbacksRef.current.handleStartLink(ideaId),
    onCompleteLink: (ideaId: string) => ideaCallbacksRef.current.handleCompleteLink(ideaId),
  }), []);

  const linkDraftActive = linkDraft !== null;
  const projectedLinkModeEnabled =
    linkModeEnabled || linkAnchorId !== null || linkDraftActive || linkBusy;
  const liveMergeIdeaId = liveDrag?.id ?? null;
  const projectedIdeaNodes = useMemo(
    () => projectIdeaNodes({
      ideas,
      boardTheme,
      selectedIdeaId,
      selectedFlowNodeIds,
      highlightIds: flashState.ideaIds,
      toneByIdeaId: focus.toneByIdeaId,
      docCounts,
      liveMergeIdeaId,
      mergeCandidateId,
      linkModeEnabled: projectedLinkModeEnabled,
      linkAnchorId,
      callbacks: ideaCallbacks,
    }),
    [
      ideas,
      boardTheme,
      docCounts,
      flashState.ideaIds,
      focus.toneByIdeaId,
      ideaCallbacks,
      linkAnchorId,
      projectedLinkModeEnabled,
      liveMergeIdeaId,
      mergeCandidateId,
      selectedFlowNodeIds,
      selectedIdeaId,
    ],
  );
  // Same inline-callback hazard as the idea callbacks above. Latch the
  // latest references in a ref so projectedSuggestionNodes only re-runs when
  // its data changes, not when the parent re-renders.
  const suggestionCallbacksRef = useRef({
    onAdmitSuggestion,
    onElaborateSuggestion,
    onDismissSuggestion,
    onExpandSuggestions,
    onCollapseSuggestions,
  });
  useEffect(() => {
    suggestionCallbacksRef.current = {
      onAdmitSuggestion,
      onElaborateSuggestion,
      onDismissSuggestion,
      onExpandSuggestions,
      onCollapseSuggestions,
    };
  }, [onAdmitSuggestion, onElaborateSuggestion, onDismissSuggestion, onExpandSuggestions, onCollapseSuggestions]);
  const stableSuggestionCallbacks = useMemo(
    () => ({
      onAdmitSuggestion: (id: string) => suggestionCallbacksRef.current.onAdmitSuggestion?.(id),
      onElaborateSuggestion: (id: string) => suggestionCallbacksRef.current.onElaborateSuggestion?.(id),
      onDismissSuggestion: (id: string) => suggestionCallbacksRef.current.onDismissSuggestion?.(id),
      onExpandSuggestions: () => suggestionCallbacksRef.current.onExpandSuggestions?.(),
      onCollapseSuggestions: () => suggestionCallbacksRef.current.onCollapseSuggestions?.(),
    }),
    [],
  );
  const projectedSuggestionNodes = useMemo(
    () => projectSuggestionNodes({
      suggestions: effectiveSuggestions,
      selectedFlowNodeIds,
      animatedSuggestionIds,
      suggestionBusy,
      suggestionOverflowCount,
      suggestionsExpanded,
      onAdmitSuggestion: stableSuggestionCallbacks.onAdmitSuggestion,
      onElaborateSuggestion: stableSuggestionCallbacks.onElaborateSuggestion,
      onDismissSuggestion: stableSuggestionCallbacks.onDismissSuggestion,
      onExpandSuggestions: stableSuggestionCallbacks.onExpandSuggestions,
      onCollapseSuggestions: stableSuggestionCallbacks.onCollapseSuggestions,
    }),
    [
      animatedSuggestionIds,
      effectiveSuggestions,
      selectedFlowNodeIds,
      stableSuggestionCallbacks,
      suggestionBusy,
      suggestionOverflowCount,
      suggestionsExpanded,
    ],
  );
  const onConnectionClickRef = useRef(onConnectionClick);
  useEffect(() => { onConnectionClickRef.current = onConnectionClick; }, [onConnectionClick]);
  const stableOnEdgeSelect = useCallback((_: unknown, ideaIds: string[]) => {
    triggerFlash(ideaIds);
    onConnectionClickRef.current?.(ideaIds);
  }, []);
  const projectedEdges = useMemo(
    () => projectConnectionEdges({
      ideas: effectiveIdeas,
      connections: connectionList,
      liveDrag,
      activeIdeaId: focus.activeIdeaId,
      activePathIdeaIds: [...focus.activePathIdeaIds],
      animatedConnectionIds,
      suppressAnimations,
      onSelect: stableOnEdgeSelect,
    }),
    [animatedConnectionIds, connectionList, effectiveIdeas, focus.activeIdeaId, focus.activePathIdeaIds, liveDrag, stableOnEdgeSelect, suppressAnimations],
  );

  useEffect(() => {
    setFlowNodes(current => reconcileNodes(current, [...projectedIdeaNodes, ...projectedSuggestionNodes], draggingNodeIdRef.current));
  }, [projectedIdeaNodes, projectedSuggestionNodes]);

  useEffect(() => {
    setFlowEdges(projectedEdges);
  }, [projectedEdges]);

  useEffect(() => {
    return () => {
      clearTimer(flashTimerRef);
      clearTimer(mergeTimerRef);
      onDragStateChange?.(false);
      onFocusIdeaChange?.(null);
    };
  }, [onDragStateChange, onFocusIdeaChange]);

  useEffect(() => {
    if (!highlightIds?.length) return;
    triggerFlash(highlightIds);
  }, [highlightIds]);

  function clearMergeHold(): void {
    if (mergeTimerRef.current !== null) {
      window.clearTimeout(mergeTimerRef.current);
      mergeTimerRef.current = null;
    }
    setMergeCandidateId(null);
  }

  function triggerFlash(ideaIds: string[]): void {
    clearTimer(flashTimerRef);
    setFlashState({ activeIdeaId: ideaIds[0] ?? null, ideaIds });
    flashTimerRef.current = window.setTimeout(() => {
      setFlashState({ activeIdeaId: null, ideaIds: [] });
      flashTimerRef.current = null;
    }, 900);
  }

  function clearFlowSelection(): void {
    selectFlowNodes([]);
  }

  function selectFlowNodes(nodeIds: string[]): void {
    const selection = new Set(nodeIds);
    setSelectedFlowNodeIds(nodeIds);
    setFlowNodes(current => current.map(node => ({
      ...node,
      selected: selection.has(node.id),
    })));
  }

  function clearPendingNodePosition(nodeId: string): void {
    if (draggingNodeIdRef.current === nodeId) {
      draggingNodeIdRef.current = null;
    }
  }

  function pointFromClient(clientX: number, clientY: number): {
    screenX: number;
    screenY: number;
    boardX: number;
    boardY: number;
  } | null {
    const host = boardSurfaceRef.current;
    if (!host) return null;
    const rect = host.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    return {
      screenX,
      screenY,
      boardX: (screenX - viewport.x) / viewport.zoom,
      boardY: (screenY - viewport.y) / viewport.zoom,
    };
  }

  async function saveQuickLink(nextDraft: LinkDraft): Promise<void> {
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
      await onCreateConnection({ ...linkDraft, rationale });
      setLinkDraft(null);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Failed to save link.');
    } finally {
      setLinkBusy(false);
    }
  }

  const liveOverlayContent = React.isValidElement(overlayContent)
    ? React.cloneElement(overlayContent as React.ReactElement<{ ideas?: Idea[] }>, { ideas: effectiveIdeas })
    : overlayContent;
  const boardBounds = estimateBoardBounds(effectiveIdeas, effectiveSuggestions);
  const selectionBounds = selectedIdeaBounds(flowNodes);
  const selectionScreenBounds = selectionBounds
    ? {
        left: selectionBounds.left * viewport.zoom + viewport.x,
        top: selectionBounds.top * viewport.zoom + viewport.y,
        bottom: selectionBounds.bottom * viewport.zoom + viewport.y,
      }
    : null;
  const linkSourceIdea = linkDraft ? effectiveIdeas.find(idea => idea.id === linkDraft.fromIdeaId) ?? null : null;
  const linkTargetIdea = linkDraft ? effectiveIdeas.find(idea => idea.id === linkDraft.toIdeaId) ?? null : null;
  const linkingActive = linkModeEnabled || linkAnchorId !== null || linkDraft !== null || linkBusy;
  // Kill the default-canvas first-time hint; it reads as a SaaS toast. Only show contextual hint while link mode is actively engaged.
  const showConnectionHint = false;
  const overlayViewportStyle = {
    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    transformOrigin: '0 0',
    width: `${boardBounds.width}px`,
    height: `${boardBounds.height}px`,
  } as const;

  const effectiveIdeasRef = useRef(effectiveIdeas);
  useEffect(() => {
    effectiveIdeasRef.current = effectiveIdeas;
  }, [effectiveIdeas]);

  return (
    <div className="bo-canvas relative h-full w-full overflow-auto" aria-label="Idea canvas">
      <div
        ref={boardSurfaceRef}
        className="relative"
        onPointerDownCapture={event => {
          if (event.button !== 0) return;
          // Marquee-select is an opt-in gesture (shift-drag). Everything else — plain
          // drag on empty canvas, drag on a sticky, click on a sticky — falls through
          // to React Flow. Prevents the marquee from firing during a node drag.
          if (!event.shiftKey) return;
          const target = event.target as HTMLElement | null;
          if (!target) return;
          if (
            target.closest('.react-flow__node') ||
            target.closest('.react-flow__edge') ||
            target.closest('.bo-note-artifact') ||
            target.closest('.bo-critique-artifact') ||
            target.closest('.bo-connection-composer') ||
            target.closest('.bo-shell-action') ||
            target.closest('button') ||
            target.closest('input') ||
            target.closest('textarea') ||
            target.closest('select') ||
            target.closest('[data-marquee-ignore="true"]')
          ) {
            return;
          }
          const point = pointFromClient(event.clientX, event.clientY);
          if (!point) return;
          const pointerId = event.pointerId;
          const startPoint = {
            pointerId,
            screenX: point.screenX,
            screenY: point.screenY,
            boardX: point.boardX,
            boardY: point.boardY,
          };
          marqueeStartRef.current = startPoint;
          setMarqueeRect({ left: point.screenX, top: point.screenY, width: 0, height: 0 });

          function updateMarquee(moveEvent: PointerEvent): void {
            if (moveEvent.pointerId !== pointerId) return;
            const next = pointFromClient(moveEvent.clientX, moveEvent.clientY);
            if (!next) return;
            setMarqueeRect({
              left: Math.min(startPoint.screenX, next.screenX),
              top: Math.min(startPoint.screenY, next.screenY),
              width: Math.abs(next.screenX - startPoint.screenX),
              height: Math.abs(next.screenY - startPoint.screenY),
            });
          }

          function finishMarquee(upEvent: PointerEvent): void {
            if (upEvent.pointerId !== pointerId) return;
            window.removeEventListener('pointermove', updateMarquee);
            window.removeEventListener('pointerup', finishMarquee);
            window.removeEventListener('pointercancel', finishMarquee);

            const end = pointFromClient(upEvent.clientX, upEvent.clientY);
            marqueeStartRef.current = null;
            setMarqueeRect(null);
            if (!end) return;

            const dragDistance = Math.hypot(end.screenX - startPoint.screenX, end.screenY - startPoint.screenY);
            if (dragDistance < 6) return;

            const left = Math.min(startPoint.boardX, end.boardX);
            const right = Math.max(startPoint.boardX, end.boardX);
            const top = Math.min(startPoint.boardY, end.boardY);
            const bottom = Math.max(startPoint.boardY, end.boardY);
            const selectedIds = effectiveIdeasRef.current
              .filter(idea => {
                const panel = idea.panel;
                if (!panel) return false;
                return (
                  panel.x >= left &&
                  panel.y >= top &&
                  panel.x + panel.width <= right &&
                  panel.y + panel.height <= bottom
                );
              })
              .map(idea => ideaNodeId(idea.id));
            selectFlowNodes(selectedIds);
          }

          window.addEventListener('pointermove', updateMarquee);
          window.addEventListener('pointerup', finishMarquee);
          window.addEventListener('pointercancel', finishMarquee);
        }}
        style={{
          width: `${boardBounds.width}px`,
          minWidth: '100%',
          height: `${boardBounds.height}px`,
          minHeight: '100%',
        }}
      >
        <ReactFlowProvider>
          <ReactFlow<BoardNode, BoardEdge>
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes as never}
            edgeTypes={edgeTypes as never}
            onNodesChange={(changes: NodeChange<BoardNode>[]) => setFlowNodes(current => applyNodeChanges<BoardNode>(changes, current))}
            onEdgesChange={(changes: EdgeChange<BoardEdge>[]) => setFlowEdges(current => applyEdgeChanges<BoardEdge>(changes, current))}
            onInit={instance => {
              flowInstanceRef.current = instance;
            }}
            onMove={(_, nextViewport) => {
              setViewport(nextViewport);
            }}
            onNodeClick={(_, node) => {
              const ideaId = parseIdeaId(node.id);
              if (ideaId) {
                selectFlowNodes([node.id]);
                onOpen(ideaId);
                onFocusIdeaChange?.(ideaId);
                return;
              }
              const suggestionId = parseSuggestionId(node.id);
              if (!suggestionId) return;
              selectFlowNodes([node.id]);
              onOpenSuggestion?.(suggestionId);
              onFocusIdeaChange?.(null);
            }}
            onPaneClick={() => {
              setHoveredIdeaId(null);
              onFocusIdeaChange?.(null);
              setLinkAnchorId(null);
              setLinkDraft(null);
              setLinkError(null);
              clearFlowSelection();
            }}
            onNodeMouseEnter={(_, node) => {
              const ideaId = parseIdeaId(node.id);
              if (!ideaId) return;
              setHoveredIdeaId(ideaId);
              onFocusIdeaChange?.(ideaId);
            }}
            onNodeMouseLeave={(_, node) => {
              if (!parseIdeaId(node.id)) return;
              setHoveredIdeaId(null);
              onFocusIdeaChange?.(null);
            }}
            onNodeDragStart={(_, node) => {
              draggingNodeIdRef.current = node.id;
              onDragStateChange?.(true);
              clearMergeHold();
              if (parseIdeaId(node.id) || parseSuggestionId(node.id)) {
                selectFlowNodes([node.id]);
              }
            }}
            onNodeDrag={(_, node) => {
              const ideaId = parseIdeaId(node.id);
              if (!ideaId) return;
              setLiveDrag({ id: ideaId, x: node.position.x, y: node.position.y });
              const dragged = effectiveIdeas.find(idea => idea.id === ideaId);
              if (!dragged) return;
              const hovering = effectiveIdeas.find(other => (
                other.id !== ideaId && centersOverlap(dragged, other, node.position.x, node.position.y)
              ));
              if (hovering && hovering.id !== mergeCandidateId) {
                clearMergeHold();
                setMergeCandidateId(hovering.id);
                mergeTimerRef.current = window.setTimeout(() => {
                  mergeTimerRef.current = null;
                  clearMergeHold();
                  onMerge(ideaId, hovering.id);
                }, MERGE_HOLD_MS);
              } else if (!hovering && mergeCandidateId) {
                clearMergeHold();
              }
            }}
            onNodeDragStop={(_, node) => {
              onDragStateChange?.(false);
              const ideaId = parseIdeaId(node.id);
              const suggestionId = parseSuggestionId(node.id);
              const wasHovering = mergeCandidateId;
              clearMergeHold();

              if (ideaId) {
                draggingNodeIdRef.current = node.id;
                void Promise.resolve(onMove(ideaId, node.position.x, node.position.y))
                  .catch(err => {
                    console.error('[ReactFlowCanvas] move persistence failed:', err);
                  })
                  .finally(() => {
                    clearPendingNodePosition(node.id);
                    setLiveDrag(current => (current?.id === ideaId ? null : current));
                  });
                if (wasHovering) return;
                const dropped = effectiveIdeas.find(idea => idea.id === ideaId);
                if (!dropped) return;
                const neighbor = effectiveIdeas.find(other => (
                  other.id !== ideaId && minEdgeDistance(dropped, other, node.position.x, node.position.y) < GROUP_PROXIMITY_PX
                ));
                if (neighbor) {
                  onGroup(ideaId, neighbor.id);
                } else if (dropped.panel?.groupId) {
                  onUngroup(ideaId);
                }
                return;
              }

              if (suggestionId) {
                draggingNodeIdRef.current = node.id;
                void Promise.resolve(onMoveSuggestion?.(suggestionId, node.position.x, node.position.y))
                  .catch(err => {
                    console.error('[ReactFlowCanvas] suggestion move persistence failed:', err);
                  })
                  .finally(() => clearPendingNodePosition(node.id));
                return;
              }

              draggingNodeIdRef.current = null;
              setLiveDrag(null);
            }}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable={false}
            selectionOnDrag={false}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnDoubleClick={false}
            zoomOnPinch
            deleteKeyCode={null}
            fitView={false}
            nodeClickDistance={4}
            minZoom={0.55}
            maxZoom={1.9}
            proOptions={{ hideAttribution: true }}
            className="bo-reactflow-canvas"
          />
        </ReactFlowProvider>

        <div className="pointer-events-none absolute inset-0 z-[8] overflow-hidden">
          <div className="absolute left-0 top-0" style={overlayViewportStyle}>
            {liveOverlayContent}

            {linkDraft && linkSourceIdea && linkTargetIdea && (
              <div className="pointer-events-auto">
                <ConnectionComposer
                  sourceIdea={linkSourceIdea}
                  targetIdea={linkTargetIdea}
                  draftKind={linkDraft.kind}
                  draftRationale={linkDraft.rationale}
                  busy={linkBusy}
                  error={linkError}
                  onKindChange={kind => setLinkDraft(current => (current ? { ...current, kind } : current))}
                  onRationaleChange={rationale => setLinkDraft(current => (current ? { ...current, rationale } : current))}
                  onSubmit={() => { void handleSaveLink(); }}
                  onCancel={() => {
                    setLinkDraft(null);
                    setLinkError(null);
                  }}
                />
              </div>
            )}

            {groups.map(group => {
              const theme = group.theme?.trim() ?? '';
              const sharedQuestion = group.sharedQuestion?.trim() ?? '';
              if (!theme && !sharedQuestion) return null;
              const layout = groupLabelLayout(group, effectiveIdeas);
              if (!layout) return null;
              return (
                <div
                  key={group.id}
                  className="pointer-events-none absolute max-w-[280px]"
                  style={{
                    left: layout.left,
                    top: layout.top,
                    borderLeft: `3px solid ${colorForGroup(group.id)}`,
                    paddingLeft: 6,
                    zIndex: 6,
                  }}
                >
                  {theme && <p className="truncate text-[11px] font-bold uppercase tracking-wide text-gray-700">{theme}</p>}
                  {sharedQuestion && <p className="truncate text-[11px] italic text-gray-500">{sharedQuestion}</p>}
                </div>
              );
            })}
          </div>
        </div>

        {marqueeRect && marqueeRect.width > 2 && marqueeRect.height > 2 && (
          <div
            className="pointer-events-none absolute z-[29] rounded-[18px] border-2 border-dashed border-sky-500/70 bg-sky-200/12"
            style={{
              left: marqueeRect.left,
              top: marqueeRect.top,
              width: marqueeRect.width,
              height: marqueeRect.height,
            }}
          />
        )}

        {linkingActive && onCreateConnection && (
          <div
            className="pointer-events-none absolute right-4 top-[5rem] z-20 max-w-[18rem] px-3 py-2"
            style={{
              background: '#fffdf5',
              border: '1.5px solid rgba(26, 24, 20, 0.6)',
              borderRadius: 4,
              boxShadow: '3px 3px 0 rgba(26, 24, 20, 0.18)',
              fontFamily: '"Kalam", "Patrick Hand", cursive',
            }}
          >
            <p
              className="text-[10px] uppercase"
              style={{
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                letterSpacing: '0.14em',
                color: 'rgba(26, 24, 20, 0.72)',
              }}
            >
              link mode
            </p>
            <p className="mt-1 text-[13px] leading-snug" style={{ color: '#1a1814' }}>
              pick a source, then a target. toggle link mode to add a reason before saving.
            </p>
          </div>
        )}

        {showConnectionHint && (
          <div />
        )}

        {selectionBounds && selectedIdeaIds.length > 1 && onGroupSelection && (
          <div
            className="absolute z-[31] flex items-center gap-2"
            style={{
              left: Math.max(12, selectionScreenBounds?.left ?? selectionBounds.left),
              top: Math.max(
                12,
                selectionScreenBounds
                  ? selectionScreenBounds.top > 56
                    ? selectionScreenBounds.top - 44
                    : selectionScreenBounds.bottom + 8
                  : selectionBounds.top,
              ),
            }}
          >
            <button
              type="button"
              onClick={() => {
                setGroupSelectionBusy(true);
                void Promise.resolve(onGroupSelection(selectedIdeaIds)).finally(() => {
                  setGroupSelectionBusy(false);
                  clearFlowSelection();
                });
              }}
              disabled={groupSelectionBusy}
              className="bo-shell-action bo-shell-action--primary"
            >
              {groupSelectionBusy ? 'Grouping…' : `Group ${selectedIdeaIds.length} notes`}
            </button>
            <button
              type="button"
              onClick={clearFlowSelection}
              className="bo-shell-action"
            >
              Clear
            </button>
          </div>
        )}

        <div
          className="bo-viewport-controls absolute bottom-16 right-4 z-[32] flex items-center gap-2 px-2.5 py-1.5"
          style={{
            background: '#fffdf5',
            border: '1.5px solid rgba(26, 24, 20, 0.55)',
            borderRadius: 4,
            boxShadow: '3px 3px 0 rgba(26, 24, 20, 0.18)',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          }}
        >
          <button
            type="button"
            className="bo-viewport-btn"
            onClick={() => { void flowInstanceRef.current?.zoomOut(); }}
            aria-label="Zoom out"
          >
            −
          </button>
          <span
            className="text-[10px] uppercase"
            style={{ letterSpacing: '0.12em', color: 'rgba(26, 24, 20, 0.72)' }}
          >
            {Math.round(viewport.zoom * 100)}%
          </span>
          <button
            type="button"
            className="bo-viewport-btn"
            onClick={() => { void flowInstanceRef.current?.zoomIn(); }}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="bo-viewport-btn bo-viewport-btn--text"
            onClick={() => {
              void flowInstanceRef.current?.fitView({ duration: 280, padding: 0.18 });
            }}
          >
            fit
          </button>
        </div>

        {ideas.length === 0 && effectiveSuggestions.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <p
              className="max-w-sm text-center"
              style={{
                fontFamily: '"Caveat", "Kalam", cursive',
                fontSize: '1.9rem',
                color: 'rgba(26, 24, 20, 0.55)',
                lineHeight: 1.15,
              }}
            >
              blank page. drop a note to start.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
