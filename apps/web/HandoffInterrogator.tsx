import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Brief, Persona, ProviderId } from '../../src/types';
import {
  CRITIC_ROLE_IDS,
  runPreShipInterrogator,
  type InterrogatorFinding,
  type InterrogatorSeverity,
  type RunRoleFn,
} from '../../src/orchestrator/preShipInterrogator';
import { listPersonasForBoard, listPersonasForProject } from '../../src/storage/personas';
import { getSettings } from '../../src/storage/settings';
import { buildPayload, payloadToMessages } from '../../src/orchestrator/ctmcp';
import { callWithRetry } from '../../src/orchestrator/retryAndFallback';

/**
 * bo-164 — Pre-ship LLM interrogator panel.
 *
 * Spec: Design/IMPLEMENTATION_PLAN.md §5 (Screen 07 · Handoff), §6 M5.
 *
 * Mounts inside HandoffScreen's `data-bo-interrogator-slot`. Loads the active
 * personas for the brief's project (and board, if scoped), exposes a "Run
 * interrogation" button, calls `runPreShipInterrogator`, and renders the
 * resulting findings grouped by persona.
 *
 * Architecture:
 *   - Persona resolution lives here (the orchestrator stays pure).
 *   - The `runRole` callback is wired to `callWithRetry` + `buildPayload` so
 *     each critic role goes through the same retry/fallback path the rest of
 *     the orchestrator uses. Tests can short-circuit by passing
 *     `runRoleOverride`.
 *   - Findings are kept in component state — the user can dismiss locally to
 *     unblock ship. Persisting them as MarginNotes is a follow-up (covered
 *     by the Brief screen's existing margin-note infra in bo-153).
 */

export interface HandoffInterrogatorProps {
  brief: Brief;
  /** Optional override — supplied by tests / Storybook to bypass IDB. */
  personasOverride?: Persona[];
  /**
   * Optional override — when set, the panel uses this instead of the live
   * `callWithRetry` runner. Tests pass a stub that returns canned role output.
   */
  runRoleOverride?: RunRoleFn;
  /**
   * Optional callback when the user dismisses a finding. Defaults to
   * local-only dismissal.
   */
  onFindingDismissed?: (finding: InterrogatorFinding) => void;
}

