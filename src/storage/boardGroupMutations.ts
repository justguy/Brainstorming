import type { ChangeActor } from '../board/types';
import type { BoardId, IdeaGroup } from '../types';
import { createEntityPatches, hydrateBoardState, supersedeFutureChanges } from './boardJournal';
import {
  createChangeSet,
  createGroupRecord,
  flattenPatches,
  getDisplacedGroup,
  removeIdeaFromGroupRecord,
  sameIds,
  setIdeaGroupId,
  uniqueIds,
  writeGroupRecord,
} from './boardGroupMutationHelpers';
import { loadBoardDocument } from './boardDocument';
import { getBoardHistoryState } from './boardHistoryState';
import type { BoardCommitResult, BoardGroupCommitResult } from './boardControllerTypes';
import { ensureBoard } from './boards';
import { getDb } from './db';

export async function commitGroupIdeas(
  boardId: BoardId,
  input: { ideaIdA: string; ideaIdB: string; actor: ChangeActor },
): Promise<BoardGroupCommitResult> {
  if (input.ideaIdA === input.ideaIdB) {
    throw new Error('groupIdeas requires two distinct idea ids.');
  }

  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'ideas', 'groups', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const ideasStore = tx.objectStore('ideas');
  const groupsStore = tx.objectStore('groups');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const [ideaA, ideaB] = await Promise.all([
    ideasStore.get(input.ideaIdA),
    ideasStore.get(input.ideaIdB),
  ]);
  if (!ideaA || !ideaB) {
    throw new Error(`Ideas not found for grouping: ${input.ideaIdA}, ${input.ideaIdB}`);
  }

  const now = Date.now();
  const targetGroupId = ideaB.panel?.groupId ?? ideaA.panel?.groupId ?? crypto.randomUUID();
  const targetGroupBefore = await groupsStore.get(targetGroupId);
  const displaced = getDisplacedGroup(ideaA, ideaB, targetGroupId);
  const displacedGroupBefore = displaced ? await groupsStore.get(displaced.groupId) : undefined;
  const displacedIdeaId = displaced?.ideaId;

  const targetGroupIdeaIds = uniqueIds([...(targetGroupBefore?.ideaIds ?? []), ideaA.id, ideaB.id]);
  const targetGroupAfter = targetGroupBefore
    ? sameIds(targetGroupBefore.ideaIds, targetGroupIdeaIds)
      ? targetGroupBefore
      : {
          ...targetGroupBefore,
          ideaIds: targetGroupIdeaIds,
          updatedAt: now,
        }
    : createGroupRecord(boardId, targetGroupId, [ideaA.id, ideaB.id], now);

  const displacedGroupAfter = displacedGroupBefore
    ? removeIdeaFromGroupRecord(displacedGroupBefore, displacedIdeaId!, now)
    : undefined;

  const afterIdeaA = setIdeaGroupId(ideaA, targetGroupId, now);
  const afterIdeaB = setIdeaGroupId(ideaB, targetGroupId, now);

  const patches = [
    createEntityPatches('groups', targetGroupId, targetGroupBefore, targetGroupAfter),
    displacedGroupBefore
      ? createEntityPatches('groups', displacedGroupBefore.id, displacedGroupBefore, displacedGroupAfter)
      : { forward: [], inverse: [] },
    createEntityPatches('ideas', ideaA.id, ideaA, afterIdeaA),
    createEntityPatches('ideas', ideaB.id, ideaB, afterIdeaB),
  ];
  const hasChanges = patches.some(entry => entry.forward.length > 0);

  if (!hasChanges) {
    await tx.done;
    const document = await loadBoardDocument(boardId);
    return {
      document,
      history: await getBoardHistoryState(boardId),
      groupId: targetGroupId,
    };
  }

  const nextBoard = {
    ...currentBoard,
    updatedAt: now,
    changeCursor: currentBoard.nextChangeSeq,
    nextChangeSeq: currentBoard.nextChangeSeq + 1,
  };
  const boardPatches = createEntityPatches('boards', boardId, currentBoard, nextBoard);
  const changeSet = createChangeSet({
    boardId,
    seq: currentBoard.nextChangeSeq,
    baseSeq: currentBoard.changeCursor,
    actor: input.actor,
    kind: 'group_ideas',
    summary: `Grouped ideas ${ideaA.id} and ${ideaB.id}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'groups', id: targetGroupId },
      ...(displacedGroupBefore ? [{ store: 'groups' as const, id: displacedGroupBefore.id }] : []),
      { store: 'ideas', id: ideaA.id },
      { store: 'ideas', id: ideaB.id },
    ],
    forward: [...flattenPatches(patches, 'forward'), ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...flattenPatches(patches, 'inverse')],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await ideasStore.put(afterIdeaA);
  await ideasStore.put(afterIdeaB);
  await writeGroupRecord(groupsStore, targetGroupAfter);
  await writeGroupRecord(groupsStore, displacedGroupAfter, displacedGroupBefore?.id);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  const document = await loadBoardDocument(boardId);
  return { document, history: await getBoardHistoryState(boardId), changeSet, groupId: targetGroupId };
}

export async function commitUngroupIdea(
  boardId: BoardId,
  input: { ideaId: string; actor: ChangeActor },
): Promise<BoardCommitResult> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'ideas', 'groups', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const ideasStore = tx.objectStore('ideas');
  const groupsStore = tx.objectStore('groups');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const idea = await ideasStore.get(input.ideaId);
  if (!idea) throw new Error(`Idea not found: ${input.ideaId}`);
  const groupId = idea.panel?.groupId;
  if (!groupId) {
    await tx.done;
    const document = await loadBoardDocument(boardId);
    return { document, history: await getBoardHistoryState(boardId) };
  }

  const groupBefore = await groupsStore.get(groupId);
  const afterIdea = setIdeaGroupId(idea, undefined, Date.now());
  const afterGroup = groupBefore ? removeIdeaFromGroupRecord(groupBefore, idea.id, afterIdea.updatedAt) : undefined;
  const ideaPatches = createEntityPatches('ideas', idea.id, idea, afterIdea);
  const groupPatches = createEntityPatches('groups', groupId, groupBefore, afterGroup);
  if (ideaPatches.forward.length === 0 && groupPatches.forward.length === 0) {
    await tx.done;
    const document = await loadBoardDocument(boardId);
    return { document, history: await getBoardHistoryState(boardId) };
  }

  const nextBoard = {
    ...currentBoard,
    updatedAt: afterIdea.updatedAt,
    changeCursor: currentBoard.nextChangeSeq,
    nextChangeSeq: currentBoard.nextChangeSeq + 1,
  };
  const boardPatches = createEntityPatches('boards', boardId, currentBoard, nextBoard);
  const changeSet = createChangeSet({
    boardId,
    seq: currentBoard.nextChangeSeq,
    baseSeq: currentBoard.changeCursor,
    actor: input.actor,
    kind: 'ungroup_idea',
    summary: `Ungrouped idea ${idea.id}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'ideas', id: idea.id },
      ...(groupBefore ? [{ store: 'groups' as const, id: groupBefore.id }] : []),
    ],
    forward: [...ideaPatches.forward, ...groupPatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...groupPatches.inverse, ...ideaPatches.inverse],
    committedAt: afterIdea.updatedAt,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await ideasStore.put(afterIdea);
  await writeGroupRecord(groupsStore, afterGroup, groupBefore?.id);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  const document = await loadBoardDocument(boardId);
  return { document, history: await getBoardHistoryState(boardId), changeSet };
}

