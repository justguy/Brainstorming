import { SUB_PHASES, type SubPhaseSpec } from './subPhases';
import type {
  BeadCoordinationState,
  BriefState,
  BeadReviewFlag,
  BeadSuggestion,
  Idea,
} from '../types';

export type DerivedBeadStatus =
  | 'locked'
  | 'active'
  | 'completed'
  | 'needs_attention'
  | 'soft_nudge';

export interface DerivedBeadEntry {
  id: SubPhaseSpec['id'];
  phaseNumber: number;
  label: string;
  shortLabel: string;
  kind: SubPhaseSpec['kind'];
  status: DerivedBeadStatus;
  summary: string;
  reviewFlag: BeadReviewFlag | null;
  suggested: boolean;
  suggestion: BeadSuggestion | null;
}

export interface DerivedIdeaBeadState {
  ideaId: string;
  currentPhase: number;
  activeBeadId: string | null;
  suggestedNext: BeadSuggestion | null;
  reviewFlags: BeadReviewFlag[];
  summary: string;
  beads: DerivedBeadEntry[];
}

export function defaultBeadCoordinationState(): BeadCoordinationState {
  return { reviewFlags: [] };
}

export function isKnownBeadPhase(phase: number): boolean {
  return SUB_PHASES.some(spec => Math.abs(spec.number - phase) < 1e-9);
}

export function normalizeBeadCoordination(
  value: Idea['beadCoordination'] | undefined,
): BeadCoordinationState {
  const reviewFlags = Array.isArray(value?.reviewFlags)
    ? value.reviewFlags.filter(flag => (
      typeof flag?.id === 'string'
      && typeof flag?.reason === 'string'
      && typeof flag?.flaggedAt === 'number'
      && typeof flag?.phase === 'number'
      && isKnownBeadPhase(flag.phase)
    ))
    : [];
  const suggestion = value?.suggestedNext;
  const suggestedNext = suggestion
    && typeof suggestion.reason === 'string'
    && typeof suggestion.suggestedAt === 'number'
    && typeof suggestion.phase === 'number'
    && isKnownBeadPhase(suggestion.phase)
    ? suggestion
    : undefined;
  return {
    reviewFlags,
    ...(suggestedNext ? { suggestedNext } : {}),
  };
}

export function deriveIdeaBeadState(idea: Pick<
  Idea,
  'id' | 'phase' | 'readiness' | 'artifactMd' | 'ambiguities' | 'clarifications' | 'briefState' | 'beadCoordination'
>): DerivedIdeaBeadState {
  const currentPhase = Number.isFinite(idea.phase) ? idea.phase : 0;
  const coordination = normalizeBeadCoordination(idea.beadCoordination);
  const reviewFlags = coordination.reviewFlags
    .filter(flag => flag.phase < currentPhase)
    .sort((left, right) => left.phase - right.phase || left.flaggedAt - right.flaggedAt);
  const flaggedByPhase = new Map(reviewFlags.map(flag => [flag.phase, flag] as const));
  const suggestedNext = coordination.suggestedNext && coordination.suggestedNext.phase > currentPhase
    ? coordination.suggestedNext
    : null;
  const activeSpec = SUB_PHASES.find(spec => Math.abs(spec.number - currentPhase) < 1e-9);
  const reviewPrefix = reviewFlags.length > 0 ? `${reviewFlags.length} bead review marker(s).` : 'No review markers.';
  const suggestionText = suggestedNext
    ? `Suggested next bead: ${formatPhaseLabel(suggestedNext.phase)}`
    : 'No soft bead nudge is set.';

  return {
    ideaId: idea.id,
    currentPhase,
    activeBeadId: activeSpec?.id ?? null,
    suggestedNext,
    reviewFlags,
    summary: `Readiness is ${idea.readiness}. Active bead is ${activeSpec?.shortLabel ?? currentPhase}. ${suggestionText} ${reviewPrefix}`,
    beads: SUB_PHASES.map(spec => {
      const reviewFlag = flaggedByPhase.get(spec.number) ?? null;
      const suggestion = suggestedNext && Math.abs(suggestedNext.phase - spec.number) < 1e-9
        ? suggestedNext
        : null;
      const status = deriveBeadEntryStatus(spec, currentPhase, Boolean(reviewFlag), Boolean(suggestion));
      return {
        id: spec.id,
        phaseNumber: spec.number,
        label: spec.label,
        shortLabel: spec.shortLabel,
        kind: spec.kind,
        status,
        summary: summarizeBead(spec.id, idea),
        reviewFlag,
        suggested: Boolean(suggestion),
        suggestion,
      };
    }),
  };
}

