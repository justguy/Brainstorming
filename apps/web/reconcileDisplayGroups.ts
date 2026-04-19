import type { Idea, IdeaGroup } from '../../src/types';

export function reconcileDisplayGroups(ideas: Idea[], persistedGroups: IdeaGroup[]): IdeaGroup[] {
  const memberIdeasByGroupId = new Map<string, Idea[]>();
  for (const idea of ideas) {
    const groupId = idea.panel?.groupId;
    if (!groupId) continue;
    const members = memberIdeasByGroupId.get(groupId);
    if (members) {
      members.push(idea);
    } else {
      memberIdeasByGroupId.set(groupId, [idea]);
    }
  }

  const persistedGroupsById = new Map(persistedGroups.map(group => [group.id, group]));
  return [...memberIdeasByGroupId.entries()]
    .map(([groupId, memberIdeas]) => {
      const persistedGroup = persistedGroupsById.get(groupId);
      const memberIds = orderedMemberIds(
        memberIdeas.map(idea => idea.id),
        persistedGroup?.ideaIds ?? [],
      );

      return {
        id: groupId,
        boardId: persistedGroup?.boardId ?? memberIdeas.find(idea => idea.boardId)?.boardId,
        theme: persistedGroup?.theme,
        sharedQuestion: persistedGroup?.sharedQuestion,
        ideaIds: memberIds,
        createdAt: persistedGroup?.createdAt ?? Math.min(...memberIdeas.map(idea => idea.createdAt)),
        updatedAt: Math.max(persistedGroup?.updatedAt ?? 0, ...memberIdeas.map(idea => idea.updatedAt)),
      };
    })
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

function orderedMemberIds(memberIds: string[], persistedIds: string[]): string[] {
  const remainingIds = new Set(memberIds);
  const orderedIds = persistedIds.filter(id => {
    if (!remainingIds.has(id)) return false;
    remainingIds.delete(id);
    return true;
  });
  orderedIds.push(...memberIds.filter(id => remainingIds.has(id)));
  return orderedIds;
}
