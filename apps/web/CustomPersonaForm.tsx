/**
 * bo-169 — Custom persona authoring form (M5).
 *
 * Spec: Design/IMPLEMENTATION_PLAN.md §5 Screen 08, §6 M5 ("Custom personas").
 *
 * Renders a small inline form (no modal/portal layer — the host decides where
 * to mount it) collecting:
 *   - name (required)
 *   - roleIds (1+ required, multi-select from `AVAILABLE_ROLE_IDS`)
 *   - description (optional, free-form / system-prompt-ish)
 *
 * On submit it calls `createPersona` with `kind: 'custom'`. Scope defaults to
 * 'board' when a `boardId` is supplied, falling back to 'project' otherwise.
 * The active flag is set to true so the new persona shows up immediately on
 * the parent panel.
 *
 * The form is intentionally framework-light: it uses `useState` for the draft,
 * runs validation on submit, and exposes `onCreated` so the parent can refresh
 * its persona list. No toast / error-boundary integration here — surface
 * errors via the inline `<div role="alert">` slot and let the parent re-fetch.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  AVAILABLE_ROLE_IDS,
  type AvailableRole,
} from '../../src/personas/registry';
import { createPersona } from '../../src/storage/personas';
import { DEFAULT_PROJECT_ID } from '../../src/storage/projects';
import type { BoardId, Persona, ProjectId } from '../../src/types';

export interface CustomPersonaFormProps {
  /**
   * Board the new persona should be scoped to. When provided, the persona is
   * persisted with `scope: 'board'` and `boardId: boardId`. When omitted the
   * form falls back to `scope: 'project'` (project-wide custom persona).
   */
  boardId?: BoardId;
  /**
   * Project to associate with the persona. Defaults to the canonical default
   * project so legacy single-project setups keep working.
   */
  projectId?: ProjectId;
  /** Fired after the persona has been persisted successfully. */
  onCreated?: (persona: Persona) => void;
  /** Fired when the user clicks "Cancel". The form does not unmount itself. */
  onCancel?: () => void;
  /**
   * Override the role catalogue (Storybook / tests). Defaults to the
   * project-wide `AVAILABLE_ROLE_IDS` from the persona registry.
   */
  rolesOverride?: ReadonlyArray<AvailableRole>;
}

const FORM_CLASS =
  'bo-custom-persona-form flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm';
const FIELD_CLASS = 'flex flex-col gap-1';
const LABEL_CLASS = 'text-xs font-semibold uppercase tracking-[0.08em] text-slate-500';
const INPUT_CLASS =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200';
const TEXTAREA_CLASS = `${INPUT_CLASS} min-h-[5rem] resize-y`;
const HELP_CLASS = 'text-xs text-slate-500';
const ROLE_GRID_CLASS = 'grid grid-cols-1 gap-1.5 sm:grid-cols-2';
const ROLE_OPTION_CLASS =
  'flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-slate-300 hover:bg-slate-50';
const ROLE_OPTION_SELECTED_CLASS =
  'border-emerald-300 bg-emerald-50/70 ring-1 ring-emerald-200';
const ROLE_CHECKBOX_CLASS = 'mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-500';
const ROLE_LABEL_CLASS = 'text-xs font-semibold text-slate-900';
const ROLE_DESC_CLASS = 'text-[11px] leading-snug text-slate-500';
const ACTIONS_CLASS = 'flex flex-wrap items-center justify-end gap-2';
const ERROR_CLASS =
  'rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700';
const PRIMARY_BTN_CLASS =
  'inline-flex items-center gap-1 rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60';
const SECONDARY_BTN_CLASS =
  'inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50';

export function CustomPersonaForm({
  boardId,
  projectId,
  onCreated,
  onCancel,
  rolesOverride,
}: CustomPersonaFormProps): React.ReactElement {
  const roles = rolesOverride ?? AVAILABLE_ROLE_IDS;
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [selectedRoleIds, setSelectedRoleIds] = useState<ReadonlyArray<string>>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && selectedRoleIds.length > 0 && !submitting;

  const scopeLabel = useMemo(
    () => (boardId ? 'this board' : 'the whole project'),
    [boardId],
  );

  const toggleRole = useCallback((roleId: string) => {
    setSelectedRoleIds((prev) => {
      if (prev.includes(roleId)) return prev.filter((r) => r !== roleId);
      return [...prev, roleId];
    });
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) return;
      setSubmitting(true);
      setError(null);
      try {
        const persona = await createPersona({
          name: trimmedName,
          kind: 'custom',
          roleIds: [...selectedRoleIds],
          scope: boardId ? 'board' : 'project',
          active: true,
          projectId: projectId ?? DEFAULT_PROJECT_ID,
          boardId,
          description: description.trim() || undefined,
        });
        // Reset draft so the form is reusable for back-to-back authoring.
        setName('');
        setDescription('');
        setSelectedRoleIds([]);
        onCreated?.(persona);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(`Could not create persona: ${message}`);
      } finally {
        setSubmitting(false);
      }
    },
    [
      canSubmit,
      trimmedName,
      selectedRoleIds,
      boardId,
      projectId,
      description,
      onCreated,
    ],
  );

  return (
    <form
      className={FORM_CLASS}
      onSubmit={handleSubmit}
      aria-label="Create custom persona"
    >
      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS} htmlFor="bo-custom-persona-name">
          Name
        </label>
        <input
          id="bo-custom-persona-name"
          className={INPUT_CLASS}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. UX Devil"
          maxLength={80}
          autoComplete="off"
          required
        />
        <span className={HELP_CLASS}>
          Scoped to {scopeLabel}.
        </span>
      </div>

      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS} htmlFor="bo-custom-persona-description">
          Description (optional)
        </label>
        <textarea
          id="bo-custom-persona-description"
          className={TEXTAREA_CLASS}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this persona for? Free-form notes / system-prompt-ish guidance."
          maxLength={2000}
        />
      </div>

      <fieldset className={FIELD_CLASS}>
        <legend className={LABEL_CLASS}>Roles</legend>
        <span className={HELP_CLASS}>
          Pick one or more orchestrator roles this persona will speak through.
        </span>
        <div className={ROLE_GRID_CLASS} role="group" aria-label="Roles">
          {roles.map((role) => {
            const checked = selectedRoleIds.includes(role.id);
            const className = [
              ROLE_OPTION_CLASS,
              checked ? ROLE_OPTION_SELECTED_CLASS : '',
            ]
              .filter(Boolean)
              .join(' ');
            const optionId = `bo-custom-persona-role-${role.id}`;
            return (
              <label key={role.id} htmlFor={optionId} className={className}>
                <input
                  id={optionId}
                  type="checkbox"
                  className={ROLE_CHECKBOX_CLASS}
                  checked={checked}
                  onChange={() => toggleRole(role.id)}
                />
                <span className="flex flex-col gap-0.5">
                  <span className={ROLE_LABEL_CLASS}>{role.label}</span>
                  <span className={ROLE_DESC_CLASS}>{role.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {error && (
        <div className={ERROR_CLASS} role="alert">
          {error}
        </div>
      )}

      <div className={ACTIONS_CLASS}>
        {onCancel && (
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className={PRIMARY_BTN_CLASS}
          disabled={!canSubmit}
        >
          {submitting ? 'Creating…' : 'Create persona'}
        </button>
      </div>
    </form>
  );
}

export default CustomPersonaForm;
