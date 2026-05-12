import { useEffect, useSyncExternalStore } from 'react';

/**
 * useCanvasZoomMode — Screen 02 cluster-zoom mode hook (Build Spec §s02).
 *
 * Emits the current visual mode of the board canvas based on react-flow's
 * actual viewport zoom level:
 *  - `'sticky'` when zoom > 0.52 — full sticky cards, lines, edit affordances.
 *  - `'cluster'` when zoom < 0.48 — 22×16 chips, bold halos, cluster labels.
 *
 * A small hysteresis band (0.48 ↔ 0.52) prevents flicker when the user hovers
 * the boundary. The hook is provider-agnostic: instead of `useViewport()` (which
 * only works inside `ReactFlowProvider`), it observes the `.react-flow__viewport`
 * element's `transform` style on each animation frame. This lets overlays
 * outside the provider (e.g. `BoardCanvasStage`'s overlay stack) consume the
 * same signal as the in-flow `IdeaNoteNode`s.
 *
 * The watcher is a module-level singleton — every component that calls the
 * hook subscribes to one shared rAF loop. The loop only runs while at least
 * one subscriber is mounted.
 */

export type CanvasZoomMode = 'sticky' | 'cluster';

export const CLUSTER_ENTER_ZOOM = 0.48;
export const CLUSTER_EXIT_ZOOM = 0.52;

interface ZoomState {
  zoom: number;
  mode: CanvasZoomMode;
}

const initialState: ZoomState = { zoom: 1, mode: 'sticky' };

let currentState: ZoomState = initialState;
let manualOverrideActive = false;
const listeners = new Set<() => void>();
let rafHandle: number | null = null;

function nextMode(zoom: number, prev: CanvasZoomMode): CanvasZoomMode {
  if (prev === 'sticky') {
    return zoom <= CLUSTER_ENTER_ZOOM ? 'cluster' : 'sticky';
  }
  return zoom >= CLUSTER_EXIT_ZOOM ? 'sticky' : 'cluster';
}

function readZoomFromDom(): number | null {
  if (typeof document === 'undefined') return null;
  const node = document.querySelector('.react-flow__viewport');
  if (!node) return null;
  // React Flow paints the viewport transform on `.react-flow__viewport`'s
  // inline style. Prefer the inline value (cheaper than getComputedStyle and
  // matches the exact zoom React Flow set, not a rounded matrix).
  const inline = (node as HTMLElement).style.transform;
  if (inline) {
    const scaleMatch = inline.match(/scale\(([^)]+)\)/);
    if (scaleMatch) {
      const value = parseFloat(scaleMatch[1]);
      if (Number.isFinite(value)) return value;
    }
  }
  const computed = window.getComputedStyle(node as Element).transform;
  if (computed && computed !== 'none') {
    // matrix(a, b, c, d, tx, ty) — a is the x-scale.
    const match = computed.match(/matrix\(([^)]+)\)/);
    if (match) {
      const parts = match[1].split(',').map(part => parseFloat(part.trim()));
      const scale = parts[0];
      if (Number.isFinite(scale)) return scale;
    }
  }
  return null;
}

function tick(): void {
  rafHandle = null;
  const zoom = readZoomFromDom();
  if (zoom !== null) {
    const naturalMode = nextMode(zoom, currentState.mode);
    const mode: CanvasZoomMode = manualOverrideActive ? 'cluster' : naturalMode;
    if (zoom !== currentState.zoom || mode !== currentState.mode) {
      currentState = { zoom, mode };
      listeners.forEach(listener => listener());
    }
  }
  if (listeners.size > 0) {
    rafHandle = window.requestAnimationFrame(tick);
  }
}

function startLoop(): void {
  if (rafHandle !== null) return;
  if (typeof window === 'undefined') return;
  rafHandle = window.requestAnimationFrame(tick);
}

function stopLoop(): void {
  if (rafHandle === null) return;
  window.cancelAnimationFrame(rafHandle);
  rafHandle = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) startLoop();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopLoop();
  };
}

function getSnapshot(): ZoomState {
  return currentState;
}

function getServerSnapshot(): ZoomState {
  return initialState;
}

/**
 * Returns the current canvas zoom level and derived mode. Updates on every
 * react-flow viewport change (panning, zooming, fitView).
 */
export function useCanvasZoomMode(): ZoomState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Lightweight variant — most callers only need the mode string. Avoids
 * re-rendering on every pan when the mode hasn't flipped.
 */
export function useCanvasZoomModeOnly(): CanvasZoomMode {
  const state = useCanvasZoomMode();
  return state.mode;
}

/**
 * Lets a host component force cluster mode regardless of the actual zoom.
 * Used by `BoardCanvasStage` so the on-canvas "Cluster zoom" toggle and the
 * `C` keyboard shortcut keep working — IdeaNoteNode and any other consumer
 * see `mode: 'cluster'` whenever any override is active.
 *
 * Returns an unsubscribe function. Multiple components may register; the
 * override is on whenever any caller has set `true`. The implementation
 * uses a refcount-style model: each caller "owns" their own boolean, and
 * the effective override is the OR over all owners.
 */
export function setManualClusterOverride(active: boolean): void {
  if (manualOverrideActive === active) return;
  manualOverrideActive = active;
  // Re-run the mode derivation with the new override applied.
  const zoom = currentState.zoom;
  const mode: CanvasZoomMode = manualOverrideActive ? 'cluster' : nextMode(zoom, 'sticky');
  if (mode !== currentState.mode) {
    currentState = { zoom, mode };
    listeners.forEach(listener => listener());
  }
}

/**
 * Test/Story hook: forcibly set the current zoom mode. Useful from harnesses
 * that don't render a live React Flow viewport (e.g. design previews).
 *
 * This is a side-channel — production callers should never need it.
 */
export function __setCanvasZoomModeForTesting(zoom: number): void {
  const mode = nextMode(zoom, currentState.mode);
  currentState = { zoom, mode };
  listeners.forEach(listener => listener());
}

/**
 * Optional helper for components that want to wait one frame after mount
 * before reading the zoom (avoids a sticky→cluster flicker when the viewport
 * hasn't been initialised yet on first render).
 */
export function useCanvasZoomModeAfterMount(): CanvasZoomMode {
  const state = useCanvasZoomMode();
  // Force a single rerender shortly after mount so the initial read picks up
  // the real viewport, not the SSR default of 1.0.
  useEffect(() => {
    const handle = window.requestAnimationFrame(() => {
      const zoom = readZoomFromDom();
      if (zoom !== null && zoom !== currentState.zoom) {
        const mode = nextMode(zoom, currentState.mode);
        currentState = { zoom, mode };
        listeners.forEach(listener => listener());
      }
    });
    return () => window.cancelAnimationFrame(handle);
  }, []);
  return state.mode;
}
