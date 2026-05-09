import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRoute } from '../routing/useRoute';
import { useBriefSync } from '../useBriefSync';
import { usePromoteToPrinciple } from '../usePromoteToPrinciple';
import Markdown from '../../../src/workspace/markdown';
import BriefVersionPicker from '../brief/BriefVersionPicker';
import MarginNoteList from '../brief/MarginNoteList';
import AddMarginNoteForm from '../brief/AddMarginNoteForm';
import { listPersonas } from '../../../src/storage/personas';
import type { Brief, BriefShipStatus, BriefVersion, Persona } from '../../../src/types';

/**
 * Screen 04 · The Brief.
 *
 * Spec: Design/IMPLEMENTATION_PLAN.md §5 (Screen 04 · The Brief), §6 M4.
 *
 * v0 scope (bo-152):
 *   - Read the active route via `useRoute` and require `route.kind === 'brief'`.
 *     The brief route is `#/b/:boardId/brief/:ideaId` (see `parseRoute`), so
 *     we resolve the brief by `ideaId` through `useBriefSync({ ideaId })`. The
 *     hook also accepts `{ briefId }` for the handoff flow; this screen sticks
 *     to the route-supplied ideaId since that's the deep-linkable key.
 *   - Render the latest brief version's `artifactMd` via the existing
 *     `Markdown` primitive (`src/workspace/markdown.tsx`, marked + DOMPurify).
 *     When `artifactMd` is missing we fall back to a derived projection of
 *     the embedded `BriefState` so the screen is never empty for a brief that
 *     has at least one snapshot.
 *   - Surface the brief's `shipStatus` as a pill and a placeholder
 *     "Ship to ..." button. The button is intentionally inert in v0 — the
 *     interrogator + channel integrations are M5 work (Screen 07).
 *
 * bo-155 additions:
 *   - ⌘S / Ctrl+S keyboard handler snapshots the currently displayed version
 *     (its `briefState` + `artifactMd`) into a new BriefVersion via
 *     `appendVersion`. Auto-versioning is intentionally avoided per spec
 *     (IMPLEMENTATION_PLAN §5 — "snapshot on ⌘S only, auto-versioning would
 *     explode the store"). A transient "Saved" indicator confirms the write.
 *   - `BriefVersionPicker` in the toolbar lets the user inspect prior
 *     snapshots read-only. The "current" version is always the latest by
 *     `seq`; selecting an older version flips the article into a viewing
 *     state but doesn't change which version is canonical. Editing a past
 *     version is out of scope (spec calls for a fork action — separate task).
 *
 * Out of scope (deferred to follow-ups):
 *   - Margin notes column / inline annotations  → bo-154
 *     (`brief/MarginNoteList.tsx`, `brief/BriefSection.tsx` annotations).
 *   - Real ship handoff (interrogator + adapters) → bo-130 + Screen 07/M5.
 *   - Fork-from-version action (editing the past).
 *   - App.tsx route dispatch (rendering this screen on `route.kind === 'brief'`)
 *     is left to bo-130 (BoardScreen refactor of App.tsx). This module is a
 *     self-contained named + default export so the dispatcher can choose
 *     either convention.
 */

export interface BriefScreenProps {
  /**
   * Optional escape hatch for tests / Storybook — bypass the route hook and
   * supply the input directly. Mirrors the convention in `MapScreen`.
   */
  ideaIdOverride?: string;
  /** Optional escape hatch for tests — bypass IDB entirely. */
  briefOverride?: Brief | null;
  /** Optional override for the placeholder ship handler (tests / future wiring). */
  onShipClick?: (brief: Brief) => void;
  /**
   * Optional override for the snapshot author label (tests / future "logged-in
   * user" wiring). Defaults to `'user'` to match storage's `authoredBy` shape.
   */
  authoredBy?: string;
  /**
   * Optional override for the persona roster used by the margin-note composer
   * (tests / Storybook). When omitted, personas are loaded from IDB on mount.
   */
  personasOverride?: readonly Persona[];
  /**
   * Optional override for the "current persona" — when set, the margin-note
   * composer defaults attribution to this persona id. Defaults to user.
   */
  currentPersonaId?: string | null;
}

