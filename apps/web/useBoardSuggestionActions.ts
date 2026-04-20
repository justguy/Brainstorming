import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { DEFAULT_BOARD_TITLE, type BoardDocument } from '../../src/board/types';
import type { BeatResult, ScoutBeatContext } from '../../src/beats/types';
import { runAdhocRole } from '../../src/orchestrator/adhocRole';
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

type SuggestionBusyState = 'admit' | 'elaborate' | 'dismiss' | null;
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
}: UseBoardSuggestionActionsArgs) {
  const [scouting, setScouting] = useState(false);
  const [lastScoutRunAt, setLastScoutRunAt] = useState<number | null>(null);
  const [suggestionBusy, setSuggestionBusy] = useState<Record<string, SuggestionBusyState>>({});
  const [animatedSuggestionIds, setAnimatedSuggestionIds] = useState<string[]>([]);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
  const suggestionRevealTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => clearTimer(suggestionRevealTimerRef);
  }, []);

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
      return null;
    }
  }

  async function handleAdmitSuggestion(
    id: string,
    source: 'canvas' | 'webmcp' = 'canvas',
  ): Promise<void> {
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
    } finally {
      setSuggestionBusy(prev => ({ ...prev, [id]: null }));
    }
  }

  async function handleElaborateSuggestion(
    id: string,
    source: 'canvas' | 'webmcp' = 'canvas',
  ): Promise<void> {
    setSuggestionBusy(prev => ({ ...prev, [id]: 'elaborate' }));
    try {
      const suggestion = await getSuggestion(id);
      if (!suggestion) return;
      const boardIdeas = ideas.filter(idea => idea.status !== 'archived' && idea.status !== 'discarded');
      const task = buildElaboratorTask({ suggestion, boardIdeas });
      const { result } = await runAdhocRole<SuggestionElaboratorOutput>(suggestionElaborator, task);
      if (!result) return;

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
    } finally {
      setSuggestionBusy(prev => ({ ...prev, [id]: null }));
    }
  }

  async function handleDismissSuggestion(
    id: string,
    source: 'canvas' | 'webmcp' = 'canvas',
  ): Promise<void> {
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
    } finally {
      setSuggestionBusy(prev => ({ ...prev, [id]: null }));
    }
  }

  const visibleCanvasSuggestions = suggestionsExpanded
    ? suggestions
    : suggestions.slice(0, Math.min(COLLAPSED_SUGGESTION_COUNT, suggestions.length));
  const suggestionOverflowCount = Math.max(0, suggestions.length - visibleCanvasSuggestions.length);

  return {
    scouting,
    lastScoutRunAt,
    suggestionBusy,
    animatedSuggestionIds,
    suggestionsExpanded,
    visibleCanvasSuggestions,
    suggestionOverflowCount,
    runScout,
    runCrossPollinate,
    handleAdmitSuggestion,
    handleElaborateSuggestion,
    handleDismissSuggestion,
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
