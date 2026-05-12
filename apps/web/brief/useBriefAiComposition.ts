/**
 * useBriefAiComposition — Screen 04 AI hook.
 *
 * Wires `briefComposer` and active-persona critic roles into BriefScreen so
 * the brief becomes an LLM-living document (Build Spec §s04 — AI hooks):
 *
 *  - On brief mount (and on idea-id change), if the current version has no
 *    `artifactMd` (or holds a stale non-canonical one), run `briefComposer`
 *    once and `appendVersion()` the result.
 *  - In parallel, run a margin-note pass:
 *      - Scout (`outsideKnowledgeScout`) → up to 2 citation-need notes
 *      - Devil's (`devilsAdvocate`) → up to 2 critique notes (Risks)
 *      - Historian (`ambiguityExtractor`) → up to 3 ambiguity flag notes
 *    Cap the total added in one pass at 5. Skip personas already represented
 *    in the current `Brief.marginNotes` for this version (dedup by personaId).
 *
 * The hook is gated on a local ref keyed by `briefId:versionId` so navigating
 * away and back doesn't re-fire the pass.
 *
 * Provider-key gate:
 *  - If no credential is configured for the active provider, the hook returns
 *    `{ status: 'no-key' }` and skips both passes silently. The host renders a
 *    quiet hint and falls back to the locally-derived markdown.
 *
 * The hook is intentionally test-friendly: it accepts an `runRoleOverride`
 * (mirrors HandoffInterrogator's pattern) and a `personasOverride` so unit
 * tests can stub the LLM transport. Production wires the live runner.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Brief,
  BriefState,
  BriefVersion,
  Idea,
  LlmMessage,
  Persona,
  Settings,
} from '../../../src/types';
import { listPersonasForBoard, listPersonasForProject } from '../../../src/storage/personas';
import { getSettings } from '../../../src/storage/settings';
import { buildPayload, payloadToMessages, type RoleSpec } from '../../../src/orchestrator/ctmcp';
import { callLlmViaSW } from '../../../src/orchestrator/llmBridge';
import { briefComposer, type BriefComposerOutput } from '../../../src/orchestrator/roles/briefComposer';
import {
  outsideKnowledgeScout,
  type OutsideKnowledgeScoutOutput,
} from '../../../src/orchestrator/roles/outsideKnowledgeScout';
import { devilsAdvocate, type DevilsAdvocateOutput } from '../../../src/orchestrator/roles/devilsAdvocate';
import {
  ambiguityExtractor,
  type AmbiguityExtractorOutput,
} from '../../../src/orchestrator/roles/ambiguityExtractor';
import type { AppendBriefVersionInput, AddMarginNoteInput } from '../../../src/storage/briefs';

/** Runner shape — mirrors HandoffInterrogator.RunRoleFn so the same stubs work. */
export type AiRunRoleFn = (args: { role: RoleSpec; idea: Idea }) => Promise<unknown>;

export interface UseBriefAiCompositionArgs {
  brief: Brief | null;
  ideaId: string | null;
  /** Latest version (or null when no versions yet). */
  latestVersion: BriefVersion | null;
  /** Test escape hatch: when supplied, used instead of IDB persona lookup. */
  personasOverride?: readonly Persona[];
  /** Test escape hatch: stub LLM transport. */
  runRoleOverride?: AiRunRoleFn;
  /**
   * Test escape hatch: provide settings synchronously. When omitted the hook
   * calls `getSettings()` itself.
   */
  settingsOverride?: Settings;
  /** Author label for new versions / margin notes added by the AI pass. */
  authoredBy?: string;
  /** Commit a new version produced by briefComposer. */
  appendVersion: (input: AppendBriefVersionInput) => Promise<Brief>;
  /** Append a new margin note (single, persisted). */
  addMarginNote: (input: AddMarginNoteInput) => Promise<Brief>;
  /**
   * When true, suppress the auto-on-mount run. The Recompose button still
   * triggers the composer when invoked directly.
   */
  disabled?: boolean;
}

export type AiCompositionStatus =
  /** No work pending; either fresh mount or last pass succeeded. */
  | { kind: 'idle' }
  /** Composer call in flight. */
  | { kind: 'composing' }
  /** Margin-note pass in flight (post-compose or solo). */
  | { kind: 'annotating' }
  /** Both passes resolved. */
  | { kind: 'done' }
  /** Skipped because no provider credential is configured. */
  | { kind: 'no-key' }
  /** Last pass failed; the host surfaces the message as a warning tag. */
  | { kind: 'error'; message: string };

export interface UseBriefAiCompositionResult {
  status: AiCompositionStatus;
  /**
   * Re-run the composer for the currently displayed version. Optionally
   * dispatches a confirm prompt when the host knows the version was manually
   * edited — the host owns that UX, this hook trusts the caller.
   */
  recompose: () => Promise<void>;
}

