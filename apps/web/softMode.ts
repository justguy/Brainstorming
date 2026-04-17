export type SoftMode = 'explore' | 'structure' | 'stress' | 'converge';
export type ActivityKind = 'edit' | 'group' | 'doc';
export type SoftModeAssessment = SoftModeInference;

export interface SoftModeSignals {
  ideaCount: number;
  editCount: number;
  groupingCount: number;
  idleMs: number;
  docIdeasCount: number;
  connectionCount?: number;
  activeCritiqueCount?: number;
}

export interface SoftModeInference {
  inferredMode: SoftMode;
  confidence: number;
  reason: string;
}

export interface ActivityState {
  lastInteractionAt: number;
  recentEdits: number[];
  recentGroups: number[];
  recentDocs: number[];
  lastDismissedAt: number;
}

export interface SoftModeHintVisibilityInput {
  assessment: SoftModeAssessment;
  idleMs: number;
  lastDismissedAt: number;
  now: number;
  cooldownMs?: number;
  minConfidence?: number;
  minIdleMs?: number;
}

interface NormalizedSignals {
  ideaCount: number;
  editCount: number;
  groupingCount: number;
  idleMs: number;
  docIdeasCount: number;
  connectionCount: number;
  activeCritiqueCount: number;
  ideaLoad: number;
  editLoad: number;
  groupingLoad: number;
  idleLoad: number;
  docLoad: number;
  connectionLoad: number;
  critiqueLoad: number;
}

interface ModeScore {
  mode: SoftMode;
  score: number;
}

const ACTIVITY_WINDOW_MS = 30_000;
const DEFAULT_HINT_COOLDOWN_MS = 20_000;
const DEFAULT_MIN_CONFIDENCE = 0.55;
const DEFAULT_MIN_IDLE_MS = 1_500;

export function inferSoftMode(signals: SoftModeSignals): SoftModeInference {
  const normalized = normalizeSignals(signals);
  const isSparseBoard =
    normalized.ideaCount === 0 &&
    normalized.editCount === 0 &&
    normalized.groupingCount === 0 &&
    normalized.docIdeasCount === 0;

  if (isSparseBoard) {
    return {
      inferredMode: 'explore',
      confidence: roundConfidence(0.28 + normalized.idleLoad * 0.08),
      reason: 'Sparse board activity defaults to explore until stronger idea or grouping signals appear.',
    };
  }

  const ranked = rankModes(normalized);
  const top = ranked[0];
  const runnerUp = ranked[1];
  const activityStrength =
    (normalized.ideaLoad +
      normalized.editLoad +
      normalized.groupingLoad +
      normalized.idleLoad +
      normalized.docLoad +
      normalized.connectionLoad +
      normalized.critiqueLoad) /
    7;
  const scoreGap = top.score - runnerUp.score;
  const confidence = roundConfidence(0.33 + top.score * 0.25 + scoreGap * 0.55 + activityStrength * 0.1);

  return {
    inferredMode: top.mode,
    confidence,
    reason: buildReason(top.mode, normalized),
  };
}

export function recordActivity(state: ActivityState, kind: ActivityKind, now = Date.now()): ActivityState {
  const at = sanitizeTimestamp(now);
  const next: ActivityState = {
    lastInteractionAt: at,
    recentEdits: pruneActivity(state.recentEdits, at),
    recentGroups: pruneActivity(state.recentGroups, at),
    recentDocs: pruneActivity(state.recentDocs, at),
    lastDismissedAt: state.lastDismissedAt,
  };

  if (kind === 'edit') next.recentEdits = [...next.recentEdits, at];
  if (kind === 'group') next.recentGroups = [...next.recentGroups, at];
  if (kind === 'doc') next.recentDocs = [...next.recentDocs, at];

  return next;
}

export function dismissSoftModeHint(state: ActivityState, now = Date.now()): ActivityState {
  return {
    ...state,
    lastDismissedAt: sanitizeTimestamp(now),
  };
}

export function getSoftModeCooldownRemaining(
  now: number,
  lastDismissedAt: number,
  cooldownMs = DEFAULT_HINT_COOLDOWN_MS,
): number {
  const safeCooldownMs = sanitizeNonNegative(cooldownMs);
  if (lastDismissedAt <= 0) return 0;

  const elapsedMs = sanitizeNonNegative(now - lastDismissedAt);
  return Math.max(0, safeCooldownMs - elapsedMs);
}

export function shouldShowSoftModeHint(input: SoftModeHintVisibilityInput): boolean {
  const minConfidence = clamp(input.minConfidence ?? DEFAULT_MIN_CONFIDENCE, 0, 1);
  const minIdleMs = sanitizeNonNegative(input.minIdleMs ?? DEFAULT_MIN_IDLE_MS);
  const remainingCooldownMs = getSoftModeCooldownRemaining(
    input.now,
    input.lastDismissedAt,
    input.cooldownMs ?? DEFAULT_HINT_COOLDOWN_MS,
  );

  if (remainingCooldownMs > 0) return false;
  if (input.assessment.confidence < minConfidence) return false;
  if (sanitizeNonNegative(input.idleMs) < minIdleMs) return false;

  return true;
}

