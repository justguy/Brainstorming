import { DEFAULT_BOARD_ID, type BoardDocument } from '../../src/board/types';
import type {
  BoardId,
  Connection,
  CritiqueStatus,
  Idea,
  IdeaCritique,
  IdeaGroup,
  ScoutSuggestion,
  SupportingDoc,
} from '../../src/types';
import { loadBoardDocument as loadBoardDocumentFromStore } from '../../src/storage/boardDocument';
import {
  listConnections as listConnectionsFromStore,
  replaceConnections as replaceConnectionsInStore,
} from '../../src/storage/connections';
import {
  createCritique as createCritiqueInStore,
  dismissCritique as dismissCritiqueInStore,
  listCritiques as listCritiquesFromStore,
  listCritiquesForIdea as listCritiquesForIdeaFromStore,
} from '../../src/storage/critiques';
import {
  countDocsForIdea as countDocsForIdeaFromStore,
  listDocsForIdea as listDocsForIdeaFromStore,
} from '../../src/storage/docs';
import {
  addIdeaToGroup as addIdeaToGroupInStore,
  createGroup as createGroupInStore,
  getGroup as getGroupFromStore,
  listGroups as listGroupsFromStore,
  removeIdeaFromGroup as removeIdeaFromGroupInStore,
  updateGroup as updateGroupInStore,
} from '../../src/storage/groups';
import {
  createIdea as createIdeaInStore,
  discardIdea as discardIdeaInStore,
  getIdea as getIdeaFromStore,
  listIdeas as listIdeasFromStore,
  restoreIdea as restoreIdeaInStore,
} from '../../src/storage/ideas';
import {
  admitSuggestion as admitSuggestionInStore,
  createSuggestion as createSuggestionInStore,
  dismissSuggestion as dismissSuggestionInStore,
  getSuggestion as getSuggestionFromStore,
  listSuggestions as listSuggestionsFromStore,
  setSuggestionElaboration as setSuggestionElaborationInStore,
} from '../../src/storage/suggestions';
import { MAX_VISIBLE_SUGGESTIONS } from './suggestionDedup';

export type CreateBoardIdeaInput = Omit<Parameters<typeof createIdeaInStore>[0], 'boardId'>;
export type CreateBoardGroupInput = Parameters<typeof createGroupInStore>;
export type CreateBoardCritiqueInput = Omit<Parameters<typeof createCritiqueInStore>[0], 'boardId'>;
export type CreateBoardSuggestionInput = Omit<Parameters<typeof createSuggestionInStore>[0], 'boardId'>;

export interface StandaloneBoardSnapshot {
  board: BoardDocument['board'];
  boardId: BoardId;
  ideas: Idea[];
  groups: IdeaGroup[];
  docs: SupportingDoc[];
  docCounts: Record<string, number>;
  suggestions: ScoutSuggestion[];
  critiques: IdeaCritique[];
  connections: Connection[];
  tweaks: BoardDocument['tweaks'];
}

export function countDocsByIdea(docs: SupportingDoc[]): Record<string, number> {
  return docs.reduce<Record<string, number>>((counts, doc) => {
    counts[doc.ideaId] = (counts[doc.ideaId] ?? 0) + 1;
    return counts;
  }, {});
}

export function pickPendingSuggestions(
  suggestions: ScoutSuggestion[],
  limit = MAX_VISIBLE_SUGGESTIONS,
): ScoutSuggestion[] {
  return suggestions
    .filter(suggestion => suggestion.status === 'pending')
    .slice(0, limit);
}

export function mapStandaloneBoardSnapshot(
  snapshot: BoardDocument,
  options: { visibleSuggestionLimit?: number } = {},
): StandaloneBoardSnapshot {
  return {
    board: snapshot.board,
    boardId: snapshot.board.id,
    ideas: snapshot.ideas,
    groups: snapshot.groups,
    docs: snapshot.docs,
    docCounts: countDocsByIdea(snapshot.docs),
    suggestions: pickPendingSuggestions(snapshot.suggestions, options.visibleSuggestionLimit),
    critiques: snapshot.critiques,
    connections: snapshot.connections,
    tweaks: snapshot.tweaks,
  };
}

export interface BoardRepository {
  boardId: BoardId;
  forBoard(nextBoardId: BoardId): BoardRepository;
  loadSnapshot(options?: { visibleSuggestionLimit?: number }): Promise<StandaloneBoardSnapshot>;
  loadDocument(): Promise<BoardDocument>;
  listIdeas(): Promise<Idea[]>;
  getIdea(ideaId: string): Promise<Idea | undefined>;
  createIdea(input: CreateBoardIdeaInput): Promise<Idea>;
  discardIdea(ideaId: string): Promise<Idea>;
  restoreIdea(ideaId: string): Promise<Idea>;
  listGroups(): Promise<IdeaGroup[]>;
  getGroup(groupId: string): Promise<IdeaGroup | undefined>;
  createGroup(...args: CreateBoardGroupInput): Promise<IdeaGroup>;
  updateGroup(groupId: string, patch: Partial<IdeaGroup>): Promise<IdeaGroup>;
  addIdeaToGroup(groupId: string, ideaId: string): Promise<IdeaGroup>;
  removeIdeaFromGroup(groupId: string, ideaId: string): Promise<IdeaGroup | null>;
  listDocsForIdea(ideaId: string): Promise<SupportingDoc[]>;
  countDocsForIdea(ideaId: string): Promise<number>;
  listConnections(): Promise<Connection[]>;
  replaceConnections(connections: Connection[]): Promise<void>;
  listCritiques(): Promise<IdeaCritique[]>;
  listCritiquesForIdea(ideaId: string, status?: CritiqueStatus): Promise<IdeaCritique[]>;
  createCritique(input: CreateBoardCritiqueInput): Promise<IdeaCritique>;
  dismissCritique(critiqueId: string): Promise<IdeaCritique>;
  listSuggestions(): Promise<ScoutSuggestion[]>;
  getSuggestion(suggestionId: string): Promise<ScoutSuggestion | undefined>;
  createSuggestion(input: CreateBoardSuggestionInput): Promise<ScoutSuggestion>;
  admitSuggestion(suggestionId: string, admittedIdeaId: string): Promise<ScoutSuggestion>;
  dismissSuggestion(suggestionId: string): Promise<ScoutSuggestion>;
  setSuggestionElaboration(suggestionId: string, elaboration: string): Promise<ScoutSuggestion>;
}

