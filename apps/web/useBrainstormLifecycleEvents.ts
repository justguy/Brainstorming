import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { BoardDocument } from '../../src/board/types';
import type { BoardHistoryState } from '../../src/storage/boardControllerTypes';
import { createBoardController } from '../../src/storage/boardController';
import { advance } from '../../src/orchestrator/stateMachine';
import type { Idea } from '../../src/types';

const TOOL_ACTOR = { type: 'tool', source: 'webmcp' } as const;

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

    async function patchBriefState(args: {
      ideaId: string;
      requestId?: string;
      summary: string;
      mutate: (idea: Idea) => Idea['briefState'];
      errorLabel: string;
    }): Promise<void> {
      try {
        const idea = ideas.find(entry => entry.id === args.ideaId);
        if (!idea) return;
        const committed = await boardController.updateIdea({
          ideaId: args.ideaId,
          patch: { briefState: args.mutate(idea) },
          actor: TOOL_ACTOR,
          summary: args.summary,
        });
        applyCommittedBoard(committed.document, committed.history);
      } catch (err) {
        console.error(args.errorLabel, err);
      } finally {
        emitToolCompletion(args.requestId);
      }
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
      await patchBriefState({
        ideaId,
        requestId,
        summary: `Updated lens ${lensId} on idea ${ideaId}`,
        errorLabel: '[App] patchLens failed:',
        mutate: idea => ({
          ...idea.briefState,
          lenses: idea.briefState.lenses.map(lens =>
            lens.id === lensId
              ? { ...lens, ...(verdict ? { verdict } : {}), ...(userNote !== undefined ? { userNote } : {}) }
              : lens,
          ),
        }),
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
      await patchBriefState({
        ideaId,
        requestId,
        summary: `Updated challenge ${challengeId} on idea ${ideaId}`,
        errorLabel: '[App] patchChallenge failed:',
        mutate: idea => ({
          ...idea.briefState,
          challenges: idea.briefState.challenges.map(challenge =>
            challenge.id === challengeId
              ? { ...challenge, ...(stance ? { stance } : {}), ...(userRebuttal !== undefined ? { userRebuttal } : {}) }
              : challenge,
          ),
        }),
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
      await patchBriefState({
        ideaId,
        requestId,
        summary: `Updated stress result ${stressId} on idea ${ideaId}`,
        errorLabel: '[App] patchStress failed:',
        mutate: idea => ({
          ...idea.briefState,
          stressResults: idea.briefState.stressResults.map(stress =>
            stress.id === stressId
              ? { ...stress, ...(handled !== undefined ? { handled } : {}), ...(userResponse !== undefined ? { userResponse } : {}) }
              : stress,
          ),
        }),
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
      await patchBriefState({
        ideaId,
        requestId,
        summary: `Selected next step for idea ${ideaId}`,
        errorLabel: '[App] chooseNextStep failed:',
        mutate: idea => ({
          ...idea.briefState,
          nextStep: nextStep as Idea['briefState']['nextStep'],
        }),
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

    const listeners: Array<[string, EventListener]> = [
      ['brainstorm:selectIdea', handleSelectIdea as EventListener],
      ['brainstorm:advancePhase', handleAdvancePhase as EventListener],
      ['brainstorm:patchLens', handlePatchLens as EventListener],
      ['brainstorm:patchChallenge', handlePatchChallenge as EventListener],
      ['brainstorm:patchStress', handlePatchStress as EventListener],
      ['brainstorm:exportHandoff', handleExportHandoff as EventListener],
      ['brainstorm:chooseNextStep', handleChooseNextStep as EventListener],
      ['brainstorm:captureIdea', handleCaptureIdeaEvent as EventListener],
    ];

    listeners.forEach(([name, listener]) => window.addEventListener(name, listener));
    return () => {
      listeners.forEach(([name, listener]) => window.removeEventListener(name, listener));
    };
  }, [boardId, ideas]);
}
