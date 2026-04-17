import React from 'react';
import type { Connection, Idea } from '../types';
import {
  buildConnectionSegments,
  getOverlayBounds,
  type LiveDragState,
} from './connectionOverlayGeometry';

export interface ConnectionOverlayProps {
  ideas: Idea[];
  connections: Connection[];
  liveDrag: LiveDragState | null;
  activeIdeaId?: string | null;
  activePathIdeaIds?: string[];
  animatedConnectionIds?: string[];
  suppressAnimations?: boolean;
  onConnectionClick?: (ideaIds: string[]) => void;
}

function lineStyle(kind: Connection['kind']): {
  stroke: string;
  flowStroke: string;
  dash?: string;
  markerEnd?: string;
  lineCap?: 'round' | 'butt';
} {
  switch (kind) {
    case 'contradicts':
      return { stroke: '#dc2626', flowStroke: '#fca5a5', dash: '12 8' };
    case 'shared_theme':
      return { stroke: '#6b7280', flowStroke: '#cbd5e1', dash: '3 10', lineCap: 'round' };
    case 'revives_killed':
      return {
        stroke: '#15803d',
        flowStroke: '#86efac',
        markerEnd: 'url(#connection-overlay-arrow)',
      };
    case 'builds_on':
    default:
      return { stroke: '#0f766e', flowStroke: '#5eead4' };
  }
}

function segmentVisual(
  segment: ReturnType<typeof buildConnectionSegments>[number],
  activeIdeaId: string | null,
  activePathIdeaIds: Set<string>,
): {
  emphasis: 'primary' | 'secondary' | 'muted';
  strokeWidth: number;
  opacity: number;
  flowWidth: number;
  flowOpacity: number;
  flowDurationMs: number;
} {
  const touchesActive = Boolean(activeIdeaId && segment.ideaIds.includes(activeIdeaId));
  const isOnActivePath = segment.ideaIds.every(ideaId => activePathIdeaIds.has(ideaId));
  const hasFocusedPath = activePathIdeaIds.size > 0;

  if (touchesActive) {
    return {
      emphasis: 'primary',
      strokeWidth: segment.strength === 'strong' ? 4.4 : 3.1,
      opacity: 0.98,
      flowWidth: segment.strength === 'strong' ? 5.6 : 4.1,
      flowOpacity: 0.86,
      flowDurationMs: segment.strength === 'strong' ? 1200 : 1450,
    };
  }

  if (isOnActivePath) {
    return {
      emphasis: 'secondary',
      strokeWidth: segment.strength === 'strong' ? 3.4 : 2.35,
      opacity: 0.72,
      flowWidth: segment.strength === 'strong' ? 4.4 : 3.2,
      flowOpacity: 0.34,
      flowDurationMs: segment.strength === 'strong' ? 1500 : 1800,
    };
  }

  if (hasFocusedPath) {
    return {
      emphasis: 'muted',
      strokeWidth: segment.strength === 'strong' ? 2 : 1.3,
      opacity: 0.15,
      flowWidth: 2.4,
      flowOpacity: 0,
      flowDurationMs: 0,
    };
  }

  return {
    emphasis: segment.strength === 'strong' ? 'primary' : 'secondary',
    strokeWidth: segment.strength === 'strong' ? 3.6 : 2.3,
    opacity: segment.strength === 'strong' ? 0.88 : 0.58,
    flowWidth: segment.strength === 'strong' ? 4.6 : 3.1,
    flowOpacity: segment.strength === 'strong' ? 0.48 : 0.22,
    flowDurationMs: segment.strength === 'strong' ? 1500 : 1900,
  };
}

function pathForSegment(x1: number, y1: number, x2: number, y2: number, compactness = 1): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy);
  const bend = Math.min(42, Math.max(10, distance * 0.12 * compactness));
  const normalX = distance === 0 ? 0 : -dy / distance;
  const normalY = distance === 0 ? 0 : dx / distance;
  const controlX = (x1 + x2) / 2 + normalX * bend;
  const controlY = (y1 + y2) / 2 + normalY * bend;
  return `M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`;
}

export function ConnectionOverlay({
  ideas,
  connections,
  liveDrag,
  activeIdeaId = null,
  activePathIdeaIds = [],
  animatedConnectionIds = [],
  suppressAnimations = false,
  onConnectionClick,
}: ConnectionOverlayProps): React.ReactElement | null {
  const segments = buildConnectionSegments(ideas, connections, liveDrag);
  if (segments.length === 0) return null;

  const bounds = getOverlayBounds(ideas, liveDrag);
  const activePathIdeaIdSet = new Set(activePathIdeaIds);

  const animatedConnectionIdSet = new Set(animatedConnectionIds);
  const ideaById = new Map(ideas.map(idea => [idea.id, idea] as const));

  return (
    <svg
      className="absolute top-0 left-0 z-0 overflow-visible"
      style={{
        width: bounds.width || '100%',
        height: bounds.height || '100%',
        minWidth: '100%',
        minHeight: '100%',
      }}
      aria-hidden="true"
    >
      <defs>
        <marker
          id="connection-overlay-arrow"
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="3.5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,7 L8,3.5 z" fill="#16a34a" />
        </marker>
      </defs>

      {segments.map(segment => {
        const style = lineStyle(segment.kind);
        const visual = segmentVisual(segment, activeIdeaId, activePathIdeaIdSet);
        const sourceGroupId = ideaById.get(segment.ideaIds[0])?.panel?.groupId;
        const targetGroupId = ideaById.get(segment.ideaIds[1])?.panel?.groupId;
        const inSameGroup = !!sourceGroupId && sourceGroupId === targetGroupId;
        const path = pathForSegment(segment.x1, segment.y1, segment.x2, segment.y2, inSameGroup ? 0.45 : 1);
        const segmentLength = Math.max(1, Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) * (inSameGroup ? 0.92 : 1.08));
        const animateReveal = animatedConnectionIdSet.has(segment.connectionId) && !suppressAnimations;
        return (
          <g key={segment.id}>
            <path
              d={path}
              fill="none"
              stroke={style.stroke}
              strokeWidth={visual.strokeWidth}
              strokeDasharray={style.dash}
              strokeLinecap={style.lineCap}
              markerEnd={style.markerEnd}
              opacity={visual.opacity}
              className="pointer-events-none transition-all duration-200"
            />
            {animateReveal && visual.flowOpacity > 0 && (
              <path
                d={path}
                fill="none"
                stroke={style.flowStroke}
                strokeWidth={visual.flowWidth}
                strokeLinecap="round"
                opacity={visual.flowOpacity}
                className="pointer-events-none bo-connection-draw"
                style={{
                  ['--connection-length' as string]: segmentLength,
                  ['--connection-duration' as string]: `${Math.min(500, Math.max(320, visual.flowDurationMs * 0.3 + (inSameGroup ? -40 : 0)))}ms`,
                  ['--connection-opacity' as string]: String(visual.flowOpacity),
                  filter: visual.emphasis === 'primary' ? 'drop-shadow(0 0 4px rgba(255,255,255,0.45))' : undefined,
                }}
              />
            )}
            {onConnectionClick && (
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                className="pointer-events-auto cursor-pointer"
                onClick={() => onConnectionClick(segment.ideaIds)}
              >
                <title>{segment.rationale}</title>
              </path>
            )}
          </g>
        );
      })}
    </svg>
  );
}
