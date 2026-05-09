import React, { useEffect, useState } from 'react';
import Canvas, { type CanvasProps } from '../../src/canvas/ReactFlowCanvas';
import { ClusterHaloLayer } from '../../src/canvas/ClusterHaloLayer';
import { estimateBoardBounds } from '../../src/canvas/reactflow/flowProjection';
import {
  CritiqueCardsLayer,
  type CritiqueCardsLayerProps,
} from '../../src/canvas/CritiqueCardsLayer';
import { ClarificationBoardOverlay } from '../../src/canvas/ClarificationBoardOverlay';
import { IdeaAttentionLayer } from '../../src/canvas/IdeaAttentionLayer';
import type { Idea, IdeaCritique, IdeaGroup } from '../../src/types';
import { Sticky } from './primitives/Sticky';

type CritiqueBusyByIdea = Record<string, boolean | null | undefined>;

export interface BoardCanvasStageProps extends Omit<CanvasProps, 'overlayContent'> {
  children?: React.ReactNode;
  critiques: IdeaCritique[];
  critiqueBusyByIdea?: CritiqueBusyByIdea;
  critiqueFocusIdeaId?: string | null;
  selectedIdeaId?: string | null;
  hoverIdeaId?: string | null;
  editingIdeaId?: string | null;
  animatedCritiqueIds?: string[];
  onAcceptCritique?: CritiqueCardsLayerProps['onAccept'];
  onDismissCritique?: CritiqueCardsLayerProps['onDismiss'];
  onIdeaUpdate?: (updated: Idea) => void;
  onActivateAttentionItem?: (input: { ideaId: string; attentionId: string }) => void;
  showClarificationOverlay?: boolean;
  /** Extra layers rendered inside the canvas-coordinate overlay (pans/zooms with the board). */
  extraCanvasOverlay?: React.ReactNode;
  /**
   * bo-143 — when set, the canvas paints a preview halo around these ideas
   * (Synthesizer cluster proposal). Cleared by passing `null`/`undefined`.
   */
  clusterPreviewIdeaIds?: string[] | null;
  /** Stable id for the preview (used to derive the preview halo colour). */
  clusterPreviewKey?: string | null;
}

function getBusyIdeaIds(critiqueBusyByIdea: CritiqueBusyByIdea | undefined): string[] {
  if (!critiqueBusyByIdea) return [];

  return Object.entries(critiqueBusyByIdea)
    .filter(([, busy]) => Boolean(busy))
    .map(([ideaId]) => ideaId);
}

