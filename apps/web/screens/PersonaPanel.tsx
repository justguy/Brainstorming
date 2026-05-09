import { useCallback, useEffect, useMemo, useState } from 'react';
import { PersonaChip } from '../primitives/PersonaChip';
import { useProjectSync } from '../useProjectSync';
import {
  listPersonasForProject,
  updatePersona,
  deletePersona,
} from '../../../src/storage/personas';
import { DEFAULT_PROJECT_ID } from '../../../src/storage/projects';
import type { AutonomyLevel, Persona, ProjectId } from '../../../src/types';

/**
 * Screen 08 · Persona panel + autonomy dial (v0 shell).
 *
 * Spec: Design/IMPLEMENTATION_PLAN.md §5 (Screen 08), §6 M3.
 *
 * v0 scope (bo-140):
 *   - List active project-scoped personas via `listPersonasForProject(projectId)`.
 *   - Render each persona as a `<PersonaChip>` whose primary click toggles the
 *     persona's `active` flag (persisted via `updatePersona`).
 *   - The kebab/more affordance offers "remove" for custom personas; built-ins
 *     are not deletable (deterministic ids — they would re-seed on next boot).
 *   - 4-stop autonomy dial bound to `Project.autonomyDial`. Selecting a stop
 *     persists immediately via `useProjectSync().updateProject({ autonomyDial })`.
 *
 * Out of scope, deferred to follow-up tasks:
 *   - Wiring the dial through `runScout` / `runConnectionFinder` /
 *     `runCritiqueIdea` so `silent` actually silences them → bo-141.
 *   - PersonaDetailDrawer (bio, prompt, cost, scope) → tracked in M3.
 *   - CustomPersonaForm (spawn flow, AI-suggested prompt) → tracked in M5.
 *   - Board-scoped personas merge → tracked alongside Screen 02 work.
 *   - App.tsx route dispatch (rendering this screen on a route) is bo-130.
 *
 * The component is a self-contained named export (`PersonaPanel`) plus a
 * default export, so route dispatchers can pick whichever convention is
 * simpler. It is not yet wired into App.tsx — that's bo-130's job.
 */

export interface PersonaPanelProps {
  /**
   * Project to show personas for. Defaults to the default project when the
   * `useProjectSync` hook has not yet resolved.
   */
  projectId?: ProjectId;
  /**
   * Optional escape hatch for tests / Storybook — bypass IndexedDB and render
   * a fixed list. When omitted, the screen loads personas via
   * `listPersonasForProject`.
   */
  personasOverride?: ReadonlyArray<Persona>;
}

const ROOT_CLASS =
  'bo-persona-panel relative flex min-h-screen flex-col gap-8 bg-slate-50 px-8 py-10 text-slate-900';
const HEADER_CLASS = 'flex flex-col gap-1';
const TITLE_CLASS = 'text-2xl font-semibold tracking-tight';
const SUBTITLE_CLASS = 'text-sm text-slate-500';
const SECTION_CLASS = 'flex flex-col gap-3';
const SECTION_HEADER_CLASS = 'flex flex-col gap-1';
const SECTION_TITLE_CLASS = 'text-sm font-semibold uppercase tracking-[0.08em] text-slate-500';
const SECTION_BODY_CLASS = 'flex flex-wrap gap-2';
const EMPTY_CLASS =
  'rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-8 text-center text-sm text-slate-500';
const LOADING_CLASS = 'text-sm text-slate-500';
const ERROR_CLASS =
  'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700';

const DIAL_GROUP_CLASS = 'flex flex-wrap gap-2';
const DIAL_OPTION_CLASS =
  'flex min-w-[10rem] flex-1 cursor-pointer flex-col gap-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:-translate-y-[1px] hover:shadow-md focus-within:ring-2 focus-within:ring-emerald-300';
