import { DEFAULT_BOARD_ID } from '../board/types';
import type { BoardId, IdeaGroup } from '../types';
import { getDb } from './db';
import { ensureBoardStorageBridge } from './migrationBridge';

export async function listGroups(boardId: BoardId = DEFAULT_BOARD_ID): Promise<IdeaGroup[]> {
  await ensureBoardStorageBridge(boardId);
  const db = await getDb();
  const all = await db.getAllFromIndex('groups', 'byBoardId', boardId);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getGroup(id: string): Promise<IdeaGroup | undefined> {
  const db = await getDb();
  return db.get('groups', id);
}

export async function createGroup(
  ideaIds: string[],
  theme?: string,
  sharedQuestion?: string,
  boardId: BoardId = DEFAULT_BOARD_ID,
): Promise<IdeaGroup> {
  await ensureBoardStorageBridge(boardId);
  const now = Date.now();
  const group: IdeaGroup = {
    id: crypto.randomUUID(),
    boardId,
    ideaIds: [...new Set(ideaIds)],
    theme,
    sharedQuestion,
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDb();
  await db.put('groups', group);
  return group;
}

export async function updateGroup(id: string, patch: Partial<IdeaGroup>): Promise<IdeaGroup> {
  const db = await getDb();
  const current = await db.get('groups', id);
  if (!current) throw new Error(`Group not found: ${id}`);
  const updated: IdeaGroup = { ...current, ...patch, id, updatedAt: Date.now() };
  await db.put('groups', updated);
  return updated;
}

export async function deleteGroup(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('groups', id);
}

export async function addIdeaToGroup(groupId: string, ideaId: string): Promise<IdeaGroup> {
  const group = await getGroup(groupId);
  if (!group) throw new Error(`Group not found: ${groupId}`);
  if (group.ideaIds.includes(ideaId)) return group;
  return updateGroup(groupId, { ideaIds: [...group.ideaIds, ideaId] });
}

export async function removeIdeaFromGroup(groupId: string, ideaId: string): Promise<IdeaGroup | null> {
  const group = await getGroup(groupId);
  if (!group) return null;
  const nextIds = group.ideaIds.filter(id => id !== ideaId);
  if (nextIds.length === 0) {
    await deleteGroup(groupId);
    return null;
  }
  return updateGroup(groupId, { ideaIds: nextIds });
}
