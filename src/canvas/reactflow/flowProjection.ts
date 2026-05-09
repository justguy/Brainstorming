import { Position, type Edge, type Node } from '@xyflow/react';

import type {
  BoardThemeMode,
  Connection,
  Idea,
  IdeaGroup,
  ScoutSuggestion,
} from '../../types';
import type { IdeaTone } from '../canvasFocus';
import {
  buildConnectionSegments,
  type LiveDragState,
} from '../connectionOverlayGeometry';
import type { ConnectionEdgeData } from './ConnectionEdge';
import {
  IDEA_FLOW_NODE_TYPE,
  type IdeaFlowNodeCallbacks,
  type IdeaFlowNodeData,
} from './ideaFlowTypes';
import type { SuggestionNodeData } from './SuggestionNode';

export const SUGGESTION_FLOW_NODE_TYPE = 'suggestion-note' as const;
export const CONNECTION_FLOW_EDGE_TYPE = 'connection-note' as const;

export type FlowIdeaNode = Node<IdeaFlowNodeData, typeof IDEA_FLOW_NODE_TYPE>;
export type FlowSuggestionNode = Node<SuggestionNodeData, typeof SUGGESTION_FLOW_NODE_TYPE>;
export type FlowBoardNode = FlowIdeaNode | FlowSuggestionNode;
export type FlowBoardEdge = Edge<ConnectionEdgeData, typeof CONNECTION_FLOW_EDGE_TYPE>;

export function ideaNodeId(ideaId: string): string {
  return `idea:${ideaId}`;
}

export function suggestionNodeId(suggestionId: string): string {
  return `suggestion:${suggestionId}`;
}

export function parseIdeaId(nodeId: string): string | null {
  return nodeId.startsWith('idea:') ? nodeId.slice(5) : null;
}

export function parseSuggestionId(nodeId: string): string | null {
  return nodeId.startsWith('suggestion:') ? nodeId.slice(11) : null;
}

function estimateSelectedIdeaNodeHeight(idea: Idea, panelHeight: number): number {
  const [title = '', ...bodyLines] = idea.rawText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const bodyLength = bodyLines.join(' ').length;
  const titleRows = Math.max(1, Math.ceil(title.length / 24));
  const bodyRows = bodyLength > 0 ? Math.ceil(bodyLength / 36) : 0;
  const metadataRows = idea.tags.length > 0 || (idea.insights?.length ?? 0) > 0 ? 1 : 0;
  const estimatedHeight = 58 + titleRows * 28 + bodyRows * 20 + metadataRows * 28;
  return Math.max(panelHeight, Math.min(460, estimatedHeight));
}

export function colorForGroup(groupId: string): string {
  let hash = 0;
  for (let i = 0; i < groupId.length; i += 1) {
    hash = (hash << 5) - hash + groupId.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

export function centersOverlap(a: Idea, b: Idea, aX?: number, aY?: number): boolean {
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

export function minEdgeDistance(a: Idea, b: Idea, aX?: number, aY?: number): number {
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

export function applyFlowPositionsToIdeas(ideas: Idea[], nodes: FlowBoardNode[]): Idea[] {
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));

  return ideas.map(idea => {
    const node = nodeById.get(ideaNodeId(idea.id));
    if (!node || !idea.panel) return idea;
    return {
      ...idea,
      panel: {
        ...idea.panel,
        x: node.position.x,
        y: node.position.y,
      },
    };
  });
}

export function applyFlowPositionsToSuggestions(
  suggestions: ScoutSuggestion[],
  nodes: FlowBoardNode[],
): ScoutSuggestion[] {
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));

  return suggestions.map(suggestion => {
    const node = nodeById.get(suggestionNodeId(suggestion.id));
    if (!node || !suggestion.panel) return suggestion;
    return {
      ...suggestion,
      panel: {
        ...suggestion.panel,
        x: node.position.x,
        y: node.position.y,
      },
    };
  });
}

