/**
 * bo-165 · GitHub channel adapter.
 *
 * v0 contract: log the formatted payload + return a placeholder ref. No
 * network calls; the formatter output is real (useful for manual paste / debug)
 * and the adapter shape mirrors what a future OAuth-backed implementation will
 * expose. Real API writes ship in M5+ once channel auth lands in Options.
 */
import type { Brief } from '../../types';
import { formatGithubBrief, type GithubIssuePayload } from './formatGithubBrief';

export interface GithubAdapterContext {
  /** Optional repo override (e.g. "owner/repo") — surfaced in the placeholder ref. */
  repo?: string;
  /** Test seam: replace the default `console.info` payload sink. */
  logger?: (label: string, payload: unknown) => void;
}

export interface GithubAdapterResult {
  ref: string;
  payload: GithubIssuePayload;
}

const DEFAULT_REPO = 'example/repo';

function fakeIssueNumber(briefId: string): number {
  // Stable, non-cryptographic projection of the brief id into 1..999 so the
  // placeholder ref is deterministic across runs (helps tests + manual debug).
  let h = 0;
  for (let i = 0; i < briefId.length; i += 1) h = (h * 31 + briefId.charCodeAt(i)) | 0;
  return Math.abs(h) % 999 + 1;
}

export async function sendGithub(
  brief: Brief,
  ctx: GithubAdapterContext = {},
): Promise<GithubAdapterResult> {
  const payload = formatGithubBrief(brief);
  const repo = ctx.repo ?? DEFAULT_REPO;
  const log = ctx.logger ?? ((label, p) => { console.info(label, p); });
  log('[github-adapter] formatted issue payload', { repo, payload });
  const ref = `https://github.com/${repo}/issues/${fakeIssueNumber(brief.id)}`;
  return { ref, payload };
}