const DIAL_OPTION_SELECTED_CLASS = 'border-emerald-300 ring-2 ring-emerald-200';
const DIAL_OPTION_LABEL_CLASS = 'text-sm font-semibold text-slate-900';
const DIAL_OPTION_DESC_CLASS = 'text-xs text-slate-500';
const DIAL_RADIO_CLASS = 'sr-only';

interface AutonomyOption {
  value: AutonomyLevel;
  label: string;
  description: string;
}

/**
 * 4-stop autonomy options. Labels follow the type vocabulary
 * (`silent` / `whispers` / `active` / `takes-pen`); descriptions paraphrase
 * the behavioural contract from the Build Spec §08.
 */
const AUTONOMY_OPTIONS: ReadonlyArray<AutonomyOption> = [
  {
    value: 'silent',
    label: 'Silent',
    description: 'No nudges. Personas only respond when @-summoned.',
  },
  {
    value: 'whispers',
    label: 'Whispers',
    description: 'Nudges queue up. Never auto-dismiss, never auto-apply.',
  },
  {
    value: 'active',
    label: 'Active',
    description: "Devil's auto-spawns counters; Synthesizer auto-clusters. User still confirms.",
  },
  {
    value: 'takes-pen',
    label: 'Takes the pen',
    description: 'Some moves auto-apply with toast + undo. Phase advances still need confirm.',
  },
];

const BUILT_IN_KINDS = new Set(['scout', 'synthesizer', 'devil', 'historian']);

function isBuiltIn(persona: Persona): boolean {
  // Custom personas always allow remove. Built-in kinds use deterministic ids
  // from registry.ts (`persona:builtin:*`) and would re-seed on next boot, so
  // we only offer toggle/edit on those.
  return persona.kind !== 'custom' && BUILT_IN_KINDS.has(persona.kind);
}

