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
 * Screen 07 · Handoff (paper-dots restyle).
 *
 * Spec: Design/Build Spec.html §s07, Design/IMPLEMENTATION_PLAN.md §5 / §6 M5.
 *
 * Behavior:
 *   - Read the active route via `useRoute` and require `route.kind === 'handoff'`.
 *     The handoff route is `#/b/:boardId/handoff/:briefId`, so we resolve the
 *     brief through `useBriefSync({ briefId })`.
 *   - Render a hand-written header: brief title + ship-status pill, in the
 *     same paper-dots idiom as `BriefScreen` for visual continuity.
 *   - Render a grid of paper-tile "channel cards" — one per channel
 *     (GitHub, Notion, Linear, Slack). Each tile shows an inline-SVG ink
 *     icon, channel name in Caveat, blurb in Kalam, and a `.btn.primary`
 *     Send button. Adapters are stubs (placeholder refs + logged payload).
 *   - Pre-flight check (Build Spec §s07): a pure derivation over the latest
 *     `Brief` version flags missing fields per channel (no owner, no
 *     estimate, missing must-stay-true content, empty artifactMd, TL;DR
 *     overflow). Warnings render inline as red ".tag" pills before Send.
 *   - Per-channel inline "Connect <channel>" CTA: when a channel is not
 *     connected, the Send button is replaced with a Connect button that
 *     toggles local component state. No separate settings page.
 *   - Idempotent re-ship: per-channel sent-ref state. Once a ref exists,
 *     the Send button relabels to "Re-ship (update)" and dispatches with
 *     an `existingRef` hint so future adapters can update in place. The
 *     same ref is reused (no duplication) and the inline status reads
 *     "Updated existing destination".
 *
 * Out of scope (deferred):
 *   - Real per-channel credential storage (currently `useState`).
 *   - Real adapter `existingRef` support — adapters today ignore the hint
 *     and return placeholder refs; the screen surfaces an "Updated"
 *     status by detecting that a prior ref already existed.
 *   - LLM-driven pre-flight interrogator (bo-164) — the static
 *     interrogator slot below stays as the long-form critique surface.
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

// ---- Paper-style layout primitives ----------------------------------------

const ROOT_STYLE: React.CSSProperties = {
  minHeight: '100vh',
  maxHeight: '100vh',
  overflowY: 'auto',
  padding: '32px 28px',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  color: 'var(--ink)',
};

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
};

const HEADER_TEXT_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const TITLE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand)',
  fontSize: 40,
  lineHeight: 1.05,
  margin: 0,
  color: 'var(--ink)',
};

const SUBTITLE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 16,
  color: 'var(--ink-soft, var(--ink))',
  opacity: 0.78,
  margin: 0,
};

const SECTION_HEADING_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand)',
  fontSize: 24,
  margin: '4px 0 0',
  color: 'var(--ink)',
};

const SECTION_BODY_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const GRID_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: 16,
  width: '100%',
};

const TILE_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '16px 16px 18px',
  border: '1.5px solid var(--ink)',
  borderRadius: 14,
  background: 'var(--paper, #fdfbf3)',
  boxShadow: '2px 3px 0 rgba(0,0,0,0.06)',
};

const TILE_HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};

const TILE_NAME_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const TILE_NAME_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand)',
  fontSize: 22,
  color: 'var(--ink)',
  margin: 0,
};

const TILE_BLURB_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 15,
  color: 'var(--ink-soft, var(--ink))',
  opacity: 0.85,
  margin: 0,
  lineHeight: 1.35,
};

const TILE_REF_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 12,
  color: 'var(--ink)',
  opacity: 0.75,
  margin: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const PREFLIGHT_WRAP_STYLE: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  margin: 0,
};

const PREFLIGHT_PILL_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontFamily: 'var(--f-hand-body)',
  fontSize: 12,
  lineHeight: 1.15,
  padding: '2px 8px',
  borderRadius: 999,
  border: '1.5px solid var(--accent-contradicts, #c94a3a)',
  color: 'var(--accent-contradicts, #c94a3a)',
  background: 'var(--paper, #fdfbf3)',
};