/** Detect whether `artifactMd` already uses the H4 canonical section headers. */
function artifactMdLooksCanonical(md: string): boolean {
  // Composer emits "## Problem Statement" style; the canonical renderer
  // (briefStateToMarkdown) emits "#### Problem". We accept either as canonical
  // — both are recognised authored output. We treat plain-text or H1/H2 dumps
  // without any spec heading words as "stale".
  if (!md.trim()) return false;
  const needles = [
    '#### Problem',
    '#### Approach',
    '#### Must stay true',
    '#### Risks',
    '#### Open questions',
    '## Problem Statement',
    '## Chosen Approach',
    '## Must-Stay-True',
    '## Risks',
    '## Open Questions',
  ];
  return needles.some((n) => md.includes(n));
}

/** Build the Idea-shaped payload roles' `buildTask` expects. */
function synthIdeaFromBrief(brief: Brief, version: BriefVersion, ideaId: string): Idea {
  const rawText =
    version.briefState.problemStatement?.trim()
    || version.briefState.desiredOutcome?.trim()
    || `Brief ${brief.id}`;
  return {
    id: ideaId,
    boardId: brief.boardId,
    rawText,
    tags: [],
    createdAt: brief.createdAt,
    updatedAt: brief.updatedAt,
    status: 'ready_for_handoff',
    phase: 7,
    briefState: version.briefState,
    ambiguities: [],
    clarifications: [],
    turnLog: [],
    artifactMd: version.artifactMd,
    readiness: 'green',
    lastTurnAt: Date.now(),
  };
}