export async function commitSetGroupTheme(
  boardId: BoardId,
  input: {
    groupId: string;
    theme?: string;
    sharedQuestion?: string;
    actor: ChangeActor;
  },
): Promise<BoardGroupCommitResult> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'groups', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const groupsStore = tx.objectStore('groups');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const groupBefore = await groupsStore.get(input.groupId);
  if (!groupBefore) throw new Error(`Group not found: ${input.groupId}`);

  const now = Date.now();
  const groupAfter: IdeaGroup =
    groupBefore.theme === input.theme && groupBefore.sharedQuestion === input.sharedQuestion
      ? groupBefore
      : {
          ...groupBefore,
          theme: input.theme,
          sharedQuestion: input.sharedQuestion,
          updatedAt: now,
        };
  const groupPatches = createEntityPatches('groups', input.groupId, groupBefore, groupAfter);
  if (groupPatches.forward.length === 0) {
    await tx.done;
    const document = await loadBoardDocument(boardId);
    return { document, history: await getBoardHistoryState(boardId), groupId: input.groupId };
  }

  const nextBoard = {
    ...currentBoard,
    updatedAt: now,
    changeCursor: currentBoard.nextChangeSeq,
    nextChangeSeq: currentBoard.nextChangeSeq + 1,
  };
  const boardPatches = createEntityPatches('boards', boardId, currentBoard, nextBoard);
  const changeSet = createChangeSet({
    boardId,
    seq: currentBoard.nextChangeSeq,
    baseSeq: currentBoard.changeCursor,
    actor: input.actor,
    kind: 'set_group_theme',
    summary: `Updated theme for group ${input.groupId}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'groups', id: input.groupId },
    ],
    forward: [...groupPatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...groupPatches.inverse],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await groupsStore.put(groupAfter);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  const document = await loadBoardDocument(boardId);
  return { document, history: await getBoardHistoryState(boardId), changeSet, groupId: input.groupId };
}
