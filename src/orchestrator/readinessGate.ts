import type { AutonomyLevel, Idea, ProviderId } from '../types';
import { buildPayload, payloadToMessages } from './ctmcp';
import { callWithRetry } from './retryAndFallback';
import { readinessJudge } from './roles/readinessJudge';
// Phase 3 fix: static import instead of dynamic import (settings.ts is stable)
import { getSettings } from '../storage/settings';

export interface ReadinessResult {
  ready: boolean;
  blockers: string[];
}

// --- Autonomy-tinted gating (bo-141 / IMPLEMENTATION_PLAN §6 M3) ---
// The 4-stop autonomy dial on `Project.autonomyDial` widens or narrows what the
// proactive layer is allowed to do. The verdict captures three knobs the
// callers care about:
//
//   * `allowAutoRun`   — may the policy layer execute durable mutations on its
//                        own (auto-apply suggestions, auto-create critiques)?
//   * `allowProactive` — may the proactive coach (idle / plateau) fire at all?
//   * `idleScale`      — multiplier applied to idle/plateau timers. <1 means
//                        fire sooner, >1 means wait longer, 0 means never.
//
// The default verdict (no dial supplied) matches today's behaviour, so any
// caller that has not yet been migrated keeps working unchanged. Per
// decision #3 in the IMPLEMENTATION_PLAN, cost caps and budget enforcement are
// deferred to v2 — this layer only reads the dial.
export interface AutonomyGateVerdict {
  /**
   * `'silent' | 'whispers' | 'active' | 'takes-pen'`. The gate stays read-only
   * — it never mutates the dial.
   */
  level: AutonomyLevel;
  /**
   * Allow durable AI mutations (auto-apply, auto-create). False below
   * `takes-pen`; the policy layer should drop down to `stage` mode instead.
   */
  allowAutoRun: boolean;
  /**
   * Allow any AI-initiated motion at all (including soft nudges + proactive
   * coach). False only on `silent`.
   */
  allowProactive: boolean;
  /**
   * Allow the structural `connect` beat to fire automatically. Below `active`
   * the synthesizer waits to be summoned. `whispers` keeps Scout (gentlest
   * nudge) but mutes the connection finder and critique runner.
   */
  allowConnectBeat: boolean;
  /**
   * Allow the standalone `critique` beat to fire automatically.
   */
  allowCritiqueBeat: boolean;
  /**
   * Allow the `scout` beat to fire automatically. Always true above `silent`
   * (Scout is the gentlest persona — `whispers` keeps it on).
   */
  allowScoutBeat: boolean;
  /**
   * Multiplier applied to idle/plateau timers. `0` means never; `1` matches
   * today's cadence; values <1 shorten the wait so `takes-pen` reacts faster.
   */
  idleScale: number;
  /**
   * Confidence-threshold scaling factor applied at decision time. `takes-pen`
   * tolerates a lower bar for executing a mutation; `whispers`/`active` use
   * today's threshold (1.0).
   */
  confidenceScale: number;
}

export const DEFAULT_AUTONOMY_LEVEL: AutonomyLevel = 'active';

export function autonomyGateVerdict(level: AutonomyLevel = DEFAULT_AUTONOMY_LEVEL): AutonomyGateVerdict {
  switch (level) {
    case 'silent':
      // Total silence: no auto-runs, no proactive coach, no nudges. Personas
      // only respond when explicitly @-summoned by the user.
      return {
        level,
        allowAutoRun: false,
        allowProactive: false,
        allowConnectBeat: false,
        allowCritiqueBeat: false,
        allowScoutBeat: false,
        idleScale: 0,
        confidenceScale: 1,
      };
    case 'whispers':
      // Gentle nudges only. Scout is the gentlest persona, so we keep it on,
      // but durable mutations always stage and Devil/Synthesizer wait to be
      // summoned. Idle threshold lengthens so we don't fire too eagerly.
      return {
        level,
        allowAutoRun: false,
        allowProactive: true,
        allowConnectBeat: false,
        allowCritiqueBeat: false,
        allowScoutBeat: true,
        idleScale: 1.5,
        confidenceScale: 1,
      };
    case 'active':
      // Today's behaviour: standard policy gating drives connect/critique/scout
      // and most actions stage by default. `executeDecision` already requires
      // a high-confidence path, so `allowAutoRun` here defers to the legacy
      // autonomy state inside `facilitatorPolicy`.
      return {
        level,
        allowAutoRun: true,
        allowProactive: true,
        allowConnectBeat: true,
        allowCritiqueBeat: true,
        allowScoutBeat: true,
        idleScale: 1,
        confidenceScale: 1,
      };
    case 'takes-pen':
      // The companion takes the pen: shorter idle wait, lower confidence bar
      // for executing mutations. Trust 2 acceptance test still requires the
      // user to confirm phase advances — those go through `<ConfirmBar>` and
      // are not auto-applied here.
      return {
        level,
        allowAutoRun: true,
        allowProactive: true,
        allowConnectBeat: true,
        allowCritiqueBeat: true,
        allowScoutBeat: true,
        idleScale: 0.6,
        confidenceScale: 0.7,
      };
    default: {
      // Exhaustiveness fallback — keeps TS honest if AutonomyLevel grows.
      const _exhaustive: never = level;
      void _exhaustive;
      return autonomyGateVerdict('active');
    }
  }
}

