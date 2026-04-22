import { useEffect, useMemo, useState } from 'react';
import type {
  BeatReviewClusterHintCandidateRecord,
  BeatReviewIdeaInsightCandidateRecord,
  BeatReviewIdeaSpawnCandidateRecord,
  BeatReviewItemRecord,
  BeatReviewSessionRecord,
  ChangeActor,
} from '../../src/board/types';
import type { BeatResult } from '../../src/beats/types';
import { createBoardController } from '../../src/storage/boardController';
import type { BoardHistoryState } from '../../src/storage/boardControllerTypes';
import type { BoardDocument } from '../../src/board/types';
import type { Idea } from '../../src/types';

type ReviewableBeatResult = BeatResult<'cluster'> | BeatResult<'summarise'>;

interface UseBeatReviewActionsArgs {
  ideas: Idea[];
  beatReviewSessions: BeatReviewSessionRecord[];
  beatReviewItems: BeatReviewItemRecord[];
  boardController: ReturnType<typeof createBoardController>;
  applyCommittedBoard: (document: BoardDocument, history: BoardHistoryState) => void;
  createBeatReviewSession: (
    result: ReviewableBeatResult,
    actor: ChangeActor,
  ) => Promise<{ session: BeatReviewSessionRecord; items: BeatReviewItemRecord[] } | null>;
  keepBeatReviewItem: (itemId: string, actor: ChangeActor) => Promise<{ item: BeatReviewItemRecord }>;
  scratchBeatReviewItem: (itemId: string, actor: ChangeActor) => Promise<{ item: BeatReviewItemRecord }>;
}

