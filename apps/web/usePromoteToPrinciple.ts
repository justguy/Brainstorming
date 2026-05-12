/**
 * bo-162 — usePromoteToPrinciple
 *
 * Tiny helper hook that wraps `useProjectSync().updateProject` to append a
 * candidate principle string to `Project.principles`. Centralised here so the
 * idea inspector, brief screen, and any future menu surface all share one
 * codepath (and one dedupe rule).
 *
 * Spec: Design/IMPLEMENTATION_PLAN.md §5 Screen 03 — "Promote-to-principle flow".
 *
 * Behaviour:
 *   - Trims whitespace and rejects empty strings (returns `false`).
 *   - Dedupes case-insensitively against the existing list — if the candidate
 *     normalises to an existing entry the call resolves with `false` and does
 *     not write. This matches the "avoid duplicates" requirement and keeps the
 *     drawer from accumulating near-identical entries on repeated promotion.
 *   - Persists via `useProjectSync().updateProject({ principles })`. The hook
 *     handles the IDB write + state refresh; we never touch storage directly.
 *
 * Returns a stable callback so consumers can pass it to memoised buttons.
 */
import { useCallback } from 'react';
import { useProjectSync } from './useProjectSync';

export interface UsePromoteToPrincipleResult {
  /**
   * Append `candidate` to `Project.principles` (idempotent, case-insensitive).
   * Resolves with `true` when the list grew, `false` when nothing changed
   * (empty string, duplicate, or no project loaded).
   */
  promoteToPrinciple: (candidate: string) => Promise<boolean>;
  /** Snapshot of the current principles list (read-only). */
  principles: string[];
  /** Forwarded so callers can render loading states without a second hook. */
  isLoading: boolean;
}

/**
 * Returns `true` when `candidate` matches `existing` after trim + lowercase.
 * Exported for tests / drawer reuse so the dedupe rule has a single home.
 */
export function principleMatches(candidate: string, existing: string): boolean {
  return candidate.trim().toLowerCase() === existing.trim().toLowerCase();
}

export function usePromoteToPrinciple(): UsePromoteToPrincipleResult {
  const { project, updateProject, isLoading } = useProjectSync();
  const principles = project?.principles ?? [];

  const promoteToPrinciple = useCallback(
    async (candidate: string): Promise<boolean> => {
      const trimmed = candidate.trim();
      if (trimmed.length === 0) return false;
      // Use the latest snapshot from the hook closure rather than re-reading
      // storage — `updateProject` resolves with the persisted record, so even
      // if two promotes race the second run will see the first's writes after
      // the closing render. Worst case: a brief duplicate that the next render
      // surface reconciles. Acceptable given the manual nature of the action.
      const current = project?.principles ?? [];
      if (current.some((entry) => principleMatches(trimmed, entry))) {
        return false;
      }
      await updateProject({ principles: [...current, trimmed] });
      return true;
    },
    [project?.principles, updateProject],
  );

  return { promoteToPrinciple, principles, isLoading };
}
