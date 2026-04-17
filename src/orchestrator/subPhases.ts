/**
 * subPhases.ts — canonical registry of phases and micro-steps.
 *
 * Main phases are integers (0, 1, 2, ..., 8). Micro steps live between them
 * as decimals (0.5, 2.5, 4.5) and run proactive "think out of the box" roles
 * that challenge the user without being blockers.
 *
 * The state machine walks this list in order. Each entry declares:
 *  - `role`: the LLM role to run when advance() is called at this step
 *  - `skippable`: user may press "Skip" to bypass without running the role
 *  - `componentKey`: which interactive UI view Workspace should render
 *  - `next`: the successor step number (usually set at runtime via indexOf)
 */

import type { RoleSpec } from './ctmcp';
import { ambiguityExtractor } from './roles/ambiguityExtractor';
import { clarificationAuthor } from './roles/clarificationAuthor';
import { approachSynthesizer } from './roles/approachSynthesizer';
import { rulesExtractor } from './roles/rulesExtractor';
import { premortemRedTeam } from './roles/premortemRedTeam';
import { briefComposer } from './roles/briefComposer';
import { selfReviewer } from './roles/selfReviewer';
import { readinessJudge } from './roles/readinessJudge';
import { outsideInLens } from './roles/outsideInLens';
import { devilsAdvocate } from './roles/devilsAdvocate';
import { stressTestRules } from './roles/stressTestRules';

export type ComponentKey =
  | 'capture' | 'ambiguity' | 'lens' | 'clarify' | 'approach'
  | 'challenge' | 'rules' | 'stress' | 'premortem'
  | 'brief' | 'review' | 'readiness' | 'done';

export interface SubPhaseSpec {
  number: number;
  id: string;
  label: string;
  shortLabel: string;
  kind: 'main' | 'micro';
  role?: RoleSpec;
  skippable: boolean;
  expectsUserInput: boolean;
  componentKey: ComponentKey;
}

export const SUB_PHASES: SubPhaseSpec[] = [
  { number: 0,   id: 'ambiguity', label: 'Ambiguity detection',       shortLabel: 'Ambiguities',    kind: 'main',  role: ambiguityExtractor,   skippable: false, expectsUserInput: false, componentKey: 'ambiguity' },
  { number: 0.5, id: 'lens',      label: 'Outside-in lens',           shortLabel: 'Lens',           kind: 'micro', role: outsideInLens,        skippable: true,  expectsUserInput: false, componentKey: 'lens' },
  { number: 1,   id: 'clarify',   label: 'Clarification questions',   shortLabel: 'Clarify',        kind: 'main',  role: clarificationAuthor,  skippable: false, expectsUserInput: false, componentKey: 'clarify' },
  { number: 2,   id: 'approach',  label: 'Approach synthesis',        shortLabel: 'Approaches',     kind: 'main',  role: approachSynthesizer,  skippable: false, expectsUserInput: true,  componentKey: 'approach' },
  { number: 2.5, id: 'devils',    label: "Devil's advocate",          shortLabel: 'Challenges',     kind: 'micro', role: devilsAdvocate,       skippable: true,  expectsUserInput: false, componentKey: 'challenge' },
  { number: 3,   id: 'rules',     label: 'Must-stay-true rules',      shortLabel: 'Rules',          kind: 'main',  role: rulesExtractor,       skippable: false, expectsUserInput: true,  componentKey: 'rules' },
  { number: 4,   id: 'premortem', label: 'Premortem / red team',      shortLabel: 'Premortem',      kind: 'main',  role: premortemRedTeam,     skippable: false, expectsUserInput: false, componentKey: 'premortem' },
  { number: 4.5, id: 'stress',    label: 'Stress-test the rules',     shortLabel: 'Stress-test',    kind: 'micro', role: stressTestRules,      skippable: true,  expectsUserInput: false, componentKey: 'stress' },
  { number: 5,   id: 'brief',     label: 'Brief composition',         shortLabel: 'Brief',          kind: 'main',  role: briefComposer,        skippable: false, expectsUserInput: false, componentKey: 'brief' },
  { number: 6,   id: 'review',    label: 'Self-review',               shortLabel: 'Review',         kind: 'main',  role: selfReviewer,         skippable: false, expectsUserInput: false, componentKey: 'review' },
  { number: 7,   id: 'readiness', label: 'Readiness decision',        shortLabel: 'Readiness',      kind: 'main',  role: readinessJudge,       skippable: false, expectsUserInput: false, componentKey: 'readiness' },
  { number: 8,   id: 'done',      label: 'Handoff ready',             shortLabel: 'Done',           kind: 'main',  skippable: false, expectsUserInput: false, componentKey: 'done' },
];

export function findSubPhase(n: number): SubPhaseSpec | undefined {
  return SUB_PHASES.find(s => Math.abs(s.number - n) < 1e-9);
}

export function nextPhaseNumber(current: number): number {
  const idx = SUB_PHASES.findIndex(s => Math.abs(s.number - current) < 1e-9);
  if (idx === -1 || idx === SUB_PHASES.length - 1) return 8;
  return SUB_PHASES[idx + 1].number;
}

export function previousPhaseNumber(current: number): number {
  const idx = SUB_PHASES.findIndex(s => Math.abs(s.number - current) < 1e-9);
  if (idx <= 0) return 0;
  return SUB_PHASES[idx - 1].number;
}

export function mainPhaseOf(n: number): number {
  return Math.floor(n);
}