interface RunStatus {
  kind: 'idle' | 'running' | 'done' | 'error';
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

const ROOT_CLASS =
  'bo-handoff-interrogator flex flex-col gap-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 px-5 py-5 text-slate-900';
const HEADER_CLASS = 'flex flex-wrap items-start justify-between gap-3';
const HEADER_TEXT_CLASS = 'flex flex-col gap-1';
const TITLE_CLASS = 'text-base font-semibold tracking-tight text-slate-900';
const SUBTITLE_CLASS = 'text-sm text-slate-600';
const BUTTON_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-full border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50';
const STATUS_PILL_CLASS =
  'inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200';
const PERSONA_GROUP_CLASS =
  'flex flex-col gap-2 rounded-xl border border-indigo-100 bg-white px-4 py-3';
const PERSONA_NAME_CLASS = 'text-sm font-semibold text-slate-900';
const PERSONA_ROLE_CLASS = 'text-xs text-slate-500';
const FINDING_LIST_CLASS = 'flex flex-col gap-2';
const FINDING_CARD_CLASS =
  'flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2';
const FINDING_HEAD_ROW_CLASS = 'flex flex-wrap items-start justify-between gap-2';
const FINDING_HEADLINE_CLASS = 'text-sm font-medium text-slate-800';
const FINDING_DETAIL_CLASS = 'text-xs text-slate-600';
const SEVERITY_PILL_CLASS =
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset';
const DISMISS_BTN_CLASS =
  'self-end text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline';
const ERROR_BANNER_CLASS =
  'rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700';
const EMPTY_CLASS = 'text-sm text-slate-600';

const SEVERITY_TONE: Record<InterrogatorSeverity, string> = {
  high: 'bg-rose-100 text-rose-800 ring-rose-200',
  medium: 'bg-amber-100 text-amber-800 ring-amber-200',
  low: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  info: 'bg-slate-100 text-slate-700 ring-slate-200',
};

const SEVERITY_LABEL: Record<InterrogatorSeverity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

/** Build the live `runRole` runner — wires `buildPayload` + `callWithRetry`. */
function makeLiveRunner(provider: ProviderId, model: string): RunRoleFn {
  return async ({ role, idea }) => {
    const task = role.buildTask(idea);
    const payload = buildPayload(role, idea, task);
    const messages = payloadToMessages(payload);
    const { result, usedFallback } = await callWithRetry({
      providerId: provider,
      model,
      messages,
      jsonSchema: role.jsonSchema,
      maxTokens: 2048,
      schema: role.schema,
    });
    if (usedFallback || result === null) {
      throw new Error(`${role.id}: provider fallback / null result.`);
    }
    return result;
  };
}

export function HandoffInterrogator({
  brief,
  personasOverride,
  runRoleOverride,
  onFindingDismissed,
}: HandoffInterrogatorProps): React.ReactElement {
  const [personas, setPersonas] = useState<Persona[] | null>(personasOverride ?? null);
  const [findings, setFindings] = useState<InterrogatorFinding[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState<RunStatus>({ kind: 'idle' });

  // Resolve active personas. Prefer board-scoped if any are set; otherwise
  // fall back to the brief's project. Built-ins live at the project scope.
  useEffect(() => {
    if (personasOverride !== undefined) {
      setPersonas(personasOverride);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const projectPersonas = await listPersonasForProject(brief.projectId);
        const boardPersonas = brief.boardId
          ? await listPersonasForBoard(brief.boardId)
          : [];
        if (cancelled) return;
        // Merge by id; board-scoped wins on collision (none today, but future-proofs).
        const byId = new Map<string, Persona>();
        for (const p of projectPersonas) byId.set(p.id, p);
        for (const p of boardPersonas) byId.set(p.id, p);
        const merged = Array.from(byId.values()).filter((p) => p.active);
        setPersonas(merged);
      } catch (err) {
        if (cancelled) return;
        // Non-fatal: surface as a load-error in the run banner. The button
        // disables when personas is null, so the user sees the message.
        setStatus({
          kind: 'error',
          error: err instanceof Error ? err.message : 'Could not load personas.',
        });
        setPersonas([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brief.projectId, brief.boardId, personasOverride]);

  const activeCriticPersonas = useMemo(
    () => (personas ?? []).filter(
      (p) => p.active && p.roleIds.some((rid) => (CRITIC_ROLE_IDS as readonly string[]).includes(rid)),
    ),
    [personas],
  );

  const runInterrogation = useCallback(async (): Promise<void> => {
    if (!personas) return;
    setStatus({ kind: 'running', startedAt: Date.now() });
    setFindings([]);
    setDismissedIds(new Set());
    try {
      let runner: RunRoleFn;
      if (runRoleOverride) {
        runner = runRoleOverride;
      } else {
        const settings = await getSettings();
        runner = makeLiveRunner(settings.activeProvider, settings.activeModel);
      }
      const result = await runPreShipInterrogator(brief, personas, runner);
      setFindings(result);
      setStatus({ kind: 'done', finishedAt: Date.now() });
    } catch (err) {
      setStatus({
        kind: 'error',
        error: err instanceof Error ? err.message : 'Interrogation failed.',
        finishedAt: Date.now(),
      });
    }
  }, [brief, personas, runRoleOverride]);

  const dismiss = useCallback(
    (finding: InterrogatorFinding) => {
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.add(finding.id);
        return next;
      });
      onFindingDismissed?.(finding);
    },
    [onFindingDismissed],
  );

  // Group findings by persona for the rendered list.
  const grouped = useMemo(() => {
    const map = new Map<string, { persona: { id: string; name: string }; rows: InterrogatorFinding[] }>();
    for (const f of findings) {
      if (dismissedIds.has(f.id)) continue;
      const key = f.personaId;
      const bucket = map.get(key);
      if (bucket) {
        bucket.rows.push(f);
      } else {
        map.set(key, {
          persona: { id: f.personaId, name: f.personaName },
          rows: [f],
        });
      }
    }
    return Array.from(map.values());
  }, [findings, dismissedIds]);

  const isLoadingPersonas = personas === null;
  const noCritics = !isLoadingPersonas && activeCriticPersonas.length === 0;
  const isRunning = status.kind === 'running';
  const showResults = findings.length > 0;
  const visibleCount = grouped.reduce((acc, g) => acc + g.rows.length, 0);

  return (
    <div className={ROOT_CLASS} data-bo-interrogator data-status={status.kind}>
      <header className={HEADER_CLASS}>
        <div className={HEADER_TEXT_CLASS}>
          <h2 className={TITLE_CLASS}>Pre-ship interrogation</h2>
          <p className={SUBTITLE_CLASS}>
            Active personas re-read the latest brief version and flag what they
            still object to. Address or dismiss each finding before ship.
          </p>
          <p className={PERSONA_ROLE_CLASS}>
            {isLoadingPersonas
              ? 'Loading personas…'
              : noCritics
                ? 'No active personas hold a critic-style role.'
                : `${activeCriticPersonas.length} persona${activeCriticPersonas.length === 1 ? '' : 's'} ready: ${activeCriticPersonas.map((p) => p.name).join(', ')}.`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {status.kind === 'done' ? (
            <span className={STATUS_PILL_CLASS}>
              {visibleCount === 0 ? 'No findings' : `${visibleCount} finding${visibleCount === 1 ? '' : 's'}`}
            </span>
          ) : null}
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={isLoadingPersonas || isRunning || noCritics || brief.shipStatus === 'shipped' || brief.shipStatus === 'archived'}
            onClick={() => { void runInterrogation(); }}
            data-bo-interrogator-run="true"
          >
            {isRunning ? 'Interrogating…' : showResults ? 'Re-run interrogation' : 'Run interrogation'}
          </button>
        </div>
      </header>

      {status.kind === 'error' && status.error ? (
        <div className={ERROR_BANNER_CLASS} role="alert">
          {status.error}
        </div>
      ) : null}

      {status.kind === 'done' && visibleCount === 0 && findings.length === 0 ? (
        <p className={EMPTY_CLASS}>The interrogator returned no findings.</p>
      ) : null}

      {status.kind === 'done' && visibleCount === 0 && findings.length > 0 ? (
        <p className={EMPTY_CLASS}>All findings dismissed. Brief is clear to ship.</p>
      ) : null}

      {grouped.length > 0 ? (
        <div className="flex flex-col gap-3" aria-label="Interrogator findings">
          {grouped.map((group) => (
            <section
              key={group.persona.id}
              className={PERSONA_GROUP_CLASS}
              data-bo-interrogator-persona={group.persona.id}
            >
              <header className="flex items-center justify-between gap-2">
                <h3 className={PERSONA_NAME_CLASS}>{group.persona.name}</h3>
                <span className={PERSONA_ROLE_CLASS}>
                  {group.rows.length} finding{group.rows.length === 1 ? '' : 's'}
                </span>
              </header>
              <ul className={FINDING_LIST_CLASS}>
                {group.rows.map((finding) => (
                  <li
                    key={finding.id}
                    className={FINDING_CARD_CLASS}
                    data-bo-interrogator-finding={finding.id}
                    data-bo-severity={finding.severity}
                  >
                    <div className={FINDING_HEAD_ROW_CLASS}>
                      <div className="flex flex-col gap-0.5">
                        <span className={FINDING_HEADLINE_CLASS}>{finding.headline}</span>
                        <span className={PERSONA_ROLE_CLASS}>
                          via {finding.roleLabel}
                        </span>
                      </div>
                      <span className={`${SEVERITY_PILL_CLASS} ${SEVERITY_TONE[finding.severity]}`}>
                        {SEVERITY_LABEL[finding.severity]}
                      </span>
                    </div>
                    {finding.detail ? (
                      <p className={FINDING_DETAIL_CLASS}>{finding.detail}</p>
                    ) : null}
                    <button
                      type="button"
                      className={DISMISS_BTN_CLASS}
                      onClick={() => dismiss(finding)}
                      aria-label={`Dismiss finding: ${finding.headline}`}
                    >
                      Dismiss
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default HandoffInterrogator;
