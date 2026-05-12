import React, { useMemo } from 'react';
import type { Idea, IdeaGroup } from '../types';
import { colorForGroup } from './reactflow/flowProjection';

/**
 * ClusterHaloLayer — Screen 02 cluster halo overlay (Build Spec §05 / M3).
 *
 * Renders a soft SVG halo around each `IdeaGroup` whose member ideas have
 * resolved canvas panels. Designed to sit inside the world-coordinate overlay
 * slot exposed by `ReactFlowCanvas` (the same div that already renders group
 * theme labels), so its bounding boxes match the React Flow viewport without
 * needing direct viewport state.
 *
 * Visual behavior:
 *  - `clusterZoom={false}` (idea zoom — default): halos render with low alpha
 *    behind/around stickies as a quiet "membership" hint.
 *  - `clusterZoom={true}` (cluster zoom): halos elevate (higher opacity, drop
 *    shadow) so the cluster is the primary unit of attention. The host is
 *    expected to swap idea nodes for `Sticky` thumbnails in this mode.
 *
 * The component is purely presentational. It expects callers to provide the
 * world-space `width`/`height` of the surface so the SVG canvas covers the
 * full scrollable board (matching the React Flow viewport bounds estimator).
 */

const HALO_PADDING_PX = 28;
const HALO_RADIUS_PX = 32;
const HALO_FILL_OPACITY_IDLE = 0.12;
const HALO_FILL_OPACITY_ACTIVE = 0.28;
const HALO_STROKE_OPACITY_IDLE = 0.32;
const HALO_STROKE_OPACITY_ACTIVE = 0.65;

export interface ClusterHaloLayerProps {
  /** Groups to project. Groups whose ideas have no panels are skipped. */
  groups: IdeaGroup[];
  /** Ideas that may belong to one of the supplied groups. */
  ideas: Idea[];
  /**
   * Total scrollable surface in world coordinates. Should match the bounds
   * computed by `estimateBoardBounds` so the SVG covers every panel.
   */
  width: number;
  height: number;
  /**
   * When `true`, halos render with elevated opacity / heavier stroke and
   * stack above stickies so the cluster reads as the dominant unit.
   * Defaults to `false` (idea zoom).
   */
  clusterZoom?: boolean;
  /**
   * Optional preview overlay (bo-143). When set, an extra halo is drawn
   * around the listed ideas using the cluster-zoom active style regardless
   * of the current zoom mode, so a proposed Synthesizer cluster can be
   * highlighted before it's applied. Ideas without panels are ignored;
   * a single panel still renders (proposals start at 2+ but defending the
   * single-panel case keeps the preview readable).
   */
  previewIdeaIds?: string[];
  /**
   * Optional stable id used to derive the preview halo colour so two
   * different previews stay distinguishable. Falls back to a fixed key.
   */
  previewKey?: string;
}

interface HaloRect {
  groupId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  theme: string | null;
}

function computeHaloRects(
  groups: IdeaGroup[],
  ideas: Idea[],
): HaloRect[] {
  if (groups.length === 0) return [];
  const ideaById = new Map(ideas.map(idea => [idea.id, idea] as const));
  const rects: HaloRect[] = [];
  for (const group of groups) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let memberCount = 0;
    for (const ideaId of group.ideaIds) {
      const idea = ideaById.get(ideaId);
      const panel = idea?.panel;
      if (!panel) continue;
      memberCount += 1;
      minX = Math.min(minX, panel.x);
      minY = Math.min(minY, panel.y);
      maxX = Math.max(maxX, panel.x + panel.width);
      maxY = Math.max(maxY, panel.y + panel.height);
    }
    // Need at least 2 panels to form a meaningful halo. A single-member halo
    // would just be a redundant outline of the sticky itself.
    if (memberCount < 2 || !Number.isFinite(minX)) continue;
    rects.push({
      groupId: group.id,
      x: minX - HALO_PADDING_PX,
      y: minY - HALO_PADDING_PX,
      width: maxX - minX + HALO_PADDING_PX * 2,
      height: maxY - minY + HALO_PADDING_PX * 2,
      color: colorForGroup(group.id),
      theme: group.theme?.trim() || null,
    });
  }
  return rects;
}

