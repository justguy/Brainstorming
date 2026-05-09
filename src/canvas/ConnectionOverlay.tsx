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

type ConnectionStrengthLabel = 'Strong' | 'Medium' | 'Weak';

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

// Visual grammar per Build Spec §"Connection-line visual grammar". Mirrors
// reactflowHelpers.connectionLineStyle so both renderer paths agree on tokens.
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
    case 'depends_on':
      return {
        stroke: '#15803d',
        flowStroke: '#86efac',
        markerEnd: 'url(#connection-overlay-arrow)',
      };
    case 'evidence_for':
      return {
        stroke: '#15803d',
        flowStroke: '#86efac',
        dash: '2 6',
        lineCap: 'round',
      };
    case 'builds_on':
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

function connectionStrengthLabel(strength: Connection['strength']): ConnectionStrengthLabel {
  if (strength === 'strong') return 'Strong';
  if (strength === 'medium') return 'Medium';
  return 'Weak';
}

function connectionKindLabel(kind: Connection['kind']): string {
  switch (kind) {
    case 'builds_on':
      return 'Builds on';
    case 'contradicts':
      return 'Contradicts';
    case 'revives_killed':
      return 'Revives killed';
    case 'shared_theme':
      return 'Shared theme';
    case 'depends_on':
      return 'Depends on';
    case 'evidence_for':
      return 'Evidence for';
  }
}

function connectionKindMeaning(kind: Connection['kind']): string {
  switch (kind) {
    case 'builds_on':
      return 'extends';
    case 'contradicts':
      return 'conflicts';
    case 'revives_killed':
      return 'revisits';
    case 'shared_theme':
      return 'aligns';
    case 'depends_on':
      return 'requires';
    case 'evidence_for':
      return 'supports';
  }
}

function truncateForBoard(text: string, maxChars: number): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
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
  const connectionById = new Map(connections.map(connection => [connection.id, connection] as const));
  const boardWidth = bounds.width || 0;
  const boardHeight = bounds.height || 0;

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
        const segmentLength = Math.max(
          1,
          Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) * (inSameGroup ? 0.92 : 1.08),
        );
        const animateReveal = animatedConnectionIdSet.has(segment.connectionId) && !suppressAnimations;

        const metadata = connectionById.get(segment.connectionId);
        const rationaleSource = metadata?.rationale ?? segment.rationale;
        const supportingDocCount = metadata?.supportingDocIds?.length ?? 0;
        const kindText = connectionKindLabel(segment.kind);
        const meaningText = connectionKindMeaning(segment.kind);
        const evidenceText = supportingDocCount > 0
          ? `${supportingDocCount} supporting ${supportingDocCount === 1 ? 'doc' : 'docs'}`
          : 'no supporting docs';

        const labelWidth = 216;
        const labelHeight = 44;
        const labelX = (segment.x1 + segment.x2) / 2;
        const labelY = (segment.y1 + segment.y2) / 2;
        const x = boardWidth > 0 ? clamp(labelX - labelWidth / 2, 4, Math.max(4, boardWidth - labelWidth - 4)) : labelX - labelWidth / 2;
        const y = boardHeight > 0 ? clamp(labelY - labelHeight / 2, 4, Math.max(4, boardHeight - labelHeight - 4)) : labelY - labelHeight / 2;

        const strengthText = connectionStrengthLabel(segment.strength);
        const isPrimary = visual.emphasis === 'primary';
        const textY1 = y + 12;
        const textY2 = y + 24;
        const textY3 = y + 35;
        const title = `${kindText}; ${strengthText} confidence; ${evidenceText}; ${meaningText}`;
        const rationale = truncateForBoard(rationaleSource, 92);

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
                stroke={style.stroke}
                strokeWidth={isPrimary ? 1.2 : 1}
              />
              <text
                x={x + 8}
                y={textY1}
                fill="#0f172a"
                fontSize={10}
                fontFamily="Inter, system-ui, sans-serif"
                letterSpacing="0.01em"
              >
                <tspan x={x + 8} fontWeight={700}>
                  {kindText} · {strengthText} confidence
                </tspan>
                <tspan x={x + 8} y={textY2}>
                  {meaningText} {connectionKindLabel(segment.kind).toLowerCase()} • {evidenceText}
                </tspan>
                <tspan x={x + 8} y={textY3}>
                  {rationale}
                </tspan>
              </text>
              </g>
            )}
            {onConnectionClick && (
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                className="pointer-events-auto cursor-pointer"
                onClick={() => onConnectionClick(segment.ideaIds)}
              >
                <title>{title}</title>
              </path>
            )}
          </g>
        );
      })}
    </svg>
  );
}
