import { DEFAULT_BOARD_ID, type BeatRunRecord } from '../board/types';
import type { BeatName, BeatResult } from '../beats/types';
import type { BoardId } from '../types';
import { getDb } from './db';
import { ensureBoardStorageBridge } from './migrationBridge';

export async function listBeatRuns(
  boardId: BoardId = DEFAULT_BOARD_ID,
  options: { limit?: number } = {},
): Promise<BeatRunRecord[]> {
  await ensureBoardStorageBridge(boardId);
  const db = await getDb();
  const rows = await db.getAllFromIndex('beatRuns', 'byBoardId', boardId);
  return rows
    .sort((left, right) => right.finishedAt - left.finishedAt)
    .slice(0, Math.max(1, options.limit ?? 50));
}

export async function recordBeatRun<T extends BeatName>(
  boardId: BoardId = DEFAULT_BOARD_ID,
  result: BeatResult<T>,
): Promise<BeatRunRecord> {
  await ensureBoardStorageBridge(boardId);
  const db = await getDb();
  const record: BeatRunRecord = {
    id: result.meta.runId,
    boardId,
    beat: result.beat,
    roleId: result.meta.roleId,
    usedFallback: result.meta.usedFallback,
    startedAt: result.meta.startedAt,
    finishedAt: result.meta.finishedAt,
    trigger: result.meta.trigger,
    size: result.meta.size,
    focusIdeaId: result.meta.focusIdeaId,
    ok: result.ok,
    reason: result.ok ? undefined : result.reason,
    proposal: result.ok ? result.proposal : null,
  };
  await db.put('beatRuns', record);
  return record;
}
