import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { DEFAULT_BOARD_TITLE, type BoardDocument } from '../../src/board/types';
import type { BeatResult, ConnectBeatContext, CritiqueBeatContext } from '../../src/beats/types';
import { listCritiquesForIdea } from '../../src/storage/critiques';
import type { BoardHistoryState } from '../../src/storage/boardControllerTypes';
import { createBoardController } from '../../src/storage/boardController';
import type { Connection, Idea, IdeaCritique, SupportingDoc } from '../../src/types';
import type { BoardRepository } from './boardRepository';
import { buildConnectBeatContext, buildCritiqueBeatContext } from './beatContext';
import {
  makeManualConnection,
  materializeConnections,
  replaceGeneratedConnections,
  upsertConnection,
} from './connectionState';

const HIGHLIGHT_FLASH_MS = 320;
const REVEAL_WINDOW_MS = 1_800;

type RevealOrigin = 'manual' | 'ai';

type RunBoardBeat = {
  (context: ConnectBeatContext): Promise<BeatResult<'connect'>>;
  (context: CritiqueBeatContext): Promise<BeatResult<'critique'>>;
};

interface UseBoardAnalysisActionsArgs {
  boardId: string;
  ideas: Idea[];
  connections: Connection[];
  boardRepository: Pick<BoardRepository, 'listDocsForIdea'>;
  boardController: ReturnType<typeof createBoardController>;
  applyCommittedBoard: (document: BoardDocument, history: BoardHistoryState) => void;
  runBoardBeat: RunBoardBeat;
}

