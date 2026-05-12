import React from 'react';

/**
 * NudgeCard — canonical small surface for an actionable nudge with the
 * `[accept] [preview] [dismiss]` triple. Intended as the shared building
 * block for inline nudges (companion rail, Robot's Notes, Synthesizer
 * cluster proposals, etc.).
 *
 * Visual style follows the `.persona-say` speech-bubble pattern from
 * `Design/brainstorm.css` — paper background, 2px ink border, hard offset
 * shadow, hand body font. Actions are `.btn.sm` sketchy buttons.
 */

export interface NudgeCardProps {
  /** Eyebrow / category label, e.g. the originating role or intent. */
  eyebrow?: string;
  /** Main heading line. */
  title: string;
  /** Optional supporting body. Falls back to children when omitted. */
  body?: React.ReactNode;
  /** Optional rich children rendered below the body line. */
  children?: React.ReactNode;
  /** Label for the primary "accept" affordance. Defaults to "Accept". */
  acceptLabel?: string;
  /** Handler for the primary "accept" action. */
  onAccept?: () => void;
  /** Label for the optional preview affordance. Defaults to "Preview". */
  previewLabel?: string;
  /** Handler for the optional preview action. Hidden when omitted. */
  onPreview?: () => void;
  /** Label for the dismiss affordance. Defaults to "Dismiss". */
  dismissLabel?: string;
  /** Handler for the dismiss action. */
  onDismiss?: () => void;
  /** Aria-label override for the host element. */
  ariaLabel?: string;
  /** Additional class names appended to the root container. */
  className?: string;
}

export function NudgeCard({
  eyebrow,
  title,
  body,
  children,
  acceptLabel = 'Accept',
  onAccept,
  previewLabel = 'Preview',
  onPreview,
  dismissLabel = 'Dismiss',
  onDismiss,
  ariaLabel,
  className,
}: NudgeCardProps): React.ReactElement {
  const rootClassName = ['nudge-card', className ?? ''].filter(Boolean).join(' ');

  return (
    <article
      className={rootClassName}
      aria-label={ariaLabel ?? title}
      role="group"
      style={{
        position: 'relative',
        width: '100%',
        background: 'var(--paper)',
        border: '2px solid var(--ink)',
        borderRadius: 12,
        padding: '10px 12px',
        boxShadow: '3px 3px 0 var(--ink)',
        fontFamily: 'var(--f-hand-body)',
        fontSize: 14,
        lineHeight: 1.3,
        color: 'var(--ink)',
      }}
    >
      {eyebrow && (
        <div
          style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 10,
            color: 'var(--ink-faint)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            marginBottom: 4,
          }}
        >
          {eyebrow}
        </div>
      )}
      <div
        style={{
          fontFamily: 'var(--f-hand)',
          fontSize: 18,
          fontWeight: 700,
          lineHeight: 1.15,
          color: 'var(--ink)',
        }}
      >
        {title}
      </div>
      {body !== undefined && body !== null && (
        <div style={{ marginTop: 4, color: 'var(--ink-soft)' }}>{body}</div>
      )}
      {children && <div style={{ marginTop: 4, color: 'var(--ink-soft)' }}>{children}</div>}
      {(onAccept || onPreview || onDismiss) && (
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          {onAccept && (
            <button type="button" onClick={onAccept} className="btn sm primary">
              {acceptLabel}
            </button>
          )}
          {onPreview && (
            <button type="button" onClick={onPreview} className="btn sm">
              {previewLabel}
            </button>
          )}
          {onDismiss && (
            <button type="button" onClick={onDismiss} className="btn sm ghost">
              {dismissLabel}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
