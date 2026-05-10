/**
 * bo-166 · Notion channel adapter.
 *
 * v0 contract: log the formatted page payload + return a placeholder ref. No
 * network calls; payload shape mirrors the Notion API so a future OAuth-backed
 * implementation can drop the formatter output straight into a `pages.create`
 * request body.
 */
import type { Brief } from '../../types';
import { formatNotionBrief, type NotionPagePayload } from './formatNotionBrief';

export interface NotionAdapterContext {
  /** Optional Notion database id — surfaced in the placeholder ref. */
  databaseId?: string;
  /** Test seam: replace the default `console.info` payload sink. */
  logger?: (label: string, payload: unknown) => void;
}

export interface NotionAdapterResult {
  ref: string;
  payload: NotionPagePayload;
}

const DEFAULT_DATABASE = 'example-database';

function fakePageSlug(briefId: string): string {
  // Deterministic 8-char alphanumeric slug derived from the brief id so the
  // placeholder ref is stable across runs (helps tests + manual debug).
  let h = 0;
  for (let i = 0; i < briefId.length; i += 1) h = (h * 31 + briefId.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).padStart(8, '0').slice(-8);
}

export async function sendNotion(
  brief: Brief,
  ctx: NotionAdapterContext = {},
): Promise<NotionAdapterResult> {
  const payload = formatNotionBrief(brief);
  const databaseId = ctx.databaseId ?? DEFAULT_DATABASE;
  const log = ctx.logger ?? ((label, p) => { console.info(label, p); });
  log('[notion-adapter] formatted page payload', { databaseId, payload });
  const ref = `https://www.notion.so/${databaseId}/${fakePageSlug(brief.id)}`;
  return { ref, payload };
}
