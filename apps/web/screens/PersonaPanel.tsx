import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PersonaChip } from '../primitives/PersonaChip';
import { useProjectSync } from '../useProjectSync';
import { CustomPersonaForm } from '../CustomPersonaForm';
import {
  listPersonasForBoard,
  listPersonasForProject,
  updatePersona,
  deletePersona,
} from '../../../src/storage/personas';
import { DEFAULT_PROJECT_ID } from '../../../src/storage/projects';
import type { AutonomyLevel, BoardId, Persona, ProjectId } from '../../../src/types';
import type { LogEvent } from '../../../src/board/projection/logEvents';

/**
 * Screen 08 · Persona panel + autonomy dial.
 *
 * Spec: Design/Build Spec.html §s08, Design/IMPLEMENTATION_PLAN.md §5/§6.
 *
 * v0 + bo-169 covered: list project/board personas, autonomy dial, custom
 * persona form. This commit fills in three Build-Spec gaps:
 *   - Hover/focus tooltip on each persona showing bio + recent-actions count.
 *   - "Suggest prompt" assist on the custom-persona form (in CustomPersonaForm).
 *   - Persona detail drawer (bio, prompt, cost, scope) opened by a per-row
 *     "Details" button. Because `PersonaChip` is off-limits for this gap, we
 *     keep the chip's primary click as the active/mute toggle and add an
 *     adjacent details button to honour the spec's "name area becomes a
 *     button" intent without re-routing the toggle.
 *
 * Out of scope / deferred:
 *   - Wiring the dial through `runScout` / `runConnectionFinder` /
 *     `runCritiqueIdea` so `silent` actually silences them → bo-141.
 *   - A live recent-actions count sourced from IDB — the panel does not
 *     currently load `changeSets` / `beatRuns`. To avoid adding a new IDB
 *     query (and a heavy fetch on every persona render), we accept an
 *     optional `eventsOverride` prop. When omitted, the tooltip shows `—` for
 *     the count. Callers that already have a `LogEvent[]` in memory (Board /
 *     Home screens) can pass it through.
 */

export interface PersonaPanelProps {
  /**
   * Project to show personas for. Defaults to the default project when the
   * `useProjectSync` hook has not yet resolved.
   */
  projectId?: ProjectId;
  /**
   * Board to show board-scoped personas for. When provided the panel renders
   * a second section ("Board-scoped personas") populated via
   * `listPersonasForBoard(boardId)` and the custom-persona form defaults to
   * `scope: 'board'` against this id (bo-169).
   */
  boardId?: BoardId;
  /**
   * Optional escape hatch for tests / Storybook — bypass IndexedDB and render
   * a fixed list of project-scoped personas. When omitted, the screen loads
   * personas via `listPersonasForProject`.
   */
  personasOverride?: ReadonlyArray<Persona>;
  /**
   * Optional escape hatch for board-scoped personas. Mirrors
   * `personasOverride` for the second section.
   */
  boardPersonasOverride?: ReadonlyArray<Persona>;
  /**
   * Optional pre-projected `LogEvent[]` (typically from `projectLogEvents`).
   * When supplied, persona tooltips show the count of events in the trailing
   * hour authored by each persona. When omitted, the count renders as `—` and
   * a screenreader hint explains the source is not wired locally.
   */
  eventsOverride?: ReadonlyArray<LogEvent>;
}

