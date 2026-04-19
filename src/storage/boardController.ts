import { createCapturedIdea } from '../board/ideaFactory';
import type { ChangeActor, ChangeSetKind, ChangeSetRecord } from '../board/types';
import type { BoardId, Idea } from '../types';
import { createEntityPatches, hydrateBoardState, supersedeFutureChanges } from './boardJournal';
import { listChangeSets } from './changeSets';
import { loadBoardDocument } from './boardDocument';
import { ensureBoard } from './boards';
import { getBoardHistoryState } from './boardHistoryState';
import { replayChangeSet } from './boardHistoryReplay';
import { commitMergeIdeas } from './boardMergeMutations';
import { commitGroupIdeas, commitSetGroupTheme, commitUngroupIdea } from './boardGroupMutations';
import { commitUpdateIdea } from './boardIdeaMutations';
import type { BoardCommitResult, BoardIdeaCommitResult } from './boardControllerTypes';
import { getDb } from './db';
import { publishIdeaRows } from './ideaSync';
import { commitDismissCritique, commitDismissSuggestion } from './boardOverlayMutations';
import { commitReplaceConnections } from './boardConnectionMutations';
import { commitCreateDoc, commitDeleteDoc, commitUpdateDoc } from './boardDocMutations';
import { commitUpdateTweaks } from './boardTweakMutations';
import {
  commitBeatReviewItemDecision,
  commitCreateBeatReviewSession,
} from './boardBeatReviewMutations';
import {
  commitAdmitSuggestion,
  commitCreateCritique,
  commitCreateSuggestion,
  commitElaborateSuggestion,
} from './boardGeneratedMutations';

export function createBoardController(boardId: BoardId) {
  return {
    boardId,
    captureIdea(input: { rawText: string; tags: string[]; actor: ChangeActor }) {
      return commitCapturedIdea(boardId, input);
    },
    moveIdeaPanel(input: { ideaId: string; x: number; y: number; actor: ChangeActor }) {
      return commitIdeaMutation(boardId, {
        kind: 'move_idea',
        actor: input.actor,
        summary: `Moved idea ${input.ideaId}`,
        ideaId: input.ideaId,
        mutate: idea => {
          const panel = {
            ...(idea.panel ?? { width: 260, height: 180 }),
            x: input.x,
            y: input.y,
            width: idea.panel?.width ?? 260,
            height: idea.panel?.height ?? 180,
            groupId: idea.panel?.groupId,
          };
          return { ...idea, panel };
        },
      });
    },
    discardIdea(input: { ideaId: string; actor: ChangeActor }) {
      return commitIdeaMutation(boardId, {
        kind: 'discard_idea',
        actor: input.actor,
        summary: `Discarded idea ${input.ideaId}`,
        ideaId: input.ideaId,
        mutate: idea => ({ ...idea, status: 'discarded' }),
      });
    },
    restoreIdea(input: { ideaId: string; actor: ChangeActor }) {
      return commitIdeaMutation(boardId, {
        kind: 'restore_idea',
        actor: input.actor,
        summary: `Restored idea ${input.ideaId}`,
        ideaId: input.ideaId,
        mutate: idea => ({ ...idea, status: 'captured' }),
      });
    },
    updateIdea(input: { ideaId: string; patch: Partial<Idea>; actor: ChangeActor; summary?: string }) {
      return commitUpdateIdea(boardId, input);
    },
    mergeIdeas(input: {
      draggedId: string;
      targetId: string;
      mergedRawText: string;
      mergedTags: string[];
      synthesisNotes: string;
      tensions: string[];
      actor: ChangeActor;
    }) {
      return commitMergeIdeas(boardId, input);
    },
    groupIdeas(input: { ideaIdA: string; ideaIdB: string; actor: ChangeActor }) {
      return commitGroupIdeas(boardId, input);
    },
    ungroupIdea(input: { ideaId: string; actor: ChangeActor }) {
      return commitUngroupIdea(boardId, input);
    },
    setGroupTheme(input: {
      groupId: string;
      theme?: string;
      sharedQuestion?: string;
      actor: ChangeActor;
    }) {
      return commitSetGroupTheme(boardId, input);
    },
    dismissCritique(input: { critiqueId: string; actor: ChangeActor }) {
      return commitDismissCritique(boardId, input);
    },
    dismissSuggestion(input: { suggestionId: string; actor: ChangeActor }) {
      return commitDismissSuggestion(boardId, input);
    },
    createCritique(input: { ideaId: string; critique: string; evidenceAsk: string; actor: ChangeActor }) {
      return commitCreateCritique(boardId, input);
    },
    createSuggestion(input: {
      rawText: string;
      rationale: string;
      source: string;
      relatedIdeaIds?: string[];
      panel?: import('../types').ScoutSuggestion['panel'];
      actor: ChangeActor;
    }) {
      return commitCreateSuggestion(boardId, input);
    },
    elaborateSuggestion(input: { suggestionId: string; elaboration: string; actor: ChangeActor }) {
      return commitElaborateSuggestion(boardId, input);
    },
    admitSuggestion(input: { suggestionId: string; actor: ChangeActor }) {
      return commitAdmitSuggestion(boardId, input);
    },
    createDoc(input: { ideaId: string; title: string; rawText: string; actor: ChangeActor }) {
      return commitCreateDoc(boardId, { ...input, boardId });
    },
    updateDoc(input: {
      docId: string;
      patch: Partial<Pick<import('../types').SupportingDoc, 'title' | 'rawText' | 'summary' | 'facts' | 'status' | 'error'>>;
      actor: ChangeActor;
      summary?: string;
    }) {
      return commitUpdateDoc(boardId, input);
    },
    deleteDoc(input: { docId: string; actor: ChangeActor }) {
      return commitDeleteDoc(boardId, input);
    },
    replaceConnections(input: { connections: import('../types').Connection[]; actor: ChangeActor; summary?: string }) {
      return commitReplaceConnections(boardId, input);
    },
    updateTweaks(input: { patch: Record<string, unknown>; actor: ChangeActor; summary?: string }) {
      return commitUpdateTweaks(boardId, input);
    },
    createBeatReviewSession(input: {
      result: import('../beats/types').BeatResult<'cluster'> | import('../beats/types').BeatResult<'summarise'>;
      actor: ChangeActor;
    }) {
      return commitCreateBeatReviewSession(boardId, input);
    },
    keepBeatReviewItem(input: { itemId: string; actor: ChangeActor }) {
      return commitBeatReviewItemDecision(boardId, { ...input, status: 'kept' });
    },
    scratchBeatReviewItem(input: { itemId: string; actor: ChangeActor }) {
      return commitBeatReviewItemDecision(boardId, { ...input, status: 'scratched' });
    },
    undo() {
      return replayChangeSet(boardId, 'undo');
    },
    redo() {
      return replayChangeSet(boardId, 'redo');
    },
    listChangeSets(limit = 50) {
      return listChangeSets(boardId, limit);
    },
    getHistoryState() {
      return getBoardHistoryState(boardId);
    },
  };
}