/** Live LLM runner — mirrors HandoffInterrogator.makeLiveRunner but uses callLlmViaSW. */
function makeLiveRunner(settings: Settings): AiRunRoleFn {
  return async ({ role, idea }): Promise<unknown> => {
    const task = role.buildTask(idea);
    const payload = buildPayload(role, idea, task);
    const messages: LlmMessage[] = payloadToMessages(payload);
    const result = await callLlmViaSW({
      providerId: settings.activeProvider,
      model: settings.activeModel,
      messages,
      jsonSchema: role.jsonSchema,
      maxTokens: 2048,
    });
    // Prefer the provider's pre-parsed JSON when available; fall back to
    // parsing `raw` so providers that don't ship structured outputs still work.
    if (result?.parsedJson !== undefined) {
      return role.parse(result.parsedJson);
    }
    const raw = result?.raw ?? '';
    if (!raw.trim()) {
      throw new Error(`${role.id}: empty LLM response.`);
    }
    try {
      return role.parse(JSON.parse(raw));
    } catch (err) {
      throw new Error(
        `${role.id}: failed to parse model output (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
  };
}

/** Does the active provider have an API key set? Empty string is "not set". */
function hasProviderKey(settings: Settings): boolean {
  const key = settings.credentials?.[settings.activeProvider];
  return typeof key === 'string' && key.trim().length > 0;
}

/** Total budget for one margin-note pass — keep the rail readable. */
const TOTAL_NOTES_CAP = 5;
const SCOUT_PER_PASS = 2;
const DEVILS_PER_PASS = 2;
const HISTORIAN_PER_PASS = 3;

/**
 * Pick personas relevant to a given role-id. We treat the four built-in
 * personas as the canonical mapping; custom personas opt-in by listing the
 * role-id in their `roleIds`.
 */
function personasFor(personas: readonly Persona[], roleId: string): Persona[] {
  return personas.filter((p) => p.active && p.roleIds.includes(roleId));
}

/** Best-effort dedup: skip role if any active persona already has notes for this version. */
function alreadyAnnotated(
  brief: Brief,
  versionId: string | undefined,
  personaIds: readonly string[],
): boolean {
  if (personaIds.length === 0) return true; // no persona → suppress
  return brief.marginNotes.some(
    (n) =>
      n.status === 'open'
      && (versionId === undefined || n.anchorVersionId === versionId)
      && n.authorPersonaId !== undefined
      && personaIds.includes(n.authorPersonaId),
  );
}

export function useBriefAiComposition(
  args: UseBriefAiCompositionArgs,
): UseBriefAiCompositionResult {
  const {
    brief,
    ideaId,
    latestVersion,
    personasOverride,
    runRoleOverride,
    settingsOverride,
    authoredBy = 'ai',
    appendVersion,
    addMarginNote,
    disabled = false,
  } = args;

  const [status, setStatus] = useState<AiCompositionStatus>({ kind: 'idle' });

  // Track which (brief, version) combinations we've processed so the pass
  // only fires once per version. We key by composite string so toggling
  // versions or briefs re-arms the pass.
  const processedRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef<boolean>(false);

  // Stash latest mutators / overrides on refs so the effect can fire on the
  // (brief, version) identity alone without re-running on every render.
  const appendRef = useRef(appendVersion);
  const addNoteRef = useRef(addMarginNote);
  const personasOverrideRef = useRef(personasOverride);
  const runRoleOverrideRef = useRef(runRoleOverride);
  const settingsOverrideRef = useRef(settingsOverride);
  const authoredByRef = useRef(authoredBy);
  appendRef.current = appendVersion;
  addNoteRef.current = addMarginNote;
  personasOverrideRef.current = personasOverride;
  runRoleOverrideRef.current = runRoleOverride;
  settingsOverrideRef.current = settingsOverride;
  authoredByRef.current = authoredBy;

  /**
   * Resolve the persona roster. Tests / Storybook pass `personasOverride`.
   * Production reads project + board personas via IDB and merges (board wins
   * on collision — mirrors HandoffInterrogator's resolution).
   */
  const loadPersonas = useCallback(async (): Promise<readonly Persona[]> => {
    if (personasOverrideRef.current !== undefined) {
      return personasOverrideRef.current;
    }
    if (!brief) return [];
    const projectPersonas = await listPersonasForProject(brief.projectId);
    const boardPersonas = brief.boardId
      ? await listPersonasForBoard(brief.boardId)
      : [];
    const byId = new Map<string, Persona>();
    for (const p of projectPersonas) byId.set(p.id, p);
    for (const p of boardPersonas) byId.set(p.id, p);
    return Array.from(byId.values()).filter((p) => p.active);
  }, [brief]);

  /**
   * Run the composer for a specific version. Used by both the auto-on-mount
   * path and the manual recompose action. Persists the result via
   * `appendVersion`. Returns the new brief so callers can chain the
   * margin-note pass against the just-appended version.
   */
  const runComposer = useCallback(
    async (
      targetBrief: Brief,
      targetVersion: BriefVersion,
      runner: AiRunRoleFn,
      currentIdeaId: string,
    ): Promise<Brief> => {
      const idea = synthIdeaFromBrief(targetBrief, targetVersion, currentIdeaId);
      const raw = await runner({ role: briefComposer, idea });
      const out = raw as BriefComposerOutput;
      const nextBriefState: BriefState = {
        ...targetVersion.briefState,
        ...out.briefUpdate,
        // Arrays from briefUpdate may be empty; preserve the prior version's
        // values when the composer omitted them. The schema requires the array
        // fields, so we accept whatever it produced verbatim.
        mustStayTrueRules: out.briefUpdate.mustStayTrueRules,
        successCriteria: out.briefUpdate.successCriteria,
        outOfScope: out.briefUpdate.outOfScope,
        openQuestions: out.briefUpdate.openQuestions,
      };
      return await appendRef.current({
        briefState: nextBriefState,
        artifactMd: out.artifactMd,
        authoredBy: authoredByRef.current,
        note: 'AI-composed brief',
      });
    },
    [],
  );

  /**
   * Run the three critic roles and append up to TOTAL_NOTES_CAP margin notes.
   * Each role is gated on persona availability + dedup against existing notes.
   */
  const runMarginNotePass = useCallback(
    async (
      targetBrief: Brief,
      targetVersion: BriefVersion,
      runner: AiRunRoleFn,
      currentIdeaId: string,
      personas: readonly Persona[],
    ): Promise<void> => {
      const idea = synthIdeaFromBrief(targetBrief, targetVersion, currentIdeaId);
      let remaining = TOTAL_NOTES_CAP;

      // ---- Scout pass (citations) -----------------------------------------
      const scoutPersonas = personasFor(personas, 'outsideKnowledgeScout');
      if (
        remaining > 0
        && scoutPersonas.length > 0
        && !alreadyAnnotated(targetBrief, targetVersion.id, scoutPersonas.map((p) => p.id))
      ) {
        try {
          const raw = await runner({ role: outsideKnowledgeScout, idea });
          const out = raw as OutsideKnowledgeScoutOutput;
          const persona = scoutPersonas[0];
          const items = (out.suggestions ?? []).slice(0, Math.min(SCOUT_PER_PASS, remaining));
          for (const s of items) {
            const text = `Citation needed: ${s.rawText} (source: ${s.source}). ${s.rationale}`;
            await addNoteRef.current({
              text,
              authorPersonaId: persona.id,
              authorLabel: persona.name,
              anchorVersionId: targetVersion.id,
            });
            remaining -= 1;
            if (remaining <= 0) break;
          }
        } catch {
          // Per-role failures degrade silently — we still try the others.
        }
      }

      // ---- Devil's Advocate pass (Risks critiques) ------------------------
      const devilsPersonas = personasFor(personas, 'devilsAdvocate');
      if (
        remaining > 0
        && devilsPersonas.length > 0
        && !alreadyAnnotated(targetBrief, targetVersion.id, devilsPersonas.map((p) => p.id))
      ) {
        try {
          const raw = await runner({ role: devilsAdvocate, idea });
          const out = raw as DevilsAdvocateOutput;
          const persona = devilsPersonas[0];
          const items = (out.challenges ?? []).slice(0, Math.min(DEVILS_PER_PASS, remaining));
          for (const c of items) {
            const text = `${c.critique} — evidence ask: ${c.evidenceAsk}`;
            await addNoteRef.current({
              text,
              authorPersonaId: persona.id,
              authorLabel: persona.name,
              anchorSection: 'risks',
              anchorVersionId: targetVersion.id,
            });
            remaining -= 1;
            if (remaining <= 0) break;
          }
        } catch {
          // ignore — see Scout pass comment
        }
      }

      // ---- Historian / Ambiguity pass (terminology flags) -----------------
      const historianPersonas = personasFor(personas, 'ambiguityExtractor');
      if (
        remaining > 0
        && historianPersonas.length > 0
        && !alreadyAnnotated(targetBrief, targetVersion.id, historianPersonas.map((p) => p.id))
      ) {
        try {
          const raw = await runner({ role: ambiguityExtractor, idea });
          const out = raw as AmbiguityExtractorOutput;
          const persona = historianPersonas[0];
          const items = (out.ambiguities ?? []).slice(0, Math.min(HISTORIAN_PER_PASS, remaining));
          for (const a of items) {
            const text = `Ambiguity (${a.type}, severity ${a.severity}): ${a.plainLanguage}`;
            await addNoteRef.current({
              text,
              authorPersonaId: persona.id,
              authorLabel: persona.name,
              anchorVersionId: targetVersion.id,
            });
            remaining -= 1;
            if (remaining <= 0) break;
          }
        } catch {
          // ignore
        }
      }
    },
    [],
  );

  /**
   * Execute a full pass: composer (if needed) followed by margin notes.
   * `force === true` skips the "version has canonical artifactMd?" gate so
   * the Recompose button always re-runs.
   */
  const performPass = useCallback(
    async (force: boolean): Promise<void> => {
      if (inFlightRef.current) return;
      if (!brief || !latestVersion || !ideaId) return;
      inFlightRef.current = true;
      try {
        const settings = settingsOverrideRef.current ?? (await getSettings());
        if (!hasProviderKey(settings)) {
          setStatus({ kind: 'no-key' });
          return;
        }
        const runner = runRoleOverrideRef.current ?? makeLiveRunner(settings);

        const needsCompose = force
          || !latestVersion.artifactMd
          || !artifactMdLooksCanonical(latestVersion.artifactMd);

        let activeBrief = brief;
        let activeVersion = latestVersion;
        if (needsCompose) {
          setStatus({ kind: 'composing' });
          activeBrief = await runComposer(brief, latestVersion, runner, ideaId);
          // The newly-appended version is the last in the array. Fall back to
          // the prior one if appendVersion returned a brief without a fresh
          // append (defensive — appendVersion is contracted to add one).
          activeVersion = activeBrief.versions[activeBrief.versions.length - 1] ?? latestVersion;
        }

        const personas = await loadPersonas();
        setStatus({ kind: 'annotating' });
        await runMarginNotePass(activeBrief, activeVersion, runner, ideaId, personas);
        setStatus({ kind: 'done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'AI composition failed';
        setStatus({ kind: 'error', message });
      } finally {
        inFlightRef.current = false;
      }
    },
    [brief, ideaId, latestVersion, loadPersonas, runComposer, runMarginNotePass],
  );

  // Auto-on-mount pass. The composite key dedups so navigating away + back to
  // the same brief/version doesn't re-trigger; switching versions or ideas does.
  useEffect(() => {
    if (disabled) return;
    if (!brief || !latestVersion || !ideaId) return;
    const passKey = `${brief.id}:${latestVersion.id}`;
    if (processedRef.current.has(passKey)) return;
    processedRef.current.add(passKey);
    void performPass(false);
  }, [brief, latestVersion, ideaId, disabled, performPass]);

  const recompose = useCallback(async (): Promise<void> => {
    // Reset the dedup so subsequent navigations re-fire on the new version.
    // We intentionally do NOT clear the whole set — only this version's entry.
    if (brief && latestVersion) {
      processedRef.current.delete(`${brief.id}:${latestVersion.id}`);
    }
    await performPass(true);
  }, [brief, latestVersion, performPass]);

  return { status, recompose };
}

export default useBriefAiComposition;