// --- Plateau detection ---
// Readiness drives our proactive-suggester nudges. When the score isn't moving,
// the suggester emits one nudge per plateau (it self-resets when the score
// changes). The "score" is computed from the board signal each tick: number of
// ideas, number of connections, and how many ideas are at green readiness.
export interface ReadinessSample {
  at: number;
  score: number;
}

export interface ReadinessSnapshotInput {
  ideas: Idea[];
  connectionCount: number;
}

export interface PlateauDetectionInput {
  samples: ReadinessSample[];
  now: number;
  windowMs?: number;
  minSampleCount?: number;
  /**
   * Optional autonomy dial. When supplied, the plateau window is scaled by the
   * dial's `idleScale` so `takes-pen` re-fires faster and `silent` never fires.
   * Omit to preserve today's behaviour.
   */
  autonomyDial?: AutonomyLevel;
}

const READINESS_LEVEL_SCORE: Record<Idea['readiness'], number> = {
  red: 0,
  yellow: 1,
  green: 2,
};

// Default plateau window — readiness has to sit still for this long before we
// consider it stuck. Picked to overlap with the proactive idle threshold (~25s)
// so we don't fire two nudges back-to-back when both signals trip.
const DEFAULT_PLATEAU_WINDOW_MS = 45_000;
const DEFAULT_PLATEAU_MIN_SAMPLES = 3;
const SAMPLE_RETENTION_MS = 5 * 60_000;

export function computeReadinessScore(input: ReadinessSnapshotInput): number {
  const { ideas, connectionCount } = input;
  const ideaScore = ideas.reduce((sum, idea) => sum + (READINESS_LEVEL_SCORE[idea.readiness] ?? 0), 0);
  return ideas.length + connectionCount + ideaScore;
}

export function appendReadinessSample(
  history: ReadinessSample[],
  sample: ReadinessSample,
  retentionMs: number = SAMPLE_RETENTION_MS,
): ReadinessSample[] {
  const cutoff = sample.at - retentionMs;
  const next = [...history.filter(item => item.at >= cutoff), sample];
  return next;
}

export function detectReadinessPlateau(input: PlateauDetectionInput): boolean {
  const verdict = autonomyGateVerdict(input.autonomyDial);
  // `silent` (idleScale === 0) suppresses plateau detection entirely. The
  // proactive coach uses this signal to decide whether to nudge — so a 0 here
  // means "the coach never fires on its own".
  if (verdict.idleScale <= 0) return false;
  const baseWindow = input.windowMs ?? DEFAULT_PLATEAU_WINDOW_MS;
  const window = Math.max(1, Math.round(baseWindow * verdict.idleScale));
  const minSamples = input.minSampleCount ?? DEFAULT_PLATEAU_MIN_SAMPLES;
  const cutoff = input.now - window;
  const recent = input.samples.filter(sample => sample.at >= cutoff);
  if (recent.length < minSamples) return false;
  const first = recent[0];
  return recent.every(sample => sample.score === first.score);
}

export async function checkReadiness(idea: Idea): Promise<ReadinessResult> {
  // Get provider/model from settings — API key stays in the service worker.
  let activeProvider: ProviderId = 'gemini';
  let activeModel = 'gemini-2.5-pro';

  try {
    const settings = await getSettings();
    activeProvider = settings.activeProvider;
    activeModel = settings.activeModel;
  } catch (e) {
    console.warn('[readinessGate] Could not load settings:', e);
  }

  const task = readinessJudge.buildTask(idea);
  const payload = buildPayload(readinessJudge, idea, task);
  const messages = payloadToMessages(payload);

  const { result, usedFallback } = await callWithRetry({
    providerId: activeProvider,
    model: activeModel,
    messages,
    jsonSchema: readinessJudge.jsonSchema,
    maxTokens: 1024,
    schema: readinessJudge.schema,
  });

  if (usedFallback || result === null) {
    return { ready: false, blockers: ['Readiness check failed — manual review required.'] };
  }

  return {
    ready: result.ready ?? false,
    blockers: result.blockers ?? [],
  };
}
