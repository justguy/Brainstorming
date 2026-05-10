import React, { useCallback, useMemo, useState } from 'react';
import { useRoute } from '../routing/useRoute';
import { useBriefSync } from '../useBriefSync';
import { HandoffInterrogator } from '../HandoffInterrogator';
import type { Brief, BriefShipStatus, BriefVersion } from '../../../src/types';
import { sendGithub } from '../../../src/integrations/github/githubAdapter';
import { sendNotion } from '../../../src/integrations/notion/notionAdapter';
import { sendLinear } from '../../../src/integrations/linear/linearAdapter';
import { sendSlack } from '../../../src/integrations/slack/slackAdapter';

/**
 * Screen 07 · Handoff (v0 shell + placeholder channel cards).
 *
 * Spec: Design/IMPLEMENTATION_PLAN.md §5 (Screen 07 · Handoff), §6 M5.
 *
 * v0 scope (bo-163):
 *   - Read the active route via `useRoute` and require `route.kind === 'handoff'`.
 *     The handoff route is `#/b/:boardId/handoff/:briefId`, so we resolve the
 *     brief through `useBriefSync({ briefId })`. (`BriefScreen` keys off
 *     `ideaId`; this screen keys off `briefId` per the route shape.)
 *   - Render a header summary: title + ship-status pill, mirroring the look of
 *     `BriefScreen` for visual continuity.
 *   - Render a grid of "channel cards" — one per channel (GitHub, Notion,
 *     Linear, Slack). Each card shows the channel name + a placeholder action.
 *     Cards are intentionally inert in v0: clicking "Send" stubs out the
 *     handoff by flipping the brief's `shipStatus` to `'shipped'` and
 *     surfacing a placeholder reference inline. No real network calls.
 *
 * Out of scope (deferred to follow-up tasks):
 *   - Pre-ship LLM interrogator slot               → bo-164
 *     (`handoff/PreShipInterrogator.tsx`). A placeholder slot is left in the
 *     layout below; the interrogator mounts there once it lands.
 *   - GitHub channel formatter + adapter           → bo-165 (DONE)
 *   - Notion channel formatter + adapter           → bo-166 (DONE)
 *   - Linear channel formatter + adapter           → bo-167 (DONE)
 *   - Slack channel formatter + adapter            → bo-168 (DONE)
 *   - App.tsx route dispatch (rendering this screen on `route.kind === 'handoff'`)
 *     is left to bo-130 (BoardScreen refactor of App.tsx). This module is a
 *     self-contained named + default export so the dispatcher can choose
 *     either convention.
 */

export type HandoffChannelId = 'github' | 'notion' | 'linear' | 'slack';

interface HandoffChannelDescriptor {
  id: HandoffChannelId;
  name: string;
  blurb: string;
  /** Owner task once the real adapter lands (for the "Coming soon" badge). */
  owningTaskId: string;
}

const CHANNELS: ReadonlyArray<HandoffChannelDescriptor> = [
  {
    id: 'github',
    name: 'GitHub',
    blurb: 'Open an issue with the brief as the body.',
    owningTaskId: 'bo-165',
  },
  {
    id: 'notion',
    name: 'Notion',
    blurb: 'Append a new page to a chosen database.',
    owningTaskId: 'bo-166',
  },
  {
    id: 'linear',
    name: 'Linear',
    blurb: 'File a ticket with the brief summary.',
    owningTaskId: 'bo-167',
  },
  {
    id: 'slack',
    name: 'Slack',
    blurb: 'Post a digest to a chosen channel.',
    owningTaskId: 'bo-168',
  },
];

export interface HandoffScreenProps {
  /**
   * Optional escape hatch for tests / Storybook — bypass the route hook and
   * supply the input directly. Mirrors the convention in `BriefScreen` /
   * `MapScreen`.
   */
  briefIdOverride?: string;
  /** Optional escape hatch for tests — bypass IDB entirely. */
  briefOverride?: Brief | null;
  /**
   * Optional override hook fired when a placeholder channel "Send" is pressed.
   * Tests use this to assert routing without touching IDB. When absent, the
   * stub flips `shipStatus` to `'shipped'` via `useBriefSync.setShipStatus`.
   */
  onChannelSend?: (channelId: HandoffChannelId, brief: Brief) => void;
}

const ROOT_CLASS =
  'bo-handoff-screen relative flex min-h-screen flex-col gap-6 bg-slate-50 px-8 py-10 text-slate-900';
