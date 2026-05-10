/**
 * bo-168 · Slack channel adapter.
 *
 * v0 contract: log the formatted Block Kit payload + return a placeholder ref.
 * No network calls; payload mirrors `chat.postMessage` so a future OAuth
 * implementation can pass the formatter output as the API request body.
 */
import type { Brief } from '../../types';
import { formatSlackBrief, type SlackPostPayload } from './formatSlackBrief';

export interface SlackAdapterContext {
  /** Optional channel name or ID — surfaced in the placeholder ref. */
  channel?: string;
  /** Test seam: replace the default `console.info` payload sink. */
  logger?: (label: string, payload: unknown) => void;
}

export interface SlackAdapterResult {
  ref: string;
  payload: SlackPostPayload;
}

const DEFAULT_CHANNEL = '#brainstorming';

function fakeMessageTs(briefId: string): string {
  // Slack message timestamps are `<seconds>.<microseconds>`; we synthesize a
  // deterministic one from the brief id so the placeholder ref is stable.
  let h = 0;
  for (let i = 0; i < briefId.length; i += 1) h = (h * 31 + briefId.charCodeAt(i)) | 0;
  const seconds = 1_700_000_000 + (Math.abs(h) % 9_000_000);
  const micros = (Math.abs(h) % 1_000_000).toString().padStart(6, '0');
  return `${seconds}.${micros}`;
}

export async function sendSlack(
  brief: Brief,
  ctx: SlackAdapterContext = {},
): Promise<SlackAdapterResult> {
  const payload = formatSlackBrief(brief);
  const channel = ctx.channel ?? DEFAULT_CHANNEL;
  const log = ctx.logger ?? ((label, p) => { console.info(label, p); });
  log('[slack-adapter] formatted post payload', { channel, payload });
  const ref = `https://example.slack.com/archives/${encodeURIComponent(channel)}/p${fakeMessageTs(brief.id).replace('.', '')}`;
  return { ref, payload };
}
