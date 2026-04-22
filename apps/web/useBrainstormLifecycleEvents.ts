import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { BoardDocument } from '../../src/board/types';
import type { BoardHistoryState } from '../../src/storage/boardControllerTypes';
import { createBoardController } from '../../src/storage/boardController';
import { applyAmbiguityResolution, advance } from '../../src/orchestrator/stateMachine';
import { isKnownBeadPhase, normalizeBeadCoordination } from '../../src/orchestrator/beadState';
import { findSubPhase } from '../../src/orchestrator/subPhases';
import type { Idea, AmbiguityResolutionStatus, LlmMessage, ProviderId } from '../../src/types';

const TOOL_ACTOR = { type: 'tool', source: 'webmcp' } as const;
const VALID_NEXT_STEPS = ['planning', 'prototyping', 'research', 'stakeholder_review', 'defer'] as const;

type AmbiguityApplyAction = 'resolve_only' | 'add_rule' | 'choose_next_step';

interface UseBrainstormLifecycleEventsArgs {
  boardId: string;
  ideas: Idea[];
  boardController: ReturnType<typeof createBoardController>;
  applyCommittedBoard: (document: BoardDocument, history: BoardHistoryState) => void;
  loadIdeas: () => Promise<void>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setAdvancingFromTool: Dispatch<SetStateAction<boolean>>;
  setCreating: Dispatch<SetStateAction<boolean>>;
}

