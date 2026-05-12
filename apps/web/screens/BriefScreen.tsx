import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRoute } from '../routing/useRoute';
import { useBriefSync } from '../useBriefSync';
import { usePromoteToPrinciple } from '../usePromoteToPrinciple';
import Markdown from '../../../src/workspace/markdown';
import BriefVersionPicker from '../brief/BriefVersionPicker';
import MarginNoteList from '../brief/MarginNoteList';
import AddMarginNoteForm from '../brief/AddMarginNoteForm';
import { listPersonas } from '../../../src/storage/personas';
import { getDb } from '../../../src/storage/db';
import {
  useBriefAiComposition,
  type AiRunRoleFn,
} from '../brief/useBriefAiComposition';
import type {
  Brief,
  BriefShipStatus,
  BriefState,
  BriefVersion,
  Idea,
  Persona,
  Settings,
} from '../../../src/types';

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
  /**
   * Optional override for the AI composition runner. Tests / Storybook pass a
   * stub that returns canned role output so the screen never reaches the
   * service worker. Mirrors the convention in `HandoffInterrogator`.
   */
  aiRunRoleOverride?: AiRunRoleFn;
  /**
   * Optional settings override — lets tests inject a synthetic credentials
   * blob so the provider-key gate can be exercised deterministically.
   */
  aiSettingsOverride?: Settings;
  /**
   * When true, suppress the auto-on-mount AI composition pass. Tests use this
   * to keep the screen deterministic; the Recompose button still fires.
   */
  aiDisabled?: boolean;
}

/*
 * Screen 04 · The Brief — paper-styled restyle.
 *
 * Visual mapping notes:
 *   - Root is `.paper-dots` so the entire screen sits on dotted-cream paper;
 *     the screen owns `min-h-screen` so the texture fills the viewport.
 *   - The article body wears `.paper` for the warm cream background plus a
 *     hand-drawn 2px ink border, mimicking a memo pinned to the wall.
 *   - Headers use the hand title font (`--f-hand` / Caveat) via inline style;
 *     body copy inherits `--f-hand-body` from the global body element.
 *   - Status pills, save indicator, and historical-notice are composed inline
 *     because the design CSS doesn't define `.pill` / `.tag` as standalone —
 *     they only exist scoped to `.sticky`. Inline lets us bind directly to
 *     `--ink`, `--paper`, and the sticky-color tokens.
 *   - Ship button uses `.btn.primary`; secondary actions (promote-to-principle)
 *     use plain `.btn`.
 *   - Margin notes rail is a sticky-yellow-ish column, headed with a hand
 *     label, framing the existing `MarginNoteList` + `AddMarginNoteForm`
 *     primitives (unmodified, out of scope).
 */
const ROOT_CLASS =
  'bo-brief-screen paper-dots relative flex min-h-screen max-h-screen overflow-y-auto flex-col gap-6 px-8 py-10';
const HEADER_CLASS =
  'flex flex-wrap items-start justify-between gap-4 border-b-2 pb-5';
const HEADER_TEXT_CLASS = 'flex flex-col gap-1';
const TITLE_CLASS = 'text-4xl leading-none tracking-tight';
const SUBTITLE_CLASS = 'text-sm';
const ARTICLE_CLASS =
  'paper relative overflow-hidden border-2 px-8 py-7';
const EMPTY_CLASS =
  'paper relative overflow-hidden border-2 border-dashed px-6 py-12 text-center text-base';
const LOADING_CLASS = 'text-base';
const ERROR_CLASS =
  'paper relative overflow-hidden border-2 px-4 py-3 text-base';
const STATUS_PILL_BASE_CLASS =
  'inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs uppercase tracking-wider';
const SHIP_BUTTON_CLASS = 'btn';
const SHIP_BUTTON_PRIMARY_CLASS = 'btn primary';
const SAVE_INDICATOR_CLASS =
  'inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs uppercase tracking-wider';
const SAVE_ERROR_CLASS =
  'inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs uppercase tracking-wider';
const HISTORICAL_NOTICE_CLASS =
  'rounded-md border-2 border-dashed px-3 py-2 text-sm';
const LAYOUT_CLASS = 'grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]';
const ARTICLE_COLUMN_CLASS = 'flex flex-col gap-4 min-w-0';
const RAIL_COLUMN_CLASS =
  'flex min-h-[400px] flex-col gap-3 rounded-lg border-2 border-dashed px-3 py-3';
const SECTION_GUTTER_BUTTON_CLASS =
  'inline-flex h-7 min-w-7 items-center justify-center rounded-full border-2 px-2.5 text-[12px] leading-none transition focus:outline-none';

const INK = 'var(--ink)';
const INK_SOFT = 'var(--ink-soft)';
const INK_FAINT = 'var(--ink-faint)';
const PAPER = 'var(--paper)';
const PAPER_DARK = 'var(--paper-dark)';
const ACCENT_CONTRADICTS = 'var(--accent-contradicts)';
const ACCENT_REVIVES = 'var(--accent-revives)';
const F_HAND: React.CSSProperties = { fontFamily: 'var(--f-hand)' };
const F_HAND_BODY: React.CSSProperties = { fontFamily: 'var(--f-hand-body)' };
const F_MONO: React.CSSProperties = { fontFamily: 'var(--f-mono)' };

/**
 * Ship-status → sticky color mapping.
 *   - draft     → paper-on-ink   (neutral, the blank slate)
 *   - ready     → sticky-yellow  (warm, eye-catching — "this is ready")
 *   - shipped   → sticky-green   (success, revives accent green)
 *   - archived  → sticky-lilac on faint ink (drained, set aside)
 */
