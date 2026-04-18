import { defaultPanelForIdea } from '../board/ideaFactory';
import type { ChangeSetRecord } from '../board/types';
import type { BoardId, Idea, IdeaGroup } from '../types';

export function getDisplacedGroup(
  ideaA: Idea,
  ideaB: Idea,
  targetGroupId: string,
): { groupId: string; ideaId: string } | null {
  if (ideaA.panel?.groupId && ideaA.panel.groupId !== targetGroupId) {
    return { groupId: ideaA.panel.groupId, ideaId: ideaA.id };
  }
  if (ideaB.panel?.groupId && ideaB.panel.groupId !== targetGroupId) {
    return { groupId: ideaB.panel.groupId, ideaId: ideaB.id };
  }
  return null;
}

export function setIdeaGroupId(idea: Idea, groupId: string | undefined, updatedAt: number): Idea {
  const panel = { ...(idea.panel ?? defaultPanelForIdea(idea)), groupId };
  if (idea.panel?.groupId === groupId) {
    return idea;
  }
  return {
    ...idea,
    panel,
    updatedAt,
  };
}

export function removeIdeaFromGroupRecord(
  group: IdeaGroup,
  ideaId: string,
  updatedAt: number,
): IdeaGroup | undefined {
  const ideaIds = group.ideaIds.filter(id => id !== ideaId);
  if (ideaIds.length === 0) return undefined;
  if (sameIds(group.ideaIds, ideaIds)) return group;
  return {
    ...group,
    ideaIds,
    updatedAt,
  };
}

export function createGroupRecord(
  boardId: BoardId,
  groupId: string,
  ideaIds: string[],
  now: number,
): IdeaGroup {
  return {
    id: groupId,
    boardId,
    ideaIds: uniqueIds(ideaIds),
    createdAt: now,
    updatedAt: now,
  };
}

export async function writeGroupRecord(
  groupsStore: any,
  group: IdeaGroup | undefined,
  previousId?: string,
): Promise<void> {
  if (!group) {
    if (previousId) {
      await groupsStore.delete(previousId);
    }
    return;
  }
  await groupsStore.put(group);
}

export function createChangeSet(input: Omit<ChangeSetRecord, 'id' | 'status'>): ChangeSetRecord {
  return {
    ...input,
    id: crypto.randomUUID(),
    status: 'committed',
  };
}

export function flattenPatches(
  patches: Array<{ forward: ChangeSetRecord['forward']; inverse: ChangeSetRecord['inverse'] }>,
  direction: 'forward' | 'inverse',
) {
  return patches.flatMap(entry => entry[direction]);
}

export function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
