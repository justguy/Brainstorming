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
  onConnectionClick?: (ideaIds: string[]) => void;
}

function lineStyle(kind: Connection['kind']): {
  stroke: string;
  dash?: string;
  markerEnd?: string;
  lineCap?: 'round' | 'butt';
} {
  switch (kind) {
    case 'contradicts':
      return { stroke: '#dc2626', dash: '10 8' };
    case 'shared_theme':
      return { stroke: '#6b7280', dash: '2 8', lineCap: 'round' };
    case 'revives_killed':
      return { stroke: '#16a34a', markerEnd: 'url(#connection-overlay-arrow)' };
    case 'builds_on':
    default:
      return { stroke: '#0f766e' };
  }
}

function pathForSegment(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy);
  const bend = Math.min(42, Math.max(14, distance * 0.12));
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
  onConnectionClick,
}: ConnectionOverlayProps): React.ReactElement | null {
  const segments = buildConnectionSegments(ideas, connections, liveDrag);
  if (segments.length === 0) return null;

  const bounds = getOverlayBounds(ideas, liveDrag);

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
        const path = pathForSegment(segment.x1, segment.y1, segment.x2, segment.y2);
        const style = lineStyle(segment.kind);
        return (
          <g key={segment.id}>
            <path
              d={path}
              fill="none"
              stroke={style.stroke}
              strokeWidth={segment.strength === 'strong' ? 3 : 2.25}
              strokeDasharray={style.dash}
              strokeLinecap={style.lineCap}
              markerEnd={style.markerEnd}
              opacity={segment.strength === 'strong' ? 0.95 : 0.72}
              className="pointer-events-none transition-all duration-300"
            />
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
