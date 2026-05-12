import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { DEFAULT_BOARD_TITLE, type BoardDocument } from '../../src/board/types';
import type { BeatResult, ScoutBeatContext } from '../../src/beats/types';
import { runAdhocRole } from '../../src/orchestrator/adhocRole';
import { reportLlmFallback } from '../../src/orchestrator/retryAndFallback';
import {
  suggestionElaborator,
  buildElaboratorTask,
  type SuggestionElaboratorOutput,
} from '../../src/orchestrator/roles/suggestionElaborator';
import type { BoardHistoryState } from '../../src/storage/boardControllerTypes';
import { createBoardController } from '../../src/storage/boardController';
import { getSuggestion } from '../../src/storage/suggestions';
import type {
  FacilitatorActionExecutionMode,
  FacilitatorInterventionStrength,
  FacilitatorRoleId,
} from '../../src/storage/facilitatorSyncEvents';
import type { Idea, ScoutSuggestion, SupportingDoc } from '../../src/types';
import type { BoardRepository } from './boardRepository';
import { buildScoutBeatContext } from './beatContext';
import { runCrossPollinateSuggestion } from './crossPollinateSuggestion';
import { MAX_VISIBLE_SUGGESTIONS, pickVisibleSuggestions } from './suggestionDedup';
import {
  ghostPanelFor,
  suggestionActorFor,
  type RevealOrigin,
  type SuggestionMutationSource,
} from './suggestionActionHelpers';

const COLLAPSED_SUGGESTION_COUNT = 3;
const REVEAL_WINDOW_MS = 1_800;
const SUGGESTION_ERROR_TTL_MS = 6_000;

type SuggestionBusyState = 'admit' | 'elaborate' | 'dismiss' | null;

function suggestionErrorMessage(action: 'admit' | 'elaborate' | 'dismiss', err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err ?? '');
  if (/MAX_TOKENS/i.test(detail)) return 'Model ran out of room. Try again.';
  if (/no usable content/i.test(detail)) return 'Model returned no usable text. Try again.';
  if (/api key|credential/i.test(detail)) return 'API key missing or invalid.';
  switch (action) {
    case 'admit':
      return 'Could not keep this suggestion. Try again.';
    case 'elaborate':
      return 'Elaboration failed. Try again.';
    case 'dismiss':
      return 'Could not dismiss this suggestion. Try again.';
  }
}
type ScoutPolicyOptions = {
  origin?: RevealOrigin;
  limitNew?: number;
  source?: SuggestionMutationSource;
  automationKey?: string;
  executionMode?: FacilitatorActionExecutionMode;
  interventionStrength?: FacilitatorInterventionStrength;
  role?: FacilitatorRoleId;
  policyReason?: string;
};

type RunBoardBeat = {
  (context: ScoutBeatContext): Promise<BeatResult<'scout'>>;
};

interface UseBoardSuggestionActionsArgs {
  boardId: string;
  ideas: Idea[];
  suggestions: ScoutSuggestion[];
  boardRepository: Pick<BoardRepository, 'listDocsForIdea' | 'listSuggestions'>;
  boardController: ReturnType<typeof createBoardController>;
  applyCommittedBoard: (document: BoardDocument, history: BoardHistoryState) => void;
  runBoardBeat: RunBoardBeat;
  markActivity: (kind: 'edit' | 'group' | 'doc') => void;
  onSuggestionOutcome?: (input: {
    suggestionId: string;
    outcome: 'accepted' | 'rejected';
  }) => void;
  onBackgroundError?: (input: { source: 'scout'; error: unknown }) => void;
}

