import { useEffect, useMemo, useState } from 'react';
import type {
  BeatReviewItemRecord,
  BeatReviewSessionRecord,
  BoardTweaksRecord,
  ChangeActor,
} from '../../src/board/types';
import { DEFAULT_BOARD_ID, DEFAULT_BOARD_TITLE } from '../../src/board/types';
import type { Idea, IdeaCritique, IdeaGroup, SupportingDoc, ScoutSuggestion, Connection } from '../../src/types';
import { getSettings } from '../../src/storage/settings';
import { runAdhocRole } from '../../src/orchestrator/adhocRole';
import {
  docFactExtractor,
  buildDocFactExtractorTask,
  type DocFactExtractorOutput,
} from '../../src/orchestrator/roles/docFactExtractor';
import { createBoardController } from '../../src/storage/boardController';
import type {
  BoardBeatReviewItemCommitResult,
  BoardBeatReviewSessionCommitResult,
  BoardCommitResult,
  BoardDocCommitResult,
  BoardHistoryState,
} from '../../src/storage/boardControllerTypes';
import type { ChangeSetRecord } from '../../src/board/types';
import {
  defaultBoardRepository,
  mapStandaloneBoardSnapshot,
  type StandaloneBoardSnapshot,
} from './boardRepository';
import { reconcileDisplayGroups } from './reconcileDisplayGroups';

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
  const [boardTitle, setBoardTitle] = useState(DEFAULT_BOARD_TITLE);
  const boardRepository = useMemo(() => defaultBoardRepository.forBoard(boardId), [boardId]);
  const boardController = useMemo(() => createBoardController(boardId), [boardId]);
  const supportingDocController = boardController as typeof boardController & SupportingDocMutationController;
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [groups, setGroups] = useState<IdeaGroup[]>([]);
  const [docs, setDocs] = useState<SupportingDoc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  const [connections, setConnections] = useState<Connection[]>([]);
  const [critiques, setCritiques] = useState<IdeaCritique[]>([]);
  const [suggestions, setSuggestions] = useState<ScoutSuggestion[]>([]);
  const [beatReviewSessions, setBeatReviewSessions] = useState<BeatReviewSessionRecord[]>([]);
  const [beatReviewItems, setBeatReviewItems] = useState<BeatReviewItemRecord[]>([]);
  const [tweaks, setTweaks] = useState<BoardTweaksRecord | null>(null);
  const [historyState, setHistoryState] = useState<BoardHistoryState>({
    canUndo: false,
    canRedo: false,
    cursor: 0,
    nextSeq: 1,
  });
  const [changeSets, setChangeSets] = useState<ChangeSetRecord[]>([]);

  function applyBoardSnapshot(snapshot: StandaloneBoardSnapshot): void {
    setBoardId(snapshot.board.id);
    setBoardTitle(snapshot.board.title);
    setIdeas(snapshot.ideas);
    setGroups(reconcileDisplayGroups(snapshot.ideas, snapshot.groups));
    setDocs(snapshot.docs);
    setConnections(snapshot.connections);
    setCritiques(snapshot.critiques);
    setSuggestions(snapshot.suggestions);
    setBeatReviewSessions(snapshot.beatReviewSessions);
    setBeatReviewItems(snapshot.beatReviewItems);
    setTweaks(snapshot.tweaks);
    setDocCounts(snapshot.docCounts);
  }

  function applyCommittedBoard(
    document: Awaited<ReturnType<typeof boardRepository.loadDocument>>,
    history: BoardHistoryState,
  ): void {
    applyBoardSnapshot(mapStandaloneBoardSnapshot(document));
    setHistoryState(history);
    setSelectedId(prev => (prev && document.ideas.some(idea => idea.id === prev) ? prev : null));
    void boardController.listChangeSets(50).then(setChangeSets).catch(() => {});
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

  async function updateBoardTweaks(
    patch: Record<string, unknown>,
    actor: ChangeActor,
    summary?: string,
  ): Promise<BoardTweaksRecord> {
    const committed = await boardController.updateTweaks({ patch, actor, summary });
    applyCommittedBoard(committed.document, committed.history);
    return committed.tweaks;
  }

  async function createBeatReviewSession(
    result: Parameters<typeof boardController.createBeatReviewSession>[0]['result'],
    actor: ChangeActor,
  ): Promise<BoardBeatReviewSessionCommitResult | null> {
    const committed = await boardController.createBeatReviewSession({ result, actor });
    if (!committed) return null;
    applyCommittedBoard(committed.document, committed.history);
    return committed;
  }

  async function keepBeatReviewItem(itemId: string, actor: ChangeActor): Promise<BoardBeatReviewItemCommitResult> {
    const committed = await boardController.keepBeatReviewItem({ itemId, actor });
    applyCommittedBoard(committed.document, committed.history);
    return committed;
  }

  async function scratchBeatReviewItem(itemId: string, actor: ChangeActor): Promise<BoardBeatReviewItemCommitResult> {
    const committed = await boardController.scratchBeatReviewItem({ itemId, actor });
    applyCommittedBoard(committed.document, committed.history);
    return committed;
  }

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
      const [snapshot, nextHistory, nextChangeSets] = await Promise.all([
        boardRepository.loadSnapshot(),
        boardController.getHistoryState(),
        boardController.listChangeSets(50),
      ]);
      applyBoardSnapshot(snapshot);
      setHistoryState(nextHistory);
      setChangeSets(nextChangeSets);
      setSelectedId(prev => (prev && snapshot.ideas.some(idea => idea.id === prev) ? prev : null));
    } catch {
      // non-fatal
    }
  }

  async function loadIdeas(): Promise<void> {
    try {
      const nextIdeas = await boardRepository.listIdeas();
      setIdeas(nextIdeas);
      setGroups(prev => reconcileDisplayGroups(nextIdeas, prev));
      setSelectedId(prev => (prev && nextIdeas.some(idea => idea.id === prev) ? prev : null));
    } catch {
      // non-fatal
    }
  }

  async function loadGroups(): Promise<void> {
    try {
      setGroups(reconcileDisplayGroups(ideas, await boardRepository.listGroups()));
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
    boardTitle,
    boardRepository,
    boardController,
    ideas,
    groups,
    docs,
    selectedId,
    setSelectedId,
    hasApiKey,
    docCounts,
    setDocCounts,
    connections,
    critiques,
    suggestions,
    beatReviewSessions,
    beatReviewItems,
    tweaks,
    historyState,
    changeSets,
    applyCommittedBoard,
    updateBoardTweaks,
    createBeatReviewSession,
    keepBeatReviewItem,
    scratchBeatReviewItem,
    handleIdeaUpdate,
    loadBoard,
    loadIdeas,
    loadGroups,
    loadDocCounts,
    loadConnections: loadBoard,
    loadSuggestions: loadBoard,
    loadCritiques: loadBoard,
    supportingDocMutations,
    refineSupportingDoc,
  };
}
