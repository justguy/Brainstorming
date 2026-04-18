import { useState } from 'react';
import { runBeat } from '../../src/orchestrator/runBeat';
import type {
  BeatContextMap,
  BeatName,
  BeatResult,
  BeatRunState,
  ClusterBeatContext,
  ConnectBeatContext,
  CritiqueBeatContext,
  ScoutBeatContext,
  SummariseBeatContext,
} from '../../src/beats/types';

export function useBoardBeatRunner() {
  const [activeBeatRun, setActiveBeatRun] = useState<BeatRunState | null>(null);

  async function runBoardBeat(context: ScoutBeatContext): Promise<BeatResult<'scout'>>;
  async function runBoardBeat(context: ConnectBeatContext): Promise<BeatResult<'connect'>>;
  async function runBoardBeat(context: CritiqueBeatContext): Promise<BeatResult<'critique'>>;
  async function runBoardBeat(context: ClusterBeatContext): Promise<BeatResult<'cluster'>>;
  async function runBoardBeat(context: SummariseBeatContext): Promise<BeatResult<'summarise'>>;
  async function runBoardBeat(context: BeatContextMap[BeatName]): Promise<BeatResult<BeatName>> {
    setActiveBeatRun({
      beat: context.beat,
      trigger: context.trigger,
      size: context.size,
      status: 'running',
      startedAt: Date.now(),
      focusIdeaId: 'focusIdeaId' in context ? context.focusIdeaId : undefined,
    });
    try {
      return await runBeat(context as any);
    } finally {
      setActiveBeatRun(null);
    }
  }

  return {
    activeBeatRun,
    runBoardBeat,
  };
}