async function commitIdeaMutation(
  boardId: BoardId,
  input: {
    kind: Extract<ChangeSetKind, 'move_idea' | 'discard_idea' | 'restore_idea'>;
    actor: ChangeActor;
    summary: string;
    ideaId: string;
    mutate: (idea: Idea) => Idea;
  },
): Promise<BoardCommitResult> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx = db.transaction(['boards', 'ideas', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const ideasStore = tx.objectStore('ideas');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const beforeIdea = await ideasStore.get(input.ideaId);
  if (!beforeIdea) {
    throw new Error(`Idea not found: ${input.ideaId}`);
  }

  const now = Date.now();
  const seq = currentBoard.nextChangeSeq;
  const baseSeq = currentBoard.changeCursor;
  const afterIdea = { ...input.mutate(beforeIdea), id: beforeIdea.id, boardId, updatedAt: now };

  const ideaPatches = createEntityPatches('ideas', afterIdea.id, beforeIdea, afterIdea);
  if (ideaPatches.forward.length === 0) {
    await tx.done;
    const document = await loadBoardDocument(boardId);
    return { document, history: await getBoardHistoryState(boardId) };
  }

  const nextBoard = {
    ...currentBoard,
    updatedAt: now,
    changeCursor: seq,
    nextChangeSeq: seq + 1,
  };
  const boardPatches = createEntityPatches('boards', boardId, currentBoard, nextBoard);
  const changeSet: ChangeSetRecord = {
    id: crypto.randomUUID(),
    boardId,
    seq,
    baseSeq,
    kind: input.kind,
    actor: input.actor,
    summary: input.summary,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'ideas', id: afterIdea.id },
    ],
    forward: [...ideaPatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...ideaPatches.inverse],
    committedAt: now,
    status: 'committed',
  };

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await ideasStore.put(afterIdea);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;
  await publishIdeaRows([afterIdea], boardId);

  const document = await loadBoardDocument(boardId);
  return { document, changeSet, history: await getBoardHistoryState(boardId) };
}

async function commitCapturedIdea(
  boardId: BoardId,
  input: { rawText: string; tags: string[]; actor: ChangeActor },
): Promise<BoardIdeaCommitResult> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'ideas', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const ideasStore = tx.objectStore('ideas');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const now = Date.now();
  const seq = currentBoard.nextChangeSeq;
  const afterIdea = createCapturedIdea({
    boardId,
    rawText: input.rawText,
    tags: input.tags,
    createdAt: now,
  });
  const ideaPatches = createEntityPatches('ideas', afterIdea.id, undefined, afterIdea);
  const nextBoard = {
    ...currentBoard,
    updatedAt: now,
    changeCursor: seq,
    nextChangeSeq: seq + 1,
  };
  const boardPatches = createEntityPatches('boards', boardId, currentBoard, nextBoard);
  const changeSet: ChangeSetRecord = {
    id: crypto.randomUUID(),
    boardId,
    seq,
    baseSeq: currentBoard.changeCursor,
    kind: 'capture_idea',
    actor: input.actor,
    summary: `Captured idea: ${input.rawText.slice(0, 80)}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'ideas', id: afterIdea.id },
    ],
    forward: [...ideaPatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...ideaPatches.inverse],
    committedAt: now,
    status: 'committed',
  };

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await ideasStore.put(afterIdea);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;
  await publishIdeaRows([afterIdea], boardId);

  const document = await loadBoardDocument(boardId);
  return { idea: afterIdea, document, changeSet, history: await getBoardHistoryState(boardId) };
}
