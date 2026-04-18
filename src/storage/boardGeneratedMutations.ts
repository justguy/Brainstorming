import { createCapturedIdea } from '../board/ideaFactory';
import type { ChangeActor } from '../board/types';
import type { BoardId, Idea, IdeaCritique, ScoutSuggestion } from '../types';
import { createEntityPatches, hydrateBoardState, supersedeFutureChanges } from './boardJournal';
import { createChangeSet } from './boardGroupMutationHelpers';
import { loadBoardDocument } from './boardDocument';
import { getBoardHistoryState } from './boardHistoryState';
import type {
  BoardCritiqueCommitResult,
  BoardSuggestionAdmitCommitResult,
  BoardSuggestionCommitResult,
} from './boardControllerTypes';
import { ensureBoard } from './boards';
import { getDb } from './db';

export async function commitCreateCritique(
  boardId: BoardId,
  input: { ideaId: string; critique: string; evidenceAsk: string; actor: ChangeActor },
): Promise<BoardCritiqueCommitResult> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'critiques', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const critiquesStore = tx.objectStore('critiques');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const now = Date.now();
  const critique: IdeaCritique = {
    id: crypto.randomUUID(),
    boardId,
    ideaId: input.ideaId,
    critique: input.critique,
    evidenceAsk: input.evidenceAsk,
    status: 'active',
    source: 'devils_advocate',
    createdAt: now,
    updatedAt: now,
  };
  const critiquePatches = createEntityPatches('critiques', critique.id, undefined, critique);
  const nextBoard = nextBoardRecord(currentBoard, now);
  const boardPatches = createEntityPatches('boards', boardId, currentBoard, nextBoard);
  const changeSet = createChangeSet({
    boardId,
    seq: currentBoard.nextChangeSeq,
    baseSeq: currentBoard.changeCursor,
    actor: input.actor,
    kind: 'create_critique',
    summary: `Created critique ${critique.id} for idea ${input.ideaId}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'critiques', id: critique.id },
    ],
    forward: [...critiquePatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...critiquePatches.inverse],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await critiquesStore.put(critique);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  return {
    critique,
    document: await loadBoardDocument(boardId),
    history: await getBoardHistoryState(boardId),
    changeSet,
  };
}

export async function commitCreateSuggestion(
  boardId: BoardId,
  input: {
    rawText: string;
    rationale: string;
    source: string;
    relatedIdeaIds?: string[];
    panel?: ScoutSuggestion['panel'];
    actor: ChangeActor;
  },
): Promise<BoardSuggestionCommitResult> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'suggestions', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const suggestionsStore = tx.objectStore('suggestions');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const now = Date.now();
  const suggestion: ScoutSuggestion = {
    id: crypto.randomUUID(),
    boardId,
    rawText: input.rawText,
    rationale: input.rationale,
    source: input.source,
    status: 'pending',
    relatedIdeaIds: input.relatedIdeaIds,
    panel: input.panel,
    createdAt: now,
    updatedAt: now,
  };
  const suggestionPatches = createEntityPatches('suggestions', suggestion.id, undefined, suggestion);
  const nextBoard = nextBoardRecord(currentBoard, now);
  const boardPatches = createEntityPatches('boards', boardId, currentBoard, nextBoard);
  const changeSet = createChangeSet({
    boardId,
    seq: currentBoard.nextChangeSeq,
    baseSeq: currentBoard.changeCursor,
    actor: input.actor,
    kind: 'create_suggestion',
    summary: `Created suggestion ${suggestion.id}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'suggestions', id: suggestion.id },
    ],
    forward: [...suggestionPatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...suggestionPatches.inverse],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await suggestionsStore.put(suggestion);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  return {
    suggestion,
    document: await loadBoardDocument(boardId),
    history: await getBoardHistoryState(boardId),
    changeSet,
  };
}

