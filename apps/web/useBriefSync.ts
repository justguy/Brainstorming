import { useCallback, useEffect, useRef, useState } from 'react';
import type { Brief, BriefShipStatus } from '../../src/types';
import {
  addMarginNote as storageAddMarginNote,
  appendBriefVersion as storageAppendBriefVersion,
  getBrief as storageGetBrief,
  getBriefForIdea as storageGetBriefForIdea,
  resolveMarginNote as storageResolveMarginNote,
  setShipStatus as storageSetShipStatus,
  type AddMarginNoteInput,
  type AppendBriefVersionInput,
  type ResolveMarginNoteInput,
} from '../../src/storage/briefs';

/**
 * bo-153 — useBriefSync
 *
 * React hook that owns a single Brief record. Mirrors the shape of
 * `useProjectSync` / `useBoardSync`: own state, async load on mount, awaitable
 * mutators that commit through the storage module before updating local state
 * with the persisted record so callers can rely on `updatedAt` reflecting
 * truth.
 *
 * Inputs (per IMPLEMENTATION_PLAN §5 Screen 04 — both forms must work because
 * the route is `#/b/:boardId/brief/:ideaId` while the handoff route is
 * `#/b/:boardId/handoff/:briefId`):
 *
 *   - `{ ideaId }`  → resolved through `getBriefForIdea` (latest by updatedAt;
 *     undefined when the idea has not graduated yet).
 *   - `{ briefId }` → resolved through `getBrief`.
 *
 * Pass `null` / `undefined` to disable the hook (renders before navigation
 * picks an id). The hook re-loads when the input id changes.
 *
 * Reactivity contract:
 *   - On mount + on input id change: re-fetches.
 *   - Mutations replace local state with the freshly persisted record.
 *   - `reload()` re-reads from IDB; useful after out-of-band writes (e.g. the
 *     pre-ship interrogator running in another component).
 *   - The storage layer exposes no event bus today, so cross-tab updates are
 *     not yet reflected. This matches `useProjectSync` and is the natural
 *     subscriber when a bus is added.
 */

export type UseBriefSyncInput =
  | { ideaId: string; briefId?: undefined }
  | { briefId: string; ideaId?: undefined }
  | null
  | undefined;

export interface UseBriefSyncResult {
  brief: Brief | null;
  isLoading: boolean;
  /** True once the initial load has completed AND no brief was found. */
  notFound: boolean;
  reload(): Promise<void>;
  appendVersion(input: AppendBriefVersionInput): Promise<Brief>;
  addMarginNote(input: AddMarginNoteInput): Promise<Brief>;
  resolveMarginNote(input: ResolveMarginNoteInput): Promise<Brief>;
  setShipStatus(status: BriefShipStatus): Promise<Brief>;
}

/** Exported for tests. Resolves the input prop into a `{kind, id}` pair or null. */
export function normaliseInput(input: UseBriefSyncInput): { kind: 'idea' | 'brief'; id: string } | null {
  if (!input) return null;
  if ('briefId' in input && input.briefId) return { kind: 'brief', id: input.briefId };
  if ('ideaId' in input && input.ideaId) return { kind: 'idea', id: input.ideaId };
  return null;
}

export function useBriefSync(input: UseBriefSyncInput): UseBriefSyncResult {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(() => normaliseInput(input) !== null);
  const [notFound, setNotFound] = useState(false);

  // Guard against state updates after unmount — IDB calls are async and may
  // resolve after the component is gone.
  const mountedRef = useRef(true);
  // Track the in-flight target so a stale load (e.g. when the input id flips
  // mid-fetch) doesn't overwrite the newer one.
  const target = normaliseInput(input);
  const targetKey = target ? `${target.kind}:${target.id}` : null;
  const targetKeyRef = useRef<string | null>(targetKey);
  targetKeyRef.current = targetKey;

  const load = useCallback(async (): Promise<void> => {
    const current = targetKeyRef.current;
    if (!current) {
      if (mountedRef.current) {
        setBrief(null);
        setNotFound(false);
        setIsLoading(false);
      }
      return;
    }
    if (mountedRef.current) {
      setIsLoading(true);
    }
    try {
      const [kind, id] = splitKey(current);
      const next = kind === 'brief'
        ? await storageGetBrief(id)
        : await storageGetBriefForIdea(id);
      // Bail if the input changed while we were awaiting.
      if (targetKeyRef.current !== current) return;
      if (!mountedRef.current) return;
      setBrief(next ?? null);
      setNotFound(!next);
    } catch {
      if (targetKeyRef.current !== current) return;
      if (!mountedRef.current) return;
      // Non-fatal: leave brief untouched, callers can decide how to surface.
      setNotFound(false);
    } finally {
      if (mountedRef.current && targetKeyRef.current === current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Re-load whenever the resolved id changes. We intentionally key off the
  // composite `targetKey` string so toggling between `{ ideaId }` and
  // `{ briefId }` shapes triggers a refetch even when the raw id matches.
  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [targetKey, load]);

  const requireBriefId = useCallback((): string => {
    if (brief?.id) return brief.id;
    if (target?.kind === 'brief') return target.id;
    throw new Error('useBriefSync: cannot mutate before a brief is loaded.');
  }, [brief?.id, target?.kind, target?.id]);

  const appendVersion = useCallback(async (payload: AppendBriefVersionInput): Promise<Brief> => {
    const id = requireBriefId();
    const updated = await storageAppendBriefVersion(id, payload);
    if (mountedRef.current) {
      setBrief(updated);
      setNotFound(false);
    }
    return updated;
  }, [requireBriefId]);

  const addMarginNote = useCallback(async (payload: AddMarginNoteInput): Promise<Brief> => {
    const id = requireBriefId();
    const updated = await storageAddMarginNote(id, payload);
    if (mountedRef.current) {
      setBrief(updated);
      setNotFound(false);
    }
    return updated;
  }, [requireBriefId]);

  const resolveMarginNote = useCallback(async (payload: ResolveMarginNoteInput): Promise<Brief> => {
    const id = requireBriefId();
    const updated = await storageResolveMarginNote(id, payload);
    if (mountedRef.current) {
      setBrief(updated);
      setNotFound(false);
    }
    return updated;
  }, [requireBriefId]);

  const setShipStatus = useCallback(async (status: BriefShipStatus): Promise<Brief> => {
    const id = requireBriefId();
    const updated = await storageSetShipStatus(id, status);
    if (mountedRef.current) {
      setBrief(updated);
      setNotFound(false);
    }
    return updated;
  }, [requireBriefId]);

  return {
    brief,
    isLoading,
    notFound,
    reload: load,
    appendVersion,
    addMarginNote,
    resolveMarginNote,
    setShipStatus,
  };
}

function splitKey(key: string): ['brief' | 'idea', string] {
  const colon = key.indexOf(':');
  const kind = key.slice(0, colon) as 'brief' | 'idea';
  const id = key.slice(colon + 1);
  return [kind, id];
}
