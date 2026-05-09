import React, { useCallback, useMemo } from 'react';
import { useRoute } from '../routing/useRoute';
import { useBriefSync } from '../useBriefSync';
import { usePromoteToPrinciple } from '../usePromoteToPrinciple';
import Markdown from '../../../src/workspace/markdown';
import type { Brief, BriefShipStatus, BriefVersion } from '../../../src/types';

/**
 * Screen 04 · The Brief (v0 shell).
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
 * Out of scope (deferred to follow-ups):
 *   - Margin notes column / inline annotations  → bo-154
 *     (`brief/MarginNoteList.tsx`, `brief/BriefSection.tsx` annotations).
 *   - Version picker / scrubber                  → bo-155
 *     (`brief/BriefVersionPicker.tsx`, ⌘S snapshot UX).
 *   - Real ship handoff (interrogator + adapters) → bo-130 + Screen 07/M5.
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

export function BriefScreen({
  ideaIdOverride,
  briefOverride,
  onShipClick,
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

  const version = useMemo(() => latestVersion(brief), [brief]);

  const renderedMarkdown = useMemo(() => {
    if (!version) return '';
    if (version.artifactMd && version.artifactMd.trim().length > 0) {
      return version.artifactMd;
    }
    return briefStateToMarkdown(version);
  }, [version]);

  // bo-162 — wire the brief into the same promote-to-principle path the
  // idea inspector uses. Source string is the latest version's problem
  // statement, falling back to desired outcome (both are principle-shaped
  // single-sentence fields). Button is hidden when neither is present.
  const { promoteToPrinciple } = usePromoteToPrinciple();
  const principleCandidate = useMemo(() => {
    if (!version) return '';
    const problem = version.briefState.problemStatement?.trim() ?? '';
    if (problem.length > 0) return problem;
    const outcome = version.briefState.desiredOutcome?.trim() ?? '';
    return outcome;
  }, [version]);

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

  const handleShipClick = useCallback(() => {
    if (!brief) return;
    if (onShipClick) {
      onShipClick(brief);
    }
    // No real handoff in v0. Screen 07 (M5) wires the interrogator + adapters.
  }, [brief, onShipClick]);

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
              : `Version ${version?.seq ?? versionCount} of ${versionCount}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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

      <article className={ARTICLE_CLASS} aria-label="Brief content">
        {version === null ? (
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
          <Markdown content={renderedMarkdown} />
        )}
      </article>

      {/*
        Margin notes column (bo-154) and version picker (bo-155) land in
        follow-up tasks; intentionally absent here so the v0 shell ships
        without speculative scaffolding.
      */}
    </div>
  );
}

export default BriefScreen;
