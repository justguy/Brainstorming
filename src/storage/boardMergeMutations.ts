import { createCapturedIdea } from '../board/ideaFactory';
import type { ChangeActor } from '../board/types';
import type { BoardId, Idea, IdeaGroup } from '../types';
import { createEntityPatches, hydrateBoardState, supersedeFutureChanges } from './boardJournal';
import { loadBoardDocument } from './boardDocument';
import type { BoardMergeCommitResult } from './boardControllerTypes';
import { createChangeSet, removeIdeaFromGroupRecord, writeGroupRecord } from './boardGroupMutationHelpers';
import { getBoardHistoryState } from './boardHistoryState';
import { ensureBoard } from './boards';
import { getDb } from './db';
import { recordFacilitatorBoardMutation } from './facilitatorSync';
import { publishIdeaRows } from './ideaSync';

export async function commitMergeIdeas(
  boardId: BoardId,
  input: {
    draggedId: string;
    targetId: string;
    mergedRawText: string;
    mergedTags: string[];
    synthesisNotes: string;
    tensions: string[];
    actor: ChangeActor;
  },
): Promise<BoardMergeCommitResult> {
  if (input.draggedId === input.targetId) {
    throw new Error('mergeIdeas requires two distinct idea ids.');
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

  const [draggedIdea, targetIdea] = await Promise.all([
    ideasStore.get(input.draggedId),
    ideasStore.get(input.targetId),
  ]) as [Idea | undefined, Idea | undefined];
  if (!draggedIdea || !targetIdea) {
    throw new Error(`Ideas not found for merge: ${input.draggedId}, ${input.targetId}`);
  }

  const now = Date.now();
  const mergedIdea = createMergedIdea(boardId, draggedIdea, targetIdea, input, now);
  const archivedDragged = { ...draggedIdea, status: 'archived' as const, boardId, updatedAt: now };
  const archivedTarget = { ...targetIdea, status: 'archived' as const, boardId, updatedAt: now };

  const groupIds = [...new Set([draggedIdea.panel?.groupId, targetIdea.panel?.groupId].filter(Boolean))] as string[];
  const groupPairs = await Promise.all(
    groupIds.map(async groupId => {
      const before = await groupsStore.get(groupId);
      const after = before ? removeMergedIdeasFromGroup(before, draggedIdea, targetIdea, now) : undefined;
      return { before, after };
    }),
  );

  const patches = [
    createEntityPatches('ideas', mergedIdea.id, undefined, mergedIdea),
    createEntityPatches('ideas', draggedIdea.id, draggedIdea, archivedDragged),
    createEntityPatches('ideas', targetIdea.id, targetIdea, archivedTarget),
    ...groupPairs
      .filter((entry): entry is { before: IdeaGroup; after: IdeaGroup | undefined } => !!entry.before)
      .map(entry => createEntityPatches('groups', entry.before.id, entry.before, entry.after)),
  ];

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
    kind: 'merge_ideas',
    summary: `Merged ideas ${draggedIdea.id} and ${targetIdea.id} into ${mergedIdea.id}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'ideas', id: mergedIdea.id },
      { store: 'ideas', id: draggedIdea.id },
      { store: 'ideas', id: targetIdea.id },
      ...groupPairs
        .filter((entry): entry is { before: IdeaGroup; after: IdeaGroup | undefined } => !!entry.before)
        .map(entry => ({ store: 'groups' as const, id: entry.before.id })),
    ],
    forward: [...patches.flatMap(entry => entry.forward), ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...patches.flatMap(entry => entry.inverse)],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await ideasStore.put(mergedIdea);
  await ideasStore.put(archivedDragged);
  await ideasStore.put(archivedTarget);
  for (const entry of groupPairs) {
    await writeGroupRecord(groupsStore, entry.after, entry.before?.id);
  }
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;
  recordFacilitatorBoardMutation(boardId, {
    kind: 'idea',
    actorType: input.actor.type,
    at: now,
    entityId: mergedIdea.id,
    ideaId: mergedIdea.id,
    summary: `Merged ideas ${draggedIdea.id} and ${targetIdea.id}`,
  });
  await publishIdeaRows([mergedIdea, archivedDragged, archivedTarget], boardId);

  return {
    idea: mergedIdea,
    document: await loadBoardDocument(boardId),
    history: await getBoardHistoryState(boardId),
    changeSet,
  };
}

function createMergedIdea(
  boardId: BoardId,
  draggedIdea: Idea,
  targetIdea: Idea,
  input: {
    mergedRawText: string;
    mergedTags: string[];
    synthesisNotes: string;
    tensions: string[];
  },
  now: number,
): Idea {
  const targetPanel = targetIdea.panel ?? { x: 60, y: 60, width: 260, height: 180 };
  const base = createCapturedIdea({
    boardId,
    rawText: input.mergedRawText,
    tags: input.mergedTags,
    panel: { ...targetPanel, groupId: undefined },
  });
  return {
    ...base,
    boardId,
    createdAt: now,
    updatedAt: now,
    mergedFrom: [draggedIdea.id, targetIdea.id],
    briefState: {
      ...base.briefState,
      openQuestions: [
        ...(input.tensions.length > 0 ? [`Tensions: ${input.tensions.join(' | ')}`] : []),
        `Merge notes: ${input.synthesisNotes}`,
      ],
    },
  };
}

function removeMergedIdeasFromGroup(group: IdeaGroup, draggedIdea: Idea, targetIdea: Idea, now: number): IdeaGroup | undefined {
  let next = removeIdeaFromGroupRecord(group, draggedIdea.id, now);
  if (next && next.ideaIds.includes(targetIdea.id)) {
    next = removeIdeaFromGroupRecord(next, targetIdea.id, now);
  }
  return next;
}
