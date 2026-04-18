import type { ChangeActor } from '../../src/board/types';
import type { Idea, IdeaGroup } from '../../src/types';
import type { BoardDocument } from '../../src/board/types';
import type { BoardHistoryState } from '../../src/storage/boardControllerTypes';
import { createBoardController } from '../../src/storage/boardController';
import { runAdhocRole } from '../../src/orchestrator/adhocRole';
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

      const group = grouped.document.groups.find((entry: IdeaGroup) => entry.id === grouped.groupId);
      if (group) {
        const groupIdeas = group.ideaIds
          .map(id => grouped.document.ideas.find(entry => entry.id === id))
          .filter((entry): entry is Idea => !!entry);
        const task = buildGroupThemerTask(groupIdeas);
        const { result } = await runAdhocRole<GroupThemerOutput>(groupThemer, task);
        if (result) {
          const themed = await boardController.setGroupTheme({
            groupId: group.id,
            theme: result.theme,
            sharedQuestion: result.sharedQuestion,
            actor: { type: 'ai', source: 'system', label: 'groupThemer' },
          });
          applyCommittedBoard(themed.document, themed.history);
        }
      }

      markActivity('group');
    } catch (err) {
      console.error('[App] group failed:', err);
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
      const { result } = await runAdhocRole<IdeaMergerOutput>(ideaMerger, task);
      if (!result) {
        console.warn('[App] merge LLM call returned no result — skipping merge.');
        return;
      }

      const committed = await boardController.mergeIdeas({
        draggedId,
        targetId,
        mergedRawText: result.mergedRawText,
        mergedTags: result.mergedTags,
        synthesisNotes: result.synthesisNotes,
        tensions: result.tensions,
        actor: actorFor(source),
      });
      applyCommittedBoard(committed.document, committed.history);
      setSelectedId(committed.idea.id);
      markActivity('edit');
    } catch (err) {
      console.error('[App] merge failed:', err);
    } finally {
      setCanvasBusy(null);
    }
  }

  return {
    handleMove,
    handleGroup,
    handleUngroup,
    handleMerge,
  };
}

function actorFor(source: MutationSource): ChangeActor {
  return source === 'webmcp'
    ? { type: 'tool', source }
    : { type: 'user', source };
}