export async function commitElaborateSuggestion(
  boardId: BoardId,
  input: { suggestionId: string; elaboration: string; actor: ChangeActor },
): Promise<BoardSuggestionCommitResult> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'suggestions', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const suggestionsStore = tx.objectStore('suggestions');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const suggestionBefore = await suggestionsStore.get(input.suggestionId);
  if (!suggestionBefore) throw new Error(`Suggestion not found: ${input.suggestionId}`);
  const now = Date.now();
  const suggestion = suggestionBefore.elaboration === input.elaboration
    ? suggestionBefore
    : { ...suggestionBefore, elaboration: input.elaboration, updatedAt: now };
  const suggestionPatches = createEntityPatches('suggestions', suggestion.id, suggestionBefore, suggestion);
  if (suggestionPatches.forward.length === 0) {
    await tx.done;
    return {
      suggestion,
      document: await loadBoardDocument(boardId),
      history: await getBoardHistoryState(boardId),
    };
  }

  const nextBoard = nextBoardRecord(currentBoard, now);
  const boardPatches = createEntityPatches('boards', boardId, currentBoard, nextBoard);
  const changeSet = createChangeSet({
    boardId,
    seq: currentBoard.nextChangeSeq,
    baseSeq: currentBoard.changeCursor,
    actor: input.actor,
    kind: 'elaborate_suggestion',
    summary: `Elaborated suggestion ${suggestion.id}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'suggestions', id: suggestion.id },
    ],
    forward: [...suggestionPatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...suggestionPatches.inverse],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await suggestionsStore.put(suggestion);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  return {
    suggestion,
    document: await loadBoardDocument(boardId),
    history: await getBoardHistoryState(boardId),
    changeSet,
  };
}

export async function commitAdmitSuggestion(
  boardId: BoardId,
  input: { suggestionId: string; actor: ChangeActor },
): Promise<BoardSuggestionAdmitCommitResult> {
  await ensureBoard(boardId);
  const db = await getDb();
  const tx: any = db.transaction(['boards', 'ideas', 'suggestions', 'changeSets'], 'readwrite');
  const boardsStore = tx.objectStore('boards');
  const ideasStore = tx.objectStore('ideas');
  const suggestionsStore = tx.objectStore('suggestions');
  const changeSetsStore = tx.objectStore('changeSets');
  const currentBoard = hydrateBoardState(await boardsStore.get(boardId));
  if (!currentBoard) throw new Error(`Board not found: ${boardId}`);

  const suggestionBefore = await suggestionsStore.get(input.suggestionId);
  if (!suggestionBefore) throw new Error(`Suggestion not found: ${input.suggestionId}`);

  const now = Date.now();
  const idea = createIdeaFromSuggestion(boardId, suggestionBefore, now);
  const suggestion = suggestionBefore.status === 'admitted' && suggestionBefore.admittedIdeaId
    ? suggestionBefore
    : { ...suggestionBefore, status: 'admitted', admittedIdeaId: idea.id, updatedAt: now };
  const ideaPatches = createEntityPatches('ideas', idea.id, undefined, idea);
  const suggestionPatches = createEntityPatches('suggestions', suggestion.id, suggestionBefore, suggestion);
  const nextBoard = nextBoardRecord(currentBoard, now);
  const boardPatches = createEntityPatches('boards', boardId, currentBoard, nextBoard);
  const changeSet = createChangeSet({
    boardId,
    seq: currentBoard.nextChangeSeq,
    baseSeq: currentBoard.changeCursor,
    actor: input.actor,
    kind: 'admit_suggestion',
    summary: `Admitted suggestion ${suggestion.id} as idea ${idea.id}`,
    affected: [
      { store: 'boards', id: boardId },
      { store: 'ideas', id: idea.id },
      { store: 'suggestions', id: suggestion.id },
    ],
    forward: [...ideaPatches.forward, ...suggestionPatches.forward, ...boardPatches.forward],
    inverse: [...boardPatches.inverse, ...suggestionPatches.inverse, ...ideaPatches.inverse],
    committedAt: now,
  });

  await supersedeFutureChanges(changeSetsStore, boardId, currentBoard.changeCursor + 1);
  await ideasStore.put(idea);
  await suggestionsStore.put(suggestion);
  await boardsStore.put(nextBoard);
  await changeSetsStore.put(changeSet);
  await tx.done;

  return {
    idea,
    suggestion,
    document: await loadBoardDocument(boardId),
    history: await getBoardHistoryState(boardId),
    changeSet,
  };
}

function nextBoardRecord(board: { updatedAt: number; changeCursor: number; nextChangeSeq: number }, now: number) {
  return {
    ...board,
    updatedAt: now,
    changeCursor: board.nextChangeSeq,
    nextChangeSeq: board.nextChangeSeq + 1,
  };
}

function createIdeaFromSuggestion(boardId: BoardId, suggestion: ScoutSuggestion, createdAt: number): Idea {
  const bodyParts = [suggestion.rawText];
  if (suggestion.elaboration) bodyParts.push('', '## Scout elaboration', suggestion.elaboration);
  if (suggestion.rationale) bodyParts.push('', `_Scout rationale:_ ${suggestion.rationale}`);
  return createCapturedIdea({
    boardId,
    rawText: bodyParts.join('\n'),
    tags: ['from-scout', suggestion.source.split(':')[0]?.trim() || 'scout'],
    panel: suggestion.panel ? { ...suggestion.panel } : undefined,
    createdAt,
  });
}