export function BoardCanvasStage({
  children,
  boardTheme,
  critiques,
  critiqueBusyByIdea,
  critiqueFocusIdeaId = null,
  selectedIdeaId = null,
  hoverIdeaId = null,
  editingIdeaId = null,
  animatedCritiqueIds = [],
  suppressAnimations = false,
  onAcceptCritique,
  onDismissCritique,
  onIdeaUpdate,
  onActivateAttentionItem,
  showClarificationOverlay = true,
  extraCanvasOverlay,
  clusterPreviewIdeaIds = null,
  clusterPreviewKey = null,
  ideas,
  groups,
  onOpen,
  ...canvasProps
}: BoardCanvasStageProps): React.ReactElement {
  const busyIdeaIds = getBusyIdeaIds(critiqueBusyByIdea);
  // M3 / Screen 02: cluster-zoom toggles between idea zoom (default — full
  // sticky cards on the canvas, halos quietly behind) and cluster zoom
  // (stickies dim to thumbnails + halos elevate so the cluster reads first).
  const [clusterZoom, setClusterZoom] = useState(false);

  // Keyboard shortcut "C" to flip between idea/cluster zoom — matches the
  // affordance of "F"/"+/-" already supplied by the ReactFlow viewport panel.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'c' && event.key !== 'C') return;
      const target = event.target as HTMLElement | null;
      if (target) {
        if (
          target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT'
        ) {
          return;
        }
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      setClusterZoom(value => !value);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const surfaceBounds = estimateBoardBounds(ideas);
  const groupList = groups ?? [];

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      data-cluster-zoom={clusterZoom ? 'true' : 'false'}
    >
      <main className="h-full w-full overflow-hidden" aria-label="Canvas">
        <Canvas
          {...canvasProps}
          boardTheme={boardTheme}
          ideas={ideas}
          groups={groupList}
          onOpen={onOpen}
          selectedIdeaId={selectedIdeaId}
          suppressAnimations={suppressAnimations}
          overlayContent={
            <BoardCanvasOverlayStack
              boardTheme={boardTheme}
              ideas={ideas}
              groups={groupList}
              critiques={critiques}
              busyIdeaIds={busyIdeaIds}
              activeIdeaId={critiqueFocusIdeaId}
              hoveredIdeaId={hoverIdeaId}
              editingIdeaId={editingIdeaId}
              animatedCritiqueIds={animatedCritiqueIds}
              suppressAnimations={suppressAnimations}
              selectedIdeaId={selectedIdeaId}
              onAcceptCritique={onAcceptCritique}
              onDismissCritique={onDismissCritique}
              onIdeaUpdate={onIdeaUpdate}
              onActivateAttentionItem={onActivateAttentionItem}
              onOpen={onOpen}
              showClarificationOverlay={showClarificationOverlay}
              clusterZoom={clusterZoom}
              surfaceWidth={surfaceBounds.width}
              surfaceHeight={surfaceBounds.height}
              extraCanvasOverlay={extraCanvasOverlay}
              clusterPreviewIdeaIds={clusterPreviewIdeaIds ?? undefined}
              clusterPreviewKey={clusterPreviewKey ?? undefined}
            />
          }
        />
      </main>
      <ZoomViewToggle
        clusterZoom={clusterZoom}
        clusterCount={groupList.length}
        onToggle={() => setClusterZoom(value => !value)}
      />
      {children}
    </div>
  );
}

interface BoardCanvasOverlayStackProps {
  boardTheme: BoardCanvasStageProps['boardTheme'];
  ideas?: Idea[];
  groups: IdeaGroup[];
  critiques: IdeaCritique[];
  busyIdeaIds: string[];
  activeIdeaId: string | null;
  hoveredIdeaId: string | null;
  editingIdeaId: string | null;
  animatedCritiqueIds: string[];
  suppressAnimations: boolean;
  selectedIdeaId: string | null;
  onAcceptCritique?: CritiqueCardsLayerProps['onAccept'];
  onDismissCritique?: CritiqueCardsLayerProps['onDismiss'];
  onIdeaUpdate?: (updated: Idea) => void;
  onActivateAttentionItem?: (input: { ideaId: string; attentionId: string }) => void;
  onOpen?: (ideaId: string) => void;
  showClarificationOverlay: boolean;
  clusterZoom: boolean;
  surfaceWidth: number;
  surfaceHeight: number;
  extraCanvasOverlay?: React.ReactNode;
  clusterPreviewIdeaIds?: string[];
  clusterPreviewKey?: string;
}

