import React from 'react';
import type { Connection } from '../../types';
import {
  connectionLabelCopy,
  connectionLineStyle,
  pathForConnection,
  type ConnectionEdgeGeometry,
  type ConnectionEdgeRenderState,
} from './reactflowHelpers';

export interface ConnectionEdgeData extends ConnectionEdgeRenderState, Record<string, unknown> {
  connection: Connection;
  // The optional third argument carries the click's viewport coordinates so
  // the canvas host can anchor a popover near the user's pointer (Screen 05
  // — connection inspector). Older callers that only need the connection /
  // idea ids can ignore it.
  onSelect?: (
    connectionId: string,
    ideaIds: string[],
    clientPosition?: { x: number; y: number },
  ) => void;
  labelX?: number;
  labelY?: number;
}

export interface ConnectionEdgeProps extends ConnectionEdgeGeometry {
  id: string;
  data: ConnectionEdgeData;
  selected?: boolean;
  animated?: boolean;
  markerEnd?: string;
  className?: string;
  style?: React.CSSProperties;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function getEdgeVisual(
  connection: Connection,
  state: ConnectionEdgeRenderState,
  selected: boolean,
): {
  emphasis: 'primary' | 'secondary' | 'muted';
  strokeWidth: number;
  opacity: number;
  flowWidth: number;
  flowOpacity: number;
  flowDurationMs: number;
} {
  const activeIdeaId = state.activeIdeaId ?? null;
  const activePathIdeaIds = new Set(state.activePathIdeaIds ?? []);
  const touchesActive = Boolean(activeIdeaId && connection.ideaIds.includes(activeIdeaId));
  const isOnActivePath = connection.ideaIds.every(ideaId => activePathIdeaIds.has(ideaId));
  const hasFocusedPath = activePathIdeaIds.size > 0;

  if (touchesActive || selected) {
    return {
      emphasis: 'primary',
      strokeWidth: connection.strength === 'strong' ? 4.4 : 3.1,
      opacity: 0.98,
      flowWidth: connection.strength === 'strong' ? 5.6 : 4.1,
      flowOpacity: 0.86,
      flowDurationMs: connection.strength === 'strong' ? 1200 : 1450,
    };
  }

  if (isOnActivePath) {
    return {
      emphasis: 'secondary',
      strokeWidth: connection.strength === 'strong' ? 3.4 : 2.35,
      opacity: 0.72,
      flowWidth: connection.strength === 'strong' ? 4.4 : 3.2,
      flowOpacity: 0.34,
      flowDurationMs: connection.strength === 'strong' ? 1500 : 1800,
    };
  }

  if (hasFocusedPath) {
    return {
      emphasis: 'muted',
      strokeWidth: connection.strength === 'strong' ? 2 : 1.3,
      opacity: 0.15,
      flowWidth: 2.4,
      flowOpacity: 0,
      flowDurationMs: 0,
    };
  }

  return {
    emphasis: connection.strength === 'strong' ? 'primary' : 'secondary',
    strokeWidth: connection.strength === 'strong' ? 3.6 : 2.3,
    opacity: connection.strength === 'strong' ? 0.88 : 0.58,
    flowWidth: connection.strength === 'strong' ? 4.6 : 3.1,
    flowOpacity: connection.strength === 'strong' ? 0.48 : 0.22,
    flowDurationMs: connection.strength === 'strong' ? 1500 : 1900,
  };
}

export function ConnectionEdge({
  id,
  data,
  sourceX,
  sourceY,
  targetX,
  targetY,
  selected = false,
  animated = false,
  markerEnd,
  className,
  style,
}: ConnectionEdgeProps): React.ReactElement {
  const connection = data.connection;
  const edgeStyle = connectionLineStyle(connection.kind);
  const visual = getEdgeVisual(connection, data, selected);
  const path = pathForConnection({ sourceX, sourceY, targetX, targetY }, connection.id.startsWith('manual-') ? 0.45 : 1);
  const segmentLength = Math.max(1, Math.hypot(targetX - sourceX, targetY - sourceY));
  const title = connectionLabelCopy(connection);
  const labelX = data.labelX ?? (sourceX + targetX) / 2;
  const labelY = data.labelY ?? (sourceY + targetY) / 2;
  const labelWidth = 228;
  const labelHeight = 50;
  const x = clamp(labelX - labelWidth / 2, 4, Number.MAX_SAFE_INTEGER);
  const y = clamp(labelY - labelHeight / 2, 4, Number.MAX_SAFE_INTEGER);
  const reveal = animated && !data.suppressAnimations;
  const isPrimary = visual.emphasis === 'primary';
  const markerId = `${id}-arrow`;

  return (
    <g className={className} style={style}>
      <defs>
        <marker
          id={`${id}-arrow`}
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

      <path
        d={path}
        fill="none"
        stroke={edgeStyle.stroke}
        strokeWidth={visual.strokeWidth}
        strokeDasharray={edgeStyle.dash}
        strokeLinecap={edgeStyle.lineCap}
        markerEnd={markerEnd ?? (edgeStyle.markerEnd ? `url(#${markerId})` : undefined)}
        opacity={visual.opacity}
        className="pointer-events-none transition-all duration-200"
      />

      {reveal && visual.flowOpacity > 0 && (
        <path
          d={path}
          fill="none"
          stroke={edgeStyle.flowStroke}
          strokeWidth={visual.flowWidth}
          strokeLinecap="round"
          opacity={visual.flowOpacity}
          className="pointer-events-none bo-connection-draw"
          style={{
            ['--connection-length' as string]: segmentLength,
            ['--connection-duration' as string]: `${Math.min(500, Math.max(320, visual.flowDurationMs * 0.3))}ms`,
            ['--connection-opacity' as string]: String(visual.flowOpacity),
            filter: visual.emphasis === 'primary' ? 'drop-shadow(0 0 4px rgba(255,255,255,0.45))' : undefined,
          }}
        />
      )}

      {visual.emphasis !== 'muted' && (
        <g opacity={isPrimary ? 0.98 : 0.8}>
          <rect
            x={x}
            y={y}
            width={labelWidth}
            height={labelHeight}
            rx={10}
            fill="#ffffff"
            fillOpacity={0.96}
            stroke={edgeStyle.stroke}
            strokeWidth={isPrimary ? 1.2 : 1}
          />
          <text
            x={x + 8}
            y={y + 12}
            fill="#0f172a"
            fontSize={10}
            fontFamily="IBM Plex Mono, monospace"
            letterSpacing="0.01em"
          >
            <tspan x={x + 8} fontWeight={700}>
              {title.title}
            </tspan>
            <tspan x={x + 8} y={y + 24}>
              {title.subtitle}
            </tspan>
            <tspan x={x + 8} y={y + 35}>
              {title.meta} · {title.rationale}
            </tspan>
          </text>
        </g>
      )}

      {data.onSelect && (
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={14}
          className="pointer-events-auto cursor-pointer"
          onClick={event => {
            // Forward the viewport-relative click point so the host can
            // anchor a popover (Screen 05 — connection inspector) right
            // beside the user's pointer rather than at the edge midpoint.
            data.onSelect?.(connection.id, connection.ideaIds, {
              x: event.clientX,
              y: event.clientY,
            });
          }}
        >
          <title>{`${title.title}; ${title.meta}; ${title.rationale}`}</title>
        </path>
      )}
    </g>
  );
}
