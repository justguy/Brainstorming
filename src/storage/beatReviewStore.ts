import type {
  BeatReviewCandidateRecord,
  BeatReviewItemRecord,
  BeatReviewSessionRecord,
} from '../board/types';
import type { BeatResult } from '../beats/types';
import type { BoardId } from '../types';
import { DEFAULT_BOARD_ID } from '../board/types';
import { getDb } from './db';
import { ensureBoardStorageBridge } from './migrationBridge';

type ReviewableBeatResult = BeatResult<'cluster'> | BeatResult<'summarise'>;

export async function listBeatReviewSessions(
  boardId: BoardId = DEFAULT_BOARD_ID,
  options: { status?: BeatReviewSessionRecord['status']; limit?: number } = {},
): Promise<BeatReviewSessionRecord[]> {
  await ensureBoardStorageBridge(boardId);
  const db = await getDb();
  const rows = await db.getAllFromIndex('beatReviewSessions', 'byBoardId', boardId);
  return rows
    .filter(session => (options.status ? session.status === options.status : true))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, Math.max(1, options.limit ?? 50));
}

export async function listBeatReviewItems(
  boardId: BoardId = DEFAULT_BOARD_ID,
  options: { sessionId?: string; status?: BeatReviewItemRecord['status'] } = {},
): Promise<BeatReviewItemRecord[]> {
  await ensureBoardStorageBridge(boardId);
  const db = await getDb();
  const rows = options.sessionId
    ? await db.getAllFromIndex('beatReviewItems', 'bySessionId', options.sessionId)
    : await db.getAllFromIndex('beatReviewItems', 'byBoardId', boardId);
  return rows
    .filter(item => item.boardId === boardId)
    .filter(item => (options.status ? item.status === options.status : true))
    .sort((left, right) => left.createdAt - right.createdAt);
}

export async function getBeatReviewSession(sessionId: string): Promise<BeatReviewSessionRecord | undefined> {
  const db = await getDb();
  return db.get('beatReviewSessions', sessionId);
}

export async function getBeatReviewItem(itemId: string): Promise<BeatReviewItemRecord | undefined> {
  const db = await getDb();
  return db.get('beatReviewItems', itemId);
}

export function buildBeatReviewRecords(
  boardId: BoardId,
  result: ReviewableBeatResult,
  now = Date.now(),
): { session: BeatReviewSessionRecord; items: BeatReviewItemRecord[] } {
  const sessionId = crypto.randomUUID();
  const itemCandidates = result.ok ? mapCandidates(result) : [];
  const items = itemCandidates.map((candidate, index) => ({
    id: crypto.randomUUID(),
    boardId,
    sessionId,
    beatRunId: result.meta.runId,
    beat: result.beat,
    status: 'pending' as const,
    candidate,
    createdAt: now + index,
    updatedAt: now + index,
  }));
  const count = items.length;
  const label = result.beat === 'cluster' ? 'Cluster review' : 'Summary review';
  const session: BeatReviewSessionRecord = {
    id: sessionId,
    boardId,
    beatRunId: result.meta.runId,
    beat: result.beat,
    roleId: result.meta.roleId,
    usedFallback: result.meta.usedFallback,
    trigger: result.meta.trigger,
    size: result.meta.size,
    focusIdeaId: result.meta.focusIdeaId,
    title: label,
    summary: count === 1 ? `1 candidate from ${label.toLowerCase()}.` : `${count} candidates from ${label.toLowerCase()}.`,
    status: count > 0 && items.some(item => item.status === 'pending') ? 'open' : 'resolved',
    itemIds: items.map(item => item.id),
    startedAt: result.meta.startedAt,
    finishedAt: result.meta.finishedAt,
    createdAt: now,
    updatedAt: now,
    resolvedAt: count > 0 ? undefined : now,
  };
  return { session, items };
}

function mapCandidates(result: ReviewableBeatResult): BeatReviewCandidateRecord[] {
  if (!result.ok) return [];

  if (result.beat === 'cluster') {
    return result.proposal.hints.map(hint => ({
      kind: 'cluster_hint',
      label: hint.theme,
      summary: hint.sharedQuestion,
      detail: `Theme: ${hint.theme}`,
      confidence: hint.confidence,
      affectedIdeaIds: [...hint.ideaIds],
      sources: [...hint.sources],
      payload: hint,
    }));
  }

  return result.proposal.summaries.map(summary => ({
    kind: 'summary',
    label: 'Board summary',
    summary: summary.summary,
    detail: summary.relatedIdeaIds.length > 0
      ? `Touches ${summary.relatedIdeaIds.length} related idea${summary.relatedIdeaIds.length === 1 ? '' : 's'}.`
      : 'No specific related ideas were called out.',
    confidence: summary.confidence,
    affectedIdeaIds: [...summary.relatedIdeaIds],
    sources: [...summary.sources],
    payload: summary,
  }));
}
