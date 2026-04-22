import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Idea } from '../../src/types';
import type { BoardDocument } from '../../src/board/types';
import type { BoardHistoryState } from '../../src/storage/boardControllerTypes';
import { createBoardController } from '../../src/storage/boardController';

interface UseBrainstormWorkspaceEventsArgs {
  boardId: string;
  ideas: Idea[];
  boardController: ReturnType<typeof createBoardController>;
  applyCommittedBoard: (document: BoardDocument, history: BoardHistoryState) => void;
  loadBoard: () => Promise<void>;
  loadIdeas: () => Promise<void>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  handleMove: (ideaId: string, x: number, y: number, source?: 'canvas' | 'webmcp') => Promise<void>;
  handleGroup: (ideaIdA: string, ideaIdB: string, source?: 'canvas' | 'webmcp') => Promise<void>;
  handleUngroup: (ideaId: string, source?: 'canvas' | 'webmcp') => Promise<void>;
  handleMerge: (draggedId: string, targetId: string, source?: 'canvas' | 'webmcp') => Promise<void>;
}

export function useBrainstormWorkspaceEvents({
  boardId,
  ideas,
  boardController,
  applyCommittedBoard,
  loadBoard,
  loadIdeas,
  setSelectedId,
  handleMove,
  handleGroup,
  handleUngroup,
  handleMerge,
}: UseBrainstormWorkspaceEventsArgs): void {
  useEffect(() => {
    function emitToolCompletion(requestId?: string, detail?: Record<string, unknown>): void {
      if (!requestId) return;
      window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail }));
    }

    const handleIdeasChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ boardId?: string }>;
      if (customEvent.detail?.boardId && customEvent.detail.boardId !== boardId) {
        return;
      }
      void loadBoard();
    };

    const handleMoveEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ ideaId: string; x: number; y: number; requestId?: string }>;
      const { ideaId, x, y, requestId } = customEvent.detail;
      try {
        await handleMove(ideaId, x, y, 'webmcp');
      } catch (err) {
        console.error('[App] move failed:', err);
      }
      emitToolCompletion(requestId);
    };

    const handleDiscardIdeaEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ ideaId: string; requestId?: string }>;
      const { ideaId, requestId } = customEvent.detail;
      let error: string | undefined;
      try {
        const result = await boardController.discardIdea({
          ideaId,
          actor: { type: 'tool', source: 'webmcp' },
        });
        applyCommittedBoard(result.document, result.history);
        setSelectedId(prev => (prev === ideaId ? null : prev));
      } catch (err) {
        error = err instanceof Error ? err.message : 'discard failed';
      }
      emitToolCompletion(requestId, { ok: !error, error });
    };

    const handleRestoreIdeaEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ ideaId: string; requestId?: string }>;
      const { ideaId, requestId } = customEvent.detail;
      let error: string | undefined;
      try {
        const result = await boardController.restoreIdea({
          ideaId,
          actor: { type: 'tool', source: 'webmcp' },
        });
        applyCommittedBoard(result.document, result.history);
      } catch (err) {
        error = err instanceof Error ? err.message : 'restore failed';
      }
      emitToolCompletion(requestId, { ok: !error, error });
    };

    const handleGroupEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ ideaIdA: string; ideaIdB: string; requestId?: string }>;
      const { ideaIdA, ideaIdB, requestId } = customEvent.detail;
      try {
        await handleGroup(ideaIdA, ideaIdB, 'webmcp');
      } catch (err) {
        console.error('[App] group failed:', err);
      }
      emitToolCompletion(requestId);
    };

    const handleUngroupEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ ideaId: string; requestId?: string }>;
      const { ideaId, requestId } = customEvent.detail;
      try {
        await handleUngroup(ideaId, 'webmcp');
      } catch (err) {
        console.error('[App] ungroup failed:', err);
      }
      emitToolCompletion(requestId);
    };

    const handleMergeEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ draggedId: string; targetId: string; requestId?: string }>;
      const { draggedId, targetId, requestId } = customEvent.detail;
      try {
        await handleMerge(draggedId, targetId, 'webmcp');
      } catch (err) {
        console.error('[App] merge failed:', err);
      }
      emitToolCompletion(requestId);
    };

    const listeners: Array<[string, EventListener]> = [
      ['brainstorm:ideasChanged', handleIdeasChanged as EventListener],
      ['brainstorm:movePanel', handleMoveEvent as EventListener],
      ['brainstorm:discardIdea', handleDiscardIdeaEvent as EventListener],
      ['brainstorm:restoreIdea', handleRestoreIdeaEvent as EventListener],
      ['brainstorm:groupIdeas', handleGroupEvent as EventListener],
      ['brainstorm:ungroupIdea', handleUngroupEvent as EventListener],
      ['brainstorm:mergeIdeas', handleMergeEvent as EventListener],
    ];

    listeners.forEach(([name, listener]) => window.addEventListener(name, listener));
    return () => {
      listeners.forEach(([name, listener]) => window.removeEventListener(name, listener));
    };
  }, [boardId, ideas, loadBoard]);
}
