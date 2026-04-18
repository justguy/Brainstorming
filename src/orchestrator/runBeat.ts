import type {
  BeatContextMap,
  BeatName,
  BeatResult,
  BeatRunMeta,
  ClusterBeatContext,
  ConnectBeatContext,
  CritiqueBeatContext,
  ScoutBeatContext,
  SummariseBeatContext,
} from '../beats/types';
import type { RunRoleResult } from './adhocRole';
import { runAdhocRole } from './adhocRole';
import { beatRegistry } from './beatRegistry';

type BeatRunner = typeof runAdhocRole;

function buildBeatMeta(
  context: BeatContextMap[BeatName],
  input: Pick<RunRoleResult<unknown>, 'usedFallback'>,
  roleId: string,
  startedAt: number,
): BeatRunMeta {
  return {
    runId: crypto.randomUUID(),
    beat: context.beat,
    roleId,
    usedFallback: input.usedFallback,
    startedAt,
    finishedAt: Date.now(),
    trigger: context.trigger,
    size: context.size,
    focusIdeaId: 'focusIdeaId' in context ? context.focusIdeaId : undefined,
  };
}

async function executeBeat<T extends BeatName>(
  context: BeatContextMap[T],
  runner: BeatRunner,
): Promise<BeatResult<T>> {
  const entry = beatRegistry[context.beat];
  const startedAt = Date.now();
  const task = entry.buildTask(context as never);
  if (!task) {
    return {
      ok: false,
      beat: context.beat,
      meta: buildBeatMeta(context, { usedFallback: false }, entry.role.id, startedAt),
      proposal: null,
      reason: 'not_applicable',
    } as BeatResult<T>;
  }

  const roleResult = await runner(entry.role, task);
  const meta = buildBeatMeta(context, roleResult, entry.role.id, startedAt);
  if (!roleResult.result) {
    return {
      ok: false,
      beat: context.beat,
      meta,
      proposal: null,
      reason: 'no_result',
    } as BeatResult<T>;
  }

  return {
    ok: true,
    beat: context.beat,
    meta,
    proposal: entry.mapProposal(context as never, roleResult.result),
  } as BeatResult<T>;
}

export function runBeat(context: ScoutBeatContext, runner?: BeatRunner): Promise<BeatResult<'scout'>>;
export function runBeat(context: ConnectBeatContext, runner?: BeatRunner): Promise<BeatResult<'connect'>>;
export function runBeat(context: CritiqueBeatContext, runner?: BeatRunner): Promise<BeatResult<'critique'>>;
export function runBeat(context: ClusterBeatContext, runner?: BeatRunner): Promise<BeatResult<'cluster'>>;
export function runBeat(context: SummariseBeatContext, runner?: BeatRunner): Promise<BeatResult<'summarise'>>;
export function runBeat(
  context: BeatContextMap[BeatName],
  runner: BeatRunner = runAdhocRole,
): Promise<BeatResult<BeatName>> {
  switch (context.beat) {
    case 'scout':
      return executeBeat(context, runner);
    case 'connect':
      return executeBeat(context, runner);
    case 'critique':
      return executeBeat(context, runner);
    case 'cluster':
      return executeBeat(context, runner);
    case 'summarise':
      return executeBeat(context, runner);
    default:
      throw new Error(`Unsupported beat: ${(context as BeatContextMap[BeatName]).beat}`);
  }
}
