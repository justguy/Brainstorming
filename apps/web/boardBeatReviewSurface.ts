import type {
  BeatResult,
  ClusterBeatContext,
  SummariseBeatContext,
} from '../../src/beats/types';
import type {
  BeatReviewItemRecord,
  BeatReviewSessionRecord,
} from '../../src/board/types';
import type { Connection, Idea, IdeaGroup } from '../../src/types';
import { buildClusterBeatContext, buildSummariseBeatContext } from './beatContext';

type ReviewableBeatResult = BeatResult<'cluster'> | BeatResult<'summarise'>;

type RunBoardBeat = {
  (context: ClusterBeatContext): Promise<BeatResult<'cluster'>>;
  (context: SummariseBeatContext): Promise<BeatResult<'summarise'>>;
};

interface SelectBoardBeatReviewSurfaceArgs {
  beatReviewSessions: BeatReviewSessionRecord[];
  beatReviewItems: BeatReviewItemRecord[];
  activeBeatReviewSession: BeatReviewSessionRecord | null;
}

interface RunManualBoardBeatArgs {
  beat: 'cluster' | 'summarise';
  boardId: string;
  boardTitle: string;
  ideas: Idea[];
  groups: IdeaGroup[];
  connections: Connection[];
  runBoardBeat: RunBoardBeat;
  presentBeatReview: (
    result: ReviewableBeatResult,
    source?: 'canvas' | 'webmcp' | 'beat',
  ) => Promise<{ sessionId: string; itemCount: number } | null>;
}

export function selectBoardBeatReviewSurface({
  beatReviewSessions,
  beatReviewItems,
  activeBeatReviewSession,
}: SelectBoardBeatReviewSurfaceArgs): {
  boardBeatReviewSession: BeatReviewSessionRecord | null;
  boardBeatReviewItems: BeatReviewItemRecord[];
} {
  const latestBoardReviewSession = [...beatReviewSessions]
    .filter(session => session.beat === 'cluster' || session.beat === 'summarise')
    .sort((left, right) => right.finishedAt - left.finishedAt)[0] ?? null;
  const boardBeatReviewSession = activeBeatReviewSession ?? latestBoardReviewSession;
  const boardBeatReviewItems = boardBeatReviewSession
    ? beatReviewItems.filter(item => item.sessionId === boardBeatReviewSession.id)
    : [];
  return { boardBeatReviewSession, boardBeatReviewItems };
}

export async function runManualBoardBeat({
  beat,
  boardId,
  boardTitle,
  ideas,
  groups,
  connections,
  runBoardBeat,
  presentBeatReview,
}: RunManualBoardBeatArgs): Promise<void> {
  const result = beat === 'cluster'
    ? await runBoardBeat(buildClusterBeatContext({
        boardId,
        boardTitle,
        ideas,
        connections,
        trigger: 'manual',
        size: 'big',
        aggressiveness: 'balanced',
      }))
    : await runBoardBeat(buildSummariseBeatContext({
        boardId,
        boardTitle,
        ideas,
        groups,
        connections,
        trigger: 'manual',
        size: 'big',
        aggressiveness: 'balanced',
      }));

  if (result.ok) {
    await presentBeatReview(result, 'canvas');
  }
}
