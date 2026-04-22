import '@xyflow/react/dist/style.css';

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  onMove: (ideaId: string, x: number, y: number) => void;
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
  onMoveSuggestion?: (suggestionId: string, x: number, y: number) => void;
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

  return projected.map(node => {
    const existing = currentById.get(node.id);
    if (!existing) return node;
    return {
      ...node,
      position: draggingNodeId === node.id ? existing.position : node.position,
      selected: existing.selected ?? node.selected,
    };
  });
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
  const [mergeProgress, setMergeProgress] = useState(0);
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
  const mergeStartRef = useRef<number | null>(null);
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
  const connectionList = connections ?? [];
  const activeIdeaId = liveDrag?.id ?? hoveredIdeaId ?? flashState.activeIdeaId;
  const focus = useMemo(
    () => deriveCanvasFocus(effectiveIdeas.map(idea => idea.id), connectionList, activeIdeaId, flashState.ideaIds),
    [effectiveIdeas, connectionList, activeIdeaId, flashState],
  );
  const selectedIdeaIds = useMemo(
    () => flowNodes.flatMap(node => {
      if (!node.selected || node.type !== IDEA_FLOW_NODE_TYPE) return [];
      return [node.data.idea.id];
    }),
    [flowNodes],
  );

  const ideaCallbacks: IdeaFlowNodeCallbacks & { onDiscardIdea?: (ideaId: string) => void } = {
    onOpenIdea: onOpen,
    onOpenDocs,
    onDiscardIdea: onDiscard,
    onStartLink: ideaId => {
      if (!onCreateConnection) return;
      clearFlowSelection();
      setLinkDraft(null);
      setLinkError(null);
      setLinkAnchorId(prev => (prev === ideaId ? null : ideaId));
    },
    onCompleteLink: ideaId => {
      if (!onCreateConnection) return;
      setLinkError(null);
      if (!linkAnchorId) {
        setLinkAnchorId(ideaId);
        return;
      }
      if (linkAnchorId === ideaId) {
        setLinkAnchorId(null);
        return;
      }
      const nextDraft = {
        fromIdeaId: linkAnchorId,
        toIdeaId: ideaId,
        kind: 'builds_on' as const,
        rationale: linkModeEnabled ? '' : 'Connected on canvas.',
      };
      setLinkAnchorId(null);
      if (!linkModeEnabled) {
        void saveQuickLink(nextDraft);
        return;
      }
      setLinkDraft(nextDraft);
    },
  };

  const projectedIdeaNodes = useMemo(
    () => projectIdeaNodes({
      ideas: effectiveIdeas,
      boardTheme,
      selectedIdeaId,
      selectedFlowNodeIds,
      highlightIds: flashState.ideaIds,
      toneByIdeaId: focus.toneByIdeaId,
      docCounts,
      liveMergeIdeaId: liveDrag?.id ?? null,
      mergeProgress,
      mergeCandidateId,
      linkModeEnabled: linkModeEnabled || linkAnchorId !== null || linkDraft !== null || linkBusy,
      linkAnchorId,
      callbacks: ideaCallbacks,
    }),
    [
      boardTheme,
      docCounts,
      effectiveIdeas,
      flashState.ideaIds,
      focus.toneByIdeaId,
      linkAnchorId,
      linkBusy,
      linkDraft,
      linkModeEnabled,
      liveDrag?.id,
      mergeCandidateId,
      mergeProgress,
      selectedFlowNodeIds,
      selectedIdeaId,
    ],
  );
  const projectedSuggestionNodes = useMemo(
    () => projectSuggestionNodes({
      suggestions: effectiveSuggestions,
      selectedFlowNodeIds,
      animatedSuggestionIds,
      suggestionBusy,
      suggestionOverflowCount,
      suggestionsExpanded,
      onAdmitSuggestion,
      onElaborateSuggestion,
      onDismissSuggestion,
      onExpandSuggestions,
      onCollapseSuggestions,
    }),
    [
      animatedSuggestionIds,
      effectiveSuggestions,
      onAdmitSuggestion,
      onCollapseSuggestions,
      onDismissSuggestion,
      onElaborateSuggestion,
      onExpandSuggestions,
      selectedFlowNodeIds,
      suggestionBusy,
      suggestionOverflowCount,
      suggestionsExpanded,
    ],
  );
  const projectedEdges = useMemo(
    () => projectConnectionEdges({
      ideas: effectiveIdeas,
      connections: connectionList,
      liveDrag,
      activeIdeaId: focus.activeIdeaId,
      activePathIdeaIds: [...focus.activePathIdeaIds],
      animatedConnectionIds,
      suppressAnimations,
      onSelect: (_, ideaIds) => {
        triggerFlash(ideaIds);
        onConnectionClick?.(ideaIds);
      },
    }),
    [animatedConnectionIds, connectionList, effectiveIdeas, focus.activeIdeaId, focus.activePathIdeaIds, liveDrag, onConnectionClick, suppressAnimations],
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
      if (mergeTimerRef.current !== null) {
        window.clearInterval(mergeTimerRef.current);
      }
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
      window.clearInterval(mergeTimerRef.current);
      mergeTimerRef.current = null;
    }
    mergeStartRef.current = null;
    setMergeCandidateId(null);
    setMergeProgress(0);
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
  const showConnectionHint = Boolean(onCreateConnection && connectionList.length === 0 && ideas.length >= 2 && !linkingActive);
  const overlayViewportStyle = {
    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    transformOrigin: '0 0',
    width: `${boardBounds.width}px`,
    height: `${boardBounds.height}px`,
  } as const;

  useEffect(() => {
    if (!marqueeStartRef.current) return undefined;

    function finishMarquee(event: PointerEvent): void {
      if (marqueeStartRef.current?.pointerId !== event.pointerId) return;
      const start = marqueeStartRef.current;
      marqueeStartRef.current = null;
      const end = pointFromClient(event.clientX, event.clientY);
      setMarqueeRect(null);
      if (!start || !end) return;

      const dragDistance = Math.hypot(end.screenX - start.screenX, end.screenY - start.screenY);
      if (dragDistance < 6) return;

      const left = Math.min(start.boardX, end.boardX);
      const right = Math.max(start.boardX, end.boardX);
      const top = Math.min(start.boardY, end.boardY);
      const bottom = Math.max(start.boardY, end.boardY);
      const selectedIds = effectiveIdeas
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

    function updateMarquee(event: PointerEvent): void {
      if (marqueeStartRef.current?.pointerId !== event.pointerId) return;
      const start = marqueeStartRef.current;
      const point = pointFromClient(event.clientX, event.clientY);
      if (!start || !point) return;
      setMarqueeRect({
        left: Math.min(start.screenX, point.screenX),
        top: Math.min(start.screenY, point.screenY),
        width: Math.abs(point.screenX - start.screenX),
        height: Math.abs(point.screenY - start.screenY),
      });
    }

    window.addEventListener('pointermove', updateMarquee);
    window.addEventListener('pointerup', finishMarquee);
    window.addEventListener('pointercancel', finishMarquee);

    return () => {
      window.removeEventListener('pointermove', updateMarquee);
      window.removeEventListener('pointerup', finishMarquee);
      window.removeEventListener('pointercancel', finishMarquee);
    };
  }, [effectiveIdeas, viewport]);

  return (
    <div className="bo-canvas relative h-full w-full overflow-auto" aria-label="Idea canvas">
      <div
        ref={boardSurfaceRef}
        className="relative"
        onPointerDownCapture={event => {
          if (event.button !== 0) return;
          const target = event.target as HTMLElement | null;
          if (!target) return;
          if (
            target.closest('.react-flow__node') ||
            target.closest('.react-flow__edge') ||
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
          marqueeStartRef.current = {
            pointerId: event.pointerId,
            screenX: point.screenX,
            screenY: point.screenY,
            boardX: point.boardX,
            boardY: point.boardY,
          };
          setMarqueeRect({ left: point.screenX, top: point.screenY, width: 0, height: 0 });
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
                mergeStartRef.current = Date.now();
                mergeTimerRef.current = window.setInterval(() => {
                  const startedAt = mergeStartRef.current;
                  if (startedAt == null) return;
                  const progress = Math.min(1, (Date.now() - startedAt) / MERGE_HOLD_MS);
                  setMergeProgress(progress);
                  if (progress >= 1) {
                    clearMergeHold();
                    onMerge(ideaId, hovering.id);
                  }
                }, 50);
              } else if (!hovering && mergeCandidateId) {
                clearMergeHold();
              }
            }}
            onNodeDragStop={(_, node) => {
              draggingNodeIdRef.current = null;
              onDragStateChange?.(false);
              const ideaId = parseIdeaId(node.id);
              const suggestionId = parseSuggestionId(node.id);
              const wasHovering = mergeCandidateId;
              clearMergeHold();
              setLiveDrag(null);

              if (ideaId) {
                onMove(ideaId, node.position.x, node.position.y);
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
                onMoveSuggestion?.(suggestionId, node.position.x, node.position.y);
              }
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
          <div className="pointer-events-none absolute right-4 top-[6.25rem] z-20 max-w-[18rem] rounded-[22px] border border-sky-200/90 bg-white/92 px-3 py-2.5 shadow-sm backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700">Link mode</p>
            <p className="mt-1 text-xs font-semibold text-slate-900">
              Pick a source note, then a target note. Toggle link mode when you want to set the reason and relation type before saving.
            </p>
          </div>
        )}

        {showConnectionHint && (
          <div className="pointer-events-none absolute right-4 top-[6.25rem] z-20 max-w-[18rem] rounded-[22px] border border-sky-200/90 bg-white/92 px-3 py-2.5 shadow-sm backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700">Connections</p>
            <p className="mt-1 text-xs font-semibold text-slate-900">
              Use the note arrows to connect fast, or toggle link mode to add a reason and relation type before saving.
            </p>
          </div>
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

        <div className="absolute bottom-16 right-4 z-[32] flex items-center gap-2 rounded-[18px] border border-slate-300/80 bg-white/92 px-3 py-2 shadow-[3px_4px_0_rgba(26,24,20,0.14)] backdrop-blur">
          <button type="button" className="bo-shell-action" onClick={() => { void flowInstanceRef.current?.zoomOut(); }}>
            -
          </button>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            {Math.round(viewport.zoom * 100)}%
          </span>
          <button type="button" className="bo-shell-action" onClick={() => { void flowInstanceRef.current?.zoomIn(); }}>
            +
          </button>
          <button
            type="button"
            className="bo-shell-action"
            onClick={() => {
              void flowInstanceRef.current?.fitView({ duration: 280, padding: 0.18 });
            }}
          >
            Fit
          </button>
        </div>

        {ideas.length === 0 && effectiveSuggestions.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="bo-empty-state max-w-md rounded-[28px] border px-6 py-6 text-center shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Empty board</p>
              <h2 className="mt-3 text-lg font-semibold text-slate-900">Add the first note.</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use <span className="font-semibold text-slate-800">New note</span> to place a card on the canvas. Then use <span className="font-semibold text-slate-800">Link mode</span> to connect notes and the <span className="font-semibold text-slate-800">role dock</span> to scout or challenge the board.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