const ROOT_CLASS =
  'bo-brief-screen relative flex min-h-screen flex-col gap-6 bg-slate-50 px-8 py-10 text-slate-900';
const HEADER_CLASS = 'flex flex-wrap items-start justify-between gap-4';
const HEADER_TEXT_CLASS = 'flex flex-col gap-1';
const TITLE_CLASS = 'text-2xl font-semibold tracking-tight';
const SUBTITLE_CLASS = 'text-sm text-slate-500';
const ARTICLE_CLASS =
  'rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-sm';
const EMPTY_CLASS =
  'rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center text-sm text-slate-500';
const LOADING_CLASS = 'text-sm text-slate-500';
const ERROR_CLASS =
  'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700';
const STATUS_PILL_BASE_CLASS =
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium';
const SHIP_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
const SAVE_INDICATOR_CLASS =
  'inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200';
const SAVE_ERROR_CLASS =
  'inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-800 ring-1 ring-inset ring-rose-200';
const HISTORICAL_NOTICE_CLASS =
  'rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800';
const LAYOUT_CLASS = 'grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]';
const ARTICLE_COLUMN_CLASS = 'flex flex-col gap-4 min-w-0';
const RAIL_COLUMN_CLASS = 'flex min-h-[400px] flex-col gap-3';
const SECTION_GUTTER_BUTTON_CLASS =
  'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none ring-1 ring-inset transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300';
const SECTION_GUTTER_HAS_CLASS =
  'bg-amber-100 text-amber-800 ring-amber-200 hover:bg-amber-200';
const SECTION_GUTTER_EMPTY_CLASS =
  'bg-slate-100 text-slate-500 ring-slate-200 hover:bg-slate-200';

const STATUS_PILL_TONE: Record<BriefShipStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  ready: 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200',
  shipped: 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  archived: 'bg-zinc-200 text-zinc-700 ring-1 ring-inset ring-zinc-300',
};

const STATUS_PILL_LABEL: Record<BriefShipStatus, string> = {
  draft: 'Draft',
  ready: 'Ready to ship',
  shipped: 'Shipped',
  archived: 'Archived',
};

/** Latest version of a brief, or `null` when none exist yet. */
function latestVersion(brief: Brief | null): BriefVersion | null {
  if (!brief || brief.versions.length === 0) return null;
  return brief.versions[brief.versions.length - 1];
}

/**
 * Catalogue of brief sections used as `MarginNote.anchorSection` values.
 *
 * Stable ids are deliberately kebab-style strings: they're embedded in
 * persisted MarginNote rows, so the catalogue is append-only — never
 * rename a section id after a release without a migration. The render
 * gutter cross-references these ids when rendering per-section indicators.
 */
export interface BriefSectionDescriptor {
  /** Stable persisted id (anchorSection). */
  id: string;
  /** Human label shown in section headings + the composer dropdown. */
  label: string;
}

export const BRIEF_SECTIONS: readonly BriefSectionDescriptor[] = [
  { id: 'problem', label: 'Problem' },
  { id: 'audience', label: 'Audience' },
  { id: 'desired-outcome', label: 'Desired outcome' },
  { id: 'must-stay-true', label: 'Must stay true' },
  { id: 'success-criteria', label: 'Success criteria' },
  { id: 'out-of-scope', label: 'Out of scope' },
  { id: 'open-questions', label: 'Open questions' },
  { id: 'next-step', label: 'Next step' },
];

/**
 * Determine which section ids actually have content for the displayed brief
 * version. The structured rendering in this screen only emits headings for
 * non-empty sections, but margin notes can anchor to any section regardless
 * of whether the version has content there yet — the gutter grays those out.
 */
function activeSectionIds(version: BriefVersion | null): Set<string> {
  if (!version) return new Set();
  const { briefState } = version;
  const out = new Set<string>();
  if (briefState.problemStatement) out.add('problem');
  if (briefState.audience) out.add('audience');
  if (briefState.desiredOutcome) out.add('desired-outcome');
  if (briefState.mustStayTrueRules.length > 0) out.add('must-stay-true');
  if (briefState.successCriteria.length > 0) out.add('success-criteria');
  if (briefState.outOfScope.length > 0) out.add('out-of-scope');
  if (briefState.openQuestions.length > 0) out.add('open-questions');
  if (briefState.nextStep) out.add('next-step');
  return out;
}

