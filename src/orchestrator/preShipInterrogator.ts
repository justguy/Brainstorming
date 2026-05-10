/**
 * bo-164 — Pre-ship LLM interrogator.
 *
 * Spec: Design/IMPLEMENTATION_PLAN.md §5 (Screen 07 · Handoff), §6 M5.
 *
 * Active personas re-read the latest brief version one final time before ship
 * and post structured findings. The user must address or dismiss them before
 * the brief leaves the building.
 *
 * Contract:
 *   `runPreShipInterrogator(brief, activePersonas, runRole)` →
 *     `Promise<InterrogatorFinding[]>`
 *
 * Strategy:
 *   - Extract the latest BriefVersion (caller is responsible for ensuring at
 *     least one version exists; an empty `versions[]` short-circuits to a
 *     single non-fatal finding rather than throwing).
 *   - For each active persona, intersect its `roleIds` with
 *     `CRITIC_ROLE_IDS` — the curated set of critic-style roles whose purpose
 *     is to push back rather than synthesise. Personas with no critic role
 *     contribute nothing.
 *   - All `(persona, roleId)` pairs run concurrently via the injected
 *     `runRole` callback. The callback owns provider/retry concerns; this
 *     module stays pure so unit tests can swap a deterministic stub in.
 *   - Per-call failures degrade gracefully — they yield a single
 *     `severity: 'info'` finding with the error message rather than
 *     poisoning the whole batch.
 *
 * Out of scope here:
 *   - Real LLM transport (lives in `src/orchestrator/retryAndFallback.ts`).
 *     The UI layer (`apps/web/HandoffInterrogator.tsx`) wires the runner.
 *   - Persona-fetching (callers pass already-filtered active personas).
 *   - Persistence as MarginNotes — surfaced as nudges in the UI for now.
 */
import type { Brief, BriefVersion, Idea, Persona, RiskItem } from '../types';
import { devilsAdvocate, type DevilsAdvocateOutput } from './roles/devilsAdvocate';
import { premortemRedTeam, type PremortemRedTeamOutput } from './roles/premortemRedTeam';
import { stressTestRules, type StressTestRulesOutput } from './roles/stressTestRules';
import { selfReviewer, type SelfReviewerOutput } from './roles/selfReviewer';
import type { RoleSpec } from './ctmcp';

/** Critic-style role ids — those whose purpose is to push back on the brief. */
export const CRITIC_ROLE_IDS = [
  'devilsAdvocate',
  'premortemRedTeam',
  'stressTestRules',
  'selfReviewer',
] as const;

export type CriticRoleId = (typeof CRITIC_ROLE_IDS)[number];

/** Lookup table from registry-style roleId → RoleSpec. */
export const CRITIC_ROLE_SPECS: Record<CriticRoleId, RoleSpec> = {
  devilsAdvocate,
  premortemRedTeam,
  stressTestRules,
  selfReviewer,
};

/** Severity bucket for the rendered nudge. Mirrors NudgeCard tones. */
export type InterrogatorSeverity = 'high' | 'medium' | 'low' | 'info';

/** A single critique surfaced by a critic role on behalf of a persona. */
export interface InterrogatorFinding {
  /** Stable id so the UI can key list rows + dismiss state. */
  id: string;
  personaId: string;
  personaName: string;
  /** Registry roleId (e.g. `devilsAdvocate`). */
  roleId: CriticRoleId;
  /** Display label for the role; sourced from registry's AVAILABLE_ROLE_IDS. */
  roleLabel: string;
  severity: InterrogatorSeverity;
  /** Short headline shown in bold on the card. */
  headline: string;
  /** Optional fuller body with evidence-asks / failure modes / etc. */
  detail?: string;
  /**
   * When the role failed (network / parse), this carries the error message
   * so the UI can surface a non-fatal hint rather than silently dropping
   * the persona's contribution.
   */
  error?: string;
}

/**
 * The runner callback the orchestrator delegates to. Production wires this to
 * `callWithRetry` + `buildPayload`. Tests swap in a deterministic stub.
 *
 * The runner receives the role spec and a synthesised Idea-shaped input
 * (because every role's `buildTask` keys off `Idea`). It must return the
 * already-validated role output (i.e. the result of `role.parse(...)`), or
 * throw on persistent failure.
 */
export type RunRoleFn = (args: {
  role: RoleSpec;
  idea: Idea;
}) => Promise<unknown>;

export interface PreShipInterrogatorOptions {
  /** Override for the latest version when callers want to re-run an older one. */
  versionOverride?: BriefVersion;
}

/**
 * Run all active personas' critic-style roles against the latest version of
 * the brief. Resolves with one or more findings per (persona, role) pair.
 */