export function PersonaPanel({
  projectId,
  personasOverride,
}: PersonaPanelProps = {}): React.ReactElement {
  const { project, updateProject, isLoading: projectLoading } = useProjectSync();
  const effectiveProjectId = projectId ?? project?.id ?? DEFAULT_PROJECT_ID;

  const [personas, setPersonas] = useState<ReadonlyArray<Persona> | null>(
    personasOverride ?? null,
  );
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (personasOverride !== undefined) {
      setPersonas(personasOverride);
      return;
    }

    let cancelled = false;
    setError(null);
    listPersonasForProject(effectiveProjectId)
      .then((next) => {
        if (!cancelled) setPersonas(next);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
          setPersonas([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveProjectId, personasOverride]);

  const reload = useCallback(async () => {
    if (personasOverride !== undefined) return;
    try {
      const next = await listPersonasForProject(effectiveProjectId);
      setPersonas(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    }
  }, [effectiveProjectId, personasOverride]);

  const handleToggleActive = useCallback(
    async (personaId: string) => {
      const current = personas?.find((p) => p.id === personaId);
      if (!current) return;
      try {
        await updatePersona(personaId, { active: !current.active });
        await reload();
      } catch (cause) {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      }
    },
    [personas, reload],
  );

  const handleMore = useCallback(
    async (personaId: string) => {
      const current = personas?.find((p) => p.id === personaId);
      if (!current) return;
      // v0 surfaces a single confirm-driven "remove" path for custom
      // personas. Built-ins are non-removable (would re-seed); we leave the
      // edit/details flow for the PersonaDetailDrawer follow-up.
      if (isBuiltIn(current)) {
        // No-op kebab for built-ins keeps the affordance discoverable while
        // signalling that a richer drawer is coming. A `window.alert` keeps
        // the screen self-contained without pulling in a toast system.
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(
            `${current.name} is a built-in persona. Editing details lands with the Persona detail drawer.`,
          );
        }
        return;
      }
      const ok =
        typeof window === 'undefined' || typeof window.confirm !== 'function'
          ? true
          : window.confirm(`Remove custom persona "${current.name}"?`);
      if (!ok) return;
      try {
        await deletePersona(personaId);
        await reload();
      } catch (cause) {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      }
    },
    [personas, reload],
  );

  const handleAutonomyChange = useCallback(
    async (next: AutonomyLevel) => {
      try {
        await updateProject({ autonomyDial: next });
      } catch (cause) {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      }
    },
    [updateProject],
  );

  const currentAutonomy: AutonomyLevel = project?.autonomyDial ?? 'active';

  const personaChips = useMemo(() => {
    if (personas === null) return null;
    return personas.map((persona) => (
      <PersonaChip
        key={persona.id}
        persona={persona}
        onClick={handleToggleActive}
        onMore={handleMore}
        moreAriaLabel={
          isBuiltIn(persona)
            ? `Persona details for ${persona.name}`
            : `Remove custom persona ${persona.name}`
        }
        withAutonomyDot
        autonomyLevel={currentAutonomy}
        title={
          persona.active
            ? `${persona.name} is active. Click to mute.`
            : `${persona.name} is muted. Click to activate.`
        }
      />
    ));
  }, [personas, handleToggleActive, handleMore, currentAutonomy]);

  const personasLoading = personas === null;
  const personasEmpty = personas !== null && personas.length === 0;

  return (
    <div className={ROOT_CLASS} aria-label="Persona panel">
      <header className={HEADER_CLASS}>
        <h1 className={TITLE_CLASS}>Personas</h1>
        <p className={SUBTITLE_CLASS}>
          Toggle who's in the room and how loud they get to be.
        </p>
      </header>

      {error && (
        <div className={ERROR_CLASS} role="alert">
          Could not update persona panel: {error.message}
        </div>
      )}

      <section className={SECTION_CLASS} aria-labelledby="bo-persona-panel-roster">
        <div className={SECTION_HEADER_CLASS}>
          <h2 id="bo-persona-panel-roster" className={SECTION_TITLE_CLASS}>
            Active personas
          </h2>
          <p className={SUBTITLE_CLASS}>
            Click a chip to mute or wake the persona. The kebab opens
            persona-level actions.
          </p>
        </div>

        {personasLoading && !error && (
          <div className={LOADING_CLASS} role="status">
            Loading personas…
          </div>
        )}

        {personasEmpty && !error && (
          <div className={EMPTY_CLASS}>
            No personas yet. Built-ins seed automatically on first project load.
          </div>
        )}

        {personaChips && personaChips.length > 0 && (
          <div className={SECTION_BODY_CLASS} role="list">
            {personaChips}
          </div>
        )}
      </section>

      <section className={SECTION_CLASS} aria-labelledby="bo-persona-panel-dial">
        <div className={SECTION_HEADER_CLASS}>
          <h2 id="bo-persona-panel-dial" className={SECTION_TITLE_CLASS}>
            Autonomy dial
          </h2>
          <p className={SUBTITLE_CLASS}>
            How proactive the AI personas get. Wiring through to role-gating
            ships in bo-141.
          </p>
        </div>

        <div
          className={DIAL_GROUP_CLASS}
          role="radiogroup"
          aria-label="Autonomy dial"
        >
          {AUTONOMY_OPTIONS.map((opt) => {
            const selected = currentAutonomy === opt.value;
            const optionId = `bo-autonomy-${opt.value}`;
            const className = [
              DIAL_OPTION_CLASS,
              selected ? DIAL_OPTION_SELECTED_CLASS : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <label
                key={opt.value}
                htmlFor={optionId}
                className={className}
                aria-disabled={projectLoading || undefined}
              >
                <input
                  id={optionId}
                  type="radio"
                  name="bo-autonomy-dial"
                  className={DIAL_RADIO_CLASS}
                  value={opt.value}
                  checked={selected}
                  disabled={projectLoading}
                  onChange={() => {
                    void handleAutonomyChange(opt.value);
                  }}
                />
                <span className={DIAL_OPTION_LABEL_CLASS}>{opt.label}</span>
                <span className={DIAL_OPTION_DESC_CLASS}>{opt.description}</span>
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default PersonaPanel;