function deriveBeadEntryStatus(
  spec: SubPhaseSpec,
  currentPhase: number,
  hasReviewFlag: boolean,
  hasSuggestion: boolean,
): DerivedBeadStatus {
  if (Math.abs(spec.number - currentPhase) < 1e-9) return 'active';
  if (hasReviewFlag) return 'needs_attention';
  if (hasSuggestion) return 'soft_nudge';
  return spec.number < currentPhase ? 'completed' : 'locked';
}

function summarizeBead(
  beadId: SubPhaseSpec['id'],
  idea: Pick<Idea, 'readiness' | 'artifactMd' | 'ambiguities' | 'clarifications' | 'briefState'>,
): string {
  const safeBriefState: Partial<BriefState> = idea.briefState ?? {};
  const openQuestions = safeBriefState.openQuestions ?? [];
  const lenses = safeBriefState.lenses ?? [];
  const approaches = safeBriefState.approaches ?? [];
  const challenges = safeBriefState.challenges ?? [];
  const mustStayTrueRules = safeBriefState.mustStayTrueRules ?? [];
  const risks = safeBriefState.risks ?? [];
  const stressResults = safeBriefState.stressResults ?? [];
  const clarifications = idea.clarifications ?? [];
  const ambiguities = idea.ambiguities ?? [];
  switch (beadId) {
    case 'ambiguity': {
      const openCount = ambiguities.filter(entry => (entry.resolution?.status ?? 'open') === 'open').length;
      return openCount > 0 ? `${openCount} open ambiguity${openCount === 1 ? '' : 'ies'}` : 'No open ambiguities';
    }
    case 'lens':
      return `${lenses.length} lens${lenses.length === 1 ? '' : 'es'}`;
    case 'clarify': {
      const answered = clarifications.filter(entry => entry.answer?.trim()).length;
      const total = clarifications.length;
      return total > 0 ? `${answered}/${total} clarification answers captured` : 'No clarification questions yet';
    }
    case 'approach':
      return `${approaches.length} approach${approaches.length === 1 ? '' : 'es'} explored`;
    case 'devils':
      return `${challenges.length} challenge${challenges.length === 1 ? '' : 's'} recorded`;
    case 'rules':
      return `${mustStayTrueRules.length} must-stay-true rule${mustStayTrueRules.length === 1 ? '' : 's'}`;
    case 'premortem':
      return `${risks.length} risk${risks.length === 1 ? '' : 's'} in register`;
    case 'stress':
      return `${stressResults.length} stress test${stressResults.length === 1 ? '' : 's'}`;
    case 'brief':
      return idea.artifactMd?.trim() ? 'Brief draft captured' : 'No brief draft yet';
    case 'review':
      return `${openQuestions.length} open question${openQuestions.length === 1 ? '' : 's'} after self-review`;
    case 'readiness':
      return `Readiness is ${idea.readiness}`;
    case 'done':
      return idea.briefState.nextStep ? `Next step: ${idea.briefState.nextStep}` : 'Awaiting next-step capture';
    default:
      return 'Bead progress summary unavailable.';
  }
}

function formatPhaseLabel(phase: number): string {
  const spec = SUB_PHASES.find(entry => Math.abs(entry.number - phase) < 1e-9);
  return spec ? `${spec.shortLabel} (${phase})` : `phase ${phase}`;
}