export async function runPreShipInterrogator(
  brief: Brief,
  activePersonas: Persona[],
  runRole: RunRoleFn,
  options: PreShipInterrogatorOptions = {},
): Promise<InterrogatorFinding[]> {
  // 1. Latest version is the input the personas critique. No version → bail
  //    with a single explanatory finding so the UI shows *something* useful.
  const version = options.versionOverride ?? latestVersion(brief);
  if (!version) {
    return [{
      id: `${brief.id}:no-version`,
      personaId: '__system__',
      personaName: 'Interrogator',
      roleId: 'selfReviewer',
      roleLabel: 'Self-reviewer',
      severity: 'info',
      headline: 'No brief version to interrogate yet.',
      detail:
        'Save a snapshot of the brief (⌘S in the Brief screen) before running the pre-ship interrogator.',
    }];
  }

  const idea = synthesiseIdeaFromBrief(brief, version);

  // 2. Collect (persona, role) pairs — only personas that hold a critic role.
  type Pair = { persona: Persona; roleId: CriticRoleId };
  const pairs: Pair[] = [];
  for (const persona of activePersonas) {
    if (!persona.active) continue;
    for (const rid of persona.roleIds) {
      if (isCriticRoleId(rid)) pairs.push({ persona, roleId: rid });
    }
  }

  if (pairs.length === 0) {
    return [{
      id: `${brief.id}:no-critics`,
      personaId: '__system__',
      personaName: 'Interrogator',
      roleId: 'selfReviewer',
      roleLabel: 'Self-reviewer',
      severity: 'info',
      headline: 'No active personas hold a critic-style role.',
      detail:
        'Activate the Devil\'s Advocate or Historian persona to enable pre-ship interrogation, or add a custom persona that includes one of: ' +
        CRITIC_ROLE_IDS.join(', ') + '.',
    }];
  }

  // 3. Run all pairs concurrently. Each pair returns 0..N findings.
  const results = await Promise.all(
    pairs.map(async ({ persona, roleId }) => {
      const role = CRITIC_ROLE_SPECS[roleId];
      try {
        const raw = await runRole({ role, idea });
        return findingsForRole(brief.id, persona, roleId, raw);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return [{
          id: `${brief.id}:${persona.id}:${roleId}:error`,
          personaId: persona.id,
          personaName: persona.name,
          roleId,
          roleLabel: roleLabelFor(roleId),
          severity: 'info' as InterrogatorSeverity,
          headline: `${persona.name} couldn't finish — ${roleLabelFor(roleId)}.`,
          detail: message,
          error: message,
        }];
      }
    }),
  );

  return results.flat();
}

// --- helpers ----------------------------------------------------------------

function latestVersion(brief: Brief): BriefVersion | null {
  if (!brief.versions || brief.versions.length === 0) return null;
  return brief.versions[brief.versions.length - 1];
}

export function isCriticRoleId(id: string): id is CriticRoleId {
  return (CRITIC_ROLE_IDS as readonly string[]).includes(id);
}

/**
 * Shape a Brief + its latest version into the `Idea` payload that role
 * `buildTask` / `buildPayload` expect. We don't have the original idea record
 * on hand at handoff time (the brief may outlive the canvas idea state), so
 * we reconstruct the minimal contract: rawText from problemStatement, the
 * full BriefState, and the rendered artifactMd.
 */
export function synthesiseIdeaFromBrief(
  brief: Brief,
  version: BriefVersion,
): Idea {
  const rawText = version.briefState.problemStatement?.trim()
    || version.briefState.desiredOutcome?.trim()
    || `Brief ${brief.id}`;
  const now = Date.now();
  return {
    id: brief.ideaId,
    boardId: brief.boardId,
    rawText,
    tags: [],
    createdAt: brief.createdAt,
    updatedAt: brief.updatedAt,
    status: 'ready_for_handoff',
    phase: 7, // Past readiness; brief exists.
    briefState: version.briefState,
    ambiguities: [],
    clarifications: [],
    turnLog: [],
    artifactMd: version.artifactMd,
    readiness: 'green',
    lastTurnAt: now,
  };
}

const ROLE_LABEL_BY_ID: Record<CriticRoleId, string> = {
  devilsAdvocate: "Devil's advocate",
  premortemRedTeam: 'Premortem red team',
  stressTestRules: 'Stress-test rules',
  selfReviewer: 'Self-reviewer',
};

export function roleLabelFor(roleId: CriticRoleId): string {
  return ROLE_LABEL_BY_ID[roleId];
}

/**
 * Translate a role's structured output into one or more findings. Each role
 * has its own schema, so we pattern-match on `roleId` and pluck the right
 * fields. Defensive: anything unexpected becomes an info-level finding rather
 * than a thrown error.
 */
