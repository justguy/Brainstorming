import React from 'react';

/**
 * ConfirmBar — minimal primitive for confirm/cancel decisions.
 *
 * Renders the design system's bottom-bar treatment: a paper-coloured strip
 * with a 2px ink border and the message on the left, a sketchy `.btn` pair
 * (`.btn.primary` for confirm, `.btn.ghost` for cancel) on the right. The
 * `danger` tone tints the confirm button toward `--accent-contradicts`.
 *
 * Per the M1 brief this is the visual primitive only. Wiring this through
 * phase-advance flows is a separate follow-up; do not import this from
 * call sites that mutate phase state until that task lands.
 */

export interface ConfirmBarProps {
  /** Message rendered to the user, describing what will happen on confirm. */
  message: React.ReactNode;
  /** Label for the confirm affordance. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Handler invoked when the user accepts the proposed action. */
  onConfirm: () => void;
  /** Label for the cancel affordance. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Handler invoked when the user backs out. */
  onCancel: () => void;
  /** Variant tweaks the visual emphasis. Defaults to `default`. */
  tone?: 'default' | 'danger';
  /** Disables both buttons (useful while a request is in flight). */
  busy?: boolean;
  /** Aria-label override for the host element. */
  ariaLabel?: string;
  /** Additional class names appended to the root container. */
  className?: string;
}

export function ConfirmBar({
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  cancelLabel = 'Cancel',
  onCancel,
  tone = 'default',
  busy = false,
  ariaLabel,
  className,
}: ConfirmBarProps): React.ReactElement {
  const rootClassName = ['confirm-bar', `confirm-bar--${tone}`, className ?? '']
    .filter(Boolean)
    .join(' ');

  const confirmClassName = ['btn', 'sm', tone === 'danger' ? '' : 'primary']
    .filter(Boolean)
    .join(' ');

  // For the danger tone, paint the primary button red instead of ink. We
  // express this with inline overrides on top of the regular `.btn.sm`
  // surface so it picks up hover/active animations from `brainstorm.css`.
  const dangerStyle: React.CSSProperties | undefined =
    tone === 'danger'
      ? {
          background: 'var(--accent-contradicts)',
          color: 'var(--paper)',
          borderColor: 'var(--accent-contradicts)',
          boxShadow: '1.5px 1.5px 0 var(--ink)',
        }
      : undefined;

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? 'Confirm action'}
      className={rootClassName}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 14px',
        background: 'var(--paper)',
        border: '2px solid var(--ink)',
        borderRadius: 12,
        boxShadow: '2px 2px 0 var(--ink)',
        fontFamily: 'var(--f-hand-body)',
        fontSize: 14,
        lineHeight: 1.3,
        color: 'var(--ink)',
      }}
    >
      <div style={{ minWidth: 0, flex: 1, color: 'var(--ink)' }}>{message}</div>
      <div style={{ display: 'flex', flexShrink: 0, gap: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="btn sm ghost"
          style={busy ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={confirmClassName}
          style={{
            ...(dangerStyle ?? {}),
            ...(busy ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
