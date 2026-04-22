import type { CSSProperties } from 'react';
import type { Connection, ScoutSuggestion } from '../../types';

export type ConnectionEdgeStrengthLabel = 'Strong' | 'Medium' | 'Weak';

export interface ConnectionEdgeRenderState {
  activeIdeaId?: string | null;
  activePathIdeaIds?: string[];
  animatedConnectionIds?: string[];
  suppressAnimations?: boolean;
}

export interface ConnectionEdgeGeometry {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

export interface SuggestionNodeRenderState {
  animated?: boolean;
  busy?: 'admit' | 'elaborate' | 'dismiss' | null;
  overflowCount?: number;
  expandedList?: boolean;
}

export function hashSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function suggestionRotationDeg(id: string): number {
  return ((hashSeed(id) % 12) - 6) / 3;
}

export function truncateText(value: string, maxChars: number): string {
  const clean = value.trim().replace(/\s+/g, ' ');
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function suggestionSummaryLine(suggestion: ScoutSuggestion): string | null {
  const rationale = suggestion.rationale.trim();
  if (!rationale) return null;
  return truncateText(rationale, 82);
}

export function suggestionNodeTitle(suggestion: ScoutSuggestion): string {
  return truncateText(suggestion.rawText, 80);
}

export function connectionStrengthLabel(strength: Connection['strength']): ConnectionEdgeStrengthLabel {
  if (strength === 'strong') return 'Strong';
  if (strength === 'medium') return 'Medium';
  return 'Weak';
}

export function connectionKindLabel(kind: Connection['kind']): string {
  switch (kind) {
    case 'builds_on':
      return 'Builds on';
    case 'contradicts':
      return 'Contradicts';
    case 'revives_killed':
      return 'Revives killed';
    case 'shared_theme':
      return 'Shared theme';
    default:
      return kind;
  }
}

export function connectionKindMeaning(kind: Connection['kind']): string {
  switch (kind) {
    case 'builds_on':
      return 'extends';
    case 'contradicts':
      return 'conflicts';
    case 'revives_killed':
      return 'revisits';
    case 'shared_theme':
      return 'aligns';
    default:
      return 'relates';
  }
}

export function connectionSourceLabel(connection: Connection): string {
  return connection.id.startsWith('manual-') ? 'Manual' : 'Facilitated';
}

export function connectionLineStyle(kind: Connection['kind']): {
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

export function pathForConnection(
  geometry: ConnectionEdgeGeometry,
  compactness = 1,
): string {
  const dx = geometry.targetX - geometry.sourceX;
  const dy = geometry.targetY - geometry.sourceY;
  const distance = Math.hypot(dx, dy);
  const bend = Math.min(42, Math.max(10, distance * 0.12 * compactness));
  const normalX = distance === 0 ? 0 : -dy / distance;
  const normalY = distance === 0 ? 0 : dx / distance;
  const controlX = (geometry.sourceX + geometry.targetX) / 2 + normalX * bend;
  const controlY = (geometry.sourceY + geometry.targetY) / 2 + normalY * bend;
  return `M ${geometry.sourceX} ${geometry.sourceY} Q ${controlX} ${controlY} ${geometry.targetX} ${geometry.targetY}`;
}

export function connectionLabelCopy(connection: Connection): {
  title: string;
  subtitle: string;
  rationale: string;
  meta: string;
} {
  const kindText = connectionKindLabel(connection.kind);
  const strengthText = connectionStrengthLabel(connection.strength);
  const supportingDocCount = connection.supportingDocIds?.length ?? 0;
  const evidenceText = supportingDocCount > 0
    ? `${supportingDocCount} supporting ${supportingDocCount === 1 ? 'doc' : 'docs'}`
    : 'no supporting docs';

  return {
    title: `${kindText} · ${strengthText} confidence`,
    subtitle: `${connectionKindMeaning(connection.kind)} · ${evidenceText}`,
    rationale: truncateText(connection.rationale, 92),
    meta: connectionSourceLabel(connection),
  };
}

export function suggestionNodeStyle(animated?: boolean): CSSProperties | undefined {
  if (!animated) return undefined;
  return {
    ['--suggestion-duration' as string]: '240ms',
  };
}
