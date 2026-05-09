import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { Persona } from '../../../src/types';

/**
 * bo-154 — AddMarginNoteForm
 *
 * Inline composer for a new persona-attributed margin note. Pure
 * presentational + state-controlled: the host (BriefScreen) owns the IDB
 * write through `useBriefSync().addMarginNote`. This component only
 * collects text + attribution and reports a submission via `onSubmit`.
 *
 * Author selection:
 *   - "User" is always available (the default; matches storage's default
 *     `authoredBy: 'user'` semantics — `authorPersonaId` left undefined).
 *   - Each loaded persona is selectable. The form forwards the persona id
 *     and the persona name as `authorLabel` so the list can render the
 *     denormalised label even if the persona is later deleted.
 *
 * Anchor section is supplied by the host (the form is used in two modes:
 *   - global (no preselected section)
 *   - section-scoped (host preselects section via `defaultSection`)
 * ). The select is disabled when `lockSection` is true.
 *
 * Reset behaviour:
 *   - On successful submit (parent's onSubmit promise resolves), the text
 *     field clears. The persona selection is sticky so a user mid-review
 *     keeps their attribution.
 */

export interface MarginNoteAuthorChoice {
  /** Persona.id, or null/undefined for "user" attribution. */
  authorPersonaId: string | null;
  /** Display label for denormalisation. "User" or persona.name. */
  authorLabel: string;
}

export interface AddMarginNoteFormSubmitInput {
  text: string;
  author: MarginNoteAuthorChoice;
  /** Section anchor (string id) or undefined for unanchored. */
  anchorSection?: string;
}

export interface AddMarginNoteFormProps {
  /** Personas available as authors. Empty array => only "User" is offered. */
  personas: readonly Persona[];
  /** Sections available as anchors. Each section is `{ id, label }`. */
  sections: readonly { id: string; label: string }[];
  /**
   * Called when the user clicks "Add". The host performs the IDB write and
   * may return a promise so the form can disable the button while it
   * resolves. Throwing surfaces an inline error.
   */
  onSubmit: (input: AddMarginNoteFormSubmitInput) => Promise<void> | void;
  /**
   * Initial author selection (sticky across submits). Defaults to "user"
   * (authorPersonaId === null).
   */
  defaultAuthorPersonaId?: string | null;
  /** Pre-fills the section selector. Use with `lockSection` for inline mode. */
  defaultSection?: string;
  /** When true, hides / disables the section selector. */
  lockSection?: boolean;
  /** Optional className passthrough. */
  className?: string;
  /** Compact mode tightens padding for inline section composers. */
  compact?: boolean;
}

const ROOT_CLASS =
  'bo-add-margin-note-form flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm';
const ROOT_COMPACT_CLASS =
  'bo-add-margin-note-form flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm';
const TEXTAREA_CLASS =
  'min-h-[60px] w-full resize-y rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 shadow-inner focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200';
const ROW_CLASS = 'flex flex-wrap items-center justify-between gap-2';
const SELECT_CLASS =
  'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60';
const LABEL_CLASS = 'text-[11px] font-medium uppercase tracking-wide text-slate-500';
const FIELD_CLASS = 'inline-flex items-center gap-1.5';
const SUBMIT_CLASS =
  'inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';
const ERROR_CLASS =
  'rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700';

const USER_AUTHOR_VALUE = '__user__';

export function AddMarginNoteForm({
  personas,
  sections,
  onSubmit,
  defaultAuthorPersonaId = null,
  defaultSection,
  lockSection = false,
  className,
  compact = false,
}: AddMarginNoteFormProps): React.ReactElement {
  const textId = useId();
  const authorId = useId();
  const sectionId = useId();

  const [text, setText] = useState<string>('');
  const [author, setAuthor] = useState<string>(
    defaultAuthorPersonaId ?? USER_AUTHOR_VALUE,
  );
  const [section, setSection] = useState<string>(defaultSection ?? '');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Sync the section back to the default when the host changes its preselect
  // (e.g. user clicks a different section indicator).
  useEffect(() => {
    if (defaultSection !== undefined) {
      setSection(defaultSection);
    }
  }, [defaultSection]);

  const personaOptions = useMemo(() => personas.filter(p => p.active !== false), [personas]);

  const resolveAuthor = useCallback((): MarginNoteAuthorChoice => {
    if (author === USER_AUTHOR_VALUE) {
      return { authorPersonaId: null, authorLabel: 'User' };
    }
    const match = personaOptions.find(p => p.id === author);
    if (match) {
      return { authorPersonaId: match.id, authorLabel: match.name };
    }
    return { authorPersonaId: null, authorLabel: 'User' };
  }, [author, personaOptions]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = text.trim();
      if (trimmed.length === 0) {
        setError('Note text is required.');
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        const anchorSection = section.trim().length > 0 ? section : undefined;
        await onSubmit({
          text: trimmed,
          author: resolveAuthor(),
          anchorSection,
        });
        setText('');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add note';
        setError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [text, section, onSubmit, resolveAuthor],
  );

  const rootClassName = [
    compact ? ROOT_COMPACT_CLASS : ROOT_CLASS,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <form
      className={rootClassName}
      onSubmit={handleSubmit}
      data-bo-add-margin-note-form
    >
      <label htmlFor={textId} className={LABEL_CLASS}>
        New margin note
      </label>
      <textarea
        id={textId}
        className={TEXTAREA_CLASS}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Leave a margin note for this brief…"
        aria-label="Margin note text"
        disabled={submitting}
        data-bo-margin-note-text
      />
      {error && (
        <div role="alert" className={ERROR_CLASS}>
          {error}
        </div>
      )}
      <div className={ROW_CLASS}>
        <div className="flex flex-wrap items-center gap-3">
          <div className={FIELD_CLASS}>
            <label htmlFor={authorId} className={LABEL_CLASS}>
              From
            </label>
            <select
              id={authorId}
              className={SELECT_CLASS}
              value={author}
              onChange={e => setAuthor(e.target.value)}
              disabled={submitting}
              aria-label="Margin note author"
              data-bo-margin-note-author
            >
              <option value={USER_AUTHOR_VALUE}>User</option>
              {personaOptions.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {!lockSection && sections.length > 0 && (
            <div className={FIELD_CLASS}>
              <label htmlFor={sectionId} className={LABEL_CLASS}>
                Section
              </label>
              <select
                id={sectionId}
                className={SELECT_CLASS}
                value={section}
                onChange={e => setSection(e.target.value)}
                disabled={submitting}
                aria-label="Margin note anchor section"
                data-bo-margin-note-section
              >
                <option value="">Whole brief</option>
                {sections.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <button
          type="submit"
          className={SUBMIT_CLASS}
          disabled={submitting || text.trim().length === 0}
          data-bo-margin-note-submit
        >
          {submitting ? 'Adding…' : 'Add note'}
        </button>
      </div>
    </form>
  );
}

export default AddMarginNoteForm;