const SHIP_NOTE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 12,
  color: 'var(--ink)',
  opacity: 0.7,
  margin: 0,
};

const EMPTY_STYLE: React.CSSProperties = {
  padding: '40px 24px',
  border: '1.5px dashed var(--ink)',
  borderRadius: 14,
  background: 'var(--paper, #fdfbf3)',
  textAlign: 'center',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 16,
  color: 'var(--ink)',
  opacity: 0.85,
};

const LOADING_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 16,
  color: 'var(--ink)',
  opacity: 0.7,
};

const ERROR_STYLE: React.CSSProperties = {
  padding: '12px 16px',
  border: '1.5px solid var(--ink)',
  borderRadius: 12,
  background: 'var(--sticky-pink, #fcdcdc)',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 15,
  color: 'var(--ink)',
};

const STATUS_PILL_BG: Record<BriefShipStatus, string> = {
  draft: 'var(--paper, #fdfbf3)',
  ready: 'var(--sticky-green, #d6ecc4)',
  shipped: 'var(--sticky-blue, #c9dcf5)',
  archived: 'var(--sticky-grey, #dedede)',
};

const STATUS_PILL_LABEL: Record<BriefShipStatus, string> = {
  draft: 'Draft',
  ready: 'Ready to ship',
  shipped: 'Shipped',
  archived: 'Archived',
};

function statusPillStyle(status: BriefShipStatus): React.CSSProperties {
  return {
    background: STATUS_PILL_BG[status],
    border: '1.5px solid var(--ink)',
    color: 'var(--ink)',
    fontFamily: 'var(--f-hand)',
    fontSize: 16,
    padding: '4px 12px',
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    lineHeight: 1.2,
  };
}

// ---- Inline channel icons (small, generic, ink-stroked) -------------------

function ChannelIcon({ id }: { id: HandoffChannelId }): React.ReactElement {
  const stroke = 'var(--ink, #14110f)';
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (id) {
    case 'github':
      // Generic octocat-ish: circle head + two ears + tail
      return (
        <svg {...common}>
          <circle cx="12" cy="11" r="6.5" />
          <path d="M7.5 5.5 L8.5 8" />
          <path d="M16.5 5.5 L15.5 8" />
          <path d="M9.5 19 C 9.5 16, 14.5 16, 14.5 19" />
          <circle cx="10" cy="11" r="0.8" fill={stroke} />
          <circle cx="14" cy="11" r="0.8" fill={stroke} />
        </svg>
      );
    case 'notion':
      // Generic doc with corner fold + lines
      return (
        <svg {...common}>
          <path d="M6 4 H15 L18 7 V20 H6 Z" />
          <path d="M15 4 V7 H18" />
          <path d="M8.5 11 H15.5" />
          <path d="M8.5 14 H15.5" />
          <path d="M8.5 17 H13" />
        </svg>
      );
    case 'linear':
      // Generic angled lines (linear-ish chevron)
      return (
        <svg {...common}>
          <path d="M4 14 L10 8 L14 12 L20 6" />
          <path d="M14 6 H20 V12" />
        </svg>
      );
    case 'slack':
      // Generic chat bubble with dots
      return (
        <svg {...common}>
          <path d="M5 7 Q5 4, 8 4 H16 Q19 4, 19 7 V14 Q19 17, 16 17 H11 L7 20 V17 Q5 17, 5 14 Z" />
          <circle cx="10" cy="10.5" r="0.8" fill={stroke} />
          <circle cx="13" cy="10.5" r="0.8" fill={stroke} />
          <circle cx="16" cy="10.5" r="0.8" fill={stroke} />
        </svg>
      );
  }
}

/** Latest version of a brief, or `null` when none exist yet. */
function latestVersion(brief: Brief | null): BriefVersion | null {
  if (!brief || brief.versions.length === 0) return null;
  return brief.versions[brief.versions.length - 1];
}

