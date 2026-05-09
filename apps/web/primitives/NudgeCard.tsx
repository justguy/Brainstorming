import React from 'react';

/**
 * NudgeCard — canonical small surface for an actionable nudge with the
 * `[accept] [preview] [dismiss]` triple. Intended as the shared building
 * block for inline nudges (companion rail, Robot's Notes, Synthesizer
 * cluster proposals, etc.).
 *
 * Patterned on the action group inside `RobotNotesSummary`, but extracted
 * so it can be reused on its own. The migration of existing call sites is
 * tracked separately (bo-144).
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

const ROOT_CLASS =
  'bo-card-surface w-full rounded-2xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700';

const ACCEPT_CLASS =
  'rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700 transition hover:border-emerald-300 hover:text-emerald-800';

const PREVIEW_CLASS =
  'rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700 transition hover:border-sky-300 hover:text-sky-800';

const DISMISS_CLASS =
  'rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:border-slate-300 hover:text-slate-700';

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
  const rootClassName = [ROOT_CLASS, className ?? ''].filter(Boolean).join(' ');

  return (
    <article
      className={rootClassName}
      aria-label={ariaLabel ?? title}
      role="group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {eyebrow}
            </p>
          )}
          <p className="mt-1 font-semibold text-slate-900">{title}</p>
          {body !== undefined && body !== null && (
            <p className="mt-1 text-[11px] text-slate-600">{body}</p>
          )}
          {children && <div className="mt-1 text-[11px] text-slate-600">{children}</div>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          {onAccept && (
            <button
              type="button"
              onClick={onAccept}
              className={ACCEPT_CLASS}
            >
              {acceptLabel}
            </button>
          )}
          {onPreview && (
            <button
              type="button"
              onClick={onPreview}
              className={PREVIEW_CLASS}
            >
              {previewLabel}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className={DISMISS_CLASS}
            >
              {dismissLabel}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
