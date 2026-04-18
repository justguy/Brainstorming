import { useEffect, useMemo, useState } from 'react';
import type { ChangeActor } from '../../src/board/types';
import { DEFAULT_BOARD_ID } from '../../src/board/types';
import type { Idea, IdeaCritique, IdeaGroup, SupportingDoc, ScoutSuggestion, Connection } from '../../src/types';
import { getSettings } from '../../src/storage/settings';
import { runAdhocRole } from '../../src/orchestrator/adhocRole';
import {
  docFactExtractor,
  buildDocFactExtractorTask,
  type DocFactExtractorOutput,
} from '../../src/orchestrator/roles/docFactExtractor';
import { createBoardController } from '../../src/storage/boardController';
import type { BoardCommitResult, BoardDocCommitResult, BoardHistoryState } from '../../src/storage/boardControllerTypes';
import {
  defaultBoardRepository,
  mapStandaloneBoardSnapshot,
  type StandaloneBoardSnapshot,
} from './boardRepository';

type SupportingDocMutationController = {
  createDoc(input: { ideaId: string; title: string; rawText: string; actor: ChangeActor }): Promise<BoardDocCommitResult>;
  updateDoc(input: {
    docId: string;
    patch: Partial<SupportingDoc>;
    actor: ChangeActor;
    summary?: string;
  }): Promise<BoardDocCommitResult>;
  deleteDoc(input: { docId: string; actor: ChangeActor }): Promise<BoardCommitResult>;
};

type SupportingDocMutations = {
  createDoc(input: { ideaId: string; title: string; rawText: string; actor: ChangeActor }): Promise<SupportingDoc>;
  updateDoc(input: {
    docId: string;
    patch: Partial<SupportingDoc>;
    actor: ChangeActor;
    summary?: string;
  }): Promise<SupportingDoc>;
  deleteDoc(input: { docId: string; actor: ChangeActor }): Promise<void>;
};

export function useBoardSync() {
  const [boardId, setBoardId] = useState(DEFAULT_BOARD_ID);
  const boardRepository = useMemo(() => defaultBoardRepository.forBoard(boardId), [boardId]);
  const boardController = useMemo(() => createBoardController(boardId), [boardId]);
  const supportingDocController = boardController as typeof boardController & SupportingDocMutationController;
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [groups, setGroups] = useState<IdeaGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  const [connections, setConnections] = useState<Connection[]>([]);
  const [critiques, setCritiques] = useState<IdeaCritique[]>([]);
  const [suggestions, setSuggestions] = useState<ScoutSuggestion[]>([]);
  const [historyState, setHistoryState] = useState<BoardHistoryState>({
    canUndo: false,
    canRedo: false,
    cursor: 0,
    nextSeq: 1,
  });

  function applyBoardSnapshot(snapshot: StandaloneBoardSnapshot): void {
    setBoardId(snapshot.board.id);
    setIdeas(snapshot.ideas);
    setGroups(snapshot.groups);
    setConnections(snapshot.connections);
    setCritiques(snapshot.critiques);
    setSuggestions(snapshot.suggestions);
    setDocCounts(snapshot.docCounts);
  }

  function applyCommittedBoard(
    document: Awaited<ReturnType<typeof boardRepository.loadDocument>>,
    history: BoardHistoryState,
  ): void {
    applyBoardSnapshot(mapStandaloneBoardSnapshot(document));
    setHistoryState(history);
    setSelectedId(prev => (prev && document.ideas.some(idea => idea.id === prev) ? prev : null));
  }

  const supportingDocMutations: SupportingDocMutations = {
    async createDoc(input) {
      const committed = await supportingDocController.createDoc(input);
      applyCommittedBoard(committed.document, committed.history);
      return committed.doc;
    },
    async updateDoc(input) {
      const committed = await supportingDocController.updateDoc(input);
      applyCommittedBoard(committed.document, committed.history);
      return committed.doc;
    },
    async deleteDoc(input) {
      const committed = await supportingDocController.deleteDoc(input);
      applyCommittedBoard(committed.document, committed.history);
    },
  };

  async function refineSupportingDoc(doc: SupportingDoc, actor: ChangeActor): Promise<SupportingDoc> {
    try {
      const task = buildDocFactExtractorTask(doc.title, doc.rawText);
      const { result } = await runAdhocRole<DocFactExtractorOutput>(docFactExtractor, task);
      if (!result) {
        return supportingDocMutations.updateDoc({
          docId: doc.id,
          patch: {
            status: 'failed',
            error: 'Extractor returned no result. Try editing the text and re-saving.',
          },
          actor,
        });
      }
      return supportingDocMutations.updateDoc({
        docId: doc.id,
        patch: {
          status: 'ready',
          summary: result.summary,
          facts: result.facts,
          error: undefined,
        },
        actor,
      });
    } catch (err) {
      return supportingDocMutations.updateDoc({
        docId: doc.id,
        patch: {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Extraction failed.',
        },
        actor,
      });
    }
  }

  async function loadBoard(): Promise<void> {
    try {
      applyBoardSnapshot(await boardRepository.loadSnapshot());
      setHistoryState(await boardController.getHistoryState());
    } catch {
      // non-fatal
    }
  }

  async function loadDocCounts(ideaIds: string[]): Promise<void> {
    try {
      const counts = Object.fromEntries(
        await Promise.all(
          ideaIds.map(async id => [id, await boardRepository.countDocsForIdea(id)] as const),
        ),
      );
      setDocCounts(prev => ({ ...prev, ...counts }));
    } catch {
      // non-fatal
    }
  }

  async function checkApiKey(): Promise<void> {
    try {
      const settings = await getSettings();
      setHasApiKey(!!(settings.credentials[settings.activeProvider]));
    } catch {
      setHasApiKey(false);
    }
  }

  function handleIdeaUpdate(updated: Idea): void {
    setIdeas(prev => prev.map(idea => (idea.id === updated.id ? updated : idea)));
  }

  useEffect(() => {
    void loadBoard();
    void checkApiKey();
  }, []);

  useEffect(() => {
    const ideaIds = ideas.filter(idea => idea.status !== 'archived').map(idea => idea.id);
    if (ideaIds.length > 0) {
      void loadDocCounts(ideaIds);
    }
  }, [ideas, boardRepository]);

  return {
    boardId,
    boardRepository,
    boardController,
    ideas,
    groups,
    selectedId,
    setSelectedId,
    hasApiKey,
    docCounts,
    setDocCounts,
    connections,
    critiques,
    suggestions,
    historyState,
    applyCommittedBoard,
    handleIdeaUpdate,
    loadBoard,
    loadIdeas: loadBoard,
    loadGroups: loadBoard,
    loadDocCounts,
    loadConnections: loadBoard,
    loadSuggestions: loadBoard,
    loadCritiques: loadBoard,
    supportingDocMutations,
    refineSupportingDoc,
  };
}
