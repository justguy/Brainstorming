import React from 'react';
import type { AutonomyLevel, Persona, PersonaKind } from '../../../src/types';

/**
 * PersonaChip — small chip representing a persona (Scout, Synthesizer,
 * Devil's Advocate, Historian, or a user-defined custom persona).
 *
 * Accepts either a full `Persona` record or the minimal subset listed in
 * `PersonaChipFields` so call sites that only have a denormalised author
 * resolution (e.g. log-event projection rows, brief margin notes) can
 * render the same primitive without round-tripping through IDB.
 *
 * Visual style mirrors the other M1 primitives: a 2xl rounded surface
 * with an avatar slot (kind-themed initials by default), a name label,
 * and optional autonomy / status decoration. Kebab-style "more" actions
 * are surfaced via `onMore`; primary activation goes through `onClick`.
 */

export type PersonaChipKind = PersonaKind;

export interface PersonaChipFields {
  id: string;
  name: string;
  kind: PersonaChipKind;
  /**
   * Whether the persona is actively contributing. When omitted the chip
   * defaults to active styling (no muted treatment).
   */
  active?: boolean;
}

export interface PersonaChipProps {
  /** Full `Persona` record or the minimal `{id, name, kind, active?}` subset. */
  persona: Persona | PersonaChipFields;
  /** Primary click handler. Receives the persona id for routing convenience. */
  onClick?: (personaId: string) => void;
  /** Marks the chip as the currently selected persona. */
  selected?: boolean;
  /**
   * Renders an autonomy indicator dot — colour mapped to `AutonomyLevel`.
   * The dot is purely decorative; tooltips read "Autonomy: <level>".
   */
  withAutonomyDot?: boolean;
  /** Autonomy value used by the dot. Ignored when `withAutonomyDot` is false. */
  autonomyLevel?: AutonomyLevel;
  /**
   * Optional override for the avatar slot. When omitted, kind-themed
   * initials are rendered.
   */
  avatar?: React.ReactNode;
  /**
   * Optional handler for a kebab/more affordance. When provided, a small
   * trailing button is rendered next to the name. The button stops
   * propagation so the chip's primary `onClick` doesn't fire.
   */
  onMore?: (personaId: string) => void;
  /** Aria-label for the kebab button. Defaults to "Persona actions". */
  moreAriaLabel?: string;
  /** Additional class names appended to the root container. */
  className?: string;
  /** Aria-label override for the host element. */
  ariaLabel?: string;
  /** Optional tooltip applied to the host element. */
  title?: string;
}

const ROOT_CLASS =
  'bo-card-surface inline-flex max-w-full items-center gap-2 rounded-2xl px-2.5 py-1.5 text-xs leading-5 text-slate-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300';

const ROOT_INTERACTIVE =
  'cursor-pointer hover:-translate-y-[1px] hover:shadow-md';

const ROOT_SELECTED = 'ring-2 ring-emerald-300';

const ROOT_INACTIVE = 'opacity-60';

const NAME_CLASS = 'min-w-0 truncate font-semibold text-slate-900';

const MORE_BUTTON_CLASS =
  'shrink-0 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold leading-none text-slate-500 transition hover:border-slate-300 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300';

const KIND_AVATAR_CLASS: Record<PersonaChipKind, string> = {
  scout:
    'bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-200',
  synthesizer:
    'bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  devil:
    'bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200',
  historian:
    'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200',
  custom:
    'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
};

const AUTONOMY_DOT_CLASS: Record<AutonomyLevel, string> = {
  silent: 'bg-slate-300',
  whispers: 'bg-sky-400',
  active: 'bg-emerald-400',
  'takes-pen': 'bg-amber-500',
};

const KIND_LABEL: Record<PersonaChipKind, string> = {
  scout: 'Scout',
  synthesizer: 'Synthesizer',
  devil: "Devil's Advocate",
  historian: 'Historian',
  custom: 'Custom persona',
};

function deriveInitials(name: string, kind: PersonaChipKind): string {
  const cleaned = name.trim();
  if (!cleaned) {
    // Stable single-letter fallback per kind so empty names still render
    // a recognisable avatar.
    return kind.slice(0, 1).toUpperCase();
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PersonaChip({
  persona,
  onClick,
  selected = false,
  withAutonomyDot = false,
  autonomyLevel,
  avatar,
  onMore,
  moreAriaLabel = 'Persona actions',
  className,
  ariaLabel,
  title,
}: PersonaChipProps): React.ReactElement {
  const { id, name, kind } = persona;
  const isActive = persona.active !== false;

  const handleClick = onClick ? () => onClick(id) : undefined;

  const Root = handleClick ? 'button' : 'div';
  const rootProps = handleClick
    ? ({ type: 'button' as const, onClick: handleClick })
    : {};

  const rootClassName = [
    ROOT_CLASS,
    handleClick ? ROOT_INTERACTIVE : '',
    selected ? ROOT_SELECTED : '',
    !isActive ? ROOT_INACTIVE : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const kindLabel = KIND_LABEL[kind] ?? KIND_LABEL.custom;
  const computedAriaLabel =
    ariaLabel ??
    `${kindLabel}: ${name}${selected ? ', selected' : ''}${isActive ? '' : ', inactive'}`;

  const avatarNode =
    avatar ?? (
      <span
        aria-hidden="true"
        className={[
          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase tracking-[0.08em]',
          KIND_AVATAR_CLASS[kind] ?? KIND_AVATAR_CLASS.custom,
        ].join(' ')}
      >
        {deriveInitials(name, kind)}
      </span>
    );

  const handleMoreClick = onMore
    ? (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onMore(id);
      }
    : undefined;

  return (
    <Root
      {...rootProps}
      className={rootClassName}
      aria-label={computedAriaLabel}
      aria-pressed={handleClick ? selected : undefined}
      title={title}
    >
      {avatarNode}
      <span className={NAME_CLASS}>{name}</span>
      {withAutonomyDot && autonomyLevel && (
        <span
          aria-hidden="true"
          title={`Autonomy: ${autonomyLevel}`}
          className={[
            'inline-block h-2 w-2 shrink-0 rounded-full',
            AUTONOMY_DOT_CLASS[autonomyLevel],
          ].join(' ')}
        />
      )}
      {handleMoreClick && (
        <button
          type="button"
          onClick={handleMoreClick}
          aria-label={moreAriaLabel}
          className={MORE_BUTTON_CLASS}
        >
          {/* unicode kebab; aria-hidden text fallback covered by aria-label */}
          <span aria-hidden="true">{'⋮'}</span>
        </button>
      )}
    </Root>
  );
}