const HEADER_CLASS = 'flex flex-wrap items-start justify-between gap-4';
const HEADER_TEXT_CLASS = 'flex flex-col gap-1';
const TITLE_CLASS = 'text-2xl font-semibold tracking-tight';
const SUBTITLE_CLASS = 'text-sm text-slate-500';
const SECTION_HEADING_CLASS =
  'text-xs font-semibold uppercase tracking-wide text-slate-500';
const GRID_CLASS =
  'grid w-full grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4';
const CARD_CLASS =
  'flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm';
const CARD_NAME_CLASS = 'text-base font-semibold text-slate-900';
const CARD_BLURB_CLASS = 'text-sm text-slate-600';
const CARD_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
const CARD_BADGE_CLASS =
  'inline-flex w-fit items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200';
const CARD_REF_CLASS =
  'mt-1 truncate text-xs text-emerald-700';
const EMPTY_CLASS =
  'rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center text-sm text-slate-500';
const LOADING_CLASS = 'text-sm text-slate-500';
const ERROR_CLASS =
  'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700';
const STATUS_PILL_BASE_CLASS =
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium';

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

/** Best-effort, human-readable title pulled from the latest brief version. */
function deriveBriefTitle(brief: Brief | null): string {
  const v = latestVersion(brief);
  if (!v) return 'Brief';
  const md = v.artifactMd ?? '';
  // First markdown H1/H2 wins as a title; otherwise fall back to the
  // problemStatement on the embedded BriefState.
  const h1 = md.match(/^\s*#{1,2}\s+(.+?)\s*$/m);
  if (h1) return h1[1];
  const ps = v.briefState.problemStatement?.trim();
  if (ps) return ps.length > 80 ? `${ps.slice(0, 77)}…` : ps;
  return 'Brief';
}

export function HandoffScreen({
  briefIdOverride,
  briefOverride,
  onChannelSend,
}: HandoffScreenProps = {}): React.ReactElement {
  const [route] = useRoute();

  // Resolve the brief id: explicit override (tests) > route. We deliberately
  // require `kind === 'handoff'` from the route — App.tsx is the dispatcher
  // (bo-130) and any other route reaching this screen is a misuse.
  const briefIdFromRoute = route.kind === 'handoff' ? route.briefId : null;
  const briefId = briefIdOverride ?? briefIdFromRoute ?? null;

  const briefSync = useBriefSync(
    briefOverride !== undefined ? null : briefId !== null ? { briefId } : null,
  );

  // Tests can short-circuit the hook entirely with `briefOverride`.
  const brief: Brief | null =
    briefOverride !== undefined ? (briefOverride ?? null) : briefSync.brief;
  const isLoading = briefOverride !== undefined ? false : briefSync.isLoading;
  const notFound = briefOverride !== undefined ? briefOverride === null : briefSync.notFound;

  const title = useMemo(() => deriveBriefTitle(brief), [brief]);

  // Per-channel "send" state. Keyed by channel id; value is the adapter's
  // returned ref (a real-looking URL the user can click / copy). v0 adapters
  // return placeholder refs + log the formatted payload; M5+ swaps in OAuth
  // backed implementations without changing this surface.
  const [sentRefs, setSentRefs] = useState<Partial<Record<HandoffChannelId, string>>>({});

  // Adapter dispatch table. Keep the keys in lock-step with `HandoffChannelId`.
  // Each adapter returns `{ ref, payload }`; we only consume `ref` here — the
  // payload is logged inside the adapter for debug + manual paste.
  const adapters = useMemo(
    () => ({
      github: sendGithub,
      notion: sendNotion,
      linear: sendLinear,
      slack: sendSlack,
    }) satisfies Record<HandoffChannelId, (brief: Brief) => Promise<{ ref: string }>>,
    [],
  );

  const handleChannelSend = useCallback(
    async (channelId: HandoffChannelId): Promise<void> => {
      if (!brief) return;
      // Test seam: if a parent supplied `onChannelSend`, defer entirely to it
      // and skip both adapter dispatch and IDB writes. Mirrors BriefScreen.
      if (onChannelSend) {
        onChannelSend(channelId, brief);
        setSentRefs((prev) => ({ ...prev, [channelId]: `placeholder://${channelId}/${brief.id}` }));
        return;
      }
      try {
        const send = adapters[channelId];
        const { ref } = await send(brief);
        // Flip status to 'shipped' (idempotent) so the header pill reflects
        // reality. Skip when a `briefOverride` is in play (test/storybook).
        if (briefOverride === undefined && brief.shipStatus !== 'shipped') {
          await briefSync.setShipStatus('shipped');
        }
        setSentRefs((prev) => ({ ...prev, [channelId]: ref }));
      } catch {
        // Non-fatal: surface nothing — bo-164 interrogator owns proper error
        // UX. v0 stays silent rather than mis-implying a state.
      }
    },
    [adapters, brief, briefOverride, briefSync, onChannelSend],
  );

  // ---- Render branches ------------------------------------------------------

  if (route.kind !== 'handoff' && briefIdOverride === undefined && briefOverride === undefined) {
    return (
      <div className={ROOT_CLASS} aria-label="Handoff">
        <div className={ERROR_CLASS} role="alert">
          HandoffScreen mounted on a non-handoff route. Expected
          {' '}<code>route.kind === &apos;handoff&apos;</code>.
        </div>
      </div>
    );
  }

  if (briefId === null && briefOverride === undefined) {
    return (
      <div className={ROOT_CLASS} aria-label="Handoff">
        <div className={ERROR_CLASS} role="alert">
          No brief selected. Open a brief from the canvas, then ship from there.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={ROOT_CLASS} aria-label="Handoff">
        <div className={LOADING_CLASS} role="status">
          Loading brief…
        </div>
      </div>
    );
  }

  if (notFound || brief === null) {
    return (
      <div className={ROOT_CLASS} aria-label="Handoff">
        <header className={HEADER_CLASS}>
          <div className={HEADER_TEXT_CLASS}>
            <h1 className={TITLE_CLASS}>Handoff</h1>
            <p className={SUBTITLE_CLASS}>
              No brief found for this id.
            </p>
          </div>
        </header>
        <div className={EMPTY_CLASS}>
          Briefs come into existence when an idea graduates from the canvas.
          Ship-to channels light up once a brief is written.
        </div>
      </div>
    );
  }

  const status = brief.shipStatus;

  return (
    <div className={ROOT_CLASS} aria-label="Handoff">
      <header className={HEADER_CLASS}>
        <div className={HEADER_TEXT_CLASS}>
          <h1 className={TITLE_CLASS}>{title}</h1>
          <p className={SUBTITLE_CLASS}>
            Ship the brief to one or more channels. Pick where it should land.
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
        </div>
      </header>

      {/*
        Pre-ship interrogator (bo-164). Active personas re-read the latest
        brief version and post final critiques here before ship. The slot
        wrapper keeps the existing data-attribute hook for tests / parent
        layouts that key off it; the inner component owns its own styling.
      */}
      <section
        aria-label="Pre-ship interrogator"
        data-bo-interrogator-slot="true"
      >
        <HandoffInterrogator brief={brief} />
      </section>

      <section aria-label="Channels" className="flex flex-col gap-3">
        <h2 className={SECTION_HEADING_CLASS}>Channels</h2>
        <div className={GRID_CLASS}>
          {CHANNELS.map((channel) => {
            const sentRef = sentRefs[channel.id];
            const alreadySent = sentRef !== undefined;
            return (
              <article
                key={channel.id}
                className={CARD_CLASS}
                data-bo-channel-id={channel.id}
                aria-label={`${channel.name} channel`}
              >
                <header className="flex items-start justify-between gap-2">
                  <h3 className={CARD_NAME_CLASS}>{channel.name}</h3>
                  <span className={CARD_BADGE_CLASS} title={`Adapter wired in ${channel.owningTaskId}`}>
                    v0 adapter
                  </span>
                </header>
                <p className={CARD_BLURB_CLASS}>{channel.blurb}</p>
                <button
                  type="button"
                  className={CARD_BUTTON_CLASS}
                  onClick={() => { void handleChannelSend(channel.id); }}
                  disabled={status === 'archived' || alreadySent}
                  title={`Send via ${channel.name} (v0 adapter — placeholder ref, real payload logged).`}
                  aria-label={`Send to ${channel.name}`}
                >
                  {alreadySent ? 'Sent' : 'Send'}
                </button>
                {alreadySent ? (
                  <p className={CARD_REF_CLASS} title={sentRef}>
                    {sentRef}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default HandoffScreen;