function rankModes(signals: NormalizedSignals): ModeScore[] {
  const hasIdeas = signals.ideaCount > 0 ? 1 : 0;
  const critiqueHeadroom = 1 - signals.critiqueLoad;
  const connectionMaturity = (signals.connectionLoad + signals.groupingLoad) / 2;
  const scores: ModeScore[] = [
    {
      mode: 'explore',
      score:
        0.34 * (1 - signals.ideaLoad) +
        0.28 * signals.editLoad +
        0.18 * (1 - signals.groupingLoad) +
        0.12 * (1 - signals.docLoad) +
        0.08 * (1 - signals.idleLoad) +
        (signals.ideaCount === 0 ? 0.08 : 0),
    },
    {
      mode: 'structure',
      score:
        (0.22 * signals.ideaLoad +
          0.22 * signals.editLoad +
          0.28 * signals.groupingLoad +
          0.14 * (1 - signals.idleLoad) +
          0.08 * signals.docLoad +
          0.06 * (1 - signals.connectionLoad)) *
        (signals.ideaCount < 2 ? 0.85 : 1),
    },
    {
      mode: 'stress',
      score:
        (0.18 * signals.ideaLoad +
          0.12 * (1 - signals.editLoad) +
          0.08 * (1 - signals.groupingLoad) +
          0.24 * signals.idleLoad +
          0.26 * signals.docLoad +
          0.12 * critiqueHeadroom) *
        (signals.docLoad < 0.15 ? 0.85 : 1) *
        (0.55 + 0.45 * hasIdeas),
    },
    {
      mode: 'converge',
      score:
        (0.24 * signals.ideaLoad +
          0.1 * (1 - signals.editLoad) +
          0.16 * signals.groupingLoad +
          0.28 * signals.idleLoad +
          0.08 * signals.docLoad +
          0.14 * connectionMaturity) *
        (signals.ideaCount < 3 ? 0.8 : 1) *
        (signals.idleLoad < 0.15 ? 0.9 : 1),
    },
  ];

  return scores.sort((left, right) => right.score - left.score);
}

function buildReason(mode: SoftMode, signals: NormalizedSignals): string {
  switch (mode) {
    case 'explore':
      return [
        `few ideas (${signals.ideaCount})`,
        `active edits (${signals.editCount})`,
        `light grouping (${signals.groupingCount})`,
      ].join(', ') + ' point to explore.';
    case 'structure':
      return [
        `grouping activity (${signals.groupingCount})`,
        `board size (${signals.ideaCount} ideas)`,
        `emerging links (${signals.connectionCount})`,
      ].join(', ') + ' point to structure.';
    case 'stress':
      return [
        `doc-backed ideas (${signals.docIdeasCount})`,
        `longer pause (${formatDuration(signals.idleMs)})`,
        `low critique coverage (${signals.activeCritiqueCount})`,
      ].join(', ') + ' point to stress.';
    case 'converge':
      return [
        `many ideas (${signals.ideaCount})`,
        `existing links (${signals.connectionCount})`,
        `extended idle (${formatDuration(signals.idleMs)})`,
      ].join(', ') + ' point to converge.';
  }
}

function normalizeSignals(signals: SoftModeSignals): NormalizedSignals {
  const ideaCount = sanitizeNonNegative(signals.ideaCount);
  const editCount = sanitizeNonNegative(signals.editCount);
  const groupingCount = sanitizeNonNegative(signals.groupingCount);
  const idleMs = sanitizeNonNegative(signals.idleMs);
  const docIdeasCount = sanitizeNonNegative(signals.docIdeasCount);
  const connectionCount = sanitizeNonNegative(signals.connectionCount ?? 0);
  const activeCritiqueCount = sanitizeNonNegative(signals.activeCritiqueCount ?? 0);

  return {
    ideaCount,
    editCount,
    groupingCount,
    idleMs,
    docIdeasCount,
    connectionCount,
    activeCritiqueCount,
    ideaLoad: normalize(ideaCount, 8),
    editLoad: normalize(editCount, 8),
    groupingLoad: normalize(groupingCount, 4),
    idleLoad: normalize(idleMs, 25_000),
    docLoad: normalize(docIdeasCount, 4),
    connectionLoad: normalize(connectionCount, 6),
    critiqueLoad: normalize(activeCritiqueCount, 3),
  };
}

function pruneActivity(timestamps: number[], now: number): number[] {
  const cutoff = now - ACTIVITY_WINDOW_MS;
  return timestamps.filter(timestamp => timestamp >= cutoff);
}

function formatDuration(durationMs: number): string {
  const safeMs = sanitizeNonNegative(durationMs);
  if (safeMs < 1_000) return `${safeMs}ms`;
  return `${(safeMs / 1_000).toFixed(safeMs >= 10_000 ? 0 : 1)}s`;
}

function roundConfidence(value: number): number {
  return Math.round(clamp(value, 0, 1) * 100) / 100;
}

function normalize(value: number, max: number): number {
  if (max <= 0) return 0;
  return clamp(value / max, 0, 1);
}

function sanitizeTimestamp(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

function sanitizeNonNegative(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
