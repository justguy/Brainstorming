import type { ChangeActor } from '../../src/board/types';
import type { Idea, IdeaGroup } from '../../src/types';
import type { BoardDocument } from '../../src/board/types';
import type { BoardGroupCommitResult, BoardHistoryState } from '../../src/storage/boardControllerTypes';
import { createBoardController } from '../../src/storage/boardController';
import { runAdhocRole } from '../../src/orchestrator/adhocRole';
import { reportLlmFallback } from '../../src/orchestrator/retryAndFallback';
import { groupThemer, buildGroupThemerTask, type GroupThemerOutput } from '../../src/orchestrator/roles/groupThemer';
import { ideaMerger, buildIdeaMergerTask, type IdeaMergerOutput } from '../../src/orchestrator/roles/ideaMerger';

type MutationSource = 'canvas' | 'webmcp';

interface UseCanvasIdeaMutationsArgs {
  ideas: Idea[];
  boardController: ReturnType<typeof createBoardController>;
  applyCommittedBoard: (document: BoardDocument, history: BoardHistoryState) => void;
  setCanvasBusy: (value: string | null) => void;
  setSelectedId: (value: string | null) => void;
  markActivity: (kind: 'edit' | 'group' | 'doc') => void;
}

export function useCanvasIdeaMutations({
  ideas,
  boardController,
  applyCommittedBoard,
  setCanvasBusy,
  setSelectedId,
  markActivity,
}: UseCanvasIdeaMutationsArgs) {
  async function applyGroupTheme(
    grouped: BoardGroupCommitResult,
  ): Promise<void> {
    const group = grouped.document.groups.find((entry: IdeaGroup) => entry.id === grouped.groupId);
    if (!group) return;

    const groupIdeas = group.ideaIds
      .map(id => grouped.document.ideas.find(entry => entry.id === id))
      .filter((entry): entry is Idea => !!entry);
    if (groupIdeas.length < 2) return;

    const task = buildGroupThemerTask(groupIdeas);
    const { result, providerId, model } = await runAdhocRole<GroupThemerOutput>(groupThemer, task);
    if (!result) {
      // Surface the silent failure so the user sees that auto-naming gave up.
      // The group is still on the board with a placeholder name they can edit.
      reportLlmFallback({
        providerId,
        model,
        message: "The group was created but auto-naming returned no usable result. You can rename the group inline.",
      });
      return;
    }

    const themed = await boardController.setGroupTheme({
      groupId: group.id,
      theme: result.theme,
      sharedQuestion: result.sharedQuestion,
      actor: { type: 'ai', source: 'system', label: 'groupThemer' },
    });
    applyCommittedBoard(themed.document, themed.history);
  }

  function themeGroupInBackground(grouped: BoardGroupCommitResult): void {
    void applyGroupTheme(grouped).catch(err => {
      console.error('[App] group theming failed:', err);
    });
  }

  async function handleMove(
    ideaId: string,
    x: number,
    y: number,
    source: MutationSource = 'canvas',
  ): Promise<void> {
    const result = await boardController.moveIdeaPanel({
      ideaId,
      x,
      y,
      actor: actorFor(source),
    });
    applyCommittedBoard(result.document, result.history);
    markActivity('edit');
  }

  async function handleGroup(
    ideaIdA: string,
    ideaIdB: string,
    source: MutationSource = 'canvas',
  ): Promise<void> {
    const a = ideas.find(idea => idea.id === ideaIdA);
    const b = ideas.find(idea => idea.id === ideaIdB);
    if (!a || !b) return;

    setCanvasBusy('Naming group…');
    try {
      const grouped = await boardController.groupIdeas({
        ideaIdA,
        ideaIdB,
        actor: actorFor(source),
      });
      applyCommittedBoard(grouped.document, grouped.history);
      markActivity('group');
      themeGroupInBackground(grouped);
    } catch (err) {
      console.error('[App] group failed:', err);
    } finally {
      setCanvasBusy(null);
    }
  }

  async function handleGroupSelection(
    ideaIds: string[],
    source: MutationSource = 'canvas',
  ): Promise<void> {
    const uniqueIdeaIds = [...new Set(ideaIds)].filter(id => (
      ideas.some(idea => idea.id === id && idea.status !== 'archived' && idea.status !== 'discarded')
    ));
    if (uniqueIdeaIds.length < 2) return;

    setCanvasBusy('Grouping notes…');
    try {
      const [anchorIdeaId, ...restIdeaIds] = uniqueIdeaIds;
      let latestGroupResult: BoardGroupCommitResult | null = null;

      for (const ideaId of restIdeaIds) {
        latestGroupResult = await boardController.groupIdeas({
          ideaIdA: anchorIdeaId,
          ideaIdB: ideaId,
          actor: actorFor(source),
        });
      }

      if (!latestGroupResult) return;

      applyCommittedBoard(latestGroupResult.document, latestGroupResult.history);
      markActivity('group');
      themeGroupInBackground(latestGroupResult);
    } catch (err) {
      console.error('[App] group selection failed:', err);
    } finally {
      setCanvasBusy(null);
    }
  }

  async function handleUngroup(
    ideaId: string,
    source: MutationSource = 'canvas',
  ): Promise<void> {
    const idea = ideas.find(entry => entry.id === ideaId);
    if (!idea?.panel?.groupId) return;

    try {
      const result = await boardController.ungroupIdea({
        ideaId,
        actor: actorFor(source),
      });
      applyCommittedBoard(result.document, result.history);
      markActivity('group');
    } catch (err) {
      console.error('[App] ungroup failed:', err);
    }
  }

  async function handleMerge(
    draggedId: string,
    targetId: string,
    source: MutationSource = 'canvas',
  ): Promise<void> {
    const a = ideas.find(idea => idea.id === draggedId);
    const b = ideas.find(idea => idea.id === targetId);
    if (!a || !b) return;

    setCanvasBusy('Merging ideas…');
    try {
      const task = buildIdeaMergerTask(a, b);
      const { result, providerId, model } = await runAdhocRole<IdeaMergerOutput>(ideaMerger, task);
      // Manual fallback: if the LLM cannot synthesize a merge, do NOT drop the
      // user's drag gesture. Concatenate both texts so the merge still happens
      // and they can edit the result. Surface a banner so the user knows the
      // AI did not contribute and that they may want to clean up the text.
      const fallback = !result;
      const mergedRawText = result?.mergedRawText
        ?? `${a.rawText.trim()}\n\n— merged with —\n\n${b.rawText.trim()}`;
      const mergedTags = result?.mergedTags
        ?? Array.from(new Set([...(a.tags ?? []), ...(b.tags ?? [])])).slice(0, 10);
      const synthesisNotes = result?.synthesisNotes
        ?? 'Manual fallback merge: AI did not return synthesis notes. Edit the merged note to reflect what changed.';
      const tensions = result?.tensions ?? [];

      if (fallback) {
        reportLlmFallback({
          providerId,
          model,
          message: 'Merged the two notes by concatenating their text — the AI did not return a synthesized merge. Open the merged note to clean it up.',
        });
      }

      const committed = await boardController.mergeIdeas({
        draggedId,
        targetId,
        mergedRawText,
        mergedTags,
        synthesisNotes,
        tensions,
        actor: actorFor(source),
      });
      applyCommittedBoard(committed.document, committed.history);
      setSelectedId(committed.idea.id);
      markActivity('edit');
    } catch (err) {
      console.error('[App] merge failed:', err);
      reportLlmFallback({
        providerId: 'gemini',
        model: 'unknown',
        message: err instanceof Error ? `Merge failed: ${err.message}` : 'Merge failed for an unknown reason.',
      });
    } finally {
      setCanvasBusy(null);
    }
  }

  return {
    handleMove,
    handleGroup,
    handleGroupSelection,
    handleUngroup,
    handleMerge,
  };
}

function actorFor(source: MutationSource): ChangeActor {
  return source === 'webmcp'
    ? { type: 'tool', source }
    : { type: 'user', source };
}