export function useBoardAnalysisActions({
  boardId,
  ideas,
  connections,
  boardRepository,
  boardController,
  applyCommittedBoard,
  runBoardBeat,
}: UseBoardAnalysisActionsArgs) {
  const [findingConnections, setFindingConnections] = useState(false);
  const [lastConnectionsRunAt, setLastConnectionsRunAt] = useState<number | null>(null);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [critiqueBusyByIdea, setCritiqueBusyByIdea] = useState<Record<string, boolean>>({});
  const [animatedConnectionIds, setAnimatedConnectionIds] = useState<string[]>([]);
  const [animatedCritiqueIds, setAnimatedCritiqueIds] = useState<string[]>([]);
  const flashTimerRef = useRef<number | null>(null);
  const connectionRevealTimerRef = useRef<number | null>(null);
  const critiqueRevealTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      clearTimer(flashTimerRef);
      clearTimer(connectionRevealTimerRef);
      clearTimer(critiqueRevealTimerRef);
    };
  }, []);

  function handleHighlight(ids: string[]): void {
    clearTimer(flashTimerRef);
    setHighlightIds(ids);
    flashTimerRef.current = window.setTimeout(() => {
      setHighlightIds([]);
      flashTimerRef.current = null;
    }, HIGHLIGHT_FLASH_MS);
  }

  function revealConnections(connectionIds: string[]): void {
    clearTimer(connectionRevealTimerRef);
    setAnimatedConnectionIds(connectionIds);
    connectionRevealTimerRef.current = window.setTimeout(() => {
      setAnimatedConnectionIds([]);
      connectionRevealTimerRef.current = null;
    }, REVEAL_WINDOW_MS);
  }

  function revealCritique(critiqueId: string): void {
    clearTimer(critiqueRevealTimerRef);
    setAnimatedCritiqueIds([critiqueId]);
    critiqueRevealTimerRef.current = window.setTimeout(() => {
      setAnimatedCritiqueIds([]);
      critiqueRevealTimerRef.current = null;
    }, REVEAL_WINDOW_MS);
  }

  async function runConnectionFinder(options: {
    origin?: RevealOrigin;
    limitGenerated?: number;
    source?: 'canvas' | 'webmcp' | 'beat';
  } = {}): Promise<Connection[]> {
    setFindingConnections(true);
    try {
      const boardIdeas = ideas.filter(idea => idea.status !== 'archived' && idea.status !== 'discarded');
      const docsPerIdea = await Promise.all(
        boardIdeas.map(idea => boardRepository.listDocsForIdea(idea.id).catch(() => [] as SupportingDoc[])),
      );
      const supportingDocs = docsPerIdea.flat().filter(doc => doc.status === 'ready');
      const beatResult = await runBoardBeat(buildConnectBeatContext({
        boardId,
        boardTitle: DEFAULT_BOARD_TITLE,
        ideas,
        supportingDocs,
        trigger: beatTrigger(options.origin),
        size: beatSize(options.origin),
        aggressiveness: beatAggressiveness(options.origin),
      }));
      const now = beatResult.meta.finishedAt;
      const proposedConnections = beatResult.ok ? beatResult.proposal.connections : [];
      if (proposedConnections.length === 0) {
        const committed = await boardController.replaceConnections({
          connections: connections.filter(connection => connection.id.startsWith('manual-')),
          actor: analysisActorFor(options),
          summary: 'Refreshed board connections',
        });
        applyCommittedBoard(committed.document, committed.history);
        setLastConnectionsRunAt(now);
        return [];
      }

      const materialised = materializeConnections(ideas, supportingDocs, { connections: proposedConnections }, now);
      const nextGenerated = [...materialised]
        .sort((left, right) => {
          const strengthDelta = connectionStrengthWeight(right.strength) - connectionStrengthWeight(left.strength);
          if (strengthDelta !== 0) return strengthDelta;
          return left.createdAt - right.createdAt;
        })
        .slice(0, options.limitGenerated ?? materialised.length);
      const committed = await boardController.replaceConnections({
        connections: replaceGeneratedConnections(connections, nextGenerated),
        actor: analysisActorFor(options),
        summary: 'Refreshed board connections',
      });
      applyCommittedBoard(committed.document, committed.history);
      setLastConnectionsRunAt(now);
      if (options.origin === 'ai' && nextGenerated.length > 0) {
        revealConnections(nextGenerated.map(connection => connection.id));
      }
      return nextGenerated;
    } catch (err) {
      console.error('[App] connection finder failed:', err);
      return [];
    } finally {
      setFindingConnections(false);
    }
  }

  async function createManualConnection(input: {
    fromIdeaId: string;
    toIdeaId: string;
    kind: Connection['kind'];
    rationale: string;
    source?: 'canvas' | 'webmcp';
  }): Promise<Connection> {
    const { fromIdeaId, toIdeaId, kind, rationale } = input;
    const trimmedRationale = rationale.trim();
    const visibleIdeaIds = new Set(
      ideas
        .filter(idea => idea.status !== 'archived' && idea.status !== 'discarded')
        .map(idea => idea.id),
    );

    if (!visibleIdeaIds.has(fromIdeaId) || !visibleIdeaIds.has(toIdeaId)) {
      throw new Error('Choose two notes that are currently visible on the board.');
    }
    if (fromIdeaId === toIdeaId) {
      throw new Error('Choose two different notes to create a connection.');
    }
    if (!trimmedRationale) {
      throw new Error('Add a short explanation for why these notes belong together.');
    }

    const connection = makeManualConnection({
      fromIdeaId,
      toIdeaId,
      kind,
      rationale: trimmedRationale,
    });
    const committed = await boardController.replaceConnections({
      connections: upsertConnection(connections, connection),
      actor: input.source === 'webmcp'
        ? { type: 'tool', source: 'webmcp' }
        : { type: 'user', source: 'canvas', label: 'connectionsPanel' },
      summary: `Added board connection ${connection.id}`,
    });
    applyCommittedBoard(committed.document, committed.history);
    setLastConnectionsRunAt(connection.createdAt);
    handleHighlight(connection.ideaIds);
    revealConnections([connection.id]);
    return connection;
  }

  async function runCritiqueIdea(
    ideaId: string,
    options: { origin?: RevealOrigin; source?: 'canvas' | 'webmcp' | 'beat'; automationKey?: string } = {},
  ): Promise<IdeaCritique | null> {
    setCritiqueBusyByIdea(prev => ({ ...prev, [ideaId]: true }));
    try {
      const idea = ideas.find(entry => entry.id === ideaId);
      if (!idea) throw new Error(`Idea not found: ${ideaId}`);

      const activeCritiques = await listCritiquesForIdea(ideaId, 'active', boardId);
      if (activeCritiques.length >= 2) {
        throw new Error('This idea already has the maximum number of active critiques.');
      }
      const mostRecentCritiqueAt = activeCritiques[0]?.createdAt ?? 0;
      if (mostRecentCritiqueAt && Date.now() - mostRecentCritiqueAt < 25_000) {
        throw new Error('This idea is on critique cooldown. Wait a moment before asking for another critique.');
      }

      const supportingDocs = (await boardRepository.listDocsForIdea(ideaId)).filter(doc => doc.status === 'ready');
      const boardIdeas = ideas.filter(entry => entry.status !== 'archived' && entry.status !== 'discarded');
      const priorCritiques = await listCritiquesForIdea(ideaId, undefined, boardId);
      const beatResult = await runBoardBeat(buildCritiqueBeatContext({
        boardId,
        boardTitle: DEFAULT_BOARD_TITLE,
        ideas: boardIdeas,
        focusIdeaId: ideaId,
        supportingDocs,
        existingCritiques: priorCritiques,
        trigger: beatTrigger(options.origin),
        size: beatSize(options.origin),
        aggressiveness: beatAggressiveness(options.origin),
      }));
      if (!beatResult.ok || beatResult.proposal.challenges.length === 0) {
        throw new Error('Devil’s advocate returned no critique.');
      }

      const priorCritiqueTexts = new Set(
        priorCritiques.map(critique => critique.critique.trim().toLowerCase()),
      );
      const nextChallenge = beatResult.proposal.challenges.find(challenge => (
        !priorCritiqueTexts.has(challenge.critique.trim().toLowerCase())
      ));
      if (!nextChallenge) {
        throw new Error('No new critique surfaced beyond the ones already shown.');
      }

      const critiqueResult = await boardController.createCritique({
        ideaId,
        critique: nextChallenge.critique,
        evidenceAsk: nextChallenge.evidenceAsk,
        actor: critiqueActorFor(options),
        automationKey: options.automationKey,
      });
      applyCommittedBoard(critiqueResult.document, critiqueResult.history);
      handleHighlight([ideaId]);
      if (options.origin === 'ai') revealCritique(critiqueResult.critique.id);
      return critiqueResult.critique;
    } finally {
      setCritiqueBusyByIdea(prev => ({ ...prev, [ideaId]: false }));
    }
  }

  async function handleDismissCritique(
    id: string,
    source: 'canvas' | 'webmcp' = 'canvas',
  ): Promise<void> {
    try {
      const result = await boardController.dismissCritique({
        critiqueId: id,
        actor: { type: source === 'webmcp' ? 'tool' : 'user', source },
      });
      applyCommittedBoard(result.document, result.history);
    } catch (err) {
      console.error('[App] dismiss critique failed:', err);
    }
  }

  return {
    findingConnections,
    lastConnectionsRunAt,
    highlightIds,
    critiqueBusyByIdea,
    animatedConnectionIds,
    animatedCritiqueIds,
    markConnectionsRunAt: setLastConnectionsRunAt,
    handleHighlight,
    runConnectionFinder,
    createManualConnection,
    runCritiqueIdea,
    handleDismissCritique,
  };
}

