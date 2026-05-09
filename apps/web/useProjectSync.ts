import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '../../src/types';
import {
  DEFAULT_PROJECT_ID,
  getDefaultProject,
  updateProject as storageUpdateProject,
} from '../../src/storage/projects';

export interface UseProjectSyncResult {
  project: Project | null;
  updateProject: (patch: Partial<Project>) => Promise<void>;
  isLoading: boolean;
}

/**
 * bo-103 — useProjectSync
 *
 * React hook that owns the active Project record. Mirrors the shape of
 * `useBoardSync` (own state, async load on mount, awaitable mutators that
 * commit through the storage module before updating state).
 *
 * Contract (per IMPLEMENTATION_PLAN §6 M0):
 *   - On mount: resolves the default project via `getDefaultProject()`. The
 *     storage module is responsible for ensuring the row + seeding built-in
 *     personas; this hook does not contain that logic.
 *   - `project` is `null` until the first load completes.
 *   - `updateProject(patch)` writes through `storage/projects.updateProject`
 *     and replaces local state with the persisted record so callers can rely
 *     on `updatedAt` reflecting truth.
 *   - `isLoading` is `true` until the initial load resolves (success or
 *     failure). Mutations do not flip it back on; failure handling is left to
 *     the caller's promise rejection.
 *
 * The hook intentionally has no cross-tab subscription today. The storage
 * layer exposes no event bus, and `useBoardSync` follows the same pattern of
 * loading once on mount and re-reading after mutations. If/when a bus is
 * added, this hook is the natural subscriber.
 */
export function useProjectSync(): UseProjectSyncResult {
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Guard against state updates after unmount — `getDefaultProject()` does
  // async IDB work and may resolve after the component is gone.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const next = await getDefaultProject();
        if (!cancelled && mountedRef.current) {
          setProject(next);
        }
      } catch {
        // Non-fatal: project remains null. Caller can render a fallback.
      } finally {
        if (!cancelled && mountedRef.current) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  const updateProject = useCallback(async (patch: Partial<Project>): Promise<void> => {
    // Resolve target id from current state, falling back to the default so
    // callers can mutate before the initial load completes (rare but legal).
    const targetId = project?.id ?? DEFAULT_PROJECT_ID;
    const updated = await storageUpdateProject(targetId, patch);
    if (mountedRef.current) {
      setProject(updated);
    }
  }, [project?.id]);

  return { project, updateProject, isLoading };
}
