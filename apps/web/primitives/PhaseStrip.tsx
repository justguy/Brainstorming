import React from 'react';
import { SUB_PHASES, type SubPhaseSpec } from '../../../src/orchestrator/subPhases';

/**
 * PhaseStrip — generalised lifecycle strip parameterised on `currentPhase`.
 *
 * Mirrors the visual treatment of the design's hand-drawn progress beads —
 * a row of small ink-bordered dots, each with a tiny Kalam label, on a
 * paper-coloured strip. The active bead inverts to ink-on-paper; completed
 * beads fill ink; locked beads are paper-with-ink-border; attention/nudge
 * beads pick up the design's accent reds/greens.
 *
 * Phases at numbers strictly less than `currentPhase` are rendered as
 * `completed`, the matching phase is `active`, and any phases beyond it are
 * `locked`. Optional decorations (`needs_attention`, `soft_nudge`) may be
 * supplied via `phaseStatusOverrides` for callers that already know about
 * review or nudge state.
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

interface BeadVisual {
  background: string;
  border: string;
  ink: string;
}

const BEAD_VISUAL: Record<PhaseBeadStatus, BeadVisual> = {
  locked: {
    background: 'var(--paper)',
    border: 'var(--ink-faint)',
    ink: 'var(--ink-faint)',
  },
  active: {
    background: 'var(--paper)',
    border: 'var(--ink)',
    ink: 'var(--ink)',
  },
  completed: {
    background: 'var(--ink)',
    border: 'var(--ink)',
    ink: 'var(--paper)',
  },
  needs_attention: {
    background: 'var(--sticky-pink)',
    border: 'var(--accent-contradicts)',
    ink: 'var(--accent-contradicts)',
  },
  soft_nudge: {
    background: 'var(--sticky-yellow)',
    border: 'var(--ink)',
    ink: 'var(--ink)',
  },
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
  const rootProps = onActivate ? ({ type: 'button' as const, onClick: onActivate }) : {};

  const computedAriaLabel =
    ariaLabel ?? `Lifecycle progress: ${progressIndex} of ${beads.length}, ${progressLabel}`;

  const rootClassName = ['phase-strip', onActivate ? 'is-interactive' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <Root
      {...rootProps}
      className={rootClassName}
      title={title}
      aria-label={computedAriaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 12px',
        background: 'var(--paper)',
        border: '1.5px solid var(--ink)',
        borderRadius: 999,
        boxShadow: '1.5px 1.5px 0 var(--ink)',
        fontFamily: 'var(--f-hand-body)',
        fontSize: 13,
        lineHeight: 1.2,
        color: 'var(--ink)',
        cursor: onActivate ? 'pointer' : 'default',
        appearance: 'none',
        WebkitAppearance: 'none',
        textAlign: 'left',
        font: onActivate ? undefined : undefined,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--f-mono)',
          fontSize: 9.5,
          color: 'var(--ink-faint)',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
        }}
      >
        Lifecycle
      </span>
      <div
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {beads.map(({ phase, status: beadStatus }) => {
          const visual = BEAD_VISUAL[beadStatus];
          return (
            <span
              key={phase.id}
              title={`${phase.shortLabel}: ${phase.label}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: visual.background,
                border: `1.5px solid ${visual.border}`,
                color: visual.ink,
                fontFamily: 'var(--f-hand)',
                fontSize: 12,
                fontWeight: 700,
                lineHeight: 1,
                boxShadow:
                  beadStatus === 'active' ? '1.5px 1.5px 0 var(--ink)' : undefined,
              }}
            >
              {phase.shortLabel.slice(0, 2)}
            </span>
          );
        })}
      </div>
      <span style={{ color: 'var(--ink-soft)' }}>
        {progressIndex} / {beads.length} · {summary ?? progressLabel}
      </span>
      {status && (
        <span
          style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 9.5,
            color: 'var(--ink)',
            border: '1.5px solid var(--ink)',
            padding: '2px 6px',
            borderRadius: 3,
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            background: 'var(--paper)',
          }}
        >
          {status}
        </span>
      )}
    </Root>
  );
}