function clearTimer(ref: MutableRefObject<number | null>): void {
  if (ref.current !== null) {
    window.clearTimeout(ref.current);
    ref.current = null;
  }
}

function beatTrigger(origin?: RevealOrigin): 'automatic' | 'manual' {
  return origin === 'ai' ? 'automatic' : 'manual';
}

function beatSize(origin?: RevealOrigin): 'small' | 'big' {
  return origin === 'ai' ? 'small' : 'big';
}

function beatAggressiveness(origin?: RevealOrigin): 'gentle' | 'balanced' {
  return origin === 'ai' ? 'gentle' : 'balanced';
}

function analysisActorFor(options: { origin?: RevealOrigin; source?: 'canvas' | 'webmcp' | 'beat' }) {
  if (options.origin === 'ai') {
    return { type: 'ai' as const, source: 'beat' as const, beat: 'connect' as const, label: 'connectionFinder' };
  }
  if (options.source === 'webmcp') {
    return { type: 'tool' as const, source: 'webmcp' as const };
  }
  return { type: 'user' as const, source: 'canvas' as const };
}

function critiqueActorFor(options: { origin?: RevealOrigin; source?: 'canvas' | 'webmcp' | 'beat' }) {
  if (options.origin === 'ai') {
    return { type: 'ai' as const, source: 'beat' as const, beat: 'critique' as const, label: 'devilsAdvocate' };
  }
  if (options.source === 'webmcp') {
    return { type: 'tool' as const, source: 'webmcp' as const };
  }
  return { type: 'user' as const, source: 'canvas' as const };
}

function connectionStrengthWeight(strength: Connection['strength']): number {
  switch (strength) {
    case 'strong':
      return 2;
    case 'medium':
      return 1;
    case 'weak':
    default:
      return 0;
  }
}