const STATUS_PILL_STYLES: Record<BriefShipStatus, React.CSSProperties> = {
  draft: {
    background: PAPER_DARK,
    color: INK,
    borderColor: INK,
  },
  ready: {
    background: 'var(--sticky-yellow)',
    color: INK,
    borderColor: 'var(--sticky-yellow-edge)',
  },
  shipped: {
    background: 'var(--sticky-green)',
    color: INK,
    borderColor: 'var(--sticky-green-edge)',
  },
  archived: {
    background: 'var(--sticky-lilac)',
    color: INK_SOFT,
    borderColor: 'var(--sticky-lilac-edge)',
  },
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
 * Canonical brief-document section ordering (Build Spec §s04 — "Document body ·
 * sections in a fixed order"). Used by `briefStateToMarkdown` to emit the five
 * spec-mandated sections first, and by the orphan detector to scope "source
 * deleted" surfacing to the canonical document body.
 *
 * Keep these section *ids* aligned with the `BRIEF_SECTIONS` catalogue above so
 * the section-gutter / margin-note anchor remains valid. "approach" and "risks"
 * are spec-new and have no margin-note anchor in `BRIEF_SECTIONS` yet — that's
 * deliberate (margin-note anchor catalogue is append-only and orthogonal to the
 * document body's section list).
 */
const SECTION_ORDER = ['problem', 'approach', 'must-stay-true', 'risks', 'open-questions'] as const;
type CanonicalSectionId = typeof SECTION_ORDER[number];

const CANONICAL_SECTION_LABEL: Record<CanonicalSectionId, string> = {
  problem: 'Problem',
  approach: 'Approach',
  'must-stay-true': 'Must stay true',
  risks: 'Risks',
  'open-questions': 'Open questions',
};

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
 * Resolve the "Approach" projection from a `BriefState`. Prefers the chosen
 * approach (when set + still in the live list); falls back to the first
 * proposed approach when none is chosen. Returns an empty string when the
 * brief hasn't proposed any approach yet.
 */
function projectApproach(briefState: BriefState): string {
  const chosen = briefState.chosenApproachId
    ? briefState.approaches.find(a => a.id === briefState.chosenApproachId)
    : undefined;
  const pick = chosen ?? briefState.approaches[0];
  if (!pick) return '';
  const label = pick.label?.trim();
  const summary = pick.summary?.trim();
  if (label && summary) return `**${label}** — ${summary}`;
  return summary || label || '';
}

/**
 * Resolve the "Risks" projection. The spec maps Risks to `contradicts`
 * connections + Devil's Advocate notes — within the embedded BriefState that
 * surfaces as `risks[]` (structured) + `challenges[]` (Devil's critiques).
 * Renders each as a bullet so the markdown remains scannable.
 */
function projectRisksLines(briefState: BriefState): string[] {
  const out: string[] = [];
  for (const risk of briefState.risks) {
    out.push(`- ${risk.description}`);
  }
  for (const challenge of briefState.challenges) {
    if (challenge.stance === 'accept' || challenge.stance === 'pending') {
      out.push(`- ${challenge.critique}`);
    }
  }
  return out;
}

/**
 * Per-canonical-section presence + content map. Used both by the markdown
 * synthesizer and by orphan detection — orphan logic needs to know which
 * sections "should" have content (per the spec's computed-from rules) vs.
 * which are empty in the displayed snapshot.
 */
interface CanonicalSectionContent {
  /** Heading text emitted in the markdown body. */
  heading: string;
  /** Body lines (excluding heading). Empty when the section has no content. */
  body: string[];
  /** Whether the source data was populated. */
  hasContent: boolean;
}

function projectCanonicalSection(
  id: CanonicalSectionId,
  briefState: BriefState,
): CanonicalSectionContent {
  const heading = `#### ${CANONICAL_SECTION_LABEL[id]}`;
  switch (id) {
    case 'problem': {
      const text = briefState.problemStatement?.trim() ?? '';
      return { heading, body: text ? [text] : [], hasContent: text.length > 0 };
    }
    case 'approach': {
      const text = projectApproach(briefState).trim();
      return { heading, body: text ? [text] : [], hasContent: text.length > 0 };
    }
    case 'must-stay-true': {
      const rules = briefState.mustStayTrueRules.filter(r => r.trim().length > 0);
      return {
        heading,
        body: rules.map(r => `- ${r}`),
        hasContent: rules.length > 0,
      };
    }
    case 'risks': {
      const lines = projectRisksLines(briefState);
      return { heading, body: lines, hasContent: lines.length > 0 };
    }
    case 'open-questions': {
      const items = briefState.openQuestions.filter(q => q.trim().length > 0);
      return {
        heading,
        body: items.map(q => `- ${q}`),
        hasContent: items.length > 0,
      };
    }
  }
}

/**
 * Best-effort markdown projection of a `BriefState`, used as a fallback when
 * a version was snapshotted without an `artifactMd` blob. Emits the canonical
 * five sections (Build Spec §s04 — Problem · Approach · Must stay true · Risks
 * · Open questions) first, then any supplementary BriefState fields the
 * embedded state still holds (audience, desired outcome, success criteria,
 * out of scope, next step). The supplementary trailer preserves prior
 * behaviour for briefs whose authors filled those fields on the canvas.
 */
function briefStateToMarkdown(
  version: BriefVersion,
  skipSectionIds: ReadonlySet<string> = new Set(),
): string {
  const { briefState } = version;
  const lines: string[] = [];

  // --- Canonical section block (fixed order per spec) ---
  for (const id of SECTION_ORDER) {
    if (skipSectionIds.has(id)) continue;
    const section = projectCanonicalSection(id, briefState);
    if (!section.hasContent) continue;
    lines.push(section.heading);
    for (const line of section.body) lines.push(line);
    lines.push('');
  }

  // --- Supplementary trailer (kept H4 to match the canonical block) ---
  if (briefState.audience) {
    lines.push('#### Audience');
    lines.push(briefState.audience);
    lines.push('');
  }
  if (briefState.desiredOutcome) {
    lines.push('#### Desired outcome');
    lines.push(briefState.desiredOutcome);
    lines.push('');
  }
  if (briefState.successCriteria.length > 0) {
    lines.push('#### Success criteria');
    for (const item of briefState.successCriteria) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }
  if (briefState.outOfScope.length > 0) {
    lines.push('#### Out of scope');
    for (const item of briefState.outOfScope) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }
  if (briefState.nextStep) {
    lines.push(`**Next step:** ${briefState.nextStep}`);
  }

  return lines.join('\n').trim();
}

/**
 * Detect whether an `artifactMd` blob is already canonical — i.e. ships H4
 * headers for the five spec-mandated sections in the spec-mandated order. When
 * true, we render it as-is. Otherwise we re-synthesize from `BriefState`.
 *
 * The check is intentionally permissive: any of the canonical headings present
 * counts as "structured", and we trust the original author for ordering. We
 * only bail to synthesis when a blob looks like an opaque dump (e.g. a v0
 * snapshot that used `## Problem` etc — those have to be re-projected because
 * the spec is now H4).
 */
function artifactMdHasCanonicalHeaders(md: string): boolean {
  // The spec's section catalogue uses H4 (####). A pre-rendered artifact is
  // considered canonical when at least one of the five labels appears as an
  // H4 heading — that's the contract documented in IMPLEMENTATION_PLAN §5.
  // Labels are static (no regex-meta) so a plain substring match is enough.
  for (const id of SECTION_ORDER) {
    const heading = `#### ${CANONICAL_SECTION_LABEL[id]}`;
    if (md.includes(heading)) return true;
  }
  return false;
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
  aiRunRoleOverride,
  aiSettingsOverride,
  aiDisabled = false,
}: BriefScreenProps = {}): React.ReactElement {
  const [route, navigate] = useRoute();

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

  // ---- Orphan detection (spec §s04 edge case) -------------------------------
  // The brief data model does not track sticky-id provenance per section, so
  // we infer "source deleted" from a content-level signal: a canonical section
  // that *previously* had content is now empty in the displayed version. This
  // surfaces every gap that previously held material — silently dropping it
  // would violate the spec ("never silently drop content").
  //
  // We compute orphan candidates against the most recent prior version with
  // any non-empty canonical sections. Sections the user has manually dismissed
  // via the orphan banner stay hidden (per-screen-life only — orphan
  // resolution does not persist in v1; see deferred list below).
  const [dismissedSectionIds, setDismissedSectionIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  // Reattach-orphan dialog state. When non-null, the dialog is open and the
  // value is the canonical section id the user is trying to reattach a sticky
  // to. Per spec, the dialog is a sticky-picker scoped to the brief's board.
  const [orphanResolvePending, setOrphanResolvePending] = useState<CanonicalSectionId | null>(null);
  // Ideas on the brief's board — loaded lazily when the user opens the dialog.
  // We keep this in a separate state slot so re-opens are instant; `boardIdeas
  // === null` is the "not loaded yet" sentinel.
  const [boardIdeas, setBoardIdeas] = useState<readonly Idea[] | null>(null);
  const [boardIdeasError, setBoardIdeasError] = useState<string | null>(null);
  const [reattachBusy, setReattachBusy] = useState<boolean>(false);

  const orphanedSectionIds = useMemo<readonly CanonicalSectionId[]>(() => {
    if (!displayedVersion) return [];
    const displayedIdx = versions.findIndex(v => v.id === displayedVersion.id);
    if (displayedIdx <= 0) return []; // no prior version → nothing could be "deleted"
    // Walk priors newest-first; first prior with content for a section wins.
    const out: CanonicalSectionId[] = [];
    for (const id of SECTION_ORDER) {
      if (dismissedSectionIds.has(id)) continue;
      const current = projectCanonicalSection(id, displayedVersion.briefState);
      if (current.hasContent) continue;
      let hadContentBefore = false;
      for (let i = displayedIdx - 1; i >= 0; i--) {
        const prior = projectCanonicalSection(id, versions[i].briefState);
        if (prior.hasContent) {
          hadContentBefore = true;
          break;
        }
      }
      if (hadContentBefore) out.push(id);
    }
    return out;
  }, [displayedVersion, versions, dismissedSectionIds]);

  // Sections we should *not* try to synthesize into the markdown body — either
  // dismissed by the user or currently surfaced as an orphan banner (the
  // section is intentionally empty, the banner is the user's prompt).
  const sectionIdsToSkipInBody = useMemo<ReadonlySet<string>>(() => {
    const out = new Set<string>(dismissedSectionIds);
    for (const id of orphanedSectionIds) out.add(id);
    return out;
  }, [dismissedSectionIds, orphanedSectionIds]);

  const renderedMarkdown = useMemo(() => {
    if (!displayedVersion) return '';
    if (
      displayedVersion.artifactMd
      && displayedVersion.artifactMd.trim().length > 0
      && artifactMdHasCanonicalHeaders(displayedVersion.artifactMd)
    ) {
      return displayedVersion.artifactMd;
    }
    return briefStateToMarkdown(displayedVersion, sectionIdsToSkipInBody);
  }, [displayedVersion, sectionIdsToSkipInBody]);

  const handleRemoveOrphanSection = useCallback((id: CanonicalSectionId) => {
    setDismissedSectionIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const closeReattachDialog = useCallback(() => {
    setOrphanResolvePending(null);
    setBoardIdeasError(null);
  }, []);

  const loadBoardIdeasForReattach = useCallback(async (): Promise<void> => {
    if (!brief?.boardId) return;
    try {
      const db = await getDb();
      const ideas = await db.getAllFromIndex('ideas', 'byBoardId', brief.boardId);
      // Sort by most recently touched first so the picker shows the active
      // stickies near the top, matching HomeScreen's `lastActivityAt` order.
      const sorted = [...ideas].sort(
        (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
      );
      setBoardIdeas(sorted);
      setBoardIdeasError(null);
    } catch (err) {
      setBoardIdeas([]);
      setBoardIdeasError(
        err instanceof Error ? err.message : 'Could not load stickies.',
      );
    }
  }, [brief?.boardId]);

  const handleReattachOrphan = useCallback(
    (id: CanonicalSectionId) => {
      setOrphanResolvePending(id);
      // Always re-load when opening — board ideas can change between dialog
      // invocations (new stickies, edits). The cost is one IDB read per open.
      void loadBoardIdeasForReattach();
    },
    [loadBoardIdeasForReattach],
  );

  /**
   * Reattach the chosen sticky to the orphaned canonical section. v1 strategy
   * (per Build Spec §s04 "never silently drop content"): append the sticky's
   * text into the appropriate `BriefState` field, snapshot a new version, and
   * dismiss the orphan banner for that section so the new version's body
   * carries the reattached content.
   */
  const performReattach = useCallback(
    async (sectionId: CanonicalSectionId, idea: Idea): Promise<void> => {
      if (!brief || !displayedVersion || reattachBusy) return;
      setReattachBusy(true);
      try {
        const base = displayedVersion.briefState;
        const text = (idea.rawText ?? '').trim();
        if (!text) {
          throw new Error('Sticky is empty.');
        }
        let nextState: BriefState;
        switch (sectionId) {
          case 'problem': {
            const existing = (base.problemStatement ?? '').trim();
            nextState = {
              ...base,
              problemStatement: existing ? `${existing}\n\n${text}` : text,
            };
            break;
          }
          case 'approach': {
            // Approach is structured; synthesize a new Approach entry from the
            // sticky so the projection picks it up via `projectApproach`.
            const newApproach = {
              id: `reattach-${idea.id}-${Date.now()}`,
              label: text.slice(0, 60),
              summary: text,
              scores: {
                speed: 0,
                cost: 0,
                complexity: 0,
                maintainability: 0,
                teamBurden: 0,
                userValue: 0,
                operationalLoad: 0,
                adoptionRisk: 0,
                reversibility: 0,
                complianceRisk: 0,
              },
            };
            nextState = {
              ...base,
              approaches: [...base.approaches, newApproach],
              chosenApproachId: base.chosenApproachId ?? newApproach.id,
            };
            break;
          }
          case 'must-stay-true': {
            nextState = {
              ...base,
              mustStayTrueRules: [...base.mustStayTrueRules, text],
            };
            break;
          }
          case 'risks': {
            nextState = {
              ...base,
              risks: [
                ...base.risks,
                {
                  id: `reattach-${idea.id}-${Date.now()}`,
                  description: text,
                  likelihood: 'medium',
                  impact: 'medium',
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
              ],
            };
            break;
          }
          case 'open-questions': {
            nextState = { ...base, openQuestions: [...base.openQuestions, text] };
            break;
          }
        }
        await appendVersion({
          briefState: nextState,
          // Drop the prior `artifactMd` so the next render re-projects from the
          // updated `briefState` (otherwise the cached markdown still misses
          // the section we just reattached).
          artifactMd: undefined,
          authoredBy,
          note: `Reattached sticky ${idea.id} to ${sectionId}`,
        });
        // Dismiss this section's orphan banner — the new version supplies
        // content, so the orphan detector will no longer flag it anyway, but
        // dismissing makes the transition explicit if any race remains.
        setDismissedSectionIds((prev) => {
          const next = new Set(prev);
          next.add(sectionId);
          return next;
        });
        // Snap the picker back to "latest" so the article reflects the append.
        setSelectedVersionId(null);
        closeReattachDialog();
      } catch (err) {
        setBoardIdeasError(
          err instanceof Error ? err.message : 'Could not reattach sticky.',
        );
      } finally {
        setReattachBusy(false);
      }
    },
    [
      appendVersion,
      authoredBy,
      brief,
      closeReattachDialog,
      displayedVersion,
      reattachBusy,
    ],
  );

  // Escape closes the reattach dialog. We register a separate listener (vs.
  // bolting onto the ⌘S handler) so it's clear which interaction owns Escape.
  useEffect(() => {
    if (orphanResolvePending === null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeReattachDialog();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [orphanResolvePending, closeReattachDialog]);

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
  // bo-spec §s04 edge case — "Editing an old version forks a new one." When the
  // user invokes ⌘S while viewing a historical version we prompt before
  // snapshotting, so the fork is intentional rather than implicit.
  const [forkPromptOpen, setForkPromptOpen] = useState<boolean>(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest references used by the keydown handler — keeps the listener stable
  // (we add it once) without staleness.
  const displayedRef = useRef<BriefVersion | null>(displayedVersion);
  const briefRef = useRef<Brief | null>(brief);
  const appendRef = useRef(appendVersion);
  const authorRef = useRef(authoredBy);
  const savingRef = useRef(false);
  const isViewingHistoricalRef = useRef<boolean>(isViewingHistorical);
  displayedRef.current = displayedVersion;
  briefRef.current = brief;
  appendRef.current = appendVersion;
  authorRef.current = authoredBy;
  isViewingHistoricalRef.current = isViewingHistorical;

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

  // Single window-level keydown listener: ⌘S / Ctrl+S → snapshot. When the
  // user is viewing a historical version, intercept the shortcut and surface
  // a fork-prompt instead — the user must confirm the fork before we mutate
  // the brief.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!isSaveShortcut(e)) return;
      // Hijack the browser default ("Save Page As…").
      e.preventDefault();
      if (isViewingHistoricalRef.current) {
        setForkPromptOpen(true);
        return;
      }
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

  // Send-to-handoff — navigates to the handoff screen for this brief. The
  // handoff route is `#/b/:boardId/handoff/:briefId` per `parseRoute`. We
  // rely on the brief's own `boardId` (rather than the route's) so the link
  // is robust against brief-by-id deep links that don't carry the board in
  // the URL today; if the brief is missing for any reason we no-op.
  const handleSendToHandoffClick = useCallback(() => {
    if (!brief) return;
    navigate({ kind: 'handoff', boardId: brief.boardId, briefId: brief.id });
  }, [brief, navigate]);

  const handleVersionSelect = useCallback((id: string | null) => {
    setSelectedVersionId(id);
    // Selecting a different version dismisses any pending fork prompt — the
    // confirmation refers to the version the user *was* viewing.
    setForkPromptOpen(false);
  }, []);

  const handleBackToLatest = useCallback(() => {
    setSelectedVersionId(null);
    setForkPromptOpen(false);
  }, []);

  const handleConfirmFork = useCallback(() => {
    setForkPromptOpen(false);
    void performSnapshot();
  }, [performSnapshot]);

  const handleCancelFork = useCallback(() => {
    setForkPromptOpen(false);
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

  // ---- AI composition (briefComposer + active-persona margin-note pass) ----
  // Live wiring of the on-open AI hook (Build Spec §s04 — AI hooks). The hook
  // owns the composer call + the per-persona margin-note generation, gated on
  // a per-(brief, version) key so navigating away/back doesn't re-fire. The
  // hook's status drives the in-article banners below.
  //
  // We feed it `latestVer` (not `displayedVersion`) because the auto-pass
  // should only fire against the canonical current version — viewing history
  // is a read-only mode by spec (snapshots are immutable). The Recompose
  // button bypasses that gate explicitly.
  const aiComposition = useBriefAiComposition({
    brief,
    ideaId,
    latestVersion: latestVer,
    personasOverride: loadedPersonas.length > 0 ? loadedPersonas : undefined,
    runRoleOverride: aiRunRoleOverride,
    settingsOverride: aiSettingsOverride,
    authoredBy: 'ai',
    appendVersion,
    addMarginNote,
    disabled: aiDisabled || isViewingHistorical,
  });

  /**
   * Recompose button handler. v1 confirm strategy: if the displayed version
   * has a non-empty `note` field (the marker we attach to user snapshots) and
   * is the latest, we warn before overwriting. We deliberately use the native
   * `window.confirm` per the spec ("v1 can be a simple window.confirm or an
   * inline confirmation banner") — keeps the surface minimal and re-uses the
   * browser's accessible focus-trap.
   */
  const handleRecomposeClick = useCallback(() => {
    if (!brief || !latestVer) return;
    const looksManuallyEdited = Boolean(
      latestVer.note && latestVer.note.trim().length > 0 && latestVer.authoredBy !== 'ai',
    );
    if (looksManuallyEdited && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const ok = window.confirm(
        'This version has a manual snapshot note. Recomposing will append a new AI-authored version. Continue?',
      );
      if (!ok) return;
    }
    void aiComposition.recompose();
  }, [aiComposition, brief, latestVer]);

  // ---- Render branches ------------------------------------------------------

  if (route.kind !== 'brief' && ideaIdOverride === undefined && briefOverride === undefined) {
    return (
      <div className={ROOT_CLASS} aria-label="Brief" style={{ color: INK }}>
        <div
          className={ERROR_CLASS}
          role="alert"
          style={{
            ...F_HAND_BODY,
            borderColor: ACCENT_CONTRADICTS,
            color: ACCENT_CONTRADICTS,
          }}
        >
          BriefScreen mounted on a non-brief route. Expected
          {' '}<code style={F_MONO}>route.kind === &apos;brief&apos;</code>.
        </div>
      </div>
    );
  }

  if (ideaId === null && briefOverride === undefined) {
    return (
      <div className={ROOT_CLASS} aria-label="Brief" style={{ color: INK }}>
        <div
          className={ERROR_CLASS}
          role="alert"
          style={{
            ...F_HAND_BODY,
            borderColor: ACCENT_CONTRADICTS,
            color: ACCENT_CONTRADICTS,
          }}
        >
          No idea selected. Open a brief from the board canvas to land here.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={ROOT_CLASS} aria-label="Brief" style={{ color: INK }}>
        <div
          className={LOADING_CLASS}
          role="status"
          style={{ ...F_HAND_BODY, color: INK_FAINT }}
        >
          Loading brief…
        </div>
      </div>
    );
  }

  if (notFound || brief === null) {
    return (
      <div className={ROOT_CLASS} aria-label="Brief" style={{ color: INK }}>
        <header className={HEADER_CLASS} style={{ borderColor: INK }}>
          <div className={HEADER_TEXT_CLASS}>
            <h1 className={TITLE_CLASS} style={{ ...F_HAND, color: INK }}>
              Brief
            </h1>
            <p className={SUBTITLE_CLASS} style={{ ...F_HAND_BODY, color: INK_SOFT }}>
              This idea hasn&apos;t graduated yet — no brief exists.
            </p>
          </div>
        </header>
        <div
          className={EMPTY_CLASS}
          style={{ ...F_HAND_BODY, borderColor: INK_FAINT, color: INK_SOFT }}
        >
          Briefs come into existence when an idea graduates from the canvas.
          Promote the idea on the board to draft its first version.
        </div>
      </div>
    );
  }

  const status = brief.shipStatus;
  const versionCount = brief.versions.length;

  return (
    <div className={ROOT_CLASS} aria-label="Brief" style={{ color: INK }}>
      <header className={HEADER_CLASS} style={{ borderColor: INK }}>
        <div className={HEADER_TEXT_CLASS}>
          <h1 className={TITLE_CLASS} style={{ ...F_HAND, color: INK }}>
            The Brief
          </h1>
          <p className={SUBTITLE_CLASS} style={{ ...F_HAND_BODY, color: INK_SOFT }}>
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
              style={{
                ...F_MONO,
                background: PAPER_DARK,
                color: INK_SOFT,
                borderColor: INK_FAINT,
              }}
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
              style={{
                ...F_MONO,
                background: 'var(--sticky-green)',
                color: INK,
                borderColor: 'var(--sticky-green-edge)',
              }}
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
              style={{
                ...F_MONO,
                background: PAPER,
                color: ACCENT_CONTRADICTS,
                borderColor: ACCENT_CONTRADICTS,
              }}
            >
              <span aria-hidden="true">!</span>
              Save failed
            </span>
          )}
          <span
            className={STATUS_PILL_BASE_CLASS}
            aria-label={`Ship status: ${STATUS_PILL_LABEL[status]}`}
            data-bo-ship-status={status}
            style={{ ...F_MONO, ...STATUS_PILL_STYLES[status] }}
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
          {/*
            AI Recompose action — re-runs `briefComposer` for the current
            version. Disabled while a composition pass is in-flight or when
            the provider-key gate is engaged (the inline hint covers that
            case so the button itself just disappears).
          */}
          {aiComposition.status.kind !== 'no-key' && latestVer !== null ? (
            <button
              type="button"
              className="btn sm"
              onClick={handleRecomposeClick}
              disabled={
                aiComposition.status.kind === 'composing'
                || aiComposition.status.kind === 'annotating'
              }
              title="Re-run the AI Brief Composer for this version."
              aria-label="Recompose brief with AI"
              data-bo-ai-recompose
            >
              {aiComposition.status.kind === 'composing'
                ? 'Composing…'
                : aiComposition.status.kind === 'annotating'
                  ? 'Annotating…'
                  : 'Recompose with AI'}
            </button>
          ) : null}
          {/*
            bo-* — Send-to-handoff link. Surfaces the handoff screen for this
            brief so the user can reach it from the UI without typing the
            `#/b/:boardId/handoff/:briefId` hash. Disabled when the brief is
            archived (no point handing off an archive). Hidden until a brief
            exists — outer guard above already returns early when not loaded.
          */}
          <button
            type="button"
            className="btn sm"
            onClick={handleSendToHandoffClick}
            disabled={status === 'archived'}
            title="Open the handoff interrogator for this brief."
            aria-label="Send brief to handoff"
            data-bo-action="send-to-handoff"
          >
            Send to handoff&nbsp;→
          </button>
          <button
            type="button"
            className={SHIP_BUTTON_PRIMARY_CLASS}
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
        <div
          className={HISTORICAL_NOTICE_CLASS}
          role="note"
          data-bo-historical-banner
          style={{
            ...F_HAND_BODY,
            background: 'var(--sticky-peach)',
            borderColor: 'var(--sticky-peach-edge)',
            color: INK,
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Viewing version {displayedVersion?.seq} (read-only). The latest version is
              {' '}v{latestVer?.seq}.
            </span>
            <button
              type="button"
              className="btn sm"
              onClick={handleBackToLatest}
              aria-label="Back to latest version"
              data-bo-action="back-to-latest"
            >
              ← Back to latest
            </button>
          </div>
          {forkPromptOpen ? (
            <div
              className="mt-2 flex flex-wrap items-center gap-2"
              role="dialog"
              aria-label="Fork older version"
              data-bo-fork-prompt
            >
              <span>
                Editing an older version forks a new draft. Continue?
              </span>
              <button
                type="button"
                className="btn sm primary"
                onClick={handleConfirmFork}
                data-bo-action="fork-confirm"
              >
                Fork
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={handleCancelFork}
                data-bo-action="fork-cancel"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="mt-1 text-sm" style={{ color: INK_SOFT }}>
              Press{' '}
              <kbd
                className="rounded border-2 px-1 py-0.5"
                style={{
                  ...F_MONO,
                  background: PAPER,
                  borderColor: INK,
                  color: INK,
                }}
              >
                ⌘S
              </kbd>{' '}
              to fork this snapshot as a new latest version.
            </div>
          )}
        </div>
      )}

      <div className={LAYOUT_CLASS}>
        <div className={ARTICLE_COLUMN_CLASS}>
          {/*
            Section gutter strip (bo-154). Each section is a clickable button
            that surfaces a count of open margin notes anchored there. Sections
            with no current content are dimmed but still clickable — a note can
            anchor to "Open questions" even when the version doesn't have any
            yet, signalling the gap. Buttons use sticky-yellow when they have
            open notes (warm + eye-catching), paper-dark otherwise (quiet).
          */}
          {displayedVersion !== null && (
            <nav
              aria-label="Brief sections"
              className="flex flex-wrap items-center gap-1.5 px-1"
              data-bo-brief-section-gutter
            >
              <span
                className="text-[11px] uppercase tracking-wider"
                style={{ ...F_MONO, color: INK_FAINT }}
              >
                Sections
              </span>
              {sectionDescriptors.map(s => {
                const count = openNotesBySection[s.id] ?? 0;
                const hasContent = sectionIdsWithContent.has(s.id);
                const toneStyle: React.CSSProperties = count > 0
                  ? {
                      background: 'var(--sticky-yellow)',
                      color: INK,
                      borderColor: 'var(--sticky-yellow-edge)',
                    }
                  : {
                      background: PAPER_DARK,
                      color: INK_SOFT,
                      borderColor: INK_FAINT,
                    };
                return (
                  <button
                    type="button"
                    key={s.id}
                    className={`${SECTION_GUTTER_BUTTON_CLASS}${hasContent ? '' : ' opacity-60'}`}
                    onClick={() => handleSectionGutterClick(s.id)}
                    title={
                      count > 0
                        ? `${s.label}: ${count} open margin note${count === 1 ? '' : 's'}`
                        : `${s.label}: no margin notes`
                    }
                    aria-label={`Section ${s.label}, ${count} open margin notes`}
                    data-bo-section-id={s.id}
                    data-bo-section-note-count={count}
                    style={{ ...F_HAND_BODY, ...toneStyle }}
                  >
                    {s.label}
                    {count > 0 && (
                      <span
                        className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]"
                        aria-hidden="true"
                        style={{
                          ...F_MONO,
                          background: INK,
                          color: PAPER,
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          )}
          <article
            className={ARTICLE_CLASS}
            aria-label="Brief content"
            style={{ ...F_HAND_BODY, borderColor: INK, color: INK }}
          >
            {/*
              AI composition status banners (Build Spec §s04 — AI hooks).
              Four states the article surface:
                - 'composing'   → "Composing brief…" paper-styled indicator
                - 'annotating'  → "Adding margin notes…" indicator
                - 'no-key'      → quiet mono hint about Options provider key
                - 'error'       → contradicts-tinted tag with the failure reason

              The locally-derived markdown still renders underneath, so the
              article is never empty while these surface. Idle / done states
              render nothing — the article speaks for itself once the pass
              completes.
            */}
            {aiComposition.status.kind === 'composing' && (
              <div
                role="status"
                aria-live="polite"
                data-bo-ai-status="composing"
                className="mb-4 rounded-md border-2 px-3 py-2 text-sm"
                style={{
                  ...F_HAND_BODY,
                  background: 'var(--sticky-yellow)',
                  borderColor: 'var(--sticky-yellow-edge)',
                  color: INK,
                }}
              >
                <strong style={F_HAND}>Composing brief…</strong>
                <span className="ml-2" style={{ color: INK_SOFT }}>
                  The Brief Composer is reading the canvas and writing a fresh draft.
                </span>
              </div>
            )}
            {aiComposition.status.kind === 'annotating' && (
              <div
                role="status"
                aria-live="polite"
                data-bo-ai-status="annotating"
                className="mb-4 rounded-md border-2 px-3 py-2 text-sm"
                style={{
                  ...F_HAND_BODY,
                  background: PAPER_DARK,
                  borderColor: INK,
                  color: INK,
                }}
              >
                <strong style={F_HAND}>Margin notes…</strong>
                <span className="ml-2" style={{ color: INK_SOFT }}>
                  Personas are reading the brief and leaving annotations.
                </span>
              </div>
            )}
            {aiComposition.status.kind === 'no-key' && (
              <div
                role="note"
                data-bo-ai-status="no-key"
                className="mb-4 rounded-md border-2 border-dashed px-3 py-2 text-xs"
                style={{
                  ...F_MONO,
                  background: PAPER,
                  borderColor: INK_FAINT,
                  color: INK_SOFT,
                }}
              >
                Configure a provider key in Options to enable AI-composed sections and margin notes.
              </div>
            )}
            {aiComposition.status.kind === 'error' && (
              <div
                role="alert"
                data-bo-ai-status="error"
                className="mb-4 inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs uppercase tracking-wider"
                style={{
                  ...F_MONO,
                  background: PAPER,
                  borderColor: ACCENT_CONTRADICTS,
                  color: ACCENT_CONTRADICTS,
                }}
                title={aiComposition.status.message}
              >
                <span aria-hidden="true">!</span>
                AI composition unavailable — check provider key
              </div>
            )}
            {displayedVersion === null ? (
              <p style={{ ...F_HAND_BODY, color: INK_SOFT }}>
                This brief has no versions yet. Snapshot the canvas with{' '}
                <kbd
                  className="rounded border-2 px-1.5 py-0.5"
                  style={{
                    ...F_MONO,
                    background: PAPER_DARK,
                    borderColor: INK,
                    color: INK,
                  }}
                >
                  ⌘S
                </kbd>{' '}
                to create the first version.
              </p>
            ) : renderedMarkdown.length === 0 && orphanedSectionIds.length === 0 ? (
              <p style={{ ...F_HAND_BODY, color: INK_SOFT }}>
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
                {/*
                  Orphan banners (spec §s04 — "source sticky deleted").
                  Each canonical section that had content in a prior version
                  but is empty now gets surfaced here so content is never
                  silently dropped. Two actions:
                    - Reattach… → v1 stub (sets `orphanResolvePending`); the
                      real flow opens a sticky-picker.
                    - Remove section → adds the id to `dismissedSectionIds`
                      so the banner vanishes.
                */}
                {orphanedSectionIds.length > 0 && (
                  <div className="mb-4 flex flex-col gap-2" data-bo-orphan-list>
                    {orphanedSectionIds.map(id => {
                      return (
                        <div
                          key={id}
                          role="alert"
                          data-bo-orphan-section={id}
                          className="rounded-md border-2 px-3 py-2"
                          style={{
                            ...F_HAND_BODY,
                            background: PAPER_DARK,
                            borderColor: INK,
                            color: INK,
                          }}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong style={F_HAND}>
                              {CANONICAL_SECTION_LABEL[id]} — orphan
                            </strong>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="btn sm"
                                onClick={() => handleReattachOrphan(id)}
                                data-bo-action="orphan-reattach"
                                aria-label={`Reattach ${CANONICAL_SECTION_LABEL[id]} source`}
                              >
                                Reattach…
                              </button>
                              <button
                                type="button"
                                className="btn sm"
                                onClick={() => handleRemoveOrphanSection(id)}
                                data-bo-action="orphan-remove"
                                aria-label={`Remove orphaned ${CANONICAL_SECTION_LABEL[id]} section`}
                              >
                                Remove section
                              </button>
                            </div>
                          </div>
                          <p className="mt-1 text-sm" style={{ color: INK_SOFT }}>
                            Source sticky deleted. Reattach or remove this section?
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
                {renderedMarkdown.length > 0 && <Markdown content={renderedMarkdown} />}
              </>
            )}
          </article>
        </div>
        <div
          className={RAIL_COLUMN_CLASS}
          aria-label="Margin notes"
          style={{
            borderColor: INK_FAINT,
            background: 'rgba(255, 244, 227, 0.35)',
          }}
        >
          <div
            className="flex items-center justify-between px-1 pt-1"
            style={{ ...F_MONO, color: ACCENT_CONTRADICTS }}
          >
            <span className="text-[10px] uppercase tracking-[0.14em]">
              Margin notes
            </span>
            <span
              className="text-[10px] uppercase tracking-[0.14em]"
              style={{ color: ACCENT_REVIVES }}
              aria-hidden="true"
            >
              {marginNotes.filter(n => n.status === 'open').length} open
            </span>
          </div>
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
      {orphanResolvePending !== null && (
        <div
          role="presentation"
          data-bo-reattach-overlay
          onClick={(e) => {
            // Overlay-click dismiss — only when the click hit the overlay
            // itself, not a descendant. The dialog stops propagation below.
            if (e.target === e.currentTarget) closeReattachDialog();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Reattach sticky to ${CANONICAL_SECTION_LABEL[orphanResolvePending]}`}
            data-bo-reattach-dialog={orphanResolvePending}
            onClick={(e) => e.stopPropagation()}
            style={{
              ...F_HAND_BODY,
              background: PAPER,
              border: `2px solid ${INK}`,
              color: INK,
              borderRadius: 12,
              padding: '18px 20px',
              width: 'min(560px, 100%)',
              maxHeight: 'min(80vh, 720px)',
              boxShadow: '4px 4px 0 var(--ink)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <header className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <strong style={{ ...F_HAND, fontSize: 22, lineHeight: 1.1 }}>
                  Reattach to {CANONICAL_SECTION_LABEL[orphanResolvePending]}
                </strong>
                <span style={{ fontSize: 13, color: INK_SOFT }}>
                  Pick a sticky from this board to populate the section.
                </span>
              </div>
              <button
                type="button"
                className="btn sm"
                onClick={closeReattachDialog}
                aria-label="Close reattach dialog"
                data-bo-action="reattach-close"
              >
                Close
              </button>
            </header>
            <div
              style={{
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                paddingRight: 4,
              }}
              data-bo-reattach-list
            >
              {boardIdeas === null ? (
                <p style={{ color: INK_SOFT, fontSize: 14 }} role="status">
                  Loading stickies…
                </p>
              ) : boardIdeas.length === 0 ? (
                <p style={{ color: INK_SOFT, fontSize: 14 }}>
                  No stickies on this board yet.
                </p>
              ) : (
                boardIdeas.map((idea) => {
                  const title = (idea.rawText ?? '').trim() || '(empty sticky)';
                  const shortTitle =
                    title.length > 120 ? `${title.slice(0, 120)}…` : title;
                  return (
                    <div
                      key={idea.id}
                      data-bo-reattach-row={idea.id}
                      style={{
                        border: `1.5px solid ${INK}`,
                        background: PAPER_DARK,
                        borderRadius: 8,
                        padding: '8px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        boxShadow: '1.5px 1.5px 0 var(--ink)',
                      }}
                    >
                      <span
                        style={{
                          ...F_HAND,
                          fontSize: 17,
                          lineHeight: 1.2,
                          color: INK,
                        }}
                      >
                        {shortTitle}
                      </span>
                      {idea.tags && idea.tags.length > 0 && (
                        <div
                          className="flex flex-wrap gap-1"
                          aria-label="Tags"
                          style={{ ...F_MONO, color: INK_SOFT, fontSize: 10 }}
                        >
                          {idea.tags.map((t) => (
                            <span
                              key={t}
                              style={{
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                padding: '1px 6px',
                                borderRadius: 999,
                                border: `1.5px solid ${INK_FAINT}`,
                                background: PAPER,
                              }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => {
                            void performReattach(orphanResolvePending, idea);
                          }}
                          disabled={reattachBusy}
                          data-bo-action="reattach-attach"
                          aria-label={`Attach sticky ${idea.id} to ${CANONICAL_SECTION_LABEL[orphanResolvePending]}`}
                        >
                          {reattachBusy
                            ? 'Attaching…'
                            : `Attach to ${CANONICAL_SECTION_LABEL[orphanResolvePending]}`}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {boardIdeasError && (
              <div
                role="alert"
                style={{
                  border: `1.5px solid ${ACCENT_CONTRADICTS}`,
                  background: PAPER,
                  color: ACCENT_CONTRADICTS,
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 13,
                }}
              >
                {boardIdeasError}
              </div>
            )}
            <footer className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="btn sm"
                onClick={closeReattachDialog}
                data-bo-action="reattach-cancel"
              >
                Cancel
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

export default BriefScreen;
