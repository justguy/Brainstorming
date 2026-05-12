import React from 'react';
import { type EdgeProps } from '@xyflow/react';
import type { ConnectionKind, ConnectionStrength } from '../../../src/types';
import { connectionKindLabel, connectionKindMeaning } from '../../../src/connections/kindMapping';
import { pathForConnection } from '../../../src/canvas/reactflow/reactflowHelpers';

/**
 * ConnectionLine — canonical SVG edge primitive for the screens-v2 6-kind
 * connection grammar (Build Spec §02 — "Connection-line visual grammar").
 *
 * Renders all six `ConnectionKind` values with distinct visual treatments,
 * using the hand-drawn design system's ink palette (matches the `--accent-*`
 * tokens declared in `apps/web/brainstorm.css`):
 *
 *   kind            color              stroke               glyph / cap
 *   ─────────────── ────────────────── ──────────────────── ─────────────
 *   builds_on       Ink   (#1a1814)    Solid 1.8px          arrow → (parent-of)
 *   shared_theme    Grey  (#8a8578)    Dotted 1.4px (1 5)   (none)
 *   contradicts     Red   (#c94a3a)    Dashed 2px (8 5)     (none)
 *   depends_on      Green (#2f8f5e)    Solid 1.8px          arrow → (depends-on)
 *   evidence_for    Green (#2f8f5e)    Dotted 1.4px (1 5)   (none)
 *   revives_killed  Green (#2f8f5e)    Long-dash 1.8px      arrow → (legacy)
 *
 * Each kind's fill / stroke / dash / marker is fully self-contained — the
 * existing `connectionLineStyle` helper in `reactflowHelpers.ts` only knows
 * the legacy four kinds. This primitive is the screens-v2 home for the new
 * `depends_on` / `evidence_for` kinds, so that downstream surfaces (canvas
 * edges, mini-map in ConnectionInspector, brief-margin previews) all draw
 * the same way.
 *
 * The primitive is intentionally **stateless** — no focus / hover / animation
 * choreography. Higher-level wrappers (the existing `ConnectionEdge` in
 * `src/canvas/reactflow/`, future connection inspector renderer) layer
 * behavior on top. This mirrors the M1 contract of the other primitives
 * (`Sticky`, `NudgeCard`, `PhaseStrip`) — small visual atoms, dumb to state.
 *
 * ReactFlow integration:
 *   - Accepts `EdgeProps<Edge>` from `@xyflow/react`, the standard signature
 *     ReactFlow passes to `edgeTypes` entries. `id`, `sourceX/Y`, `targetX/Y`
 *     come for free.
 *   - The `kind` is required and is passed as an extra prop, NOT via
 *     `data.kind`. Callers wrap the primitive when binding to a
 *     `Connection`-typed edge type. This keeps the primitive's contract
 *     independent of the canvas's `ConnectionEdgeData` shape.
 *
 * Adoption:
 *   - This primitive is NOT yet wired into `ReactFlowCanvas.tsx`. bo-133
 *     owns the canvas adoption (and the corresponding migration of
 *     `ConnectionEdge.tsx` consumers). The existing `ConnectionEdge` keeps
 *     rendering until that swap.
 */

/**
 * Visual descriptor for a single connection kind. Centralized here so the
 * spec table (Build Spec §02) maps 1:1 to source.
 */
interface ConnectionLineVisual {
  /** Stroke color — full hex; do not return css var refs (SVG safari issues). */
  stroke: string;
  /** Stroke width in user units. */
  strokeWidth: number;
  /** SVG `stroke-dasharray`. Omit for solid. */
  dash?: string;
  /** Optional `stroke-linecap`. Defaults to browser default. */
  lineCap?: 'round' | 'butt';
  /** When true, render an arrowhead marker at the path end. */
  arrowEnd: boolean;
}