/**
 * Pre-flight: pure derivation of "missing field" warnings per channel.
 *
 * Build Spec §s07 calls out: "AI flags missing fields per channel (no owner,
 * no estimate, etc)". This is a deterministic, no-LLM probe over the latest
 * `Brief` version so the tile can self-warn before Send. Adapters may also
 * surface their own validation downstream — these checks are advisory.
 *
 * Probes (per channel):
 *   linear  · owner attribution missing  (`authoredBy` empty + no
 *             owner-bearing field on briefState)
 *   linear  · no estimate field          (briefState has no `estimate`-shaped
 *             metadata; today there's no canonical slot, so always warns)
 *   github  · "Must stay true" empty     (GH formatter renders a checkbox
 *             list from `mustStayTrueRules`; empty → no actionable content)
 *   notion  · empty artifactMd           (Notion adapter pages the rendered
 *             markdown; empty → empty page)
 *   slack   · TL;DR > 3 sentences        (Slack digest expects a 1-3
 *             sentence lede; sentence-split `problemStatement`)
 */
function derivePreflightWarnings(
  brief: Brief,
): Record<HandoffChannelId, string[]> {
  const out: Record<HandoffChannelId, string[]> = {
    github: [],
    notion: [],
    linear: [],
    slack: [],
  };
  const v = latestVersion(brief);
  if (!v) return out;
  const state = v.briefState;

  // ---- linear: owner + estimate ----
  // BriefState has no canonical `owner` field today. We treat `authoredBy`
  // on the version as a soft owner signal (persona / role attribution).
  const ownerSignal = (v.authoredBy ?? '').trim();
  const briefStateRecord = state as unknown as Record<string, unknown>;
  const ownerOnState =
    typeof briefStateRecord.owner === 'string'
      ? (briefStateRecord.owner as string).trim()
      : '';
  if (!ownerSignal && !ownerOnState) {
    out.linear.push('no owner assigned');
  }
  const estimate = briefStateRecord.estimate;
  const hasEstimate =
    (typeof estimate === 'string' && estimate.trim().length > 0) ||
    (typeof estimate === 'number' && Number.isFinite(estimate));
  if (!hasEstimate) {
    out.linear.push('no estimate');
  }

  // ---- github: Must stay true content ----
  if (!state.mustStayTrueRules || state.mustStayTrueRules.length === 0) {
    out.github.push('no "Must stay true" rules');
  }

  // ---- notion: artifact markdown ----
  if (!v.artifactMd || v.artifactMd.trim().length === 0) {
    out.notion.push('artifact markdown is empty');
  }

  // ---- slack: TL;DR length ----
  // Heuristic: sentence-split the problemStatement (or fall back to the
  // first non-empty narrative field). Warn if more than 3 sentences.
  const lede =
    (state.problemStatement ?? '').trim() ||
    (state.desiredOutcome ?? '').trim() ||
    (state.audience ?? '').trim();
  if (lede) {
    const sentences = lede
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (sentences.length > 3) {
      out.slack.push('TL;DR longer than 3 sentences');
    }
  }

  return out;
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

  // Track whether the most recent send for a channel was an update (re-ship)
  // rather than a first ship. Used to swap the inline status copy from
  // "Shipped" → "Updated existing destination" without losing the prior ref.
  const [reshipped, setReshipped] = useState<Partial<Record<HandoffChannelId, boolean>>>({});

  // Per-channel connection state. Real channel-credential storage is
  // deferred (no existing helper exists in src/storage/ — settings.ts holds
  // LLM-provider credentials only). For v1 we keep a local map; when real
  // OAuth lands, swap this for a persisted lookup without touching the
  // tile contract below.
  const [connected, setConnected] = useState<Record<HandoffChannelId, boolean>>({
    github: false,
    notion: false,
    linear: false,
    slack: false,
  });

  const preflight = useMemo<Record<HandoffChannelId, string[]>>(
    () =>
      brief
        ? derivePreflightWarnings(brief)
        : { github: [], notion: [], linear: [], slack: [] },
    [brief],
  );

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
      const existingRef = sentRefs[channelId];
      // Test seam: if a parent supplied `onChannelSend`, defer entirely to it
      // and skip both adapter dispatch and IDB writes. Mirrors BriefScreen.
      if (onChannelSend) {
        onChannelSend(channelId, brief);
        setSentRefs((prev) => ({
          ...prev,
          // Re-ship reuses the existing ref to stay idempotent.
          [channelId]:
            existingRef ?? `placeholder://${channelId}/${brief.id}`,
        }));
        setReshipped((prev) => ({ ...prev, [channelId]: Boolean(existingRef) }));
        return;
      }
      try {
        const send = adapters[channelId];
        // Adapters today take only `brief` and return a fresh placeholder
        // ref. When a prior ref exists, we still dispatch (so the
        // formatted payload is re-rendered + logged), but we *reuse* the
        // prior ref in state so the destination is not duplicated. Real
        // `existingRef` support — i.e. an in-place update via the
        // platform API — is owned by the per-channel adapter task.
        const { ref } = await send(brief);
        if (briefOverride === undefined && brief.shipStatus !== 'shipped') {
          await briefSync.setShipStatus('shipped');
        }
        setSentRefs((prev) => ({
          ...prev,
          [channelId]: existingRef ?? ref,
        }));
        setReshipped((prev) => ({ ...prev, [channelId]: Boolean(existingRef) }));
      } catch {
        // Non-fatal: surface nothing — bo-164 interrogator owns proper error
        // UX. v0 stays silent rather than mis-implying a state.
      }
    },
    [adapters, brief, briefOverride, briefSync, onChannelSend, sentRefs],
  );

  const handleChannelConnect = useCallback((channelId: HandoffChannelId): void => {
    // Stub: real implementation will trigger an OAuth dance and persist
    // tokens through a dedicated channel-credentials storage helper
    // (deferred). Today we just flip local state so the Send button
    // unlocks.
    setConnected((prev) => ({ ...prev, [channelId]: true }));
  }, []);

  // ---- Render branches ------------------------------------------------------

  if (route.kind !== 'handoff' && briefIdOverride === undefined && briefOverride === undefined) {
    return (
      <div className="paper-dots bo-handoff-screen" style={ROOT_STYLE} aria-label="Handoff">
        <div style={ERROR_STYLE} role="alert">
          HandoffScreen mounted on a non-handoff route. Expected
          {' '}<code>route.kind === &apos;handoff&apos;</code>.
        </div>
      </div>
    );
  }

  if (briefId === null && briefOverride === undefined) {
    return (
      <div className="paper-dots bo-handoff-screen" style={ROOT_STYLE} aria-label="Handoff">
        <div style={ERROR_STYLE} role="alert">
          No brief selected. Open a brief from the canvas, then ship from there.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="paper-dots bo-handoff-screen" style={ROOT_STYLE} aria-label="Handoff">
        <div style={LOADING_STYLE} role="status">
          Loading brief…
        </div>
      </div>
    );
  }

  if (notFound || brief === null) {
    return (
      <div className="paper-dots bo-handoff-screen" style={ROOT_STYLE} aria-label="Handoff">
        <header style={HEADER_STYLE}>
          <div style={HEADER_TEXT_STYLE}>
            <h1 style={TITLE_STYLE}>Handoff</h1>
            <p style={SUBTITLE_STYLE}>No brief found for this id.</p>
          </div>
        </header>
        <div style={EMPTY_STYLE}>
          Briefs come into existence when an idea graduates from the canvas.
          Ship-to channels light up once a brief is written.
        </div>
      </div>
    );
  }

  const status = brief.shipStatus;

  return (
    <div className="paper-dots bo-handoff-screen" style={ROOT_STYLE} aria-label="Handoff">
      <header style={HEADER_STYLE}>
        <div style={HEADER_TEXT_STYLE}>
          <h1 style={TITLE_STYLE}>{title}</h1>
          <p style={SUBTITLE_STYLE}>
            Ship the brief to one or more channels. Pick where it should land.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <span
            className="pill"
            style={statusPillStyle(status)}
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
        style={SECTION_BODY_STYLE}
      >
        <h2 style={SECTION_HEADING_STYLE}>Pre-ship interrogator</h2>
        <HandoffInterrogator brief={brief} />
      </section>

      <section aria-label="Channels" style={SECTION_BODY_STYLE}>
        <h2 style={SECTION_HEADING_STYLE}>Channels</h2>
        <div style={GRID_STYLE}>
          {CHANNELS.map((channel) => {
            const sentRef = sentRefs[channel.id];
            const alreadySent = sentRef !== undefined;
            const wasReshipped = Boolean(reshipped[channel.id]);
            const isConnected = connected[channel.id];
            const warnings = preflight[channel.id];
            const archived = status === 'archived';
            // We allow Send when there's no prior ref OR there is one and
            // the user wants to update in place (re-ship). Archived briefs
            // remain locked.
            const sendDisabled = archived;
            const sendLabel = alreadySent ? 'Re-ship (update)' : 'Send';
            const sendTitle = alreadySent
              ? `Re-ship to ${channel.name}: updates the existing destination in place (no duplicate).`
              : `Send via ${channel.name} (v0 adapter — placeholder ref, real payload logged).`;
            return (
              <article
                key={channel.id}
                className="board-card"
                style={TILE_STYLE}
                data-bo-channel-id={channel.id}
                data-bo-connected={isConnected ? 'true' : 'false'}
                data-bo-sent={alreadySent ? 'true' : 'false'}
                aria-label={`${channel.name} channel`}
              >
                <header style={TILE_HEADER_STYLE}>
                  <div style={TILE_NAME_ROW_STYLE}>
                    <ChannelIcon id={channel.id} />
                    <h3 style={TILE_NAME_STYLE}>{channel.name}</h3>
                  </div>
                  <span
                    className="tag"
                    title={`Adapter wired in ${channel.owningTaskId}`}
                    style={{ fontFamily: 'var(--f-mono)', fontSize: 11 }}
                  >
                    {channel.owningTaskId}
                  </span>
                </header>
                <p style={TILE_BLURB_STYLE}>{channel.blurb}</p>
                {warnings.length > 0 ? (
                  <ul
                    style={PREFLIGHT_WRAP_STYLE}
                    aria-label={`Pre-flight warnings for ${channel.name}`}
                    data-bo-preflight={channel.id}
                  >
                    {warnings.map((w) => (
                      <li
                        key={w}
                        className="tag"
                        style={PREFLIGHT_PILL_STYLE}
                        role="note"
                      >
                        <span aria-hidden="true">⚠</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {isConnected ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignSelf: 'flex-start' }}>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => { void handleChannelSend(channel.id); }}
                      disabled={sendDisabled}
                      title={sendTitle}
                      aria-label={`${sendLabel} to ${channel.name}`}
                      data-bo-send={channel.id}
                      style={{
                        opacity: sendDisabled ? 0.55 : 1,
                        cursor: sendDisabled ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {sendLabel}
                    </button>
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                      Demo connection · no real auth
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => { handleChannelConnect(channel.id); }}
                    title={`Demo-only: simulates a ${channel.name} connection. Real OAuth + token storage deferred.`}
                    aria-label={`Connect ${channel.name} (demo)`}
                    data-bo-connect={channel.id}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    Connect {channel.name} <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, opacity: 0.7, marginLeft: 6 }}>(demo)</span>
                  </button>
                )}
                {alreadySent ? (
                  <>
                    <p style={SHIP_NOTE_STYLE}>
                      {wasReshipped ? 'Updated existing destination' : 'Shipped'}
                    </p>
                    <p style={TILE_REF_STYLE} title={sentRef}>
                      {sentRef}
                    </p>
                  </>
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