export function useBeatReviewActions({
  ideas,
  beatReviewSessions,
  beatReviewItems,
  boardController,
  applyCommittedBoard,
  createBeatReviewSession,
  keepBeatReviewItem,
  scratchBeatReviewItem,
}: UseBeatReviewActionsArgs) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [dismissedSessionIds, setDismissedSessionIds] = useState<string[]>([]);
  const [busyByItem, setBusyByItem] = useState<Record<string, 'keep' | 'scratch' | null>>({});
  const [batchBusy, setBatchBusy] = useState<'keep' | 'scratch' | null>(null);

  const sessionById = useMemo(
    () => new Map(beatReviewSessions.map(session => [session.id, session])),
    [beatReviewSessions],
  );
  const itemsBySessionId = useMemo(() => {
    const next = new Map<string, BeatReviewItemRecord[]>();
    for (const item of beatReviewItems) {
      const list = next.get(item.sessionId) ?? [];
      list.push(item);
      next.set(item.sessionId, list);
    }
    for (const list of next.values()) {
      list.sort((left, right) => left.createdAt - right.createdAt);
    }
    return next;
  }, [beatReviewItems]);

  useEffect(() => {
    if (activeSessionId && sessionById.has(activeSessionId)) {
      return;
    }
    const nextActive = beatReviewSessions
      .filter(session => !dismissedSessionIds.includes(session.id))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0];
    setActiveSessionId(nextActive?.id ?? null);
  }, [activeSessionId, beatReviewSessions, dismissedSessionIds, sessionById]);

  const activeSession = activeSessionId ? sessionById.get(activeSessionId) ?? null : null;
  const activeItems = activeSession ? itemsBySessionId.get(activeSession.id) ?? [] : [];

  async function presentBeatReview(
    result: ReviewableBeatResult,
    source: 'canvas' | 'webmcp' | 'beat' = 'canvas',
  ): Promise<{ sessionId: string; itemCount: number } | null> {
    if (!result.ok) return null;
    const committed = await createBeatReviewSession(result, {
      type: source === 'webmcp' ? 'tool' : 'ai',
      source: source === 'webmcp' ? 'webmcp' : 'beat',
      beat: result.beat,
      label: 'beatReview',
    });
    if (!committed) return null;
    setDismissedSessionIds(prev => prev.filter(id => id !== committed.session.id));
    setActiveSessionId(committed.session.id);
    return { sessionId: committed.session.id, itemCount: committed.items.length };
  }

  async function handleKeep(itemId: string): Promise<void> {
    setBusyByItem(prev => ({ ...prev, [itemId]: 'keep' }));
    try {
      const actor = { type: 'user' as const, source: 'canvas' as const, label: 'beatReview' };
      const item = beatReviewItems.find(candidate => candidate.id === itemId);
      if (!item) return;
      await applyReviewCandidate(item, actor);
      await keepBeatReviewItem(itemId, actor);
    } finally {
      setBusyByItem(prev => ({ ...prev, [itemId]: null }));
    }
  }

  async function handleScratch(itemId: string): Promise<void> {
    setBusyByItem(prev => ({ ...prev, [itemId]: 'scratch' }));
    try {
      await scratchBeatReviewItem(itemId, { type: 'user', source: 'canvas', label: 'beatReview' });
    } finally {
      setBusyByItem(prev => ({ ...prev, [itemId]: null }));
    }
  }

  async function handleKeepAll(): Promise<void> {
    const pending = activeItems.filter(item => item.status === 'pending');
    if (pending.length === 0) return;
    setBatchBusy('keep');
    try {
      for (const item of pending) {
        await handleKeep(item.id);
      }
    } finally {
      setBatchBusy(null);
    }
  }

  async function handleScratchAll(): Promise<void> {
    const pending = activeItems.filter(item => item.status === 'pending');
    if (pending.length === 0) return;
    setBatchBusy('scratch');
    try {
      for (const item of pending) {
        await handleScratch(item.id);
      }
    } finally {
      setBatchBusy(null);
    }
  }

  function closeActiveSession(): void {
    if (!activeSessionId) return;
    setDismissedSessionIds(prev => [...prev, activeSessionId]);
    setActiveSessionId(null);
  }

  async function applyReviewCandidate(item: BeatReviewItemRecord, actor: ChangeActor): Promise<void> {
    switch (item.candidate.kind) {
      case 'cluster_hint':
        await applyClusterHint(item as BeatReviewItemRecord & { candidate: BeatReviewClusterHintCandidateRecord }, actor);
        return;
      case 'idea_insight':
        await applyIdeaInsight(item as BeatReviewItemRecord & { candidate: BeatReviewIdeaInsightCandidateRecord }, actor);
        return;
      case 'idea_spawn':
        await applyIdeaSpawn(item as BeatReviewItemRecord & { candidate: BeatReviewIdeaSpawnCandidateRecord }, actor);
    }
  }

  async function applyClusterHint(
    item: BeatReviewItemRecord & { candidate: BeatReviewClusterHintCandidateRecord },
    actor: ChangeActor,
  ): Promise<void> {
    const candidate = item.candidate.payload;
    const ideaIds = candidate.ideaIds ?? item.candidate.affectedIdeaIds;
    if (ideaIds.length < 2) return;

    let workingIdeas = ideas;
    let groupId = sharedGroupId(workingIdeas, ideaIds);
    for (let index = 1; index < ideaIds.length && !groupId; index += 1) {
      const committed = await boardController.groupIdeas({
        ideaIdA: ideaIds[0],
        ideaIdB: ideaIds[index],
        actor,
      });
      applyCommittedBoard(committed.document, committed.history);
      workingIdeas = committed.document.ideas;
      groupId = sharedGroupId(workingIdeas, ideaIds);
    }

    if (!groupId) return;
    const themed = await boardController.setGroupTheme({
      groupId,
      theme: candidate.theme,
      sharedQuestion: candidate.sharedQuestion,
      actor,
    });
    applyCommittedBoard(themed.document, themed.history);
  }

  async function applyIdeaInsight(
    item: BeatReviewItemRecord & { candidate: BeatReviewIdeaInsightCandidateRecord },
    actor: ChangeActor,
  ): Promise<void> {
    const candidate = item.candidate.payload;
    let workingIdeas = ideas;

    for (const ideaId of candidate.targetIdeaIds) {
      const idea = workingIdeas.find(entry => entry.id === ideaId);
      if (!idea) continue;

      const nextInsight = { ...candidate.insight, id: crypto.randomUUID() };
      const existingInsights = idea.insights ?? [];
      const alreadyPresent = existingInsights.some(existing => (
        existing.text === nextInsight.text
          && existing.beatRunId === nextInsight.beatRunId
          && sameSourceRefs(existing.sourceRefs, nextInsight.sourceRefs)
      ));
      if (alreadyPresent) continue;

      const committed = await boardController.updateIdea({
        ideaId,
        patch: { insights: [...existingInsights, nextInsight] },
        actor,
        summary: `Attached takeaway insight to idea ${ideaId}`,
      });
      applyCommittedBoard(committed.document, committed.history);
      workingIdeas = committed.document.ideas;
    }
  }

  async function applyIdeaSpawn(
    item: BeatReviewItemRecord & { candidate: BeatReviewIdeaSpawnCandidateRecord },
    actor: ChangeActor,
  ): Promise<void> {
    const candidate = item.candidate.payload;
    const committed = await boardController.captureIdea({
      rawText: candidate.rawText,
      tags: candidate.tags,
      insights: candidate.insights.map(insight => ({ ...insight, id: crypto.randomUUID() })),
      actor,
    });
    applyCommittedBoard(committed.document, committed.history);
  }

  return {
    activeSession,
    activeItems,
    busyByItem,
    batchBusy,
    presentBeatReview,
    handleKeep,
    handleScratch,
    handleKeepAll,
    handleScratchAll,
    closeActiveSession,
    focusSession(sessionId: string): void {
      setDismissedSessionIds(prev => prev.filter(id => id !== sessionId));
      setActiveSessionId(sessionId);
    },
  };
}

function sharedGroupId(ideas: Idea[], ideaIds: string[]): string | null {
  const groupIds = ideaIds
    .map(ideaId => ideas.find(idea => idea.id === ideaId)?.panel?.groupId)
    .filter((groupId): groupId is string => Boolean(groupId));
  if (groupIds.length !== ideaIds.length) return null;
  return groupIds.every(groupId => groupId === groupIds[0]) ? groupIds[0] : null;
}

function sameSourceRefs(left: BeatReviewItemRecord['candidate']['sources'], right: BeatReviewItemRecord['candidate']['sources']): boolean {
  if (left.length !== right.length) return false;
  return left.every((ref, index) => ref.kind === right[index]?.kind && ref.id === right[index]?.id);
}
