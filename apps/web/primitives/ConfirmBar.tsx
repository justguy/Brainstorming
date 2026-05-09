import React from 'react';

/**
 * ConfirmBar — minimal primitive for confirm/cancel decisions.
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

const ROOT_CLASS =
  'bo-card-surface flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl px-3 py-2 text-xs leading-5';

const MESSAGE_CLASS = 'min-w-0 flex-1 text-slate-700';

const CONFIRM_DEFAULT =
  'rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 transition hover:border-emerald-300 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50';

const CONFIRM_DANGER =
  'rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700 transition hover:border-rose-400 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-50';

const CANCEL_CLASS =
  'rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50';

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
  const rootClassName = [ROOT_CLASS, className ?? ''].filter(Boolean).join(' ');
  const confirmClassName = tone === 'danger' ? CONFIRM_DANGER : CONFIRM_DEFAULT;

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? 'Confirm action'}
      className={rootClassName}
    >
      <div className={MESSAGE_CLASS}>{message}</div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className={CANCEL_CLASS}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={confirmClassName}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
