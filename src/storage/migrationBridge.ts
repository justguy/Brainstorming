import { BOARD_DATA_VERSION, DEFAULT_BOARD_ID, type BoardRecord } from '../board/types';
import type {
  Connection,
  Idea,
  IdeaCritique,
  IdeaGroup,
  ScoutSuggestion,
  SupportingDoc,
} from '../types';
import { getDb } from './db';
import { ensureBoard, updateBoard } from './boards';
import { getBoardTweaks } from './tweaks';
import { syncTurnsForIdea } from './turns';

type BoardScopedEntity =
  | Connection
  | Idea
  | IdeaCritique
  | IdeaGroup
  | ScoutSuggestion
  | SupportingDoc;

const BOARD_SCOPED_STORES = [
  'ideas',
  'groups',
  'docs',
  'suggestions',
  'critiques',
  'connections',
] as const;

async function backfillStoreBoardIds(
  storeName: (typeof BOARD_SCOPED_STORES)[number],
  boardId: string,
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readwrite');
  const rows = await tx.store.getAll();

  for (const row of rows as BoardScopedEntity[]) {
    if (row.boardId) continue;
    await tx.store.put({ ...row, boardId });
  }

  await tx.done;
}

async function backfillAllBoardIds(boardId: string): Promise<void> {
  for (const storeName of BOARD_SCOPED_STORES) {
    await backfillStoreBoardIds(storeName, boardId);
  }
}

async function migrateLegacyTurnLogs(boardId: string): Promise<void> {
  const db = await getDb();
  const ideas = await db.getAll('ideas');

  for (const idea of ideas) {
    const turnLog = idea.turnLog ?? [];
    if (turnLog.length === 0) continue;
    await syncTurnsForIdea(boardId, idea.id, turnLog, idea.lastTurnAt ?? idea.updatedAt);
  }
}

export async function ensureBoardStorageBridge(boardId = DEFAULT_BOARD_ID): Promise<BoardRecord> {
  const board = await ensureBoard(boardId);
  if (board.dataVersion >= BOARD_DATA_VERSION) {
    await getBoardTweaks(boardId);
    return board;
  }

  await backfillAllBoardIds(boardId);
  await migrateLegacyTurnLogs(boardId);
  await getBoardTweaks(boardId);

  return updateBoard(boardId, { dataVersion: BOARD_DATA_VERSION });
}
