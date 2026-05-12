import React, { useCallback, useId, useMemo } from 'react';
import type { BriefVersion } from '../../../src/types';

/**
 * bo-155 — Brief version picker.
 *
 * Read-only dropdown listing every snapshot of a brief (timestamp + author),
 * ordered newest-first. Selecting a version flips BriefScreen into "viewing
 * historical version" mode; the live brief is always the latest by `seq`.
 *
 * Design constraints:
 *   - The "current" version is the latest by `seq`. Surfacing an explicit
 *     "Latest" sentinel keeps that invariant visible to the user — picking
 *     anything else is read-only inspection of the past.
 *   - Editing a historical version is **out of scope** for this iteration.
 *     Spec note (IMPLEMENTATION_PLAN §5 Screen 04): "Editing an old version
 *     forks a new one." That fork action lives elsewhere; this component only
 *     owns version selection.
 *   - Pure presentational + state-controlled. The hosting screen owns the
 *     `selectedVersionId` state and append-version action.
 */

export interface BriefVersionPickerProps {
  /** All versions of the brief, in storage order (oldest first by seq). */
  versions: readonly BriefVersion[];
  /**
   * Currently selected version id, or `null` to mean "latest" (the canonical
   * live view). Anything outside the `versions` list is treated as latest.
   */
  selectedVersionId: string | null;
  /**
   * Fired when the user picks a version. `null` = back to latest.
   * The id is `BriefVersion.id`, not the seq.
   */
  onSelect: (versionId: string | null) => void;
  /** Optional override for testing / Storybook. Defaults to `Intl.DateTimeFormat`. */
  formatTimestamp?: (createdAt: number) => string;
  /** Optional className passthrough so callers can size / position the control. */
  className?: string;
}

const ROOT_CLASS = 'bo-brief-version-picker inline-flex items-center gap-2';
const LABEL_CLASS = 'text-xs font-medium uppercase tracking-wide text-slate-500';
const SELECT_CLASS =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60';

const LATEST_SENTINEL = '__latest__';

function defaultFormatTimestamp(createdAt: number): string {
  // Stable, locale-aware short timestamp. Tests can override.
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return 'unknown time';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function authorLabel(version: BriefVersion): string {
  if (version.authoredBy && version.authoredBy.trim().length > 0) {
    return version.authoredBy;
  }
  return 'unknown';
}

export function BriefVersionPicker({
  versions,
  selectedVersionId,
  onSelect,
  formatTimestamp = defaultFormatTimestamp,
  className,
}: BriefVersionPickerProps): React.ReactElement | null {
  const labelId = useId();

  // Newest-first display order. We keep the input list as-is (storage order)
  // and copy here so we don't mutate caller state.
  const ordered = useMemo<BriefVersion[]>(
    () => [...versions].sort((a, b) => b.seq - a.seq),
    [versions],
  );

  const latestId = ordered.length > 0 ? ordered[0].id : null;

  // Validate the selected id — treat unknown / out-of-range as latest so the
  // picker stays in a sane state if the brief shrinks (it shouldn't, but the
  // type signature allows it).
  const effectiveSelected: string | null = useMemo(() => {
    if (selectedVersionId === null) return null;
    return ordered.some(v => v.id === selectedVersionId) ? selectedVersionId : null;
  }, [ordered, selectedVersionId]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      if (value === LATEST_SENTINEL) {
        onSelect(null);
        return;
      }
      onSelect(value);
    },
    [onSelect],
  );

  // Empty state: render nothing rather than an inert dropdown.
  if (ordered.length === 0) return null;

  const selectValue = effectiveSelected ?? LATEST_SENTINEL;

  return (
    <div className={`${ROOT_CLASS}${className ? ` ${className}` : ''}`}>
      <label className={LABEL_CLASS} htmlFor={labelId}>
        Version
      </label>
      <select
        id={labelId}
        className={SELECT_CLASS}
        value={selectValue}
        onChange={handleChange}
        aria-label="Brief version"
        data-bo-brief-version-picker
      >
        <option value={LATEST_SENTINEL} data-bo-version-latest>
          Latest{latestId
            ? ` — v${ordered[0].seq} · ${formatTimestamp(ordered[0].createdAt)} · ${authorLabel(ordered[0])}`
            : ''}
        </option>
        {ordered.length > 1 && <option disabled>──────────</option>}
        {ordered.map(v => (
          <option key={v.id} value={v.id} data-bo-version-id={v.id} data-bo-version-seq={v.seq}>
            v{v.seq} · {formatTimestamp(v.createdAt)} · {authorLabel(v)}
            {v.note ? ` — ${v.note}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

export default BriefVersionPicker;