/**
 * Best-effort markdown projection of a `BriefState`, used as a fallback when
 * a version was snapshotted without an `artifactMd` blob. Intentionally
 * lightweight — the Workspace's richer phase-section UI is not in scope for
 * the M4 v0 shell.
 */
function briefStateToMarkdown(version: BriefVersion): string {
  const { briefState } = version;
  const lines: string[] = [];

  if (briefState.problemStatement) {
    lines.push('## Problem');
    lines.push(briefState.problemStatement);
    lines.push('');
  }
  if (briefState.audience) {
    lines.push('## Audience');
    lines.push(briefState.audience);
    lines.push('');
  }
  if (briefState.desiredOutcome) {
    lines.push('## Desired outcome');
    lines.push(briefState.desiredOutcome);
    lines.push('');
  }
  if (briefState.mustStayTrueRules.length > 0) {
    lines.push('## Must stay true');
    for (const rule of briefState.mustStayTrueRules) {
      lines.push(`- ${rule}`);
    }
    lines.push('');
  }
  if (briefState.successCriteria.length > 0) {
    lines.push('## Success criteria');
    for (const item of briefState.successCriteria) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }
  if (briefState.outOfScope.length > 0) {
    lines.push('## Out of scope');
    for (const item of briefState.outOfScope) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }
  if (briefState.openQuestions.length > 0) {
    lines.push('## Open questions');
    for (const item of briefState.openQuestions) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }
  if (briefState.nextStep) {
    lines.push(`**Next step:** ${briefState.nextStep}`);
  }

  return lines.join('\n').trim();
}

type SaveIndicatorState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string };

const SAVE_INDICATOR_TIMEOUT_MS = 2000;

/**
 * Detect the platform-appropriate save shortcut.
 *
 * macOS uses ⌘S; Windows / Linux use Ctrl+S. We accept both on every platform
 * so headless tests and remote sessions don't have to guess. Browsers map ⌘S
 * to "Save Page" by default — we `preventDefault()` so this hijack works.
 */
function isSaveShortcut(e: KeyboardEvent): boolean {
  const key = e.key;
  if (key !== 's' && key !== 'S') return false;
  return e.metaKey || e.ctrlKey;
}