const ROOT_STYLE: React.CSSProperties = {
  minHeight: '100vh',
  maxHeight: '100vh',
  overflowY: 'auto',
  padding: '32px 36px 48px',
  display: 'flex',
  flexDirection: 'column',
  gap: 28,
  color: 'var(--ink)',
};
const HEADER_STYLE: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const TITLE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand)',
  fontSize: 56,
  lineHeight: 0.95,
  margin: 0,
  fontWeight: 700,
};
const SUBTITLE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 16,
  color: 'var(--ink-soft)',
  margin: 0,
};
const SECTION_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  background: 'rgba(255,255,255,0.55)',
  border: '1.5px solid var(--ink)',
  borderRadius: 14,
  padding: '18px 20px',
  boxShadow: '3px 3px 0 var(--ink)',
};
const SECTION_HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};
const SECTION_TITLE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand)',
  fontSize: 28,
  margin: 0,
  fontWeight: 700,
  lineHeight: 1.05,
};
const SECTION_SUB_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 13,
  color: 'var(--ink-soft)',
  margin: 0,
};
const SECTION_BODY_STYLE: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginTop: 4,
};
const EMPTY_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 14,
  color: 'var(--ink-soft)',
  border: '1.5px dashed var(--ink-faint)',
  borderRadius: 12,
  padding: '14px 18px',
  textAlign: 'center',
};
const LOADING_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 14,
  color: 'var(--ink-soft)',
};
const ERROR_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 14,
  color: '#7a1f15',
  border: '1.5px solid #c94a3a',
  background: '#fbeae6',
  borderRadius: 12,
  padding: '10px 14px',
};
const DIAL_GROUP_STYLE: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};
const DIAL_LABEL_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  cursor: 'pointer',
};
const DIAL_RADIO_CLASS =
  'sr-only absolute h-px w-px overflow-hidden whitespace-nowrap border-0 p-0';
const DIAL_DESC_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 13,
  color: 'var(--ink-soft)',
  marginTop: 6,
};

// -- Tooltip + details-button styles ----------------------------------------

const PERSONA_ROW_STYLE: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};
const DETAILS_BTN_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 11,
  padding: '2px 8px',
  background: 'var(--paper)',
  border: '1.5px solid var(--ink)',
  borderRadius: 999,
  cursor: 'pointer',
  color: 'var(--ink)',
  boxShadow: '1px 1px 0 var(--ink)',
};
const TOOLTIP_STYLE: React.CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 6px)',
  left: 0,
  zIndex: 30,
  minWidth: 200,
  maxWidth: 280,
  background: 'var(--paper)',
  border: '1.5px solid var(--ink)',
  borderRadius: 10,
  boxShadow: '2px 2px 0 var(--ink)',
  padding: '8px 10px',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 12,
  color: 'var(--ink)',
  pointerEvents: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const TOOLTIP_BIO_STYLE: React.CSSProperties = {
  whiteSpace: 'normal',
  lineHeight: 1.3,
};
const TOOLTIP_META_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--ink-soft)',
  fontFamily: 'var(--f-mono)',
};

// -- Drawer styles -----------------------------------------------------------

const DRAWER_OVERLAY_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.18)',
  zIndex: 90,
};
const DRAWER_STYLE_BASE: React.CSSProperties = {
  position: 'fixed',
  right: 0,
  top: 0,
  bottom: 0,
  width: 'min(420px, 40vw)',
  background: 'var(--paper)',
  borderLeft: '1.5px solid var(--ink)',
  boxShadow: '-3px 0 0 var(--ink)',
  zIndex: 100,
  display: 'flex',
  flexDirection: 'column',
  transition: 'transform 180ms ease-out',
  color: 'var(--ink)',
};
const DRAWER_HEADER_STYLE: React.CSSProperties = {
  padding: '18px 20px 8px',
  borderBottom: '1.5px solid var(--ink-faint)',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const DRAWER_TITLE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand)',
  fontSize: 32,
  fontWeight: 700,
  margin: 0,
  lineHeight: 1,
};
const DRAWER_SUBTITLE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 13,
  color: 'var(--ink-soft)',
  margin: 0,
};
const DRAWER_BODY_STYLE: React.CSSProperties = {
  padding: '14px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  overflowY: 'auto',
  flex: 1,
  fontFamily: 'var(--f-hand-body)',
  fontSize: 14,
};
const DRAWER_FIELD_LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--ink-soft)',
};
const DRAWER_FIELD_VALUE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-hand-body)',
  fontSize: 14,
  whiteSpace: 'pre-wrap',
  lineHeight: 1.35,
};
const DRAWER_FOOTER_STYLE: React.CSSProperties = {
  padding: '12px 20px 18px',
  borderTop: '1.5px solid var(--ink-faint)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
};

interface AutonomyOption {
  value: AutonomyLevel;
  label: string;
  description: string;
}

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
  return persona.kind !== 'custom' && BUILT_IN_KINDS.has(persona.kind);
}

