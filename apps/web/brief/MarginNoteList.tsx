import React, { useCallback, useMemo, useRef } from 'react';
import type { MarginNote, Persona, PersonaKind } from '../../../src/types';
import { PersonaChip, type PersonaChipFields } from '../primitives/PersonaChip';

/**
 * bo-154 — MarginNoteList
 *
 * Sidebar / right-rail list of persona-attributed margin notes anchored
 * to a brief. Pure presentational + state-controlled: the host owns
 * resolve/dismiss IDB writes through `useBriefSync().resolveMarginNote`.
 *
 * Design constraints (per IMPLEMENTATION_PLAN §5 Screen 04 + the
 * MarginNote model):
 *   - Notes carry an `authorPersonaId` (Persona) and a denormalised
 *     `authorLabel` for display when the persona record isn't loaded
 *     (or has been deleted). We prefer the live `Persona` lookup for
 *     stable kind-themed avatars; fall back to a synthetic chip from
 *     the denormalised label when nothing matches.
 *   - Notes can anchor to a brief section (`anchorSection`); the host
 *     supplies the section catalogue so we can render a "scroll to" /
 *     "open" affordance via `onAnchorClick`.
 *   - Open notes show a "Resolve" button; resolved/dismissed notes are
 *     visually muted with a tone-mapped status pill. Selecting "Dismiss"
 *     uses the same handler with status='dismissed'.
 *   - The component scrolls a referenced note into view when
 *     `focusedNoteId` is set by the parent (e.g. clicking a section
 *     gutter indicator surfaces the right rail entry).
 */

export interface MarginNoteListProps {
  notes: readonly MarginNote[];
  /** Personas keyed by id for avatar resolution. Optional. */
  personas?: readonly Persona[];
  /** Sections, supplied so anchored notes can show a section label. */
  sections?: readonly { id: string; label: string }[];
  /** Called when the user clicks "Resolve" / "Dismiss" on an open note. */
  onResolve: (noteId: string, status: 'resolved' | 'dismissed') => Promise<void> | void;
  /** Called when the user clicks the anchor breadcrumb on a note. */
  onAnchorClick?: (anchorSection: string) => void;
  /** When set, the matching note is scrolled into view + visually highlighted. */
  focusedNoteId?: string | null;
  /** Optional className passthrough. */
  className?: string;
  /** Header slot; defaults to "Margin notes" + a count. */
  header?: React.ReactNode;
  /** Footer slot — typically the AddMarginNoteForm. */
  footer?: React.ReactNode;
  /**
   * Filter mode. Defaults to 'open-first' (open notes on top, resolved
   * collapsed under a divider). 'all' shows every note as authored;
   * 'open' hides resolved/dismissed entirely.
   */
  filter?: 'open-first' | 'all' | 'open';
}

const ROOT_CLASS =
  'bo-margin-note-list flex h-full min-h-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm';
const HEADER_CLASS = 'flex items-baseline justify-between gap-2 px-1';
const HEADER_TITLE_CLASS = 'text-sm font-semibold text-slate-900';
const HEADER_COUNT_CLASS = 'text-xs text-slate-500';
const LIST_CLASS = 'flex flex-1 flex-col gap-2 overflow-y-auto pr-1';
const EMPTY_CLASS = 'rounded-md border border-dashed border-slate-200 bg-slate-50/60 px-3 py-6 text-center text-xs text-slate-500';
const ITEM_CLASS =
  'flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition';
const ITEM_RESOLVED_CLASS =
  'flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500 shadow-sm transition';
const ITEM_FOCUSED_CLASS = 'ring-2 ring-emerald-300';
const TOP_ROW_CLASS = 'flex items-center justify-between gap-2';
const TEXT_CLASS = 'whitespace-pre-wrap text-sm leading-relaxed text-slate-800';
const TEXT_RESOLVED_CLASS = 'whitespace-pre-wrap text-sm leading-relaxed text-slate-500 line-through decoration-slate-300';
const ANCHOR_CLASS =
  'inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-800';
const ANCHOR_INERT_CLASS =
  'inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600';
