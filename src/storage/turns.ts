import { DEFAULT_BOARD_ID, type IdeaTurnRecord } from '../board/types';
import type { BoardId, LlmMessage } from '../types';
import { getDb } from './db';

export interface TurnLogPage {
  entries: LlmMessage[];
  nextCursor: string | null;
  totalTurns: number;
}

function toTurnMessage(turn: IdeaTurnRecord): LlmMessage {
  return {
    role: turn.role,
    content: turn.content,
  };
}

async function listTurnRecords(boardId: BoardId, ideaId: string): Promise<IdeaTurnRecord[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('turns', 'byIdeaId', ideaId);
  return rows
    .filter(row => row.boardId === boardId)
    .sort((a, b) => a.sequence - b.sequence);
}

export async function listTurnsForIdea(boardId: BoardId = DEFAULT_BOARD_ID, ideaId: string): Promise<LlmMessage[]> {
  const rows = await listTurnRecords(boardId, ideaId);
  return rows.map(toTurnMessage);
}

export async function countTurnsForIdea(boardId: BoardId = DEFAULT_BOARD_ID, ideaId: string): Promise<number> {
  const rows = await listTurnRecords(boardId, ideaId);
  return rows.length;
}

export async function syncTurnsForIdea(
  boardId: BoardId = DEFAULT_BOARD_ID,
  ideaId: string,
  turnLog: LlmMessage[],
  lastTurnAt = Date.now(),
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('turns', 'readwrite');
  const existing = await tx.store.index('byIdeaId').getAll(ideaId);

  for (const row of existing) {
    if (row.boardId === boardId) {
      await tx.store.delete(row.id);
    }
  }

  const total = turnLog.length;
  for (let index = 0; index < total; index += 1) {
    const message = turnLog[index];
    const offset = total - index - 1;
    await tx.store.put({
      id: `${ideaId}:${index}`,
      boardId,
      ideaId,
      sequence: index,
      role: message.role,
      content: message.content,
      createdAt: lastTurnAt - offset,
    });
  }

  await tx.done;
}

export async function appendTurnRecord(
  boardId: BoardId = DEFAULT_BOARD_ID,
  ideaId: string,
  message: LlmMessage,
  createdAt = Date.now(),
): Promise<void> {
  const rows = await listTurnRecords(boardId, ideaId);
  const db = await getDb();
  await db.put('turns', {
    id: `${ideaId}:${rows.length}`,
    boardId,
    ideaId,
    sequence: rows.length,
    role: message.role,
    content: message.content,
    createdAt,
  });
}

export async function getTurnLogPageFromStore(
  boardId: BoardId = DEFAULT_BOARD_ID,
  ideaId: string,
  options: { cursor?: string; limit?: number } = {},
): Promise<TurnLogPage> {
  const entries = await listTurnsForIdea(boardId, ideaId);
  const start = Math.max(0, Number.parseInt(options.cursor ?? '0', 10) || 0);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const page = entries.slice(start, start + limit);
  const nextIndex = start + page.length;

  return {
    entries: page,
    nextCursor: nextIndex < entries.length ? String(nextIndex) : null,
    totalTurns: entries.length,
  };
}
