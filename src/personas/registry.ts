/**
 * bo-120 — Persona registry.
 *
 * The Persona facade maps named personas onto one or more existing orchestrator
 * role files in `src/orchestrator/roles/`. Built-ins ship with deterministic
 * ids so seeding is idempotent across reloads.
 *
 * Cost caps and budget enforcement are deferred per IMPLEMENTATION_PLAN
 * decision #3 — the registry stays a pure data structure.
 */
import type { Persona, PersonaKind, PersonaScope, ProjectId } from '../types';
import { DEFAULT_PROJECT_ID } from '../storage/projects';

export interface BuiltInPersonaSpec {
  kind: Exclude<PersonaKind, 'custom'>;
  /** Stable id used when seeding into IDB. */
  id: string;
  /** Display name surfaced in PersonaChip / PersonaPanel. */
  name: string;
  /** Role-id strings that resolve to files under src/orchestrator/roles/. */
  roleIds: string[];
}

export const BUILT_IN_PERSONAS: readonly BuiltInPersonaSpec[] = [
  {
    kind: 'scout',
    id: 'persona:builtin:scout',
    name: 'Scout',
    roleIds: ['outsideKnowledgeScout', 'crossPollinate'],
  },
  {
    kind: 'synthesizer',
    id: 'persona:builtin:synthesizer',
    name: 'Synthesizer',
    roleIds: ['boardClusterer', 'groupThemer', 'approachSynthesizer'],
  },
  {
    kind: 'devil',
    id: 'persona:builtin:devil',
    name: "Devil's Advocate",
    roleIds: ['devilsAdvocate', 'premortemRedTeam', 'stressTestRules'],
  },
  {
    kind: 'historian',
    id: 'persona:builtin:historian',
    name: 'Historian',
    roleIds: ['boardSummariser', 'selfReviewer'],
  },
] as const;

/** Build a freshly-stamped Persona record from a built-in spec. */
export function makeBuiltInPersona(
  spec: BuiltInPersonaSpec,
  projectId: ProjectId = DEFAULT_PROJECT_ID,
  scope: PersonaScope = 'project',
  active: boolean = true,
): Persona {
  const now = Date.now();
  return {
    id: spec.id,
    name: spec.name,
    kind: spec.kind,
    roleIds: [...spec.roleIds],
    scope,
    active,
    projectId,
    createdAt: now,
    updatedAt: now,
  };
}

/** Lookup a built-in spec by kind. */
export function getBuiltInPersonaSpec(kind: BuiltInPersonaSpec['kind']): BuiltInPersonaSpec {
  const spec = BUILT_IN_PERSONAS.find(p => p.kind === kind);
  if (!spec) {
    throw new Error(`No built-in persona spec for kind: ${kind}`);
  }
  return spec;
}
