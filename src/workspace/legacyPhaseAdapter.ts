import { SUB_PHASES, findSubPhase, type SubPhaseSpec } from '../orchestrator/subPhases';
import type { Ambiguity, BeadCoordinationState, ClarificationQuestion, Idea, Phase } from '../types';

export interface LegacyWorkspacePhaseSection {
  spec: SubPhaseSpec;
  phaseNumber: number;
  title: string;
  isActive: boolean;
  isLocked: boolean;
  isMicro: boolean;
  artifactContent?: string;
}

export interface LegacyWorkspaceAdapter {
  currentPhase: number;
  activeSpec?: SubPhaseSpec;
  showFallback: boolean;
  sections: LegacyWorkspacePhaseSection[];
}

export interface LegacyToolIdea {
  id: string;
  rawText: string;
  phase: Phase;
  readiness: Idea['readiness'];
  artifactMd?: string;
  ambiguities: Ambiguity[];
  clarifications: ClarificationQuestion[];
  beadCoordination?: BeadCoordinationState;
  briefState: Idea['briefState'];
}

export function createLegacyWorkspaceAdapter(idea: Idea): LegacyWorkspaceAdapter {
  const currentPhase = normalizeLegacyPhase(idea.phase);
  const activeSpec = findSubPhase(currentPhase);

  return {
    currentPhase,
    activeSpec,
    showFallback: idea.readiness === 'yellow',
    sections: SUB_PHASES.map(spec => buildPhaseSection(spec, currentPhase, idea.artifactMd)),
  };
}

export function createLegacyToolIdea(idea: Idea | null): LegacyToolIdea | null {
  if (!idea) return null;
  return {
    id: idea.id,
    rawText: idea.rawText,
    phase: idea.phase,
    readiness: idea.readiness,
    artifactMd: idea.artifactMd,
    ambiguities: idea.ambiguities,
    clarifications: idea.clarifications,
    beadCoordination: idea.beadCoordination,
    briefState: idea.briefState,
  };
}

function buildPhaseSection(
  spec: SubPhaseSpec,
  currentPhase: number,
  artifactMd?: string,
): LegacyWorkspacePhaseSection {
  const phaseNumber = spec.number;
  const isMicro = spec.kind === 'micro';

  return {
    spec,
    phaseNumber,
    title: isMicro ? `${spec.label} (optional)` : spec.label,
    isActive: Math.abs(phaseNumber - currentPhase) < 1e-9,
    isLocked: phaseNumber > currentPhase,
    isMicro,
    artifactContent: !isMicro && artifactMd
      ? extractPhaseSection(artifactMd, Math.floor(phaseNumber))
      : undefined,
  };
}

function normalizeLegacyPhase(phase: number): number {
  return Number.isFinite(phase) ? phase : 0;
}

/**
 * Extract the content for a specific phase from the full artifactMd.
 * Looks for a heading like `## Phase N:` and returns its content until the next `## Phase`.
 * Falls back to full content if nothing matches.
 */
export function extractPhaseSection(artifactMd: string, phase: number): string {
  const lines = artifactMd.split('\n');
  const phaseHeading = new RegExp(`^##\\s+Phase\\s+${phase}[^0-9]`, 'i');
  const nextPhaseHeading = /^##\s+Phase\s+\d/i;

  let inside = false;
  const out: string[] = [];

  for (const line of lines) {
    if (!inside && phaseHeading.test(line)) {
      inside = true;
      out.push(line);
      continue;
    }
    if (inside) {
      if (nextPhaseHeading.test(line) && !phaseHeading.test(line)) break;
      out.push(line);
    }
  }

  return out.length > 0 ? out.join('\n') : artifactMd;
}