export function useBrainstormLifecycleEvents({
  boardId,
  ideas,
  boardController,
  applyCommittedBoard,
  loadIdeas,
  setSelectedId,
  setAdvancingFromTool,
  setCreating,
}: UseBrainstormLifecycleEventsArgs): void {
  useEffect(() => {
    function emitToolCompletion(requestId?: string, detail?: Record<string, unknown>): void {
      if (!requestId) return;
      window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail }));
    }

    async function patchIdea(args: {
      ideaId: string;
      requestId?: string;
      summary: string;
      mutate: (idea: Idea) => Partial<Idea>;
      errorLabel: string;
      completion: Record<string, unknown> | ((updated: Idea) => Record<string, unknown>);
    }): Promise<void> {
      const errorCompletion = typeof args.completion === 'function' ? {} : args.completion;
      const idea = ideas.find(entry => entry.id === args.ideaId);
      if (!idea) {
        emitToolCompletion(args.requestId, { ok: false, ...errorCompletion, error: `No idea found with id "${args.ideaId}".` });
        return;
      }

      try {
        const patch = args.mutate(idea);
        const committed = await boardController.updateIdea({
          ideaId: args.ideaId,
          patch,
          actor: TOOL_ACTOR,
          summary: args.summary,
        });
        applyCommittedBoard(committed.document, committed.history);
        const completion = typeof args.completion === 'function'
          ? args.completion(committed.idea)
          : args.completion;
        emitToolCompletion(args.requestId, { ok: true, ...completion });
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Update failed';
        console.error(args.errorLabel, err);
        emitToolCompletion(args.requestId, { ok: false, ...errorCompletion, error });
      }
    }

    function normalizeAmbiguityResolutionInput(status: string | undefined): Exclude<AmbiguityResolutionStatus, 'open'> | 'open' {
      if (status === 'open' || status === 'resolved' || status === 'deferred' || status === 'dismissed') {
        return status;
      }
      return 'resolved';
    }

    async function patchAmbiguityResolution(args: {
      ideaId: string;
      ambiguityId: string;
      status: AmbiguityResolutionStatus;
      note?: string;
      requestId?: string;
      resolvedBy?: string;
    }): Promise<void> {
      try {
        const idea = ideas.find(entry => entry.id === args.ideaId);
        if (!idea) {
          emitToolCompletion(args.requestId, {
            ok: false,
            error: `No idea found with id "${args.ideaId}".`,
          });
          return;
        }

        const nextIdea = applyAmbiguityResolution(idea, {
          ambiguityId: args.ambiguityId,
          status: args.status,
          note: args.note,
          resolvedBy: args.resolvedBy,
        });

        await patchIdea({
          ideaId: args.ideaId,
          summary: `Marked ambiguity ${args.ambiguityId} as ${args.status}`,
          mutate: () => ({ ambiguities: nextIdea.ambiguities }),
          errorLabel: '[App] resolveAmbiguity failed:',
          completion: {
            ambiguityId: args.ambiguityId,
            status: args.status,
            note: args.note,
          },
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : 'resolve failed';
        emitToolCompletion(args.requestId, { ok: false, error });
      }
    }

    function listAmbiguitiesForIdea(idea: Idea, status?: AmbiguityResolutionStatus): Idea['ambiguities'] {
      return idea.ambiguities.filter(ambiguity =>
        status ? (ambiguity.resolution?.status ?? 'open') === status : true,
      );
    }

    function normalizeRuleText(rule: string | undefined): string | null {
      if (typeof rule !== 'string') return null;
      const trimmed = rule.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    function normalizeProvider(provider: string | undefined): ProviderId | undefined {
      if (provider === 'gemini' || provider === 'openai' || provider === 'anthropic') {
        return provider;
      }
      return undefined;
    }

    function normalizeAmbiguityApplyAction(action: string | undefined): AmbiguityApplyAction {
      if (action === 'add_rule' || action === 'choose_next_step') {
        return action;
      }
      return 'resolve_only';
    }

    function normalizeNextStep(step: string | undefined): Idea['briefState']['nextStep'] | null {
      return VALID_NEXT_STEPS.includes(step as (typeof VALID_NEXT_STEPS)[number])
        ? step as Idea['briefState']['nextStep']
        : null;
    }

    function normalizeBeadReason(reason: string | undefined): string | null {
      if (typeof reason !== 'string') return null;
      const trimmed = reason.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    const handleSelectIdea = (event: Event) => {
      const customEvent = event as CustomEvent<{ ideaId: string; requestId?: string }>;
      const { ideaId, requestId } = customEvent.detail;
      setSelectedId(ideaId);
      void loadIdeas().then(() => emitToolCompletion(requestId));
    };

    const handleAdvancePhase = async (event: Event) => {
      const customEvent = event as CustomEvent<{ ideaId: string; userInput?: string; skip?: boolean; requestId?: string }>;
      const { ideaId, userInput, skip, requestId } = customEvent.detail;
      const idea = ideas.find(entry => entry.id === ideaId);
      if (!idea) {
        emitToolCompletion(requestId);
        return;
      }

      setAdvancingFromTool(true);
      try {
        const updated = await advance(idea, userInput ?? '', !!skip);
        const committed = await boardController.updateIdea({
          ideaId: updated.id,
          patch: updated,
          actor: TOOL_ACTOR,
          summary: `Advanced idea ${updated.id} to phase ${updated.phase}`,
        });
        applyCommittedBoard(committed.document, committed.history);
      } catch (err) {
        console.error('[App] advancePhase failed:', err);
      } finally {
        setAdvancingFromTool(false);
        emitToolCompletion(requestId);
      }
    };

    const handlePatchLens = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        ideaId: string;
        lensId: string;
        verdict?: 'pending' | 'pinned' | 'dismissed';
        userNote?: string;
        requestId?: string;
      }>;
      const { ideaId, lensId, verdict, userNote, requestId } = customEvent.detail;
      await patchIdea({
        ideaId,
        requestId,
        summary: `Updated lens ${lensId} on idea ${ideaId}`,
        errorLabel: '[App] patchLens failed:',
        mutate: idea => ({
          briefState: {
            ...idea.briefState,
            lenses: idea.briefState.lenses.map(lens =>
              lens.id === lensId
              ? { ...lens, ...(verdict ? { verdict } : {}), ...(userNote !== undefined ? { userNote } : {}) }
              : lens,
            ),
          },
        }),
        completion: {},
      });
    };

    const handlePatchChallenge = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        ideaId: string;
        challengeId: string;
        stance?: 'pending' | 'accept' | 'defer' | 'rebut';
        userRebuttal?: string;
        requestId?: string;
      }>;
      const { ideaId, challengeId, stance, userRebuttal, requestId } = customEvent.detail;
      await patchIdea({
        ideaId,
        requestId,
        summary: `Updated challenge ${challengeId} on idea ${ideaId}`,
        errorLabel: '[App] patchChallenge failed:',
        mutate: idea => ({
          briefState: {
            ...idea.briefState,
            challenges: idea.briefState.challenges.map(challenge =>
            challenge.id === challengeId
              ? { ...challenge, ...(stance ? { stance } : {}), ...(userRebuttal !== undefined ? { userRebuttal } : {}) }
              : challenge,
            ),
          },
        }),
        completion: {},
      });
    };

    const handlePatchStress = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        ideaId: string;
        stressId: string;
        handled?: boolean;
        userResponse?: string;
        requestId?: string;
      }>;
      const { ideaId, stressId, handled, userResponse, requestId } = customEvent.detail;
      await patchIdea({
        ideaId,
        requestId,
        summary: `Updated stress result ${stressId} on idea ${ideaId}`,
        errorLabel: '[App] patchStress failed:',
        mutate: idea => ({
          briefState: {
            ...idea.briefState,
            stressResults: idea.briefState.stressResults.map(stress =>
            stress.id === stressId
              ? { ...stress, ...(handled !== undefined ? { handled } : {}), ...(userResponse !== undefined ? { userResponse } : {}) }
              : stress,
            ),
          },
        }),
        completion: {},
      });
    };

    const handleExportHandoff = (event: Event) => {
      const customEvent = event as CustomEvent<{ ideaId: string; requestId?: string }>;
      const { ideaId, requestId } = customEvent.detail;
      const idea = ideas.find(entry => entry.id === ideaId);
      if (idea?.artifactMd) {
        const slug = idea.rawText.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const blob = new Blob([idea.artifactMd], { type: 'text/markdown; charset=utf-8' });
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({ url, filename: `handoff_${slug}.md` });
      }
      emitToolCompletion(requestId);
    };

    const handleChooseNextStep = async (event: Event) => {
      const customEvent = event as CustomEvent<{ ideaId: string; nextStep: string; requestId?: string }>;
      const { ideaId, nextStep, requestId } = customEvent.detail;
      await patchIdea({
        ideaId,
        requestId,
        summary: `Selected next step for idea ${ideaId}`,
        errorLabel: '[App] chooseNextStep failed:',
        mutate: idea => ({
          briefState: {
            ...idea.briefState,
            nextStep: nextStep as Idea['briefState']['nextStep'],
          },
        }),
        completion: {},
      });
    };

    const handleAddRule = async (event: Event) => {
      const customEvent = event as CustomEvent<{ ideaId: string; rule: string; requestId?: string }>;
      const { ideaId, rule, requestId } = customEvent.detail;
      const normalizedRule = normalizeRuleText(rule);
      if (!normalizedRule) {
        emitToolCompletion(requestId, { ok: false, error: 'Rule text must be a non-empty string.' });
        return;
      }

      await patchIdea({
        ideaId,
        requestId,
        summary: `Added rule to idea ${ideaId}`,
        errorLabel: '[App] addRule failed:',
        mutate: idea => {
          if (idea.briefState.mustStayTrueRules.includes(normalizedRule)) {
            throw new Error(`Rule "${normalizedRule}" already exists on this idea.`);
          }
          return {
            briefState: {
              ...idea.briefState,
              mustStayTrueRules: [...idea.briefState.mustStayTrueRules, normalizedRule],
            },
          };
        },
        completion: {
          rule: normalizedRule,
        },
      });
    };

    const handleRemoveRule = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        ideaId: string;
        ruleIndex?: number;
        rule?: string;
        requestId?: string;
      }>;
      const { ideaId, ruleIndex, rule, requestId } = customEvent.detail;
      await patchIdea({
        ideaId,
        requestId,
        summary: `Removed rule from idea ${ideaId}`,
        errorLabel: '[App] removeRule failed:',
        mutate: idea => {
          const rules = idea.briefState.mustStayTrueRules;
          const resolvedIndex = Number.isInteger(ruleIndex)
            ? (ruleIndex as number)
            : typeof rule === 'string'
              ? rules.findIndex(entry => entry === rule)
              : -1;
          if (resolvedIndex < 0 || resolvedIndex >= rules.length) {
            throw new Error('Rule not found on this idea.');
          }
          return {
            briefState: {
              ...idea.briefState,
              mustStayTrueRules: rules.filter((_, index) => index !== resolvedIndex),
            },
          };
        },
        completion: {
          ruleIndex: Number.isInteger(ruleIndex) ? ruleIndex : null,
          rule: rule ?? null,
        },
      });
    };

    const handleCaptureIdeaEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ rawText: string; tags?: string[]; requestId?: string }>;
      const { rawText, tags, requestId } = customEvent.detail;
      let ideaId: string | undefined;
      let error: string | undefined;
      setCreating(true);
      try {
        const result = await boardController.captureIdea({
          rawText: rawText.trim(),
          tags: tags ?? [],
          actor: TOOL_ACTOR,
        });
        applyCommittedBoard(result.document, result.history);
        ideaId = result.changeSet?.affected.find(entry => entry.store === 'ideas')?.id;
        setSelectedId(ideaId ?? null);
      } catch (err) {
        error = err instanceof Error ? err.message : 'capture failed';
      } finally {
        setCreating(false);
      }
      emitToolCompletion(requestId, { ideaId, error });
    };

    const handleApplyAmbiguityResolution = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        ideaId: string;
        ambiguityId: string;
        status: string;
        resolution?: string;
        action?: string;
        rule?: string;
        nextStep?: string | null;
        summary?: string;
        roleId?: string;
        provider?: string;
        model?: string;
        userResolution?: string;
        requestId?: string;
      }>;
      const {
        ideaId,
        ambiguityId,
        status,
        resolution,
        action,
        rule,
        nextStep,
        summary,
        roleId,
        provider,
        model,
        userResolution,
        requestId,
      } = customEvent.detail;

      const normalizedStatus = normalizeAmbiguityResolutionInput(status);
      const normalizedResolution = normalizeRuleText(resolution) ?? undefined;
      const normalizedRule = normalizeRuleText(rule);
      const normalizedAction = normalizeAmbiguityApplyAction(action);
      const normalizedNextStep = normalizeNextStep(nextStep ?? undefined);
      const normalizedProvider = normalizeProvider(provider);

      await patchIdea({
        ideaId,
        requestId,
        summary: summary?.trim() || `Applied ambiguity resolution for ${ambiguityId}`,
        errorLabel: '[App] applyAmbiguityResolution failed:',
        mutate: idea => {
          const ambiguity = idea.ambiguities.find(entry => entry.id === ambiguityId);
          if (!ambiguity) {
            throw new Error(`No ambiguity found with id "${ambiguityId}".`);
          }

          const resolvedIdea = applyAmbiguityResolution(idea, {
            ambiguityId,
            status: normalizedStatus,
            note: normalizedResolution,
            resolvedBy: roleId ?? 'apply_ambiguity_resolution',
          });

          let briefState = resolvedIdea.briefState;
          let appliedWrite = 'Recorded the ambiguity resolution note.';
          if (normalizedAction === 'add_rule' && normalizedRule && !briefState.mustStayTrueRules.includes(normalizedRule)) {
            briefState = {
              ...briefState,
              mustStayTrueRules: [...briefState.mustStayTrueRules, normalizedRule],
            };
            appliedWrite = `Added rule "${normalizedRule}".`;
          } else if (
            normalizedAction === 'choose_next_step' &&
            normalizedNextStep &&
            briefState.nextStep !== normalizedNextStep
          ) {
            briefState = {
              ...briefState,
              nextStep: normalizedNextStep,
            };
            appliedWrite = `Set next step to "${normalizedNextStep}".`;
          }

          const phaseSpec = findSubPhase(resolvedIdea.phase);
          const phaseLabel = phaseSpec?.label ?? `Step ${resolvedIdea.phase}`;
          const now = Date.now();
          const turnEntries: LlmMessage[] = [];

          if (normalizeRuleText(userResolution) && normalizedStatus !== 'dismissed') {
            turnEntries.push({
              role: 'user',
              content: `Chosen ambiguity resolution for "${ambiguity.plainLanguage}": ${normalizeRuleText(userResolution)}`,
              meta: {
                phase: resolvedIdea.phase,
                phaseLabel,
                roleId: 'ambiguity_resolution_choice',
                source: 'user_input',
                entryKind: 'task',
                runSurface: 'user_edit',
              },
            });
          }

          turnEntries.push({
            role: 'assistant',
            content: [
              `Ambiguity: ${ambiguity.plainLanguage}`,
              `Status: ${normalizedStatus}`,
              normalizedResolution ? `Resolution: ${normalizedResolution}` : null,
              `Board change: ${appliedWrite}`,
              summary?.trim() ? `Summary: ${summary.trim()}` : null,
            ].filter(Boolean).join('\n'),
            meta: {
              phase: resolvedIdea.phase,
              phaseLabel,
              roleId: roleId ?? 'apply_ambiguity_resolution',
              provider: normalizedProvider,
              model,
              source: 'webmcp_tool',
              entryKind: 'result',
              runSurface: 'webmcp_tool',
              liveToolOrigin: 'brainstorm',
              liveToolNames: ['apply_ambiguity_resolution'],
            },
          });

          return {
            ambiguities: resolvedIdea.ambiguities,
            briefState,
            turnLog: [...idea.turnLog, ...turnEntries],
            lastTurnAt: now,
          };
        },
        completion: updated => ({
          idea: updated,
          ambiguityId,
          status: normalizedStatus,
        }),
      });
    };

    const handleListRisks = (event: Event) => {
      const customEvent = event as CustomEvent<{ ideaId: string; requestId?: string }>;
      const { ideaId, requestId } = customEvent.detail;
      const idea = ideas.find(entry => entry.id === ideaId);
      if (!idea) {
        emitToolCompletion(requestId, { ok: false, error: `No idea found with id "${ideaId}".` });
        return;
      }

      emitToolCompletion(requestId, {
        ok: true,
        risks: idea.briefState.risks,
        count: idea.briefState.risks.length,
        stressResults: idea.briefState.stressResults,
        rules: idea.briefState.mustStayTrueRules,
      });
    };

    const handlePatchRisk = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        ideaId: string;
        riskId: string;
        description?: string;
        likelihood?: Idea['briefState']['risks'][number]['likelihood'];
        impact?: Idea['briefState']['risks'][number]['impact'];
        userNote?: string;
        requestId?: string;
      }>;
      const { ideaId, riskId, description, likelihood, impact, userNote, requestId } = customEvent.detail;
      await patchIdea({
        ideaId,
        requestId,
        summary: `Updated risk ${riskId} on idea ${ideaId}`,
        errorLabel: '[App] patchRisk failed:',
        mutate: idea => {
          if (!idea.briefState.risks.some(risk => risk.id === riskId)) {
            throw new Error(`No risk found with id "${riskId}".`);
          }
          return {
            briefState: {
              ...idea.briefState,
              risks: idea.briefState.risks.map(risk =>
                risk.id === riskId
                  ? {
                    ...risk,
                    ...(description !== undefined ? { description } : {}),
                    ...(likelihood !== undefined ? { likelihood } : {}),
                    ...(impact !== undefined ? { impact } : {}),
                    ...(userNote !== undefined ? { userNote: userNote.trim() || undefined } : {}),
                    updatedAt: Date.now(),
                  }
                  : risk,
              ),
            },
          };
        },
        completion: {
          riskId,
          description,
          likelihood,
          impact,
          userNote,
        },
      });
    };

    const handleSuggestNextBead = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        ideaId: string;
        phaseNumber: number;
        reason: string;
        requestId?: string;
      }>;
      const { ideaId, phaseNumber, reason, requestId } = customEvent.detail;
      const normalizedReason = normalizeBeadReason(reason);
      if (!isKnownBeadPhase(phaseNumber)) {
        emitToolCompletion(requestId, { ok: false, error: `Unknown bead phase "${phaseNumber}".` });
        return;
      }
      if (!normalizedReason) {
        emitToolCompletion(requestId, { ok: false, error: 'A non-empty `reason` is required.' });
        return;
      }

      await patchIdea({
        ideaId,
        requestId,
        summary: `Suggested bead ${phaseNumber} for idea ${ideaId}`,
        errorLabel: '[App] suggestNextBead failed:',
        mutate: idea => {
          if (phaseNumber <= idea.phase) {
            throw new Error(`Suggested bead must be ahead of the current phase ${idea.phase}.`);
          }
          const coordination = normalizeBeadCoordination(idea.beadCoordination);
          return {
            beadCoordination: {
              ...coordination,
              suggestedNext: {
                phase: phaseNumber,
                reason: normalizedReason,
                suggestedAt: Date.now(),
                actorType: TOOL_ACTOR.type,
                actorSource: TOOL_ACTOR.source,
              },
            },
          };
        },
        completion: {
          phaseNumber,
          reason: normalizedReason,
        },
      });
    };

    const handleFlagBeadForReview = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        ideaId: string;
        phaseNumber: number;
        reason: string;
        requestId?: string;
      }>;
      const { ideaId, phaseNumber, reason, requestId } = customEvent.detail;
      const normalizedReason = normalizeBeadReason(reason);
      if (!isKnownBeadPhase(phaseNumber)) {
        emitToolCompletion(requestId, { ok: false, error: `Unknown bead phase "${phaseNumber}".` });
        return;
      }
      if (!normalizedReason) {
        emitToolCompletion(requestId, { ok: false, error: 'A non-empty `reason` is required.' });
        return;
      }

      await patchIdea({
        ideaId,
        requestId,
        summary: `Flagged bead ${phaseNumber} for review on idea ${ideaId}`,
        errorLabel: '[App] flagBeadForReview failed:',
        mutate: idea => {
          if (phaseNumber >= idea.phase) {
            throw new Error(`Only completed beads can be flagged for review. Current phase is ${idea.phase}.`);
          }
          const coordination = normalizeBeadCoordination(idea.beadCoordination);
          const existingFlag = coordination.reviewFlags.find(flag => Math.abs(flag.phase - phaseNumber) < 1e-9);
          const nextFlag = {
            id: existingFlag?.id ?? crypto.randomUUID(),
            phase: phaseNumber,
            reason: normalizedReason,
            flaggedAt: Date.now(),
            actorType: TOOL_ACTOR.type,
            actorSource: TOOL_ACTOR.source,
          };
          return {
            beadCoordination: {
              ...coordination,
              reviewFlags: [
                ...coordination.reviewFlags.filter(flag => Math.abs(flag.phase - phaseNumber) >= 1e-9),
                nextFlag,
              ].sort((left, right) => left.phase - right.phase || left.flaggedAt - right.flaggedAt),
            },
          };
        },
        completion: {
          phaseNumber,
          reason: normalizedReason,
        },
      });
    };

    const handleListAmbiguities = (event: Event) => {
      const customEvent = event as CustomEvent<{
        ideaId: string;
        status?: AmbiguityResolutionStatus;
        requestId?: string;
      }>;
      const { ideaId, status, requestId } = customEvent.detail;
      const idea = ideas.find(entry => entry.id === ideaId);
      if (!idea) {
        emitToolCompletion(requestId, { ok: false, error: `No idea found with id "${ideaId}".` });
        return;
      }
      const ambiguities = listAmbiguitiesForIdea(idea, status);
      emitToolCompletion(requestId, {
        ok: true,
        ambiguities,
        count: ambiguities.length,
      });
    };

    const handleResolveAmbiguity = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        ideaId: string;
        ambiguityId: string;
        status?: AmbiguityResolutionStatus | 'defer';
        resolution?: string;
        requestId?: string;
      }>;
      const {
        ideaId,
        ambiguityId,
        status,
        resolution,
        requestId,
      } = customEvent.detail;
      await patchAmbiguityResolution({
        ideaId,
        ambiguityId,
        status: normalizeAmbiguityResolutionInput(status === 'defer' ? 'deferred' : status),
        resolvedBy: TOOL_ACTOR.type,
        note: resolution,
        requestId,
      });
    };

    const listeners: Array<[string, EventListener]> = [
      ['brainstorm:selectIdea', handleSelectIdea as EventListener],
      ['brainstorm:advancePhase', handleAdvancePhase as EventListener],
      ['brainstorm:patchLens', handlePatchLens as EventListener],
      ['brainstorm:patchChallenge', handlePatchChallenge as EventListener],
      ['brainstorm:patchStress', handlePatchStress as EventListener],
      ['brainstorm:exportHandoff', handleExportHandoff as EventListener],
      ['brainstorm:chooseNextStep', handleChooseNextStep as EventListener],
      ['brainstorm:addRule', handleAddRule as EventListener],
      ['brainstorm:add_rule', handleAddRule as EventListener],
      ['brainstorm:removeRule', handleRemoveRule as EventListener],
      ['brainstorm:remove_rule', handleRemoveRule as EventListener],
      ['brainstorm:captureIdea', handleCaptureIdeaEvent as EventListener],
      ['brainstorm:listRisks', handleListRisks as EventListener],
      ['brainstorm:list_risks', handleListRisks as EventListener],
      ['brainstorm:patchRisk', handlePatchRisk as EventListener],
      ['brainstorm:patch_risk', handlePatchRisk as EventListener],
      ['brainstorm:suggestNextBead', handleSuggestNextBead as EventListener],
      ['brainstorm:suggest_next_bead', handleSuggestNextBead as EventListener],
      ['brainstorm:flagBeadForReview', handleFlagBeadForReview as EventListener],
      ['brainstorm:flag_bead_for_review', handleFlagBeadForReview as EventListener],
      ['brainstorm:listAmbiguities', handleListAmbiguities as EventListener],
      ['brainstorm:list_ambiguities', handleListAmbiguities as EventListener],
      ['brainstorm:resolveAmbiguity', handleResolveAmbiguity as EventListener],
      ['brainstorm:resolve_ambiguity', handleResolveAmbiguity as EventListener],
      ['brainstorm:applyAmbiguityResolution', handleApplyAmbiguityResolution as EventListener],
      ['brainstorm:apply_ambiguity_resolution', handleApplyAmbiguityResolution as EventListener],
    ];

    listeners.forEach(([name, listener]) => window.addEventListener(name, listener));
    return () => {
      listeners.forEach(([name, listener]) => window.removeEventListener(name, listener));
    };
  }, [boardId, ideas]);
}
