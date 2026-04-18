import type { Dispatch, SetStateAction } from 'react';
import type { BoardDocument } from '../../src/board/types';
import type { BoardHistoryState } from '../../src/storage/boardControllerTypes';
import { createBoardController } from '../../src/storage/boardController';

interface UseBoardSessionActionsArgs {
  newIdeaText: string;
  newIdeaTags: string;
  boardController: ReturnType<typeof createBoardController>;
  applyCommittedBoard: (document: BoardDocument, history: BoardHistoryState) => void;
  setCreating: Dispatch<SetStateAction<boolean>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setNewIdeaText: Dispatch<SetStateAction<string>>;
  setNewIdeaTags: Dispatch<SetStateAction<string>>;
  markActivity: (kind: 'edit' | 'group' | 'doc') => void;
}

export function useBoardSessionActions({
  newIdeaText,
  newIdeaTags,
  boardController,
  applyCommittedBoard,
  setCreating,
  setSelectedId,
  setNewIdeaText,
  setNewIdeaTags,
  markActivity,
}: UseBoardSessionActionsArgs) {
  async function handleCapture(): Promise<void> {
    const text = newIdeaText.trim();
    if (!text) return;

    setCreating(true);
    try {
      const tags = newIdeaTags
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean);
      const result = await boardController.captureIdea({
        rawText: text,
        tags,
        actor: { type: 'user', source: 'canvas' },
      });
      applyCommittedBoard(result.document, result.history);
      setSelectedId(result.changeSet?.affected.find(entry => entry.store === 'ideas')?.id ?? null);
      setNewIdeaText('');
      setNewIdeaTags('');
      markActivity('edit');
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  async function handleDiscard(ideaId: string): Promise<void> {
    try {
      const result = await boardController.discardIdea({
        ideaId,
        actor: { type: 'user', source: 'canvas' },
      });
      applyCommittedBoard(result.document, result.history);
      setSelectedId(prev => (prev === ideaId ? null : prev));
      markActivity('edit');
    } catch (err) {
      console.error('[App] discard failed:', err);
    }
  }

  async function handleRestore(ideaId: string): Promise<void> {
    try {
      const result = await boardController.restoreIdea({
        ideaId,
        actor: { type: 'user', source: 'canvas' },
      });
      applyCommittedBoard(result.document, result.history);
      markActivity('edit');
    } catch (err) {
      console.error('[App] restore failed:', err);
    }
  }

  async function handleUndo(): Promise<void> {
    try {
      const result = await boardController.undo();
      if (!result) return;
      applyCommittedBoard(result.document, result.history);
    } catch (err) {
      console.error('[App] undo failed:', err);
    }
  }

  async function handleRedo(): Promise<void> {
    try {
      const result = await boardController.redo();
      if (!result) return;
      applyCommittedBoard(result.document, result.history);
    } catch (err) {
      console.error('[App] redo failed:', err);
    }
  }

  return {
    handleCapture,
    handleDiscard,
    handleRestore,
    handleUndo,
    handleRedo,
  };
}
