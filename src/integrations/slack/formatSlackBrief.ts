/**
 * bo-168 · Slack channel formatter.
 *
 * Pure function: takes a `Brief` and returns a Slack `chat.postMessage`
 * payload — `text` fallback (for accessibility / push notifications) plus a
 * Block Kit `blocks` array (header + section paragraphs + section bullet
 * recap). Block shapes mirror Slack's API exactly so the adapter consumer can
 * pass the result straight to a future authenticated `chat.postMessage` call.
 *
 * Slack constraints honoured:
 *   - Header text ≤ 150 chars (we cap at 100 to leave headroom).
 *   - Section `text.text` ≤ 3000 chars (we trim long bodies).
 *   - We use the `mrkdwn` flavour (Slack's, not GitHub's): `*bold*` not `**`.
 */
import type { Brief, BriefState, BriefVersion } from '../../types';

export interface SlackHeaderBlock {
  type: 'header';
  text: { type: 'plain_text'; text: string; emoji?: boolean };
}

export interface SlackSectionBlock {
  type: 'section';
  text: { type: 'mrkdwn'; text: string };
}

export interface SlackContextBlock {
  type: 'context';
  elements: Array<{ type: 'mrkdwn'; text: string }>;
}

export interface SlackDividerBlock {
  type: 'divider';
}

export type SlackBlock =
  | SlackHeaderBlock
  | SlackSectionBlock
  | SlackContextBlock
  | SlackDividerBlock;

export interface SlackPostPayload {
  /** Plain-text fallback (push notifications, screen readers). */
  text: string;
  /** Block Kit blocks consumed as the `blocks` field on `chat.postMessage`. */
  blocks: SlackBlock[];
}

const HEADER_MAX = 100;
const SECTION_MAX = 2_900;
const FALLBACK_TITLE = 'Brief';

function latestVersion(brief: Brief): BriefVersion | null {
  if (brief.versions.length === 0) return null;
  return brief.versions[brief.versions.length - 1];
}

function deriveTitle(brief: Brief): string {
  const v = latestVersion(brief);
  if (!v) return FALLBACK_TITLE;
  const md = v.artifactMd ?? '';
  const heading = md.match(/^\s*#{1,2}\s+(.+?)\s*$/m);
  if (heading) return heading[1].trim();
  const ps = v.briefState.problemStatement?.trim();
  if (ps) return ps;
  return FALLBACK_TITLE;
}

function clamp(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function bulletList(items: ReadonlyArray<string>): string {
  return items
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => `• ${item}`)
    .join('\n');
}

function header(content: string): SlackHeaderBlock {
  return {
    type: 'header',
    text: { type: 'plain_text', text: clamp(content, HEADER_MAX), emoji: true },
  };
}

function section(content: string): SlackSectionBlock {
  return { type: 'section', text: { type: 'mrkdwn', text: clamp(content, SECTION_MAX) } };
}

function divider(): SlackDividerBlock {
  return { type: 'divider' };
}

function summarySectionsFromState(state: BriefState): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  if (state.problemStatement || state.audience || state.desiredOutcome) {
    const parts: string[] = [];
    if (state.problemStatement) parts.push(`*Problem:* ${state.problemStatement.trim()}`);
    if (state.audience) parts.push(`*Audience:* ${state.audience.trim()}`);
    if (state.desiredOutcome) parts.push(`*Desired outcome:* ${state.desiredOutcome.trim()}`);
    blocks.push(section(parts.join('\n')));
  }

  if (state.successCriteria.length > 0) {
    blocks.push(section(`*Success criteria*\n${bulletList(state.successCriteria)}`));
  }
  if (state.mustStayTrueRules.length > 0) {
    blocks.push(section(`*Must stay true*\n${bulletList(state.mustStayTrueRules)}`));
  }
  if (state.openQuestions.length > 0) {
    blocks.push(section(`*Open questions*\n${bulletList(state.openQuestions)}`));
  }
  if (state.risks.length > 0) {
    const lines = state.risks
      .map((r) => `• ${r.description.trim()} _(${r.likelihood}/${r.impact})_`)
      .join('\n');
    blocks.push(section(`*Risks*\n${lines}`));
  }
  return blocks;
}

export function formatSlackBrief(brief: Brief): SlackPostPayload {
  const v = latestVersion(brief);
  const title = deriveTitle(brief);
  const blocks: SlackBlock[] = [header(title)];

  if (v) {
    const summary = summarySectionsFromState(v.briefState);
    if (summary.length > 0) {
      blocks.push(...summary);
    } else if (v.artifactMd?.trim()) {
      // No structured fields populated, but artifact md exists — drop it in
      // verbatim as a single section. Slack mrkdwn isn't strict GitHub md but
      // bullets / *bold* / `code` survive the round-trip well enough for v0.
      blocks.push(section(v.artifactMd.trim()));
    } else {
      blocks.push(section('_No brief content yet._'));
    }
    blocks.push(divider(), {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Brief \`${brief.id}\` · v${v.seq} · ship status: \`${brief.shipStatus}\``,
        },
      ],
    });
  } else {
    blocks.push(section('_No brief content yet._'));
  }

  return {
    text: title,
    blocks,
  };
}