function computePreviewRect(
  ideas: Idea[],
  previewIdeaIds: string[] | undefined,
  previewKey: string,
): HaloRect | null {
  if (!previewIdeaIds || previewIdeaIds.length === 0) return null;
  const ideaById = new Map(ideas.map(idea => [idea.id, idea] as const));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let memberCount = 0;
  for (const ideaId of previewIdeaIds) {
    const idea = ideaById.get(ideaId);
    const panel = idea?.panel;
    if (!panel) continue;
    memberCount += 1;
    minX = Math.min(minX, panel.x);
    minY = Math.min(minY, panel.y);
    maxX = Math.max(maxX, panel.x + panel.width);
    maxY = Math.max(maxY, panel.y + panel.height);
  }
  if (memberCount === 0 || !Number.isFinite(minX)) return null;
  return {
    groupId: `preview:${previewKey}`,
    x: minX - HALO_PADDING_PX,
    y: minY - HALO_PADDING_PX,
    width: maxX - minX + HALO_PADDING_PX * 2,
    height: maxY - minY + HALO_PADDING_PX * 2,
    color: colorForGroup(previewKey),
    theme: null,
  };
}

export function ClusterHaloLayer({
  groups,
  ideas,
  width,
  height,
  clusterZoom = false,
  previewIdeaIds,
  previewKey = 'synthesizer-preview',
}: ClusterHaloLayerProps): React.ReactElement | null {
  const halos = useMemo(() => computeHaloRects(groups, ideas), [groups, ideas]);
  const previewRect = useMemo(
    () => computePreviewRect(ideas, previewIdeaIds, previewKey),
    [ideas, previewIdeaIds, previewKey],
  );

  if (halos.length === 0 && !previewRect) return null;

  const fillOpacity = clusterZoom ? HALO_FILL_OPACITY_ACTIVE : HALO_FILL_OPACITY_IDLE;
  const strokeOpacity = clusterZoom ? HALO_STROKE_OPACITY_ACTIVE : HALO_STROKE_OPACITY_IDLE;
  const strokeWidth = clusterZoom ? 3 : 1.5;
  // In cluster zoom, sit above the (thumbnail-sized) stickies to dominate the
  // visual hierarchy. In idea zoom, drop behind so stickies stay legible.
  const zIndex = clusterZoom ? 7 : 0;
  // Preview halos always elevate above stickies so the user sees the proposed
  // boundary regardless of zoom mode. Match the cluster-zoom thumbnail layer
  // (zIndex 9) so the preview reads as the dominant unit while it's active.
  const previewZIndex = 10;

  return (
    <>
    <svg
      className="bo-cluster-halo-layer pointer-events-none absolute left-0 top-0"
      width={width}
      height={height}
      viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`}
      style={{ zIndex, overflow: 'visible' }}
      aria-hidden="true"
      data-cluster-zoom={clusterZoom ? 'true' : 'false'}
    >
      {halos.map(halo => {
        const filterStyle = clusterZoom
          ? 'drop-shadow(0 4px 14px rgba(26, 24, 20, 0.18))'
          : undefined;
        return (
          <g key={halo.groupId} data-group-id={halo.groupId}>
            <rect
              x={halo.x}
              y={halo.y}
              width={halo.width}
              height={halo.height}
              rx={HALO_RADIUS_PX}
              ry={HALO_RADIUS_PX}
              fill={halo.color}
              fillOpacity={fillOpacity}
              stroke={halo.color}
              strokeOpacity={strokeOpacity}
              strokeWidth={strokeWidth}
              strokeDasharray={clusterZoom ? undefined : '6 6'}
              style={filterStyle ? { filter: filterStyle } : undefined}
            />
          </g>
        );
      })}
    </svg>
    {previewRect && (
      <svg
        className="bo-cluster-halo-preview-layer pointer-events-none absolute left-0 top-0"
        width={width}
        height={height}
        viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`}
        style={{ zIndex: previewZIndex, overflow: 'visible' }}
        aria-hidden="true"
        data-preview="true"
      >
        <g key={previewRect.groupId} data-group-id={previewRect.groupId}>
          <rect
            x={previewRect.x}
            y={previewRect.y}
            width={previewRect.width}
            height={previewRect.height}
            rx={HALO_RADIUS_PX}
            ry={HALO_RADIUS_PX}
            fill={previewRect.color}
            fillOpacity={HALO_FILL_OPACITY_ACTIVE}
            stroke={previewRect.color}
            strokeOpacity={HALO_STROKE_OPACITY_ACTIVE}
            strokeWidth={3}
            strokeDasharray="10 6"
            style={{ filter: 'drop-shadow(0 4px 14px rgba(26, 24, 20, 0.22))' }}
          />
        </g>
      </svg>
    )}
    </>
  );
}

export default ClusterHaloLayer;