export function estimateBoardBounds(
  ideas: Idea[],
  suggestions: ScoutSuggestion[] = [],
): { width: number; height: number } {
  let maxRight = 0;
  let maxBottom = 0;

  for (const idea of ideas) {
    const panel = idea.panel;
    if (!panel) continue;
    maxRight = Math.max(maxRight, panel.x + panel.width + 128);
    maxBottom = Math.max(maxBottom, panel.y + panel.height + 128);
  }

  for (const suggestion of suggestions) {
    const panel = suggestion.panel;
    if (!panel) continue;
    maxRight = Math.max(maxRight, panel.x + panel.width + 128);
    maxBottom = Math.max(maxBottom, panel.y + panel.height + 128);
  }

  return {
    width: Math.max(1400, maxRight),
    height: Math.max(960, maxBottom),
  };
}

export function projectIdeaNodes(input: {
  ideas: Idea[];
  boardTheme: BoardThemeMode;
  selectedIdeaId?: string | null;
  selectedFlowNodeIds?: string[];
  highlightIds?: string[];
  toneByIdeaId?: Map<string, IdeaTone>;
  docCounts?: Record<string, number>;
  liveMergeIdeaId?: string | null;
  mergeCandidateId?: string | null;
  linkModeEnabled?: boolean;
  linkAnchorId?: string | null;
  callbacks?: IdeaFlowNodeCallbacks & {
    onDiscardIdea?: (ideaId: string) => void;
  };
}): FlowIdeaNode[] {
  const selectedSet = new Set(input.selectedFlowNodeIds ?? []);
  const highlightSet = new Set(input.highlightIds ?? []);

  return input.ideas.map(idea => {
    const panel = idea.panel ?? { x: 0, y: 0, width: 260, height: 180 };
    const groupColor = idea.panel?.groupId ? colorForGroup(idea.panel.groupId) : undefined;

    const selected = selectedSet.has(ideaNodeId(idea.id)) || input.selectedIdeaId === idea.id;
    const displayHeight = selected ? estimateSelectedIdeaNodeHeight(idea, panel.height) : panel.height;

    return {
      id: ideaNodeId(idea.id),
      type: IDEA_FLOW_NODE_TYPE,
      position: { x: panel.x, y: panel.y },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: true,
      selectable: true,
      focusable: true,
      data: {
        idea,
        boardTheme: input.boardTheme,
        selected,
        tone: input.toneByIdeaId?.get(idea.id) ?? 'idle',
        docCount: input.docCounts?.[idea.id] ?? 0,
        displayHeight,
        groupColor,
        highlight: highlightSet.has(idea.id),
        merging: input.liveMergeIdeaId === idea.id && input.mergeCandidateId !== null,
        beingMergedInto: input.mergeCandidateId === idea.id,
        linkModeEnabled: input.linkModeEnabled,
        linkModeAnchor: input.linkAnchorId === idea.id,
        linkModePending: input.linkAnchorId !== null && input.linkAnchorId !== idea.id,
        onOpenIdea: input.callbacks?.onOpenIdea,
        onOpenDocs: input.callbacks?.onOpenDocs,
        onDiscardIdea: input.callbacks?.onDiscardIdea,
        onStartLink: input.callbacks?.onStartLink,
        onCompleteLink: input.callbacks?.onCompleteLink,
      },
      style: {
        width: panel.width,
        height: displayHeight,
      },
    };
  });
}

