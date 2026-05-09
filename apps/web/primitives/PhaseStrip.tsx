import React from 'react';
import { SUB_PHASES, type SubPhaseSpec } from '../../../src/orchestrator/subPhases';

/**
 * PhaseStrip — generalised lifecycle strip parameterised on `currentPhase`.
 *
 * Mirrors the visual treatment of `BoardBeadStrip` (`bo-lifecycle-strip`),
 * but does not derive its state from a specific Idea. Instead it reads the
 * canonical phase registry and highlights the supplied phase number.
 *
 * Phases at numbers strictly less than `currentPhase` are rendered as
 * `completed`, the matching phase is `active`, and any phases beyond it are
 * `locked` (rendered as the default empty bead). Optional decorations
 * (`needs_attention`, `soft_nudge`) may be supplied via `phaseStatusOverrides`
 * for callers that already know about review or nudge state.
 */

export type PhaseBeadStatus =
  | 'locked'
  | 'active'
  | 'completed'
  | 'needs_attention'
  | 'soft_nudge';

export interface PhaseStripProps {
  /** Numeric phase identifier as found in `SUB_PHASES` (e.g. 0, 0.5, 1, ...). */
  currentPhase: number;
  /** Optional override for individual phase numbers — e.g. attention/nudge flags. */
  phaseStatusOverrides?: Partial<Record<number, PhaseBeadStatus>>;
  /** Optional sub-phase list override (defaults to canonical `SUB_PHASES`). */
  phases?: ReadonlyArray<SubPhaseSpec>;
  /** Optional summary line shown after the bead track. */
  summary?: string;
  /** Optional status pill shown after the summary (e.g. "next clarify"). */
  status?: string;
  /** Tooltip applied to the host element. */
  title?: string;
  /** Aria-label override; auto-derived when omitted. */
  ariaLabel?: string;
  /** When supplied the strip renders as a button, otherwise as a div. */
  onActivate?: () => void;
  /** Extra class names appended to the root element. */
  className?: string;
}

const STATUS_CLASS: Record<PhaseBeadStatus, string> = {
  locked: 'bo-lifecycle-strip__bead',
  active: 'bo-lifecycle-strip__bead bo-lifecycle-strip__bead--active',
  completed: 'bo-lifecycle-strip__bead bo-lifecycle-strip__bead--done',
  needs_attention: 'bo-lifecycle-strip__bead bo-lifecycle-strip__bead--attention',
  soft_nudge: 'bo-lifecycle-strip__bead bo-lifecycle-strip__bead--nudge',
};

const PHASE_EPSILON = 1e-9;

function deriveStatus(phase: SubPhaseSpec, current: number): PhaseBeadStatus {
  if (Math.abs(phase.number - current) < PHASE_EPSILON) return 'active';
  if (phase.number < current) return 'completed';
  return 'locked';
}

export function PhaseStrip({
  currentPhase,
  phaseStatusOverrides,
  phases = SUB_PHASES,
  summary,
  status,
  title,
  ariaLabel,
  onActivate,
  className,
}: PhaseStripProps): React.ReactElement {
  const beads = phases.map(phase => {
    const override = phaseStatusOverrides?.[phase.number];
    const beadStatus: PhaseBeadStatus = override ?? deriveStatus(phase, currentPhase);
    return { phase, status: beadStatus };
  });

  const activeIndex = beads.findIndex(bead => bead.status === 'active');
  const completedCount = beads.filter(bead => bead.status === 'completed').length;
  const progressIndex = activeIndex >= 0 ? activeIndex + 1 : Math.max(0, completedCount);
  const activeBead = activeIndex >= 0 ? beads[activeIndex] : null;
  const progressLabel =
    activeBead?.phase.shortLabel ?? (completedCount >= beads.length ? 'done' : 'queued');

  const Root = onActivate ? 'button' : 'div';
  const rootProps = onActivate
    ? ({ type: 'button' as const, onClick: onActivate })
    : {};

  const computedAriaLabel =
    ariaLabel ?? `Lifecycle progress: ${progressIndex} of ${beads.length}, ${progressLabel}`;

  const rootClassName = [
    'bo-lifecycle-strip',
    onActivate ? 'bo-lifecycle-strip--interactive' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Root
      {...rootProps}
      className={rootClassName}
      title={title}
      aria-label={computedAriaLabel}
    >
      <span className="bo-lifecycle-strip__label">Lifecycle</span>
      <div className="bo-lifecycle-strip__track" aria-hidden="true">
        {beads.map(({ phase, status: beadStatus }) => (
          <span
            key={phase.id}
            className={STATUS_CLASS[beadStatus]}
            title={`${phase.shortLabel}: ${phase.label}`}
          />
        ))}
      </div>
      <span className="bo-lifecycle-strip__summary">
        {progressIndex} / {beads.length} · {summary ?? progressLabel}
      </span>
      {status && <span className="bo-lifecycle-strip__status">{status}</span>}
    </Root>
  );
}
