import type { ConnectionKind, LegacyConnectionKind } from '../types';

/**
 * kindMapping — adapter between the new screens-v2 6-kind connection grammar
 * and the legacy 4-kind canvas model.
 *
 * The original canvas (ConnectionOverlay, reactflowHelpers, ConnectionsPanel)
 * was built around four kinds: builds_on, contradicts, revives_killed,
 * shared_theme. The screens-v2 plan (Design/IMPLEMENTATION_PLAN.md M1) adds
 * two new spec kinds — `depends_on` and `evidence_for` — for a total of six.
 *
 * Until the canvas is fully migrated (bo-113 introduces the dedicated
 * <ConnectionLine> primitive that renders all six kinds natively), the new
 * kinds need to project onto a legacy bucket so existing renderers keep
 * working. The projection is intentionally lossy:
 *
 *   - depends_on   → builds_on   (a depends on b ≈ b extends/is required by a)
 *   - evidence_for → builds_on   (citation supports a claim ≈ extends it)
 *
 * The 4 original kinds map to themselves. Strict typing is enforced via an
 * exhaustive switch — adding a 7th kind without updating this adapter will
 * fail typecheck, which is the point.
 *
 * Consumers that need the *new* grammar verbatim should keep using
 * `ConnectionKind` and not call `toLegacyKind`. Consumers stuck on the legacy
 * 4-kind enum should funnel through this adapter rather than narrow with a
 * cast.
 */

/**
 * Project any ConnectionKind onto the legacy 4-kind subset that the existing
 * canvas / overlay renderers understand.
 */
export function toLegacyKind(kind: ConnectionKind): LegacyConnectionKind {
  switch (kind) {
    case 'builds_on':
    case 'contradicts':
    case 'revives_killed':
    case 'shared_theme':
      return kind;
    case 'depends_on':
      // "a depends on b" reads as "b is a foundation a builds on".
      return 'builds_on';
    case 'evidence_for':
      // Evidence supports / extends a claim — closest legacy bucket is
      // builds_on. Once <ConnectionLine> renders evidence_for natively this
      // mapping becomes display-only.
      return 'builds_on';
  }
}

/**
 * Return true when `kind` belongs to the legacy 4-kind subset (i.e. existed
 * before the screens-v2 6-kind extension).
 */
export function isLegacyKind(kind: ConnectionKind): kind is LegacyConnectionKind {
  return (
    kind === 'builds_on' ||
    kind === 'contradicts' ||
    kind === 'revives_killed' ||
    kind === 'shared_theme'
  );
}

/**
 * Spec kinds — the five connection kinds defined by Build Spec / screens-v2.
 * `revives_killed` is intentionally excluded: it predates the spec and is
 * carried as a 6th legacy kind.
 */
export type SpecConnectionKind = Exclude<ConnectionKind, 'revives_killed'>;

const SPEC_KINDS: ReadonlyArray<SpecConnectionKind> = [
  'builds_on',
  'contradicts',
  'shared_theme',
  'depends_on',
  'evidence_for',
];

/**
 * Return true when `kind` is one of the five spec kinds (everything except
 * the legacy `revives_killed`).
 */
export function isSpecKind(kind: ConnectionKind): kind is SpecConnectionKind {
  return SPEC_KINDS.includes(kind as SpecConnectionKind);
}

/**
 * Human-readable short label for any ConnectionKind. Existing copy for the
 * legacy 4 kinds is preserved verbatim; the two new kinds get plain-English
 * defaults that downstream UIs (ConnectionsPanel, ConnectionInspector) are
 * free to override.
 */
export function connectionKindLabel(kind: ConnectionKind): string {
  switch (kind) {
    case 'builds_on':
      return 'Builds on';
    case 'contradicts':
      return 'Contradicts';
    case 'revives_killed':
      return 'Revives killed';
    case 'shared_theme':
      return 'Shared theme';
    case 'depends_on':
      return 'Depends on';
    case 'evidence_for':
      return 'Evidence for';
  }
}

/**
 * Verb describing what the connection asserts about its endpoints. Used by
 * the canvas tooltip subtitle ("extends", "conflicts", …).
 */
export function connectionKindMeaning(kind: ConnectionKind): string {
  switch (kind) {
    case 'builds_on':
      return 'extends';
    case 'contradicts':
      return 'conflicts';
    case 'revives_killed':
      return 'revisits';
    case 'shared_theme':
      return 'aligns';
    case 'depends_on':
      return 'requires';
    case 'evidence_for':
      return 'supports';
  }
}