const KIND_VISUAL: Record<ConnectionKind, ConnectionLineVisual> = {
  // parent-of in the spec table — the canonical "this builds on that"
  // hierarchy. Ink, solid, with an arrow toward the parent.
  // Mirrors `--accent-builds` from the design tokens.
  builds_on: {
    stroke: '#1a1814',
    strokeWidth: 1.8,
    lineCap: 'round',
    arrowEnd: true,
  },
  // shares-theme — soft ink-faint grey, dotted, no arrow (theme is
  // bidirectional / non-causal). Mirrors `--accent-theme`.
  shared_theme: {
    stroke: '#8a8578',
    strokeWidth: 1.4,
    dash: '1 5',
    lineCap: 'round',
    arrowEnd: false,
  },
  // contradicts — red dashed, no arrow (conflict is bidirectional).
  // Mirrors `--accent-contradicts`.
  contradicts: {
    stroke: '#c94a3a',
    strokeWidth: 2,
    dash: '8 5',
    lineCap: 'round',
    arrowEnd: false,
  },
  // depends-on — green solid arrow → (causal: a depends on b).
  // Mirrors `--accent-revives` (the design's only green accent).
  depends_on: {
    stroke: '#2f8f5e',
    strokeWidth: 1.8,
    lineCap: 'round',
    arrowEnd: true,
  },
  // evidence-for — green dotted, lighter weight (evidence is supportive,
  // not structural).
  evidence_for: {
    stroke: '#2f8f5e',
    strokeWidth: 1.4,
    dash: '1 5',
    lineCap: 'round',
    arrowEnd: false,
  },
  // revives_killed — legacy 6th kind, kept for back-compat with the
  // existing 4-kind canvas. Green long-dash with arrow (reads as
  // "revisit / reopen").
  revives_killed: {
    stroke: '#2f8f5e',
    strokeWidth: 1.8,
    dash: '8 5',
    lineCap: 'round',
    arrowEnd: true,
  },
};

/**
 * Per-kind arrow fill. Always matches the stroke so the marker reads as the
 * same line color. Defined once at module scope to avoid allocating a new
 * marker fill on every render.
 */
function arrowFillForKind(kind: ConnectionKind): string {
  return KIND_VISUAL[kind].stroke;
}

export interface ConnectionLineProps extends EdgeProps {
  /**
   * Spec connection kind. Drives color, dash pattern, weight, arrowhead.
   * Required — there is no implicit default; callers must surface their
   * connection's kind explicitly.
   */
  kind: ConnectionKind;
  /**
   * Optional strength. Currently only used to bump opacity slightly for
   * `weak`/`medium` — a hook for future visual differentiation. Kept on the
   * primitive so callers don't need to reach for a wrapper just to dim a
   * line.
   */
  strength?: ConnectionStrength;
  /**
   * Optional click handler. When present the primitive renders a wide
   * transparent hit-target on top of the visible path so the line is easy
   * to click. The connection's `id` (from `EdgeProps`) is forwarded.
   */
  onSelect?: (id: string) => void;
}

/**
 * Compute the path bend factor. Same heuristic as the existing
 * `ConnectionOverlay` — slight curve so parallel edges don't overlap, and
 * a tighter curve when the edge is short (manual wires from drags).
 */
function bendFactorForId(id: string): number {
  return id.startsWith('manual-') ? 0.45 : 1;
}

function strengthOpacity(strength: ConnectionStrength | undefined): number {
  if (strength === 'strong') return 1;
  if (strength === 'medium') return 0.85;
  if (strength === 'weak') return 0.65;
  // Unknown / unspecified — render full strength.
  return 1;
}

export function ConnectionLine(props: ConnectionLineProps): React.ReactElement {
  const { id, sourceX, sourceY, targetX, targetY, kind, strength, onSelect } = props;
  const visual = KIND_VISUAL[kind];
  const path = pathForConnection({ sourceX, sourceY, targetX, targetY }, bendFactorForId(id));
  const opacity = strengthOpacity(strength);
  const markerId = `connection-line-arrow-${kind}-${id}`;
  const markerEnd = visual.arrowEnd ? `url(#${markerId})` : undefined;
  const a11yTitle = `${connectionKindLabel(kind)} — ${connectionKindMeaning(kind)}`;

  return (
    <g
      className="bo-connection-line"
      data-connection-kind={kind}
      data-connection-id={id}
    >
      {visual.arrowEnd && (
        <defs>
          <marker
            id={markerId}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,7 L8,3.5 z" fill={arrowFillForKind(kind)} />
          </marker>
        </defs>
      )}

      <path
        d={path}
        fill="none"
        stroke={visual.stroke}
        strokeWidth={visual.strokeWidth}
        strokeDasharray={visual.dash}
        strokeLinecap={visual.lineCap}
        markerEnd={markerEnd}
        opacity={opacity}
        className="pointer-events-none"
      >
        <title>{a11yTitle}</title>
      </path>

      {onSelect && (
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={14}
          className="pointer-events-auto cursor-pointer"
          onClick={() => onSelect(id)}
        >
          <title>{a11yTitle}</title>
        </path>
      )}
    </g>
  );
}

export default ConnectionLine;
