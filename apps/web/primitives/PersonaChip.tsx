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
 * Visual style follows the hand-drawn design system from
 * `Design/src/persona.jsx` and `brainstorm.css`: paper-coloured pill with a
 * 2px ink border, hard offset shadow, hand body font, optional kind-themed
 * avatar dot.
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
   * Optional override for the avatar slot. When omitted, a kind-themed
   * sticky-coloured dot with initials is rendered.
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

/**
 * Per-kind avatar background colour. Maps each persona kind to one of the
 * sticky paper colours from the design tokens so the chip reads as part of
 * the same palette as the canvas stickies.
 */
const KIND_AVATAR_BG: Record<PersonaChipKind, string> = {
  scout: 'var(--sticky-blue)',
  synthesizer: 'var(--sticky-green)',
  devil: 'var(--sticky-pink)',
  historian: 'var(--sticky-peach)',
  custom: 'var(--sticky-lilac)',
};

const AUTONOMY_DOT_COLOR: Record<AutonomyLevel, string> = {
  silent: 'var(--ink-faint)',
  whispers: 'var(--accent-theme)',
  active: 'var(--accent-revives)',
  'takes-pen': 'var(--accent-contradicts)',
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

  const rootClassName = ['persona-chip', selected ? 'is-selected' : '', !isActive ? 'is-inactive' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  const kindLabel = KIND_LABEL[kind] ?? KIND_LABEL.custom;
  const computedAriaLabel =
    ariaLabel ??
    `${kindLabel}: ${name}${selected ? ', selected' : ''}${isActive ? '' : ', inactive'}`;

  const avatarBg = KIND_AVATAR_BG[kind] ?? KIND_AVATAR_BG.custom;

  const avatarNode =
    avatar ?? (
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          width: 22,
          height: 22,
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
          background: avatarBg,
          border: '1.5px solid var(--ink)',
          borderRadius: '50%',
          fontFamily: 'var(--f-mono)',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--ink)',
          lineHeight: 1,
        }}
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
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        maxWidth: '100%',
        padding: '4px 12px 4px 6px',
        background: 'var(--paper)',
        border: '1.5px solid var(--ink)',
        borderRadius: 999,
        boxShadow: selected ? '2px 2px 0 var(--ink)' : '1.5px 1.5px 0 var(--ink)',
        fontFamily: 'var(--f-hand-body)',
        fontSize: 13,
        lineHeight: 1.2,
        color: 'var(--ink)',
        cursor: handleClick ? 'pointer' : 'default',
        opacity: isActive ? 1 : 0.55,
        font: handleClick ? undefined : undefined,
        textAlign: 'left',
        appearance: 'none',
        WebkitAppearance: 'none',
      }}
    >
      {avatarNode}
      <span
        style={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: 600,
        }}
      >
        {name}
      </span>
      {withAutonomyDot && autonomyLevel && (
        <span
          aria-hidden="true"
          title={`Autonomy: ${autonomyLevel}`}
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            flexShrink: 0,
            borderRadius: '50%',
            background: AUTONOMY_DOT_COLOR[autonomyLevel],
            border: '1px solid var(--ink)',
          }}
        />
      )}
      {handleMoreClick && (
        <button
          type="button"
          onClick={handleMoreClick}
          aria-label={moreAriaLabel}
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            padding: 0,
            background: 'var(--paper)',
            border: '1.5px solid var(--ink)',
            borderRadius: '50%',
            fontFamily: 'var(--f-mono)',
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--ink-soft)',
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          <span aria-hidden="true">{'⋮'}</span>
        </button>
      )}
    </Root>
  );
}
