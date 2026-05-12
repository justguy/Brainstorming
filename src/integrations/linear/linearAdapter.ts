/**
 * bo-167 · Linear channel adapter.
 *
 * v0 contract: log the formatted issue payload + return a placeholder ref. No
 * network calls; payload mirrors the shape of Linear's `IssueCreate` mutation
 * so a future OAuth-backed implementation can pass the formatter output as the
 * mutation input without remapping fields.
 */
import type { Brief } from '../../types';
import { formatLinearBrief, type LinearIssuePayload } from './formatLinearBrief';

export interface LinearAdapterContext {
  /** Optional Linear team key (e.g. "ENG") — surfaced in the placeholder ref. */
  teamKey?: string;
  /** Test seam: replace the default `console.info` payload sink. */
  logger?: (label: string, payload: unknown) => void;
}

export interface LinearAdapterResult {
  ref: string;
  payload: LinearIssuePayload;
}

const DEFAULT_TEAM = 'ENG';

function fakeIssueNumber(briefId: string): number {
  let h = 0;
  for (let i = 0; i < briefId.length; i += 1) h = (h * 31 + briefId.charCodeAt(i)) | 0;
  return Math.abs(h) % 9_999 + 1;
}

export async function sendLinear(
  brief: Brief,
  ctx: LinearAdapterContext = {},
): Promise<LinearAdapterResult> {
  const payload = formatLinearBrief(brief);
  const teamKey = ctx.teamKey ?? DEFAULT_TEAM;
  const log = ctx.logger ?? ((label, p) => { console.info(label, p); });
  log('[linear-adapter] formatted issue payload', { teamKey, payload });
  const ref = `https://linear.app/example/issue/${teamKey}-${fakeIssueNumber(brief.id)}`;
  return { ref, payload };
}