export function findingsForRole(
  briefId: string,
  persona: Persona,
  roleId: CriticRoleId,
  raw: unknown,
): InterrogatorFinding[] {
  const base = {
    personaId: persona.id,
    personaName: persona.name,
    roleId,
    roleLabel: roleLabelFor(roleId),
  };

  if (!raw || typeof raw !== 'object') {
    return [{
      ...base,
      id: `${briefId}:${persona.id}:${roleId}:empty`,
      severity: 'info',
      headline: `${persona.name} returned no findings.`,
    }];
  }

  switch (roleId) {
    case 'devilsAdvocate': {
      const out = raw as DevilsAdvocateOutput;
      const items = Array.isArray(out.challenges) ? out.challenges : [];
      if (items.length === 0) {
        return [{
          ...base,
          id: `${briefId}:${persona.id}:${roleId}:clean`,
          severity: 'low',
          headline: `${persona.name} found no critiques worth raising.`,
        }];
      }
      return items.map((c, i) => ({
        ...base,
        id: `${briefId}:${persona.id}:${roleId}:${c.id ?? i}`,
        severity: 'high' as InterrogatorSeverity,
        headline: c.critique,
        detail: c.evidenceAsk ? `Evidence ask: ${c.evidenceAsk}` : undefined,
      }));
    }

    case 'premortemRedTeam': {
      const out = raw as PremortemRedTeamOutput;
      const risks: RiskItem[] | undefined = Array.isArray(out.risks)
        ? (out.risks as unknown as RiskItem[])
        : undefined;
      const failureModes = Array.isArray(out.failureModes) ? out.failureModes : [];
      const findings: InterrogatorFinding[] = [];
      if (risks) {
        risks.forEach((r, i) => {
          const lk = (r as { likelihood?: string }).likelihood ?? 'medium';
          const im = (r as { impact?: string }).impact ?? 'medium';
          findings.push({
            ...base,
            id: `${briefId}:${persona.id}:${roleId}:risk:${(r as { id?: string }).id ?? i}`,
            severity: severityFromRisk(lk, im),
            headline: (r as { description?: string }).description ?? 'Unnamed risk.',
            detail: `Likelihood: ${lk} · Impact: ${im}`,
          });
        });
      }
      failureModes.forEach((fm, i) => {
        findings.push({
          ...base,
          id: `${briefId}:${persona.id}:${roleId}:fm:${i}`,
          severity: 'medium',
          headline: fm,
        });
      });
      if (findings.length === 0) {
        findings.push({
          ...base,
          id: `${briefId}:${persona.id}:${roleId}:clean`,
          severity: 'low',
          headline: `${persona.name} found no failure modes.`,
        });
      }
      return findings;
    }

    case 'stressTestRules': {
      const out = raw as StressTestRulesOutput;
      const items = Array.isArray(out.stressResults) ? out.stressResults : [];
      if (items.length === 0) {
        return [{
          ...base,
          id: `${briefId}:${persona.id}:${roleId}:clean`,
          severity: 'low',
          headline: `${persona.name} found no rule violations under stress.`,
        }];
      }
      return items.map((s, i) => ({
        ...base,
        id: `${briefId}:${persona.id}:${roleId}:${s.id ?? i}`,
        severity: 'medium' as InterrogatorSeverity,
        headline: `Rule ${s.ruleIndex}: ${s.edgeCase}`,
        detail: s.breakMode ? `Break mode: ${s.breakMode}` : undefined,
      }));
    }

    case 'selfReviewer': {
      const out = raw as SelfReviewerOutput;
      const findings: InterrogatorFinding[] = [];
      const contradictions = Array.isArray(out.contradictions) ? out.contradictions : [];
      const gaps = Array.isArray(out.gaps) ? out.gaps : [];
      const blockers = Array.isArray(out.blockers) ? out.blockers : [];
      contradictions.forEach((c, i) => findings.push({
        ...base,
        id: `${briefId}:${persona.id}:${roleId}:contradiction:${i}`,
        severity: 'high',
        headline: `Contradiction: ${c}`,
      }));
      gaps.forEach((g, i) => findings.push({
        ...base,
        id: `${briefId}:${persona.id}:${roleId}:gap:${i}`,
        severity: 'medium',
        headline: `Gap: ${g}`,
      }));
      blockers.forEach((b, i) => findings.push({
        ...base,
        id: `${briefId}:${persona.id}:${roleId}:blocker:${i}`,
        severity: 'high',
        headline: `Blocker: ${b}`,
      }));
      if (findings.length === 0) {
        findings.push({
          ...base,
          id: `${briefId}:${persona.id}:${roleId}:clean`,
          severity: 'low',
          headline: `${persona.name} found no contradictions, gaps, or blockers.`,
        });
      }
      return findings;
    }
  }
}

function severityFromRisk(likelihood: string, impact: string): InterrogatorSeverity {
  // Compose a coarse severity from the two dimensions: any "high" combined
  // with "high" yields high; mediums collapse to medium; everything else is
  // low. Falls back gracefully on unexpected enum values.
  if (likelihood === 'high' && impact === 'high') return 'high';
  if (likelihood === 'high' || impact === 'high') return 'medium';
  if (likelihood === 'medium' || impact === 'medium') return 'medium';
  return 'low';
}
