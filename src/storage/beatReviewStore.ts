import type {
  BeatReviewCandidateRecord,
  BeatReviewItemRecord,
  BeatReviewSessionRecord,
} from '../board/types';
import type { BeatResult, BeatRunMeta } from '../beats/types';
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
  const provenance = buildRunProvenance(result.meta);
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
    provenance,
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
    pendingCount: count,
    keptCount: 0,
    scratchedCount: 0,
    proposalKeys: result.ok ? Object.keys(result.proposal) : [],
    rawProposal: result.ok ? result.proposal : undefined,
    provenance,
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
      affectedRefs: hint.ideaIds.map(id => ({
        kind: 'idea' as const,
        id,
        label: sourceLabel(hint.sources, 'idea', id),
      })),
      rawProposal: hint,
      payload: hint,
    }));
  }

  return result.proposal.summaries.flatMap(summary => {
    const sourceRefs = [...summary.sources];
    const affectedRefs = [
      ...summary.relatedIdeaIds.map(id => ({
        kind: 'idea' as const,
        id,
        label: sourceLabel(sourceRefs, 'idea', id),
      })),
      ...(summary.relatedGroupIds ?? []).map(id => ({
        kind: 'group' as const,
        id,
        label: sourceLabel(sourceRefs, 'group', id),
      })),
    ];
    const insight = {
      id: crypto.randomUUID(),
      text: summary.summary,
      sourceRefs,
      relatedGroupIds: summary.relatedGroupIds,
      beatRunId: result.meta.runId,
      createdAt: result.meta.finishedAt,
    };

    const candidates: BeatReviewCandidateRecord[] = [];
    if (summary.relatedIdeaIds.length > 0) {
      candidates.push({
        kind: 'idea_insight',
        label: `Attach takeaway to ${summary.relatedIdeaIds.length} idea${summary.relatedIdeaIds.length === 1 ? '' : 's'}`,
        summary: summary.summary,
        detail: buildSummaryDetail(summary.relatedIdeaIds, summary.relatedGroupIds ?? []),
        confidence: summary.confidence,
        affectedIdeaIds: [...summary.relatedIdeaIds],
        affectedStructureIds: [...(summary.relatedGroupIds ?? [])],
        sources: sourceRefs,
        affectedRefs,
        rawProposal: summary,
        payload: {
          summary: summary.summary,
          targetIdeaIds: [...summary.relatedIdeaIds],
          insight,
        },
      });
    }

    candidates.push({
      kind: 'idea_spawn',
      label: 'Create takeaway idea',
      summary: summary.summary,
      detail: 'Create a new sticky that preserves the takeaway with linked source refs.',
      confidence: summary.confidence,
      affectedIdeaIds: [...summary.relatedIdeaIds],
      affectedStructureIds: [...(summary.relatedGroupIds ?? [])],
      sources: sourceRefs,
      affectedRefs,
      rawProposal: summary,
      payload: {
        rawText: summary.summary,
        tags: ['ai-takeaway'],
        insights: [insight],
      },
    });

    return candidates;
  });
}

function sourceLabel(
  sources: BeatReviewCandidateRecord['sources'],
  kind: BeatReviewCandidateRecord['sources'][number]['kind'],
  id: string,
): string | undefined {
  return sources.find(source => source.kind === kind && source.id === id)?.label;
}

function truncateLabel(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function buildRunProvenance(meta: BeatRunMeta) {
  return {
    beatRunId: meta.runId,
    beat: meta.beat,
    roleId: meta.roleId,
    usedFallback: meta.usedFallback,
    trigger: meta.trigger,
    size: meta.size,
    startedAt: meta.startedAt,
    finishedAt: meta.finishedAt,
    focusIdeaId: meta.focusIdeaId,
  };
}

function buildSummaryDetail(ideaIds: string[], groupIds: string[]): string {
  if (ideaIds.length === 0 && groupIds.length === 0) {
    return 'No specific related ideas or groups were called out.';
  }
  if (groupIds.length === 0) {
    return `Touches ${ideaIds.length} related idea${ideaIds.length === 1 ? '' : 's'}.`;
  }
  if (ideaIds.length === 0) {
    return `Touches ${groupIds.length} related group${groupIds.length === 1 ? '' : 's'}.`;
  }
  return `Touches ${ideaIds.length} related idea${ideaIds.length === 1 ? '' : 's'} across ${groupIds.length} group${groupIds.length === 1 ? '' : 's'}.`;
}