export function createBoardRepository(boardId: BoardId = DEFAULT_BOARD_ID): BoardRepository {
  return {
    boardId,
    forBoard(nextBoardId: BoardId): BoardRepository {
      return createBoardRepository(nextBoardId);
    },
    async loadSnapshot(options = {}): Promise<StandaloneBoardSnapshot> {
      const snapshot = await loadBoardDocumentFromStore(boardId);
      return mapStandaloneBoardSnapshot(snapshot, options);
    },
    loadDocument(): Promise<BoardDocument> {
      return loadBoardDocumentFromStore(boardId);
    },
    listIdeas(): Promise<Idea[]> {
      return listIdeasFromStore(boardId);
    },
    getIdea(ideaId: string): Promise<Idea | undefined> {
      return getIdeaFromStore(ideaId);
    },
    createIdea(input: CreateBoardIdeaInput): Promise<Idea> {
      return createIdeaInStore({ ...input, boardId });
    },
    discardIdea(ideaId: string): Promise<Idea> {
      return discardIdeaInStore(ideaId);
    },
    restoreIdea(ideaId: string): Promise<Idea> {
      return restoreIdeaInStore(ideaId);
    },
    listGroups(): Promise<IdeaGroup[]> {
      return listGroupsFromStore(boardId);
    },
    getGroup(groupId: string): Promise<IdeaGroup | undefined> {
      return getGroupFromStore(groupId);
    },
    createGroup(
      ideaIds: string[],
      theme?: string,
      sharedQuestion?: string,
      nextBoardId: BoardId = boardId,
    ): Promise<IdeaGroup> {
      return createGroupInStore(ideaIds, theme, sharedQuestion, nextBoardId);
    },
    updateGroup(groupId: string, patch: Partial<IdeaGroup>): Promise<IdeaGroup> {
      return updateGroupInStore(groupId, patch);
    },
    addIdeaToGroup(groupId: string, ideaId: string): Promise<IdeaGroup> {
      return addIdeaToGroupInStore(groupId, ideaId);
    },
    removeIdeaFromGroup(groupId: string, ideaId: string): Promise<IdeaGroup | null> {
      return removeIdeaFromGroupInStore(groupId, ideaId);
    },
    listDocsForIdea(ideaId: string): Promise<SupportingDoc[]> {
      return listDocsForIdeaFromStore(ideaId, boardId);
    },
    countDocsForIdea(ideaId: string): Promise<number> {
      return countDocsForIdeaFromStore(ideaId, boardId);
    },
    listConnections(): Promise<Connection[]> {
      return listConnectionsFromStore(boardId);
    },
    replaceConnections(nextConnections: Connection[]): Promise<void> {
      return replaceConnectionsInStore(nextConnections, boardId);
    },
    listCritiques(): Promise<IdeaCritique[]> {
      return listCritiquesFromStore(boardId);
    },
    listCritiquesForIdea(ideaId: string, status?: CritiqueStatus): Promise<IdeaCritique[]> {
      return listCritiquesForIdeaFromStore(ideaId, status, boardId);
    },
    createCritique(input: CreateBoardCritiqueInput): Promise<IdeaCritique> {
      return createCritiqueInStore({ ...input, boardId });
    },
    dismissCritique(critiqueId: string): Promise<IdeaCritique> {
      return dismissCritiqueInStore(critiqueId);
    },
    listSuggestions(): Promise<ScoutSuggestion[]> {
      return listSuggestionsFromStore(boardId);
    },
    getSuggestion(suggestionId: string): Promise<ScoutSuggestion | undefined> {
      return getSuggestionFromStore(suggestionId);
    },
    createSuggestion(input: CreateBoardSuggestionInput): Promise<ScoutSuggestion> {
      return createSuggestionInStore({ ...input, boardId });
    },
    admitSuggestion(suggestionId: string, admittedIdeaId: string): Promise<ScoutSuggestion> {
      return admitSuggestionInStore(suggestionId, admittedIdeaId);
    },
    dismissSuggestion(suggestionId: string): Promise<ScoutSuggestion> {
      return dismissSuggestionInStore(suggestionId);
    },
    setSuggestionElaboration(suggestionId: string, elaboration: string): Promise<ScoutSuggestion> {
      return setSuggestionElaborationInStore(suggestionId, elaboration);
    },
  };
}

export const defaultBoardRepository = createBoardRepository();
