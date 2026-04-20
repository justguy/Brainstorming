import type { Dispatch, SetStateAction } from 'react';
import {
  DEFAULT_IDEA_PANEL_HEIGHT,
  DEFAULT_IDEA_PANEL_WIDTH,
} from '../../src/board/ideaFactory';
import type { BoardDocument } from '../../src/board/types';
import type { BoardHistoryState } from '../../src/storage/boardControllerTypes';
import { createBoardController } from '../../src/storage/boardController';
import type { Idea, Panel } from '../../src/types';

const CAPTURE_CANVAS_SELECTOR = '.bo-canvas';

interface CaptureFeedback {
  tone: 'success' | 'error';
  message: string;
}

interface CaptureCommit {
  ideaId: string;
  panel: Panel;
}

interface UseBoardSessionActionsArgs {
  ideas: Idea[];
  newIdeaText: string;
  newIdeaTags: string;
  boardController: ReturnType<typeof createBoardController>;
  applyCommittedBoard: (document: BoardDocument, history: BoardHistoryState) => void;
  setCreating: Dispatch<SetStateAction<boolean>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setNewIdeaText: Dispatch<SetStateAction<string>>;
  setNewIdeaTags: Dispatch<SetStateAction<string>>;
  markActivity: (kind: 'edit' | 'group' | 'doc') => void;
  onCaptureFeedback: (feedback: CaptureFeedback | null) => void;
  onCaptureCommitted: (capture: CaptureCommit) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getCanvasElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(CAPTURE_CANVAS_SELECTOR);
}

function getViewportRect(): { left: number; top: number; width: number; height: number } {
  const canvas = getCanvasElement();
  if (canvas) {
    return {
      left: canvas.scrollLeft,
      top: canvas.scrollTop,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    };
  }

  return {
    left: 0,
    top: 0,
    width: typeof window === 'undefined' ? DEFAULT_IDEA_PANEL_WIDTH * 2 : window.innerWidth,
    height: typeof window === 'undefined' ? DEFAULT_IDEA_PANEL_HEIGHT * 2 : window.innerHeight,
  };
}

function overlaps(a: Panel, b: Panel, padding = 24): boolean {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
}

function createViewportPanel(ideas: Idea[]): Panel {
  const viewport = getViewportRect();
  const minX = Math.max(0, viewport.left + 16);
  const minY = Math.max(0, viewport.top + 16);
  const maxX = Math.max(minX, viewport.left + viewport.width - DEFAULT_IDEA_PANEL_WIDTH - 16);
  const maxY = Math.max(minY, viewport.top + viewport.height - DEFAULT_IDEA_PANEL_HEIGHT - 16);
  const centerX = viewport.left + viewport.width / 2 - DEFAULT_IDEA_PANEL_WIDTH / 2;
  const centerY = viewport.top + viewport.height / 2 - DEFAULT_IDEA_PANEL_HEIGHT / 2;
  const existingPanels = ideas
    .filter(idea => idea.status !== 'archived' && idea.status !== 'discarded')
    .map(idea => idea.panel)
    .filter((panel): panel is Panel => Boolean(panel));
  const offsets: Array<readonly [number, number]> = [
    [0, 0],
    [40, 28],
    [-40, 28],
    [40, -28],
    [-40, -28],
    [104, 0],
    [-104, 0],
    [0, 84],
    [0, -84],
    [128, 64],
    [-128, 64],
    [128, -64],
    [-128, -64],
    [0, 152],
    [0, -152],
  ];
  const spilloverOffsets: Array<readonly [number, number]> = [
    [176, 0],
    [-176, 0],
    [0, 196],
    [0, -196],
    [220, 112],
    [-220, 112],
    [220, -112],
    [-220, -112],
    [320, 0],
    [-320, 0],
  ];

  const createCandidate = (dx: number, dy: number, keepWithinViewport: boolean): Panel => ({
    x: Math.round(
      keepWithinViewport
        ? clamp(centerX + dx, minX, maxX)
        : Math.max(16, centerX + dx),
    ),
    y: Math.round(
      keepWithinViewport
        ? clamp(centerY + dy, minY, maxY)
        : Math.max(16, centerY + dy),
    ),
    width: DEFAULT_IDEA_PANEL_WIDTH,
    height: DEFAULT_IDEA_PANEL_HEIGHT,
  });

  for (const [dx, dy] of offsets) {
    const candidate = createCandidate(dx, dy, true);
    if (existingPanels.every(panel => !overlaps(candidate, panel))) {
      return candidate;
    }
  }

  for (const [dx, dy] of [...offsets, ...spilloverOffsets]) {
    const candidate = createCandidate(dx, dy, false);
    if (existingPanels.every(panel => !overlaps(candidate, panel))) {
      return candidate;
    }
  }

  return createCandidate(0, 0, true);
}

export function useBoardSessionActions({
  ideas,
  newIdeaText,
  newIdeaTags,
  boardController,
  applyCommittedBoard,
  setCreating,
  setSelectedId,
  setNewIdeaText,
  setNewIdeaTags,
  markActivity,
  onCaptureFeedback,
  onCaptureCommitted,
}: UseBoardSessionActionsArgs) {
  async function handleCapture(): Promise<boolean> {
    const text = newIdeaText.trim();
    if (!text) {
      onCaptureFeedback({
        tone: 'error',
        message: 'Write a note before adding it to the canvas.',
      });
      return false;
    }

    setCreating(true);
    onCaptureFeedback(null);
    try {
      const tags = newIdeaTags
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean);
      const panel = createViewportPanel(ideas);
      const result = await boardController.captureIdea({
        rawText: text,
        tags,
        actor: { type: 'user', source: 'canvas' },
        panel,
      });
      const committedPanel = result.idea.panel ?? panel;
      applyCommittedBoard(result.document, result.history);
      setSelectedId(result.idea.id);
      setNewIdeaText('');
      setNewIdeaTags('');
      markActivity('edit');
      onCaptureFeedback({
        tone: 'success',
        message: 'Note added. Bringing it into view…',
      });
      onCaptureCommitted({
        ideaId: result.idea.id,
        panel: committedPanel,
      });
      return true;
    } catch (err) {
      console.error('[App] capture failed:', err);
      onCaptureFeedback({
        tone: 'error',
        message: 'Could not add the note. Try again.',
      });
      return false;
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