/**
 * Naive cost-per-turn estimate for the detail drawer. Built-ins have a fixed
 * baseline; custom personas scale with role count. Hard-coded for now — the
 * orchestrator does not surface a real cost meter yet.
 */
function estimateCostPerTurn(persona: Persona): string {
  const base = isBuiltIn(persona) ? 1 : Math.max(1, persona.roleIds.length);
  return `~${base} tok-unit${base === 1 ? '' : 's'}/turn`;
}

function scopeLabel(persona: Persona): string {
  if (persona.scope === 'board') return persona.boardId ? `Board · ${persona.boardId}` : 'Board';
  return persona.projectId ? `Project · ${persona.projectId}` : 'Project';
}

/**
 * Count `LogEvent`s in the trailing hour authored by `persona.id`. The
 * `authorRef.id` may carry the persona id or a role id; we match either.
 */
function countRecentActions(
  events: ReadonlyArray<LogEvent> | undefined,
  persona: Persona,
  nowMs: number,
): number | null {
  if (!events) return null;
  const cutoff = nowMs - 60 * 60 * 1000;
  let n = 0;
  for (const ev of events) {
    if (ev.ts < cutoff) continue;
    const id = ev.authorRef?.id;
    if (id === persona.id || persona.roleIds.includes(id)) n += 1;
  }
  return n;
}

