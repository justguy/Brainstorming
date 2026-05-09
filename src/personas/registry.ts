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

/**
 * Catalogue of role-id strings recognised by the orchestrator (one per file
 * under `src/orchestrator/roles/`). The CustomPersonaForm (bo-169) renders
 * this as a multi-select; built-ins also reference these ids in `roleIds`.
 *
 * Kept hand-curated rather than discovered via filesystem so the bundler can
 * tree-shake and so renames are caught at type-check time when a built-in's
 * `roleIds` becomes stale.
 */
export interface AvailableRole {
  id: string;
  label: string;
  description: string;
}

export const AVAILABLE_ROLE_IDS: ReadonlyArray<AvailableRole> = [
  {
    id: 'outsideKnowledgeScout',
    label: 'Outside-knowledge scout',
    description: 'Surfaces external references, prior art, and analogies.',
  },
  {
    id: 'crossPollinate',
    label: 'Cross-pollinator',
    description: 'Suggests links between distant ideas across the board.',
  },
  {
    id: 'boardClusterer',
    label: 'Board clusterer',
    description: 'Proposes new groups by clustering loose ideas.',
  },
  {
    id: 'groupThemer',
    label: 'Group themer',
    description: 'Names and themes existing clusters of ideas.',
  },
  {
    id: 'approachSynthesizer',
    label: 'Approach synthesizer',
    description: 'Composes draft approaches from clustered ideas.',
  },
  {
    id: 'devilsAdvocate',
    label: "Devil's advocate",
    description: 'Critiques ideas and surfaces evidence asks.',
  },
  {
    id: 'premortemRedTeam',
    label: 'Premortem red team',
    description: 'Imagines how the plan fails, in detail.',
  },
  {
    id: 'stressTestRules',
    label: 'Stress-test rules',
    description: 'Probes must-stay-true rules against edge cases.',
  },
  {
    id: 'boardSummariser',
    label: 'Board summariser',
    description: 'Condenses recent board activity into a digest.',
  },
  {
    id: 'selfReviewer',
    label: 'Self-reviewer',
    description: 'Re-reads the brief and flags drift or missing pieces.',
  },
  {
    id: 'connectionFinder',
    label: 'Connection finder',
    description: 'Detects relationships between ideas (supports, conflicts, builds-on).',
  },
  {
    id: 'ambiguityExtractor',
    label: 'Ambiguity extractor',
    description: 'Surfaces unstated assumptions and ambiguous claims.',
  },
  {
    id: 'ambiguityResolutionSuggester',
    label: 'Ambiguity resolver',
    description: 'Proposes resolutions for surfaced ambiguities.',
  },
  {
    id: 'clarificationAuthor',
    label: 'Clarification author',
    description: 'Drafts clarifying questions to ask the user.',
  },
  {
    id: 'critiqueAcceptancePlanner',
    label: 'Critique acceptance planner',
    description: 'Plans how to act on critiques the user accepted.',
  },
  {
    id: 'docFactExtractor',
    label: 'Doc-fact extractor',
    description: 'Pulls facts and citations from supporting documents.',
  },
  {
    id: 'ideaMerger',
    label: 'Idea merger',
    description: 'Suggests merging near-duplicate ideas.',
  },
  {
    id: 'outsideInLens',
    label: 'Outside-in lens',
    description: 'Reframes ideas through user / contrarian / analogy lenses.',
  },
  {
    id: 'readinessJudge',
    label: 'Readiness judge',
    description: 'Scores how ready an idea is for handoff.',
  },
  {
    id: 'rulesExtractor',
    label: 'Rules extractor',
    description: 'Distills must-stay-true rules from board content.',
  },
  {
    id: 'suggestionElaborator',
    label: 'Suggestion elaborator',
    description: 'Expands terse suggestions into actionable detail.',
  },
  {
    id: 'themeOverlapDetector',
    label: 'Theme overlap detector',
    description: 'Detects shared themes across boards (cross-board).',
  },
  {
    id: 'briefComposer',
    label: 'Brief composer',
    description: 'Assembles the live brief from board state.',
  },
] as const;

/** Convenience lookup for `AVAILABLE_ROLE_IDS` by id. */
export function getAvailableRole(id: string): AvailableRole | undefined {
  return AVAILABLE_ROLE_IDS.find(r => r.id === id);
}
