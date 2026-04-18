import { useEffect } from 'react';
import type { BoardDocument } from '../../src/board/types';
import type { BoardHistoryState } from '../../src/storage/boardControllerTypes';
import { createBoardController } from '../../src/storage/boardController';
import type { Connection, Idea, IdeaCritique } from '../../src/types';
import { makeManualConnection, upsertConnection } from './connectionState';

interface UseBrainstormAnalysisEventsArgs {
  boardId: string;
  ideas: Idea[];
  connections: Connection[];
  boardController: ReturnType<typeof createBoardController>;
  applyCommittedBoard: (document: BoardDocument, history: BoardHistoryState) => void;
  markConnectionsRunAt: (value: number) => void;
  handleHighlight: (ids: string[]) => void;
  loadCritiques: () => Promise<void>;
  runConnectionFinder: (options?: {
    origin?: 'manual' | 'ai';
    limitGenerated?: number;
    source?: 'canvas' | 'webmcp' | 'beat';
  }) => Promise<Connection[]>;
  runCritiqueIdea: (
    ideaId: string,
    options?: { origin?: 'manual' | 'ai'; source?: 'canvas' | 'webmcp' | 'beat' },
  ) => Promise<IdeaCritique | null>;
  handleDismissCritique: (id: string, source?: 'canvas' | 'webmcp') => Promise<void>;
}

export function useBrainstormAnalysisEvents({
  boardId,
  ideas,
  connections,
  boardController,
  applyCommittedBoard,
  markConnectionsRunAt,
  handleHighlight,
  loadCritiques,
  runConnectionFinder,
  runCritiqueIdea,
  handleDismissCritique,
}: UseBrainstormAnalysisEventsArgs): void {
  useEffect(() => {
    function emitToolCompletion(requestId?: string, detail?: Record<string, unknown>): void {
      if (!requestId) return;
      window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail }));
    }

    const handleCritiquesChanged = () => {
      void loadCritiques();
    };

    const handleFindConnectionsEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ requestId?: string }>;
      const { requestId } = customEvent.detail ?? {};
      let count = 0;
      try {
        const found = await runConnectionFinder({ source: 'webmcp' });
        count = found.length;
      } catch (err) {
        console.error('[App] find_connections failed:', err);
      }
      emitToolCompletion(requestId, { count });
    };

    const handleDrawConnectionEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        fromIdeaId: string;
        toIdeaId: string;
        kind: Connection['kind'];
        rationale: string;
        requestId?: string;
      }>;
      const { fromIdeaId, toIdeaId, kind, rationale, requestId } = customEvent.detail;
      let error: string | undefined;
      let connectionId: string | undefined;

      const visibleIdeaIds = new Set(
        ideas
          .filter(idea => idea.status !== 'archived' && idea.status !== 'discarded')
          .map(idea => idea.id),
      );

      if (!visibleIdeaIds.has(fromIdeaId) || !visibleIdeaIds.has(toIdeaId)) {
        error = 'draw_connection requires both idea ids to be visible on the active canvas.';
      } else if (fromIdeaId === toIdeaId) {
        error = 'draw_connection requires two different idea ids.';
      } else if (!rationale.trim()) {
        error = 'draw_connection requires a non-empty rationale.';
      } else {
        const connection = makeManualConnection({
          fromIdeaId,
          toIdeaId,
          kind,
          rationale: rationale.trim(),
        });
        connectionId = connection.id;
        const committed = await boardController.replaceConnections({
          connections: upsertConnection(connections, connection),
          actor: { type: 'tool', source: 'webmcp' },
          summary: `Added manual connection ${connection.id}`,
        });
        applyCommittedBoard(committed.document, committed.history);
        markConnectionsRunAt(connection.createdAt);
        handleHighlight(connection.ideaIds);
      }

      emitToolCompletion(requestId, { ok: !error, error, connectionId });
    };

    const handleCritiqueIdeaEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ ideaId: string; requestId?: string }>;
      const { ideaId, requestId } = customEvent.detail;
      let critiqueId: string | undefined;
      let error: string | undefined;
      try {
        const critique = await runCritiqueIdea(ideaId, { source: 'webmcp' });
        critiqueId = critique?.id;
      } catch (err) {
        error = err instanceof Error ? err.message : 'critique failed';
      }
      emitToolCompletion(requestId, { ok: !error, error, critiqueId });
    };

    const handleDismissCritiqueEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ critiqueId: string; requestId?: string }>;
      const { critiqueId, requestId } = customEvent.detail;
      let error: string | undefined;
      try {
        await handleDismissCritique(critiqueId, 'webmcp');
      } catch (err) {
        error = err instanceof Error ? err.message : 'dismiss critique failed';
      }
      emitToolCompletion(requestId, { ok: !error, error });
    };

    const listeners: Array<[string, EventListener]> = [
      ['brainstorm:critiquesChanged', handleCritiquesChanged as EventListener],
      ['brainstorm:findConnections', handleFindConnectionsEvent as EventListener],
      ['brainstorm:drawConnection', handleDrawConnectionEvent as EventListener],
      ['brainstorm:critiqueIdea', handleCritiqueIdeaEvent as EventListener],
      ['brainstorm:dismissCritique', handleDismissCritiqueEvent as EventListener],
    ];

    listeners.forEach(([name, listener]) => window.addEventListener(name, listener));
    return () => {
      listeners.forEach(([name, listener]) => window.removeEventListener(name, listener));
    };
  }, [boardId, ideas, connections, loadCritiques]);
}