export function PersonaPanel({
  projectId,
  boardId,
  personasOverride,
  boardPersonasOverride,
  eventsOverride,
}: PersonaPanelProps = {}): React.ReactElement {
  const { project, updateProject, isLoading: projectLoading } = useProjectSync();
  const effectiveProjectId = projectId ?? project?.id ?? DEFAULT_PROJECT_ID;

  const [personas, setPersonas] = useState<ReadonlyArray<Persona> | null>(
    personasOverride ?? null,
  );
  const [boardPersonas, setBoardPersonas] = useState<ReadonlyArray<Persona> | null>(
    boardPersonasOverride ?? (boardId ? null : []),
  );
  const [error, setError] = useState<Error | null>(null);
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [hoveredPersonaId, setHoveredPersonaId] = useState<string | null>(null);
  const [detailPersona, setDetailPersona] = useState<Persona | null>(null);
  const drawerCloseBtnRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    if (boardPersonasOverride !== undefined) {
      setBoardPersonas(boardPersonasOverride);
      return;
    }
    if (!boardId) {
      setBoardPersonas([]);
      return;
    }

    let cancelled = false;
    listPersonasForBoard(boardId)
      .then((next) => {
        if (!cancelled) setBoardPersonas(next);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
          setBoardPersonas([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, boardPersonasOverride]);

  const reload = useCallback(async () => {
    const projectPromise =
      personasOverride === undefined
        ? listPersonasForProject(effectiveProjectId).then((next) => setPersonas(next))
        : Promise.resolve();
    const boardPromise =
      boardPersonasOverride === undefined && boardId
        ? listPersonasForBoard(boardId).then((next) => setBoardPersonas(next))
        : Promise.resolve();
    try {
      await Promise.all([projectPromise, boardPromise]);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    }
  }, [effectiveProjectId, personasOverride, boardId, boardPersonasOverride]);

  const handleToggleActive = useCallback(
    async (personaId: string) => {
      const current =
        personas?.find((p) => p.id === personaId) ??
        boardPersonas?.find((p) => p.id === personaId);
      if (!current) return;
      try {
        await updatePersona(personaId, { active: !current.active });
        await reload();
      } catch (cause) {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      }
    },
    [personas, boardPersonas, reload],
  );

  const handleMore = useCallback(
    async (personaId: string) => {
      const current =
        personas?.find((p) => p.id === personaId) ??
        boardPersonas?.find((p) => p.id === personaId);
      if (!current) return;
      if (isBuiltIn(current)) {
        // Built-ins now route to the detail drawer instead of an alert.
        setDetailPersona(current);
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
    [personas, boardPersonas, reload],
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

  const handleOpenDetails = useCallback(
    (personaId: string) => {
      const current =
        personas?.find((p) => p.id === personaId) ??
        boardPersonas?.find((p) => p.id === personaId);
      if (current) setDetailPersona(current);
    },
    [personas, boardPersonas],
  );

  const closeDrawer = useCallback(() => {
    setDetailPersona(null);
  }, []);

  // Escape closes the drawer; focus the close button once it opens.
  useEffect(() => {
    if (!detailPersona) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeDrawer();
      }
    };
    window.addEventListener('keydown', onKey);
    // Focus the Close button so keyboard users land somewhere safe.
    requestAnimationFrame(() => drawerCloseBtnRef.current?.focus());
    return () => window.removeEventListener('keydown', onKey);
  }, [detailPersona, closeDrawer]);

  const currentAutonomy: AutonomyLevel = project?.autonomyDial ?? 'active';
  const nowMs = Date.now();

  const renderPersonaRow = (persona: Persona): React.ReactElement => {
    const showTooltip = hoveredPersonaId === persona.id;
    const bio = persona.description?.trim();
    const recent = countRecentActions(eventsOverride, persona, nowMs);
    const recentLabel = recent === null ? '—' : String(recent);
    const tooltipId = `bo-persona-tip-${persona.id}`;
    return (
      <div
        key={persona.id}
        role="listitem"
        style={PERSONA_ROW_STYLE}
        onMouseEnter={() => setHoveredPersonaId(persona.id)}
        onMouseLeave={() =>
          setHoveredPersonaId((prev) => (prev === persona.id ? null : prev))
        }
        onFocus={() => setHoveredPersonaId(persona.id)}
        onBlur={() =>
          setHoveredPersonaId((prev) => (prev === persona.id ? null : prev))
        }
      >
        <PersonaChip
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
          ariaLabel={`${persona.name} — describedby ${tooltipId}`}
        />
        <button
          type="button"
          className="btn"
          style={DETAILS_BTN_STYLE}
          aria-label={`Open details for ${persona.name}`}
          aria-haspopup="dialog"
          onClick={() => handleOpenDetails(persona.id)}
        >
          Details
        </button>
        {showTooltip && (
          <div
            role="tooltip"
            id={tooltipId}
            style={TOOLTIP_STYLE}
            aria-live="polite"
          >
            <div style={TOOLTIP_BIO_STYLE}>
              {bio ? bio : <em style={{ color: 'var(--ink-soft)' }}>No bio yet.</em>}
            </div>
            <div style={TOOLTIP_META_STYLE}>
              Recent (1h): {recentLabel}
              {recent === null && (
                <span style={{ marginLeft: 6, opacity: 0.65 }}>
                  (wire eventsOverride to populate)
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const personaRows = useMemo(() => {
    if (personas === null) return null;
    return personas.map(renderPersonaRow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personas, hoveredPersonaId, eventsOverride, currentAutonomy]);

  const boardPersonaRows = useMemo(() => {
    if (boardPersonas === null) return null;
    return boardPersonas.map(renderPersonaRow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardPersonas, hoveredPersonaId, eventsOverride, currentAutonomy]);

  const personasLoading = personas === null;
  const personasEmpty = personas !== null && personas.length === 0;
  const boardPersonasLoading = boardId !== undefined && boardPersonas === null;
  const boardPersonasEmpty =
    boardId !== undefined && boardPersonas !== null && boardPersonas.length === 0;

  const selectedDescription =
    AUTONOMY_OPTIONS.find((opt) => opt.value === currentAutonomy)?.description ?? '';

  return (
    <div className="paper-dots bo-persona-panel" style={ROOT_STYLE} aria-label="Persona panel">
      <header style={HEADER_STYLE}>
        <h1 style={TITLE_STYLE}>Personas</h1>
        <p style={SUBTITLE_STYLE}>
          Who's in the room — and how loud they get to be.
        </p>
      </header>

      {error && (
        <div style={ERROR_STYLE} role="alert">
          Could not update persona panel: {error.message}
        </div>
      )}

      <section style={SECTION_STYLE} aria-labelledby="bo-persona-panel-dial">
        <div style={SECTION_HEADER_STYLE}>
          <h2 id="bo-persona-panel-dial" style={SECTION_TITLE_STYLE}>
            Autonomy dial
          </h2>
          <p style={SECTION_SUB_STYLE}>
            How proactive the AI personas get. Wiring through to role-gating ships in bo-141.
          </p>
        </div>

        <div
          style={DIAL_GROUP_STYLE}
          role="radiogroup"
          aria-label="Autonomy dial"
        >
          {AUTONOMY_OPTIONS.map((opt) => {
            const selected = currentAutonomy === opt.value;
            const optionId = `bo-autonomy-${opt.value}`;
            const btnClass = selected ? 'btn primary' : 'btn';
            return (
              <label
                key={opt.value}
                htmlFor={optionId}
                style={DIAL_LABEL_STYLE}
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
                <span className={btnClass} aria-hidden>
                  {opt.label}
                </span>
              </label>
            );
          })}
        </div>
        {selectedDescription && (
          <p style={DIAL_DESC_STYLE} aria-live="polite">
            {selectedDescription}
          </p>
        )}
      </section>

      <section style={SECTION_STYLE} aria-labelledby="bo-persona-panel-roster">
        <div style={SECTION_HEADER_STYLE}>
          <h2 id="bo-persona-panel-roster" style={SECTION_TITLE_STYLE}>
            Project-scoped
          </h2>
          <p style={SECTION_SUB_STYLE}>
            Tap a chip to mute or wake. Hover for bio + recent activity; click Details for the full card.
          </p>
        </div>

        {personasLoading && !error && (
          <div style={LOADING_STYLE} role="status">
            Loading personas…
          </div>
        )}

        {personasEmpty && !error && (
          <div style={EMPTY_STYLE}>
            No personas yet. Built-ins seed automatically on first project load.
          </div>
        )}

        {personaRows && personaRows.length > 0 && (
          <div style={SECTION_BODY_STYLE} role="list">
            {personaRows}
          </div>
        )}
      </section>

      <section style={SECTION_STYLE} aria-labelledby="bo-persona-panel-board">
        <div style={SECTION_HEADER_STYLE}>
          <h2 id="bo-persona-panel-board" style={SECTION_TITLE_STYLE}>
            Board-scoped
          </h2>
          <p style={SECTION_SUB_STYLE}>
            {boardId
              ? 'Custom personas tied to this board only. Spawn one to bring a fresh angle without cluttering the project roster.'
              : 'Open this panel from a board to spawn board-scoped personas. Project-scoped custom personas can still be created below.'}
          </p>
        </div>

        {boardPersonasLoading && !error && (
          <div style={LOADING_STYLE} role="status">
            Loading board personas…
          </div>
        )}

        {boardPersonasEmpty && !error && (
          <div style={EMPTY_STYLE}>
            No board-scoped personas yet. Use "New custom persona" below to spawn one.
          </div>
        )}

        {boardPersonaRows && boardPersonaRows.length > 0 && (
          <div style={SECTION_BODY_STYLE} role="list">
            {boardPersonaRows}
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          {showCreateForm ? (
            <div
              style={{
                background: 'rgba(255,255,255,0.7)',
                border: '1.5px solid var(--ink)',
                borderRadius: 12,
                padding: 14,
                boxShadow: '2px 2px 0 var(--ink)',
              }}
            >
              <CustomPersonaForm
                boardId={boardId}
                projectId={effectiveProjectId}
                onCancel={() => setShowCreateForm(false)}
                onCreated={() => {
                  setShowCreateForm(false);
                  void reload();
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="btn"
            >
              + New custom persona
            </button>
          )}
        </div>
      </section>

      {detailPersona && (
        <PersonaDetailDrawer
          persona={detailPersona}
          onClose={closeDrawer}
          onEdit={() => {
            // For custom personas, surface the existing inline form. Pre-fill
            // is not wired today (CustomPersonaForm has no edit-mode prop and
            // is out-of-scope for this gap) so the form opens blank as a
            // re-author affordance. Deferred: dedicated edit mode.
            if (detailPersona.kind === 'custom') {
              setShowCreateForm(true);
            }
            closeDrawer();
          }}
          closeButtonRef={drawerCloseBtnRef}
        />
      )}
    </div>
  );
}

// -- Drawer ------------------------------------------------------------------

interface PersonaDetailDrawerProps {
  persona: Persona;
  onClose: () => void;
  onEdit: () => void;
  closeButtonRef: React.RefObject<HTMLButtonElement>;
}

function PersonaDetailDrawer({
  persona,
  onClose,
  onEdit,
  closeButtonRef,
}: PersonaDetailDrawerProps): React.ReactElement {
  const isCustom = persona.kind === 'custom';
  const bio = persona.description?.trim();
  return (
    <>
      <div
        style={DRAWER_OVERLAY_STYLE}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="bo-persona-drawer-title"
        style={{ ...DRAWER_STYLE_BASE, transform: 'translateX(0)' }}
      >
        <header style={DRAWER_HEADER_STYLE}>
          <h2 id="bo-persona-drawer-title" style={DRAWER_TITLE_STYLE}>
            {persona.name}
          </h2>
          <p style={DRAWER_SUBTITLE_STYLE}>
            {persona.kind === 'custom' ? 'Custom persona' : `Built-in · ${persona.kind}`}
            {' · '}
            {persona.active ? 'Active' : 'Muted'}
          </p>
        </header>
        <div style={DRAWER_BODY_STYLE}>
          <div>
            <div style={DRAWER_FIELD_LABEL_STYLE}>Bio</div>
            <div style={DRAWER_FIELD_VALUE_STYLE}>
              {bio || <em style={{ color: 'var(--ink-soft)' }}>No bio yet.</em>}
            </div>
          </div>
          <div>
            <div style={DRAWER_FIELD_LABEL_STYLE}>System prompt</div>
            <div style={DRAWER_FIELD_VALUE_STYLE}>
              {bio ? (
                bio
              ) : (
                <em style={{ color: 'var(--ink-soft)' }}>
                  No custom prompt — role prompts apply.
                </em>
              )}
            </div>
          </div>
          <div>
            <div style={DRAWER_FIELD_LABEL_STYLE}>Cost-per-turn</div>
            <div style={DRAWER_FIELD_VALUE_STYLE}>{estimateCostPerTurn(persona)}</div>
          </div>
          <div>
            <div style={DRAWER_FIELD_LABEL_STYLE}>Scope</div>
            <div style={DRAWER_FIELD_VALUE_STYLE}>{scopeLabel(persona)}</div>
          </div>
          <div>
            <div style={DRAWER_FIELD_LABEL_STYLE}>Roles</div>
            <div style={DRAWER_FIELD_VALUE_STYLE}>
              {persona.roleIds.length > 0 ? persona.roleIds.join(', ') : '—'}
            </div>
          </div>
        </div>
        <div style={DRAWER_FOOTER_STYLE}>
          <button
            type="button"
            className="btn sm"
            onClick={onEdit}
            disabled={!isCustom}
            title={isCustom ? 'Edit this persona' : 'Built-in personas are not editable yet'}
            style={{
              fontFamily: 'var(--f-hand-body)',
              fontSize: 13,
              padding: '4px 12px',
              background: 'var(--paper)',
              border: '1.5px solid var(--ink)',
              borderRadius: 999,
              cursor: isCustom ? 'pointer' : 'not-allowed',
              opacity: isCustom ? 1 : 0.5,
              boxShadow: '1.5px 1.5px 0 var(--ink)',
            }}
          >
            Edit
          </button>
          <button
            type="button"
            ref={closeButtonRef}
            className="btn sm primary"
            onClick={onClose}
            style={{
              fontFamily: 'var(--f-hand-body)',
              fontSize: 13,
              padding: '4px 12px',
              background: 'var(--ink)',
              color: 'var(--paper)',
              border: '1.5px solid var(--ink)',
              borderRadius: 999,
              cursor: 'pointer',
              boxShadow: '1.5px 1.5px 0 var(--ink)',
            }}
          >
            Close
          </button>
        </div>
      </aside>
    </>
  );
}

export default PersonaPanel;
