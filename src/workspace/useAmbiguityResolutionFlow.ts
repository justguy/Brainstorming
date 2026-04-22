import { useEffect, useMemo, useState } from 'react';
import { runAdhocRole } from '../orchestrator/adhocRole';
import {
  ambiguityResolutionApplier,
  buildAmbiguityResolutionApplyTask,
  type AmbiguityResolutionApplyOutput,
} from '../orchestrator/roles/ambiguityResolutionApplier';
import {
  ambiguityResolutionSuggester,
  buildAmbiguityResolutionSuggestionTask,
  type AmbiguityResolutionSuggestionOutput,
} from '../orchestrator/roles/ambiguityResolutionSuggester';
import type { Ambiguity, ClarificationQuestion, Idea } from '../types';
import { dispatchAndWaitForResult } from '../webmcp/toolDispatch';

const SEVERITY_ORDER: Record<Ambiguity['severity'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export interface SuggestionState extends AmbiguityResolutionSuggestionOutput {
  providerLabel: string;
}

interface UseAmbiguityResolutionFlowArgs {
  idea: Idea;
  onIdeaUpdate: (updated: Idea) => void;
}

export interface UseAmbiguityResolutionFlowResult {
  ambiguities: Ambiguity[];
  suggestions: Record<string, SuggestionState>;
  customDrafts: Record<string, string>;
  errors: Record<string, string>;
  loadingSuggestionId: string | null;
  applyingId: string | null;
  expandedId: string | null;
  setExpandedId: (ambiguityId: string | null) => void;
  setCustomDraft: (ambiguityId: string, value: string) => void;
  suggestResolution: (ambiguity: Ambiguity) => Promise<void>;
  applyResolution: (ambiguity: Ambiguity, sourceMode: 'suggested' | 'custom') => Promise<void>;
  skipForNow: (ambiguity: Ambiguity) => Promise<void>;
}

export function useAmbiguityResolutionFlow({
  idea,
  onIdeaUpdate,
}: UseAmbiguityResolutionFlowArgs): UseAmbiguityResolutionFlowResult {
  const [suggestions, setSuggestions] = useState<Record<string, SuggestionState>>({});
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingSuggestionId, setLoadingSuggestionId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setSuggestions({});
    setCustomDrafts({});
    setExpandedId(null);
    setLoadingSuggestionId(null);
    setApplyingId(null);
    setErrors({});
  }, [idea.id]);

  const ambiguities = useMemo(() => (
    [...idea.ambiguities].sort((left, right) => {
      const statusLeft = left.resolution?.status ?? 'open';
      const statusRight = right.resolution?.status ?? 'open';
      if (statusLeft === 'open' && statusRight !== 'open') return -1;
      if (statusLeft !== 'open' && statusRight === 'open') return 1;
      if (statusLeft === 'deferred' && statusRight !== 'deferred' && statusRight !== 'open') return -1;
      if (statusLeft !== 'deferred' && statusRight === 'deferred' && statusLeft !== 'open') return 1;
      return SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    })
  ), [idea.ambiguities]);

  async function suggestResolution(ambiguity: Ambiguity): Promise<void> {
    if (loadingSuggestionId || applyingId) return;
    setLoadingSuggestionId(ambiguity.id);
    setErrors(current => ({ ...current, [ambiguity.id]: '' }));
    setExpandedId(ambiguity.id);
    try {
      const linkedQuestions = questionsForAmbiguity(idea, ambiguity.id);
      const task = buildAmbiguityResolutionSuggestionTask(idea, ambiguity, linkedQuestions);
      const { result, providerId, model } = await runAdhocRole<AmbiguityResolutionSuggestionOutput>(
        ambiguityResolutionSuggester,
        task,
        { maxTokens: 700 },
      );
      if (!result) {
        throw new Error('No suggested ambiguity resolution came back from the model.');
      }
      setSuggestions(current => ({
        ...current,
        [ambiguity.id]: {
          ...result,
          providerLabel: `${providerId}/${model}`,
        },
      }));
      setCustomDrafts(current => ({
        ...current,
        [ambiguity.id]: current[ambiguity.id] ?? '',
      }));
    } catch (err) {
      setErrors(current => ({
        ...current,
        [ambiguity.id]: err instanceof Error ? err.message : 'Failed to suggest a resolution.',
      }));
    } finally {
      setLoadingSuggestionId(null);
    }
  }

  async function skipForNow(ambiguity: Ambiguity): Promise<void> {
    if (applyingId || loadingSuggestionId) return;
    setApplyingId(ambiguity.id);
    setErrors(current => ({ ...current, [ambiguity.id]: '' }));
    try {
      const detail = await dispatchAndWaitForResult<{ idea: Idea }>('brainstorm:apply_ambiguity_resolution', {
        ideaId: idea.id,
        ambiguityId: ambiguity.id,
        status: 'deferred',
        resolution: 'Deferred by the user for now.',
        action: 'resolve_only',
        summary: `Deferred ambiguity "${ambiguity.plainLanguage}" for now.`,
        roleId: 'ambiguity_resolution_deferral',
        userResolution: 'Skip for now.',
      });
      onIdeaUpdate(detail.idea);
      clearLocalState(ambiguity.id);
    } catch (err) {
      setErrors(current => ({
        ...current,
        [ambiguity.id]: err instanceof Error ? err.message : 'Failed to defer ambiguity.',
      }));
    } finally {
      setApplyingId(null);
    }
  }

  async function applyResolution(
    ambiguity: Ambiguity,
    sourceMode: 'suggested' | 'custom',
  ): Promise<void> {
    if (applyingId || loadingSuggestionId) return;
    const suggestion = suggestions[ambiguity.id];
    const chosenResolution = sourceMode === 'suggested'
      ? suggestion?.suggestedResolution?.trim() ?? ''
      : customDrafts[ambiguity.id]?.trim() ?? '';
    if (!chosenResolution) {
      setErrors(current => ({
        ...current,
        [ambiguity.id]: sourceMode === 'custom'
          ? 'Enter your resolution text before applying it.'
          : 'Generate or choose a suggested resolution first.',
      }));
      return;
    }

    setApplyingId(ambiguity.id);
    setErrors(current => ({ ...current, [ambiguity.id]: '' }));

    try {
      const linkedQuestions = questionsForAmbiguity(idea, ambiguity.id);
      const task = buildAmbiguityResolutionApplyTask({
        idea,
        ambiguity,
        clarifications: linkedQuestions,
        chosenResolution,
        sourceMode,
      });
      const { result, providerId, model } = await runAdhocRole<AmbiguityResolutionApplyOutput>(
        ambiguityResolutionApplier,
        task,
        { maxTokens: 800 },
      );
      if (!result) {
        throw new Error('No usable apply result came back from the model.');
      }

      const detail = await dispatchAndWaitForResult<{ idea: Idea }>('brainstorm:apply_ambiguity_resolution', {
        ideaId: idea.id,
        ambiguityId: ambiguity.id,
        status: result.status,
        resolution: result.resolutionNote,
        action: result.action,
        rule: result.rule,
        nextStep: result.nextStep,
        summary: result.userSummary,
        roleId: ambiguityResolutionApplier.id,
        provider: providerId,
        model,
        userResolution: chosenResolution,
      });
      onIdeaUpdate(detail.idea);
      clearLocalState(ambiguity.id);
    } catch (err) {
      setErrors(current => ({
        ...current,
        [ambiguity.id]: err instanceof Error ? err.message : 'Failed to apply ambiguity resolution.',
      }));
    } finally {
      setApplyingId(null);
    }
  }

  function clearLocalState(ambiguityId: string): void {
    setSuggestions(current => {
      const next = { ...current };
      delete next[ambiguityId];
      return next;
    });
    setCustomDrafts(current => {
      const next = { ...current };
      delete next[ambiguityId];
      return next;
    });
    setErrors(current => {
      const next = { ...current };
      delete next[ambiguityId];
      return next;
    });
    setExpandedId(current => (current === ambiguityId ? null : current));
  }

  return {
    ambiguities,
    suggestions,
    customDrafts,
    errors,
    loadingSuggestionId,
    applyingId,
    expandedId,
    setExpandedId,
    setCustomDraft: (ambiguityId, value) => {
      setCustomDrafts(current => ({ ...current, [ambiguityId]: value }));
    },
    suggestResolution,
    applyResolution,
    skipForNow,
  };
}

export function questionsForAmbiguity(idea: Idea, ambiguityId: string): ClarificationQuestion[] {
  return idea.clarifications.filter(question => question.ambiguityId === ambiguityId);
}