export function BriefScreen({
  ideaIdOverride,
  briefOverride,
  onShipClick,
  authoredBy = 'user',
  personasOverride,
  currentPersonaId = null,
}: BriefScreenProps = {}): React.ReactElement {
  const [route] = useRoute();

  // Resolve the idea id: explicit override (tests) > route. We deliberately
  // require `kind === 'brief'` from the route — App.tsx is the dispatcher
  // (bo-130) and any other route reaching this screen is a misuse.
  const ideaIdFromRoute = route.kind === 'brief' ? route.ideaId : null;
  const ideaId = ideaIdOverride ?? ideaIdFromRoute ?? null;

  const briefSync = useBriefSync(
    briefOverride !== undefined ? null : ideaId !== null ? { ideaId } : null,
  );

  // Tests can short-circuit the hook entirely with `briefOverride`.
  const brief: Brief | null =
    briefOverride !== undefined ? (briefOverride ?? null) : briefSync.brief;
  const isLoading = briefOverride !== undefined ? false : briefSync.isLoading;
  const notFound = briefOverride !== undefined ? briefOverride === null : briefSync.notFound;
  const appendVersion = briefSync.appendVersion;
  const addMarginNote = briefSync.addMarginNote;
  const resolveMarginNote = briefSync.resolveMarginNote;

  // ---- Persona roster -------------------------------------------------------
  // Margin notes attribute to a persona; we load the active roster lazily so
  // the composer can render a picker. Tests bypass IDB via `personasOverride`.
  const [loadedPersonas, setLoadedPersonas] = useState<readonly Persona[]>(
    personasOverride ?? [],
  );

  useEffect(() => {
    if (personasOverride !== undefined) {
      setLoadedPersonas(personasOverride);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const all = await listPersonas();
        if (!cancelled) setLoadedPersonas(all);
      } catch {
        if (!cancelled) setLoadedPersonas([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [personasOverride]);

  // ---- Margin note focus ----------------------------------------------------
  const [focusedMarginNoteId, setFocusedMarginNoteId] = useState<string | null>(null);
  // Section preselected in the composer (set when the user clicks a section
  // gutter indicator). `null` keeps the composer's default ("Whole brief").
  const [composerSection, setComposerSection] = useState<string | undefined>(undefined);

  // ---- Version selection ----------------------------------------------------
  // `null` = "latest" sentinel. We resolve to the actual version below so the
  // invariant ("current = latest by seq") survives appends — when a new version
  // lands and the user is on "latest", the article auto-flips to it.
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const versions = useMemo<readonly BriefVersion[]>(() => brief?.versions ?? [], [brief]);

  const latestVer = useMemo(() => latestVersion(brief), [brief]);

  const displayedVersion: BriefVersion | null = useMemo(() => {
    if (selectedVersionId === null) return latestVer;
    const match = versions.find(v => v.id === selectedVersionId);
    return match ?? latestVer;
  }, [latestVer, selectedVersionId, versions]);

  const isViewingHistorical =
    displayedVersion !== null && latestVer !== null && displayedVersion.id !== latestVer.id;

  const renderedMarkdown = useMemo(() => {
    if (!displayedVersion) return '';
    if (displayedVersion.artifactMd && displayedVersion.artifactMd.trim().length > 0) {
      return displayedVersion.artifactMd;
    }
    return briefStateToMarkdown(displayedVersion);
  }, [displayedVersion]);

  // bo-162 — wire the brief into the same promote-to-principle path the
  // idea inspector uses. Source string is the displayed version's problem
  // statement, falling back to desired outcome (both are principle-shaped
  // single-sentence fields). Button is hidden when neither is present.
  // We use `displayedVersion` (vs. `latestVer`) so the action mirrors what
  // the user is currently looking at, matching the ⌘S "snapshot what you
  // see" semantics introduced by bo-155.
  const { promoteToPrinciple } = usePromoteToPrinciple();
  const principleCandidate = useMemo(() => {
    if (!displayedVersion) return '';
    const problem = displayedVersion.briefState.problemStatement?.trim() ?? '';
    if (problem.length > 0) return problem;
    const outcome = displayedVersion.briefState.desiredOutcome?.trim() ?? '';
    return outcome;
  }, [displayedVersion]);

  const handlePromoteClick = useCallback(() => {
    if (!principleCandidate) return;
    void promoteToPrinciple(principleCandidate).then((added) => {
      if (typeof window === 'undefined' || typeof window.alert !== 'function') {
        return;
      }
      window.alert(
        added
          ? 'Promoted to a project principle. Open the Principles drawer to review.'
          : 'This brief is already a principle on the project.',
      );
    });
  }, [principleCandidate, promoteToPrinciple]);

  // ---- Save (⌘S / Ctrl+S) ---------------------------------------------------
  const [saveState, setSaveState] = useState<SaveIndicatorState>({ kind: 'idle' });
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest references used by the keydown handler — keeps the listener stable
  // (we add it once) without staleness.
  const displayedRef = useRef<BriefVersion | null>(displayedVersion);
  const briefRef = useRef<Brief | null>(brief);
  const appendRef = useRef(appendVersion);
  const authorRef = useRef(authoredBy);
  const savingRef = useRef(false);
  displayedRef.current = displayedVersion;
  briefRef.current = brief;
  appendRef.current = appendVersion;
  authorRef.current = authoredBy;

  const scheduleSavedTimeout = useCallback((at: number) => {
    if (saveTimeoutRef.current !== null) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      setSaveState(prev => (prev.kind === 'saved' && prev.at === at ? { kind: 'idle' } : prev));
    }, SAVE_INDICATOR_TIMEOUT_MS);
  }, []);

  const performSnapshot = useCallback(async (): Promise<void> => {
    if (savingRef.current) return; // de-bounce double-presses
    const currentBrief = briefRef.current;
    const currentVersion = displayedRef.current;
    if (!currentBrief || !currentVersion) return;

    savingRef.current = true;
    setSaveState({ kind: 'saving' });
    try {
      // Snapshot what the user is currently looking at. If they're on a past
      // version, "save" effectively pins that historical content as a new
      // latest version — a lightweight fork-by-save. The new version's seq is
      // assigned by storage (lastSeq + 1), preserving the invariant that the
      // "current" version is always the latest by seq.
      await appendRef.current({
        briefState: currentVersion.briefState,
        artifactMd: currentVersion.artifactMd,
        authoredBy: authorRef.current,
      });
      // Snap the picker back to "latest" so the article flips to the new
      // snapshot — otherwise we'd remain visually stuck on the old version
      // we just cloned.
      setSelectedVersionId(null);
      const at = Date.now();
      setSaveState({ kind: 'saved', at });
      scheduleSavedTimeout(at);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      setSaveState({ kind: 'error', message });
    } finally {
      savingRef.current = false;
    }
  }, [scheduleSavedTimeout]);

  // Single window-level keydown listener: ⌘S / Ctrl+S → snapshot.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!isSaveShortcut(e)) return;
      // Hijack the browser default ("Save Page As…").
      e.preventDefault();
      void performSnapshot();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (saveTimeoutRef.current !== null) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [performSnapshot]);

  // ---- Misc handlers --------------------------------------------------------
  const handleShipClick = useCallback(() => {
    if (!brief) return;
    if (onShipClick) {
      onShipClick(brief);
    }
    // No real handoff in v0. Screen 07 (M5) wires the interrogator + adapters.
  }, [brief, onShipClick]);

  const handleVersionSelect = useCallback((id: string | null) => {
    setSelectedVersionId(id);
  }, []);

  // ---- Margin notes ---------------------------------------------------------
  const marginNotes = useMemo(() => brief?.marginNotes ?? [], [brief]);
  const sectionDescriptors = useMemo(() => BRIEF_SECTIONS.slice(), []);
  const sectionIdsWithContent = useMemo(
    () => activeSectionIds(displayedVersion),
    [displayedVersion],
  );
  const openNotesBySection = useMemo(() => {
    const out: Record<string, number> = {};
    for (const note of marginNotes) {
      if (note.status !== 'open') continue;
      const key = note.anchorSection ?? '__brief__';
      out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  }, [marginNotes]);

  const handleAddMarginNote = useCallback(
    async (input: {
      text: string;
      author: { authorPersonaId: string | null; authorLabel: string };
      anchorSection?: string;
    }): Promise<void> => {
      if (!brief) return;
      const updated = await addMarginNote({
        text: input.text,
        authorPersonaId: input.author.authorPersonaId ?? undefined,
        authorLabel: input.author.authorLabel,
        anchorSection: input.anchorSection,
        anchorVersionId: displayedVersion?.id,
      });
      // Focus the just-added note so the rail scrolls to it. The latest note
      // is at the head of `marginNotes` after sorting (newest-first), so
      // pull it from the persisted record to get its real id.
      const fresh = updated.marginNotes
        .filter(n => n.status === 'open')
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      if (fresh) setFocusedMarginNoteId(fresh.id);
    },
    [addMarginNote, brief, displayedVersion?.id],
  );

  const handleResolveMarginNote = useCallback(
    async (noteId: string, status: 'resolved' | 'dismissed'): Promise<void> => {
      if (!brief) return;
      await resolveMarginNote({ noteId, status });
      if (focusedMarginNoteId === noteId) setFocusedMarginNoteId(null);
    },
    [brief, focusedMarginNoteId, resolveMarginNote],
  );

  const handleSectionGutterClick = useCallback(
    (sectionId: string) => {
      setComposerSection(sectionId);
      // Surface the most-recent open note for the section as the focused entry.
      const candidate = marginNotes
        .filter(n => n.status === 'open' && n.anchorSection === sectionId)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      setFocusedMarginNoteId(candidate ? candidate.id : null);
    },
    [marginNotes],
  );

  const handleAnchorClickFromList = useCallback(
    (sectionId: string) => {
      setComposerSection(sectionId);
      setFocusedMarginNoteId(null);
      // Best-effort scroll to the section heading; rendered via id below.
      if (typeof document !== 'undefined') {
        const el = document.getElementById(`bo-brief-section-${sectionId}`);
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
      }
    },
    [],
  );

  // ---- Render branches ------------------------------------------------------

  if (route.kind !== 'brief' && ideaIdOverride === undefined && briefOverride === undefined) {
    return (
      <div className={ROOT_CLASS} aria-label="Brief">
        <div className={ERROR_CLASS} role="alert">
          BriefScreen mounted on a non-brief route. Expected
          {' '}<code>route.kind === &apos;brief&apos;</code>.
        </div>
      </div>
    );
  }

  if (ideaId === null && briefOverride === undefined) {
    return (
      <div className={ROOT_CLASS} aria-label="Brief">
        <div className={ERROR_CLASS} role="alert">
          No idea selected. Open a brief from the board canvas to land here.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={ROOT_CLASS} aria-label="Brief">
        <div className={LOADING_CLASS} role="status">
          Loading brief…
        </div>
      </div>
    );
  }

  if (notFound || brief === null) {
    return (
      <div className={ROOT_CLASS} aria-label="Brief">
        <header className={HEADER_CLASS}>
          <div className={HEADER_TEXT_CLASS}>
            <h1 className={TITLE_CLASS}>Brief</h1>
            <p className={SUBTITLE_CLASS}>
              This idea hasn&apos;t graduated yet — no brief exists.
            </p>
          </div>
        </header>
        <div className={EMPTY_CLASS}>
          Briefs come into existence when an idea graduates from the canvas.
          Promote the idea on the board to draft its first version.
        </div>
      </div>
    );
  }

  const status = brief.shipStatus;
  const versionCount = brief.versions.length;

  return (
    <div className={ROOT_CLASS} aria-label="Brief">
      <header className={HEADER_CLASS}>
        <div className={HEADER_TEXT_CLASS}>
          <h1 className={TITLE_CLASS}>Brief</h1>
          <p className={SUBTITLE_CLASS}>
            {versionCount === 0
              ? 'No versions snapshotted yet.'
              : `Version ${displayedVersion?.seq ?? versionCount} of ${versionCount}${
                  isViewingHistorical ? ' (viewing history)' : ''
                }.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {versionCount > 0 && (
            <BriefVersionPicker
              versions={versions}
              selectedVersionId={selectedVersionId}
              onSelect={handleVersionSelect}
            />
          )}
          {saveState.kind === 'saving' && (
            <span
              className={SAVE_INDICATOR_CLASS}
              role="status"
              aria-live="polite"
              data-bo-save-state="saving"
            >
              <span aria-hidden="true">●</span>
              Saving…
            </span>
          )}
          {saveState.kind === 'saved' && (
            <span
              className={SAVE_INDICATOR_CLASS}
              role="status"
              aria-live="polite"
              data-bo-save-state="saved"
            >
              <span aria-hidden="true">✓</span>
              Saved
            </span>
          )}
          {saveState.kind === 'error' && (
            <span
              className={SAVE_ERROR_CLASS}
              role="alert"
              data-bo-save-state="error"
              title={saveState.message}
            >
              <span aria-hidden="true">!</span>
              Save failed
            </span>
          )}
          <span
            className={`${STATUS_PILL_BASE_CLASS} ${STATUS_PILL_TONE[status]}`}
            aria-label={`Ship status: ${STATUS_PILL_LABEL[status]}`}
            data-bo-ship-status={status}
          >
            <span aria-hidden="true">●</span>
            {STATUS_PILL_LABEL[status]}
          </span>
          {/*
            bo-162 — promote-to-principle from the brief. Hidden when the
            brief has no problem statement or desired outcome to promote.
            Clicking writes through useProjectSync; review via the
            Principles drawer (mounted at the App level).
          */}
          {principleCandidate.length > 0 ? (
            <button
              type="button"
              className={SHIP_BUTTON_CLASS}
              onClick={handlePromoteClick}
              title="Promote this brief's problem statement to a project principle."
              aria-label="Promote brief to principle"
            >
              <span aria-hidden="true">¶</span>&nbsp;Promote to principle
            </button>
          ) : null}
          <button
            type="button"
            className={SHIP_BUTTON_CLASS}
            onClick={handleShipClick}
            disabled={status === 'shipped' || status === 'archived'}
            title="Ship handoff is wired up in Screen 07 (M5)."
            aria-label="Ship to (placeholder)"
          >
            Ship to&nbsp;…
          </button>
        </div>
      </header>

      {isViewingHistorical && (
        <div className={HISTORICAL_NOTICE_CLASS} role="note">
          Viewing version {displayedVersion?.seq} (read-only). The latest version is
          {' '}v{latestVer?.seq}. Press{' '}
          <kbd className="rounded border border-amber-300 bg-amber-100 px-1 py-0.5 font-mono">
            ⌘S
          </kbd>{' '}
          to fork this snapshot as a new latest version.
        </div>
      )}

      <div className={LAYOUT_CLASS}>
        <div className={ARTICLE_COLUMN_CLASS}>
          {/*
            Section gutter strip (bo-154). Each section is a clickable button
            that surfaces a count of open margin notes anchored there. Sections
            with no current content are dimmed but still clickable — a note can
            anchor to "Open questions" even when the version doesn't have any
            yet, signalling the gap.
          */}
          {displayedVersion !== null && (
            <nav
              aria-label="Brief sections"
              className="flex flex-wrap items-center gap-1.5 px-1"
              data-bo-brief-section-gutter
            >
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Sections
              </span>
              {sectionDescriptors.map(s => {
                const count = openNotesBySection[s.id] ?? 0;
                const hasContent = sectionIdsWithContent.has(s.id);
                const tone = count > 0
                  ? SECTION_GUTTER_HAS_CLASS
                  : SECTION_GUTTER_EMPTY_CLASS;
                return (
                  <button
                    type="button"
                    key={s.id}
                    className={`${SECTION_GUTTER_BUTTON_CLASS} ${tone}${hasContent ? '' : ' opacity-60'}`}
                    onClick={() => handleSectionGutterClick(s.id)}
                    title={
                      count > 0
                        ? `${s.label}: ${count} open margin note${count === 1 ? '' : 's'}`
                        : `${s.label}: no margin notes`
                    }
                    aria-label={`Section ${s.label}, ${count} open margin notes`}
                    data-bo-section-id={s.id}
                    data-bo-section-note-count={count}
                  >
                    {s.label}
                    {count > 0 && (
                      <span
                        className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white"
                        aria-hidden="true"
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          )}
          <article className={ARTICLE_CLASS} aria-label="Brief content">
            {displayedVersion === null ? (
              <p className="text-sm text-slate-500">
                This brief has no versions yet. Snapshot the canvas with{' '}
                <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs">
                  ⌘S
                </kbd>{' '}
                to create the first version.
              </p>
            ) : renderedMarkdown.length === 0 ? (
              <p className="text-sm text-slate-500">
                This version is empty. Add structure on the canvas, then re-snapshot.
              </p>
            ) : (
              <>
                {/*
                  Anchor stubs for section scroll-to. Each section heading also
                  ships with a label-derived `id` so MarginNoteList anchor clicks
                  can scroll the article. The Markdown projection above is
                  intentionally untouched; these anchors live above the markdown
                  body to keep DOMPurify's allow-list unchanged.
                */}
                {sectionDescriptors.map(s => (
                  <div
                    key={s.id}
                    id={`bo-brief-section-${s.id}`}
                    aria-hidden="true"
                    style={{ height: 0, overflow: 'hidden' }}
                  />
                ))}
                <Markdown content={renderedMarkdown} />
              </>
            )}
          </article>
        </div>
        <div className={RAIL_COLUMN_CLASS}>
          <MarginNoteList
            notes={marginNotes}
            personas={loadedPersonas}
            sections={sectionDescriptors}
            onResolve={handleResolveMarginNote}
            onAnchorClick={handleAnchorClickFromList}
            focusedNoteId={focusedMarginNoteId}
            footer={
              <AddMarginNoteForm
                personas={loadedPersonas}
                sections={sectionDescriptors}
                onSubmit={handleAddMarginNote}
                defaultAuthorPersonaId={currentPersonaId}
                defaultSection={composerSection ?? ''}
                compact
              />
            }
          />
        </div>
      </div>
    </div>
  );
}

export default BriefScreen;