function BoardCanvasOverlayStack({
  boardTheme,
  ideas = [],
  groups,
  critiques,
  busyIdeaIds,
  activeIdeaId,
  hoveredIdeaId,
  editingIdeaId,
  animatedCritiqueIds,
  suppressAnimations,
  selectedIdeaId,
  onAcceptCritique,
  onDismissCritique,
  onIdeaUpdate,
  onActivateAttentionItem,
  onOpen,
  showClarificationOverlay,
  clusterZoom,
  surfaceWidth,
  surfaceHeight,
  extraCanvasOverlay,
  clusterPreviewIdeaIds,
  clusterPreviewKey,
}: BoardCanvasOverlayStackProps): React.ReactElement {
  return (
    <>
      <ClusterHaloLayer
        groups={groups}
        ideas={ideas}
        width={surfaceWidth}
        height={surfaceHeight}
        clusterZoom={clusterZoom}
        previewIdeaIds={clusterPreviewIdeaIds}
        previewKey={clusterPreviewKey}
      />
      {clusterZoom && (
        <ClusterZoomThumbnailLayer
          ideas={ideas}
          selectedIdeaId={selectedIdeaId}
          onOpen={onOpen}
        />
      )}
      <IdeaAttentionLayer
        ideas={ideas}
        critiques={critiques}
        onActivate={input => onActivateAttentionItem?.(input)}
      />
      {showClarificationOverlay && selectedIdeaId && onIdeaUpdate ? (
        <ClarificationBoardOverlay
          ideas={ideas}
          selectedIdeaId={selectedIdeaId}
          onIdeaUpdate={onIdeaUpdate}
        />
      ) : null}
      <CritiqueCardsLayer
        boardTheme={boardTheme}
        ideas={ideas}
        critiques={critiques}
        busyIdeaIds={busyIdeaIds}
        activeIdeaId={activeIdeaId}
        hoveredIdeaId={hoveredIdeaId}
        editingIdeaId={editingIdeaId}
        animatedCritiqueIds={animatedCritiqueIds}
        suppressAnimations={suppressAnimations}
        onAccept={onAcceptCritique}
        onDismiss={onDismissCritique}
      />
      {extraCanvasOverlay}
    </>
  );
}

interface ClusterZoomThumbnailLayerProps {
  ideas: Idea[];
  selectedIdeaId: string | null;
  onOpen?: (ideaId: string) => void;
}

/**
 * Renders each idea as a `Sticky` thumbnail anchored at its panel's centre.
 * Used in cluster zoom so the cluster halos (rendered alongside) remain the
 * dominant visual unit while individual stickies recede into a grid-style
 * preview. Idea-zoom continues to render the full IdeaNoteNode through React
 * Flow; this layer is purely additive in cluster zoom.
 */
function ClusterZoomThumbnailLayer({
  ideas,
  selectedIdeaId,
  onOpen,
}: ClusterZoomThumbnailLayerProps): React.ReactElement {
  return (
    <div
      className="bo-cluster-thumbnail-layer pointer-events-none absolute inset-0"
      style={{ zIndex: 9 }}
      aria-hidden="false"
    >
      {ideas.map(idea => {
        const panel = idea.panel;
        if (!panel) return null;
        const left = panel.x + panel.width / 2 - 24;
        const top = panel.y + panel.height / 2 - 24;
        return (
          <div
            key={idea.id}
            className="pointer-events-auto absolute"
            style={{ left, top }}
          >
            <Sticky
              idea={idea}
              mode="thumbnail"
              selected={selectedIdeaId === idea.id}
              onClick={onOpen}
            />
          </div>
        );
      })}
    </div>
  );
}

interface ZoomViewToggleProps {
  clusterZoom: boolean;
  clusterCount: number;
  onToggle: () => void;
}

/**
 * Small button anchored to the canvas viewport that flips between the two
 * zoom modes. Lives next to the React Flow zoom controls (lower-right) but
 * stays visually distinct so the affordance reads as "view mode" rather
 * than "zoom factor".
 */
function ZoomViewToggle({
  clusterZoom,
  clusterCount,
  onToggle,
}: ZoomViewToggleProps): React.ReactElement {
  const label = clusterZoom ? 'Idea zoom' : 'Cluster zoom';
  const aria = clusterZoom
    ? 'Switch to idea zoom (full sticky cards)'
    : `Switch to cluster zoom${clusterCount > 0 ? ` (${clusterCount} group${clusterCount === 1 ? '' : 's'})` : ''}`;
  return (
    <div
      className="bo-zoom-view-toggle absolute bottom-16 left-4 z-[33]"
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
        onClick={onToggle}
        aria-pressed={clusterZoom}
        aria-label={aria}
        title={`${aria} · shortcut: C`}
        className="px-3 py-1.5 text-[11px] uppercase"
        style={{
          letterSpacing: '0.12em',
          color: clusterZoom ? '#0f5132' : 'rgba(26, 24, 20, 0.78)',
          fontWeight: clusterZoom ? 700 : 500,
        }}
      >
        {label}
      </button>
    </div>
  );
}