export function useBoardSuggestionActions({
  boardId,
  ideas,
  suggestions,
  boardRepository,
  boardController,
  applyCommittedBoard,
  runBoardBeat,
  markActivity,
  onSuggestionOutcome,
  onBackgroundError,
}: UseBoardSuggestionActionsArgs) {
  const [scouting, setScouting] = useState(false);
  const [lastScoutRunAt, setLastScoutRunAt] = useState<number | null>(null);
  const [suggestionBusy, setSuggestionBusy] = useState<Record<string, SuggestionBusyState>>({});
  const [suggestionError, setSuggestionError] = useState<Record<string, string | null>>({});
  const [animatedSuggestionIds, setAnimatedSuggestionIds] = useState<string[]>([]);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
  const suggestionRevealTimerRef = useRef<number | null>(null);
  const errorClearTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    return () => {
      clearTimer(suggestionRevealTimerRef);
      for (const timerId of Object.values(errorClearTimersRef.current)) {
        window.clearTimeout(timerId);
      }
      errorClearTimersRef.current = {};
    };
  }, []);

  function clearSuggestionError(id: string): void {
    const existing = errorClearTimersRef.current[id];
    if (existing !== undefined) {
      window.clearTimeout(existing);
      delete errorClearTimersRef.current[id];
    }
    setSuggestionError(prev => {
      if (prev[id] === undefined && prev[id] !== null) return prev;
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function setSuggestionErrorMessage(id: string, message: string): void {
    setSuggestionError(prev => ({ ...prev, [id]: message }));
    const existing = errorClearTimersRef.current[id];
    if (existing !== undefined) window.clearTimeout(existing);
    errorClearTimersRef.current[id] = window.setTimeout(() => {
      delete errorClearTimersRef.current[id];
      setSuggestionError(prev => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, SUGGESTION_ERROR_TTL_MS);
  }

  useEffect(() => {
    if (suggestions.length <= COLLAPSED_SUGGESTION_COUNT && suggestionsExpanded) {
      setSuggestionsExpanded(false);
    }
  }, [suggestions.length, suggestionsExpanded]);

  function revealSuggestions(suggestionIds: string[]): void {
    clearTimer(suggestionRevealTimerRef);
    setAnimatedSuggestionIds(suggestionIds);
    suggestionRevealTimerRef.current = window.setTimeout(() => {
      setAnimatedSuggestionIds([]);
      suggestionRevealTimerRef.current = null;
    }, REVEAL_WINDOW_MS);
  }

  async function runScout(options: ScoutPolicyOptions = {}): Promise<ScoutSuggestion[]> {
    setScouting(true);
    try {
      const boardIdeas = ideas.filter(idea => idea.status !== 'archived' && idea.status !== 'discarded');
      const docsPerIdea = await Promise.all(
        boardIdeas.map(idea => boardRepository.listDocsForIdea(idea.id).catch(() => [] as SupportingDoc[])),
      );
      const supportingDocs = docsPerIdea.flat().filter(doc => doc.status === 'ready');
      const existing = await boardRepository.listSuggestions();
      const alreadyProposedRawTexts = existing
        .filter(suggestion => suggestion.status === 'pending' || suggestion.status === 'admitted')
        .map(suggestion => suggestion.rawText);
      const dismissedRawTexts = existing
        .filter(suggestion => suggestion.status === 'dismissed')
        .map(suggestion => suggestion.rawText);

      const beatResult = await runBoardBeat(buildScoutBeatContext({
        boardId,
        boardTitle: DEFAULT_BOARD_TITLE,
        ideas,
        supportingDocs,
        existingSuggestions: existing,
        trigger: beatTrigger(options.origin),
        size: beatSize(options.origin),
        aggressiveness: beatAggressiveness(options.origin, options.interventionStrength),
      }));
      const now = beatResult.meta.finishedAt;
      setLastScoutRunAt(now);
      if (!beatResult.ok || beatResult.proposal.suggestions.length === 0) return [];

      const visibleSuggestions = pickVisibleSuggestions({
        currentVisibleCount: suggestions.length,
        alreadyProposedRawTexts,
        dismissedRawTexts,
        suggestions: beatResult.proposal.suggestions,
      }).slice(0, options.limitNew ?? MAX_VISIBLE_SUGGESTIONS);
      if (visibleSuggestions.length === 0) return [];

      if (options.origin === 'ai' && options.executionMode === 'stage') {
        return visibleSuggestions.map(suggestion => ({
          id: crypto.randomUUID(),
          boardId,
          rawText: suggestion.rawText,
          rationale: suggestion.rationale,
          source: suggestion.source,
          status: 'pending',
          relatedIdeaIds: suggestion.relatedIdeaIds,
          createdAt: now,
          updatedAt: now,
        }));
      }

      const allIdeaIds = new Set(ideas.map(idea => idea.id));
      const created: ScoutSuggestion[] = [];
      let lastCommit: Awaited<ReturnType<typeof boardController.createSuggestion>> | null = null;
      for (let index = 0; index < visibleSuggestions.length; index += 1) {
        const suggestion = visibleSuggestions[index];
        lastCommit = await boardController.createSuggestion({
          rawText: suggestion.rawText,
          rationale: suggestion.rationale,
          source: suggestion.source,
          relatedIdeaIds: suggestion.relatedIdeaIds?.filter(id => allIdeaIds.has(id)),
          panel: ghostPanelFor(suggestions.length + index),
          actor: suggestionActorFor({
            ...options,
            label: aiLabelForRole(options.role, 'outsideKnowledgeScout'),
          }),
          automationKey: options.automationKey,
        });
        created.push(lastCommit.suggestion);
      }

      if (lastCommit) {
        applyCommittedBoard(lastCommit.document, lastCommit.history);
      }
      if (created.length > 0) {
        setSuggestionsExpanded(false);
      }
      if (options.origin === 'ai' && created.length > 0) {
        revealSuggestions(created.map(suggestion => suggestion.id));
      }
      return created;
    } catch (err) {
      console.error('[App] scout failed:', err);
      onBackgroundError?.({ source: 'scout', error: err });
      return [];
    } finally {
      setScouting(false);
    }
  }

  async function runCrossPollinate(
    source: SuggestionMutationSource = 'canvas',
  ): Promise<ScoutSuggestion | null> {
    try {
      const existingSuggestions = await boardRepository.listSuggestions();
      return await runCrossPollinateSuggestion({
        ideas,
        currentSuggestions: suggestions,
        existingSuggestions,
        createSuggestion: boardController.createSuggestion,
        applyCommittedBoard,
        source,
      });
    } catch (err) {
      console.error('[App] cross_pollinate failed:', err);
      onBackgroundError?.({ source: 'scout', error: err });
      return null;
    }
  }

  async function handleAdmitSuggestion(
    id: string,
    source: 'canvas' | 'webmcp' = 'canvas',
  ): Promise<void> {
    clearSuggestionError(id);
    setSuggestionBusy(prev => ({ ...prev, [id]: 'admit' }));
    try {
      const result = await boardController.admitSuggestion({
        suggestionId: id,
        actor: source === 'webmcp'
          ? { type: 'tool', source: 'webmcp' }
          : { type: 'user', source: 'canvas' },
      });
      applyCommittedBoard(result.document, result.history);
      markActivity('edit');
      onSuggestionOutcome?.({ suggestionId: id, outcome: 'accepted' });
    } catch (err) {
      console.error('[App] admit suggestion failed:', err);
      setSuggestionErrorMessage(id, suggestionErrorMessage('admit', err));
    } finally {
      setSuggestionBusy(prev => ({ ...prev, [id]: null }));
    }
  }

  async function handleElaborateSuggestion(
    id: string,
    source: 'canvas' | 'webmcp' = 'canvas',
  ): Promise<void> {
    clearSuggestionError(id);
    setSuggestionBusy(prev => ({ ...prev, [id]: 'elaborate' }));
    try {
      const suggestion = await getSuggestion(id);
      if (!suggestion) return;
      const boardIdeas = ideas.filter(idea => idea.status !== 'archived' && idea.status !== 'discarded');
      const task = buildElaboratorTask({ suggestion, boardIdeas });
      const { result, providerId, model } = await runAdhocRole<SuggestionElaboratorOutput>(suggestionElaborator, task);
      if (!result) {
        reportLlmFallback({
          providerId,
          model,
          message: `Could not elaborate "${suggestion.rawText.slice(0, 60)}…" — the model returned no usable result. You can edit the suggestion manually or try again.`,
        });
        setSuggestionErrorMessage(id, 'Elaboration failed. Try again.');
        return;
      }

      const parts = [result.elaboration];
      if (result.subSuggestions.length > 0) {
        parts.push('', '**Sub-parts:**', ...result.subSuggestions.map((value: string) => `- ${value}`));
      }
      if (result.implicationsIfAdmitted.length > 0) {
        parts.push('', '**If admitted:**', ...result.implicationsIfAdmitted.map((value: string) => `- ${value}`));
      }
      const committed = await boardController.elaborateSuggestion({
        suggestionId: id,
        elaboration: parts.join('\n'),
        actor: source === 'webmcp'
          ? { type: 'tool', source: 'webmcp' }
          : { type: 'user', source: 'canvas' },
      });
      applyCommittedBoard(committed.document, committed.history);
    } catch (err) {
      console.error('[App] elaborate suggestion failed:', err);
      setSuggestionErrorMessage(id, suggestionErrorMessage('elaborate', err));
    } finally {
      setSuggestionBusy(prev => ({ ...prev, [id]: null }));
    }
  }

  async function handleDismissSuggestion(
    id: string,
    source: 'canvas' | 'webmcp' = 'canvas',
  ): Promise<void> {
    clearSuggestionError(id);
    setSuggestionBusy(prev => ({ ...prev, [id]: 'dismiss' }));
    try {
      const result = await boardController.dismissSuggestion({
        suggestionId: id,
        actor: { type: source === 'webmcp' ? 'tool' : 'user', source },
      });
      applyCommittedBoard(result.document, result.history);
      onSuggestionOutcome?.({ suggestionId: id, outcome: 'rejected' });
    } catch (err) {
      console.error('[App] dismiss suggestion failed:', err);
      setSuggestionErrorMessage(id, suggestionErrorMessage('dismiss', err));
    } finally {
      setSuggestionBusy(prev => ({ ...prev, [id]: null }));
    }
  }

  async function handleMoveSuggestion(
    id: string,
    x: number,
    y: number,
    source: 'canvas' | 'webmcp' = 'canvas',
  ): Promise<void> {
    const suggestion = suggestions.find(entry => entry.id === id);
    const panel = suggestion?.panel;
    if (!suggestion || !panel) return;

    const result = await boardController.moveSuggestion({
      suggestionId: id,
      panel: {
        ...panel,
        x,
        y,
      },
      actor: { type: source === 'webmcp' ? 'tool' : 'user', source },
    });
    applyCommittedBoard(result.document, result.history);
    markActivity('edit');
  }

  const visibleCanvasSuggestions = suggestionsExpanded
    ? suggestions
    : suggestions.slice(0, Math.min(COLLAPSED_SUGGESTION_COUNT, suggestions.length));
  const suggestionOverflowCount = Math.max(0, suggestions.length - visibleCanvasSuggestions.length);

  return {
    scouting,
    lastScoutRunAt,
    suggestionBusy,
    suggestionError,
    animatedSuggestionIds,
    suggestionsExpanded,
    visibleCanvasSuggestions,
    suggestionOverflowCount,
    runScout,
    runCrossPollinate,
    handleAdmitSuggestion,
    handleElaborateSuggestion,
    handleDismissSuggestion,
    handleMoveSuggestion,
    expandSuggestions: () => setSuggestionsExpanded(true),
    collapseSuggestions: () => setSuggestionsExpanded(false),
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

function beatAggressiveness(
  origin?: RevealOrigin,
  interventionStrength?: FacilitatorInterventionStrength,
): 'gentle' | 'balanced' | 'aggressive' {
  if (origin !== 'ai') return 'balanced';
  return interventionStrength ?? 'gentle';
}

function aiLabelForRole(role: FacilitatorRoleId | undefined, fallback: string): string {
  switch (role) {
    case 'scout':
      return 'policyScout';
    case 'historian':
      return 'policyHistorian';
    case 'facilitator':
      return 'policyFacilitator';
    default:
      return fallback;
  }
}
