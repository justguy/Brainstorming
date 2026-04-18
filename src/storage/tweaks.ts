import { DEFAULT_BOARD_ID, type BoardTweaksRecord } from '../board/types';
import { getDb } from './db';

function makeTweaks(boardId = DEFAULT_BOARD_ID): BoardTweaksRecord {
  const now = Date.now();
  return {
    id: `tweaks:${boardId}`,
    boardId,
    values: {},
    createdAt: now,
    updatedAt: now,
  };
}

export async function getBoardTweaks(boardId = DEFAULT_BOARD_ID): Promise<BoardTweaksRecord> {
  const db = await getDb();
  const existing = await db.get('tweaks', `tweaks:${boardId}`);
  if (existing) return existing;

  const tweaks = makeTweaks(boardId);
  await db.put('tweaks', tweaks);
  return tweaks;
}

export async function updateBoardTweaks(
  boardId = DEFAULT_BOARD_ID,
  patch: Record<string, unknown>,
): Promise<BoardTweaksRecord> {
  const db = await getDb();
  const current = await getBoardTweaks(boardId);
  const updated: BoardTweaksRecord = {
    ...current,
    values: {
      ...current.values,
      ...patch,
    },
    updatedAt: Date.now(),
  };
  await db.put('tweaks', updated);
  return updated;
}