const ACTIONS_ROW_CLASS = 'flex items-center justify-between gap-2 pt-1';
const ACTION_BUTTON_CLASS =
  'inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
const STATUS_PILL_CLASS =
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset';
const TIMESTAMP_CLASS = 'text-[11px] text-slate-400';
const DIVIDER_CLASS = 'flex items-center gap-2 px-1 text-[11px] uppercase tracking-wide text-slate-400';

const STATUS_PILL_TONE: Record<MarginNote['status'], string> = {
  open: 'bg-amber-100 text-amber-800 ring-amber-200',
  resolved: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  dismissed: 'bg-zinc-200 text-zinc-700 ring-zinc-300',
};

const STATUS_LABEL: Record<MarginNote['status'], string> = {
  open: 'Open',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function deriveAuthorChip(
  note: MarginNote,
  personas?: readonly Persona[],
): PersonaChipFields {
  if (note.authorPersonaId && personas) {
    const match = personas.find(p => p.id === note.authorPersonaId);
    if (match) {
      return { id: match.id, name: match.name, kind: match.kind, active: match.active };
    }
  }
  // No persona record (or anonymous user note). Synthesise a chip.
  const fallbackName = note.authorLabel ?? (note.authorPersonaId ? 'Persona' : 'User');
  const fallbackKind: PersonaKind = note.authorPersonaId ? 'custom' : 'custom';
  return {
    id: note.authorPersonaId ?? `user:${note.id}`,
    name: fallbackName,
    kind: fallbackKind,
    active: true,
  };
}

interface SectionMap {
  byId: Record<string, string>;
}

function buildSectionMap(sections?: readonly { id: string; label: string }[]): SectionMap {
  const byId: Record<string, string> = {};
  if (sections) {
    for (const s of sections) byId[s.id] = s.label;
  }
  return { byId };
}

export function MarginNoteList({
  notes,
  personas,
  sections,
  onResolve,
  onAnchorClick,
  focusedNoteId,
  className,
  header,
  footer,
  filter = 'open-first',
}: MarginNoteListProps): React.ReactElement {
  const sectionMap = useMemo(() => buildSectionMap(sections), [sections]);

  // Stable references for scroll-into-view on focused-id changes.
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const focusedRef = useRef<string | null>(null);

  // When the focused id flips, scroll the matching item into view.
  if (focusedNoteId && focusedNoteId !== focusedRef.current) {
    focusedRef.current = focusedNoteId;
    // Defer one tick so the ref map is populated for newly-rendered items.
    queueMicrotask(() => {
      const el = itemRefs.current.get(focusedNoteId);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  const { openNotes, closedNotes } = useMemo(() => {
    const open: MarginNote[] = [];
    const closed: MarginNote[] = [];
    // Newest-first within each bucket.
    const sorted = [...notes].sort((a, b) => b.createdAt - a.createdAt);
    for (const n of sorted) {
      if (n.status === 'open') open.push(n);
      else closed.push(n);
    }
    return { openNotes: open, closedNotes: closed };
  }, [notes]);

  const handleResolveFactory = useCallback(
    (noteId: string, status: 'resolved' | 'dismissed') => () => {
      void onResolve(noteId, status);
    },
    [onResolve],
  );

  const handleAnchorFactory = useCallback(
    (anchor: string) => onAnchorClick ? () => onAnchorClick(anchor) : undefined,
    [onAnchorClick],
  );

  const renderNote = (note: MarginNote): React.ReactElement => {
    const isOpen = note.status === 'open';
    const authorChip = deriveAuthorChip(note, personas);
    const isFocused = focusedNoteId === note.id;
    const itemClass = [
      isOpen ? ITEM_CLASS : ITEM_RESOLVED_CLASS,
      isFocused ? ITEM_FOCUSED_CLASS : '',
    ]
      .filter(Boolean)
      .join(' ');
    const sectionLabel =
      note.anchorSection && sectionMap.byId[note.anchorSection]
        ? sectionMap.byId[note.anchorSection]
        : note.anchorSection;
    const anchorClickable = onAnchorClick && note.anchorSection;
    return (
      <li
        key={note.id}
        ref={el => {
          if (el) itemRefs.current.set(note.id, el);
          else itemRefs.current.delete(note.id);
        }}
        className={itemClass}
        data-bo-margin-note-id={note.id}
        data-bo-margin-note-status={note.status}
        data-bo-margin-note-anchor={note.anchorSection ?? ''}
      >
        <div className={TOP_ROW_CLASS}>
          <PersonaChip persona={authorChip} className="text-[11px]" />
          <span className={TIMESTAMP_CLASS} title={new Date(note.createdAt).toISOString()}>
            {formatTimestamp(note.createdAt)}
          </span>
        </div>
        <p className={isOpen ? TEXT_CLASS : TEXT_RESOLVED_CLASS}>{note.text}</p>
        <div className={ACTIONS_ROW_CLASS}>
          <div className="flex items-center gap-1.5">
            {sectionLabel ? (
              anchorClickable ? (
                <button
                  type="button"
                  className={ANCHOR_CLASS}
                  onClick={handleAnchorFactory(note.anchorSection ?? '')}
                  aria-label={`Jump to section: ${sectionLabel}`}
                  data-bo-margin-note-anchor-button
                >
                  <span aria-hidden="true">¶</span>
                  {sectionLabel}
                </button>
              ) : (
                <span className={ANCHOR_INERT_CLASS}>
                  <span aria-hidden="true">¶</span>
                  {sectionLabel}
                </span>
              )
            ) : (
              <span className={`${STATUS_PILL_CLASS} ${STATUS_PILL_TONE[note.status]}`}>
                {STATUS_LABEL[note.status]}
              </span>
            )}
          </div>
          {isOpen ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className={ACTION_BUTTON_CLASS}
                onClick={handleResolveFactory(note.id, 'dismissed')}
                aria-label="Dismiss margin note"
                data-bo-margin-note-dismiss
              >
                Dismiss
              </button>
              <button
                type="button"
                className={ACTION_BUTTON_CLASS}
                onClick={handleResolveFactory(note.id, 'resolved')}
                aria-label="Resolve margin note"
                data-bo-margin-note-resolve
              >
                Resolve
              </button>
            </div>
          ) : (
            <span className={`${STATUS_PILL_CLASS} ${STATUS_PILL_TONE[note.status]}`}>
              {STATUS_LABEL[note.status]}
            </span>
          )}
        </div>
      </li>
    );
  };

  const showOpen = filter === 'open' || filter === 'open-first';
  const showClosed = filter === 'all' || filter === 'open-first';
  const visibleOpen = showOpen ? openNotes : [];
  const visibleClosed = showClosed ? closedNotes : [];
  const totalVisible = visibleOpen.length + visibleClosed.length;

  return (
    <aside
      className={[ROOT_CLASS, className ?? ''].filter(Boolean).join(' ')}
      aria-label="Brief margin notes"
      data-bo-margin-note-list
    >
      <div className={HEADER_CLASS}>
        {header ?? (
          <>
            <span className={HEADER_TITLE_CLASS}>Margin notes</span>
            <span className={HEADER_COUNT_CLASS}>
              {openNotes.length} open · {closedNotes.length} closed
            </span>
          </>
        )}
      </div>
      {totalVisible === 0 ? (
        <div className={EMPTY_CLASS}>
          No margin notes yet. Drop a thought below — your team and personas can chime in.
        </div>
      ) : (
        <ul className={LIST_CLASS}>
          {visibleOpen.map(renderNote)}
          {visibleOpen.length > 0 && visibleClosed.length > 0 && (
            <li className={DIVIDER_CLASS} aria-hidden="true">
              <span className="h-px flex-1 bg-slate-200" />
              Resolved
              <span className="h-px flex-1 bg-slate-200" />
            </li>
          )}
          {visibleClosed.map(renderNote)}
        </ul>
      )}
      {footer && <div className="px-1 pt-1">{footer}</div>}
    </aside>
  );
}

export default MarginNoteList;
