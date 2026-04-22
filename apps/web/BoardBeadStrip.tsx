import React from 'react';
import { deriveIdeaBeadState, type DerivedBeadStatus } from '../../src/orchestrator/beadState';
import type { Idea } from '../../src/types';

interface BoardBeadStripProps {
  idea: Idea | null;
  onOpenInspector?: () => void;
}

const STATUS_CLASS: Record<DerivedBeadStatus, string> = {
  locked: 'bo-lifecycle-strip__bead',
  active: 'bo-lifecycle-strip__bead bo-lifecycle-strip__bead--active',
  completed: 'bo-lifecycle-strip__bead bo-lifecycle-strip__bead--done',
  needs_attention: 'bo-lifecycle-strip__bead bo-lifecycle-strip__bead--attention',
  soft_nudge: 'bo-lifecycle-strip__bead bo-lifecycle-strip__bead--nudge',
};

export function BoardBeadStrip({
  idea,
  onOpenInspector,
}: BoardBeadStripProps): React.ReactElement {
  if (!idea) {
    return <></>;
  }

  const beadState = deriveIdeaBeadState(idea);
  const activeIndex = beadState.beads.findIndex(bead => bead.status === 'active');
  const completedCount = beadState.beads.filter(bead => bead.status === 'completed').length;
  const progressIndex = activeIndex >= 0 ? activeIndex + 1 : Math.max(0, completedCount);
  const activeBead = activeIndex >= 0 ? beadState.beads[activeIndex] : null;
  const progressLabel = activeBead?.shortLabel ?? (completedCount >= beadState.beads.length ? 'done' : 'queued');
  const statusLabel = beadState.reviewFlags.length > 0
    ? `${beadState.reviewFlags.length} review`
    : beadState.suggestedNext
      ? `next ${beadState.suggestedNext.phase}`
      : null;
  const Root = onOpenInspector ? 'button' : 'div';

  return (
    <Root
      {...(onOpenInspector ? { type: 'button', onClick: onOpenInspector } : {})}
      className={`bo-lifecycle-strip ${onOpenInspector ? 'bo-lifecycle-strip--interactive' : ''}`}
      title={beadState.summary}
      aria-label={`Lifecycle progress: ${progressIndex} of ${beadState.beads.length}, ${progressLabel}`}
    >
      <span className="bo-lifecycle-strip__label">Lifecycle</span>
      <div className="bo-lifecycle-strip__track" aria-hidden="true">
        {beadState.beads.map(bead => (
          <span
            key={bead.id}
            className={STATUS_CLASS[bead.status]}
            title={`${bead.shortLabel}: ${bead.summary}`}
          />
        ))}
      </div>
      <span className="bo-lifecycle-strip__summary">
        {progressIndex} / {beadState.beads.length} · {progressLabel}
      </span>
      {statusLabel && <span className="bo-lifecycle-strip__status">{statusLabel}</span>}
    </Root>
  );
}