export function projectSuggestionNodes(input: {
  suggestions?: ScoutSuggestion[];
  selectedSuggestionId?: string | null;
  selectedFlowNodeIds?: string[];
  animatedSuggestionIds?: string[];
  suggestionBusy?: Record<string, 'admit' | 'elaborate' | 'dismiss' | null>;
  suggestionOverflowCount?: number;
  suggestionsExpanded?: boolean;
  onAdmitSuggestion?: (id: string) => void;
  onElaborateSuggestion?: (id: string) => void;
  onDismissSuggestion?: (id: string) => void;
  onExpandSuggestions?: () => void;
  onCollapseSuggestions?: () => void;
}): FlowSuggestionNode[] {
  const suggestions = input.suggestions ?? [];
  const animatedSet = new Set(input.animatedSuggestionIds ?? []);
  const selectedSet = new Set(input.selectedFlowNodeIds ?? []);

  return suggestions.map((suggestion, index) => {
    const panel = suggestion.panel ?? { x: 480, y: 60, width: 248, height: 172 };
    const isLastVisible = index === suggestions.length - 1;

    return {
      id: suggestionNodeId(suggestion.id),
      type: SUGGESTION_FLOW_NODE_TYPE,
      position: { x: panel.x, y: panel.y },
      draggable: true,
      selectable: true,
      focusable: true,
      selected: selectedSet.has(suggestionNodeId(suggestion.id)) || input.selectedSuggestionId === suggestion.id,
      data: {
        suggestion,
        animated: animatedSet.has(suggestion.id),
        busy: input.suggestionBusy?.[suggestion.id] ?? null,
        overflowCount: isLastVisible ? input.suggestionOverflowCount ?? 0 : 0,
        expandedList: isLastVisible && !!input.suggestionsExpanded,
        onAdmit: input.onAdmitSuggestion,
        onElaborate: input.onElaborateSuggestion,
        onDismiss: input.onDismissSuggestion,
        onExpandOverflow: isLastVisible ? input.onExpandSuggestions : undefined,
        onCollapseOverflow: isLastVisible ? input.onCollapseSuggestions : undefined,
      },
      style: {
        width: panel.width,
        height: panel.height,
      },
    };
  });
}

export function projectConnectionEdges(input: {
  ideas: Idea[];
  connections: Connection[];
  liveDrag: LiveDragState | null;
  activeIdeaId?: string | null;
  activePathIdeaIds?: string[];
  animatedConnectionIds?: string[];
  suppressAnimations?: boolean;
  onSelect?: (connectionId: string, ideaIds: string[]) => void;
}): FlowBoardEdge[] {
  const segments = buildConnectionSegments(input.ideas, input.connections, input.liveDrag);
  const connectionById = new Map(input.connections.map(connection => [connection.id, connection] as const));
  const animatedSet = new Set(input.animatedConnectionIds ?? []);

  return segments.map(segment => {
    const connection = connectionById.get(segment.connectionId);
    if (!connection) {
      throw new Error(`Missing connection for segment ${segment.connectionId}`);
    }

    return {
      id: segment.id,
      type: CONNECTION_FLOW_EDGE_TYPE,
      source: ideaNodeId(segment.ideaIds[0]),
      target: ideaNodeId(segment.ideaIds[1]),
      selectable: true,
      animated: animatedSet.has(connection.id) && !input.suppressAnimations,
      data: {
        connection,
        activeIdeaId: input.activeIdeaId,
        activePathIdeaIds: input.activePathIdeaIds ?? [],
        animatedConnectionIds: input.animatedConnectionIds ?? [],
        suppressAnimations: input.suppressAnimations,
        labelX: (segment.x1 + segment.x2) / 2,
        labelY: (segment.y1 + segment.y2) / 2,
        onSelect: input.onSelect,
      },
    };
  });
}

export function selectedIdeaBounds(nodes: FlowBoardNode[]): {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
} | null {
  const selectedIdeaNodes = nodes.filter((node): node is FlowIdeaNode => (
    node.type === IDEA_FLOW_NODE_TYPE && Boolean(node.selected)
  ));

  if (selectedIdeaNodes.length === 0) return null;

  const left = Math.min(...selectedIdeaNodes.map(node => node.position.x));
  const top = Math.min(...selectedIdeaNodes.map(node => node.position.y));
  const right = Math.max(
    ...selectedIdeaNodes.map(node => node.position.x + Number(node.style?.width ?? node.data.idea.panel?.width ?? 260)),
  );
  const bottom = Math.max(
    ...selectedIdeaNodes.map(node => node.position.y + Number(node.style?.height ?? node.data.idea.panel?.height ?? 180)),
  );

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export function groupLabelLayout(
  group: IdeaGroup,
  ideas: Idea[],
): { left: number; top: number } | null {
  const members = ideas.filter(idea => idea.panel?.groupId === group.id);
  if (members.length === 0) return null;
  const minX = Math.min(...members.map(member => member.panel?.x ?? 0));
  const minY = Math.min(...members.map(member => member.panel?.y ?? 0));
  return {
    left: minX,
    top: Math.max(0, minY - 28),
  };
}
