/**
 * Hash-route parser — pure, exhaustive.
 *
 * Maps `window.location.hash` strings to a `RouteState` discriminated union.
 * Reference: Design/IMPLEMENTATION_PLAN.md §3 (Routing changes), Build Spec §04.
 *
 * Route table:
 *   ''                            → home (no project)
 *   '#'                           → home (no project)
 *   '#/p/:projectId'              → home (with project)
 *   '#/b/:boardId'                → board
 *   '#/b/:boardId?idea=:ideaId'   → board (focused on an idea)
 *   '#/b/:boardId/map'            → map
 *   '#/b/:boardId/brief/:ideaId'  → brief
 *   '#/b/:boardId/log'            → log
 *   '#/b/:boardId/handoff/:bId'   → handoff
 *   '#/options'                   → options
 *   anything else                 → unknown
 */

export type RouteState =
  | { kind: 'home'; projectId: string | null }
  | { kind: 'board'; boardId: string; ideaId: string | null }
  | { kind: 'brief'; boardId: string; ideaId: string }
  | { kind: 'handoff'; boardId: string; briefId: string }
  | { kind: 'log'; boardId: string }
  | { kind: 'map'; boardId: string }
  | { kind: 'options' }
  | { kind: 'unknown'; raw: string };

const HOME_PROJECT_RE = /^\/p\/([^/?#]+)$/;
const BOARD_RE = /^\/b\/([^/?#]+)$/;
const BOARD_MAP_RE = /^\/b\/([^/?#]+)\/map$/;
const BOARD_LOG_RE = /^\/b\/([^/?#]+)\/log$/;
const BOARD_BRIEF_RE = /^\/b\/([^/?#]+)\/brief\/([^/?#]+)$/;
const BOARD_HANDOFF_RE = /^\/b\/([^/?#]+)\/handoff\/([^/?#]+)$/;

/**
 * Strip a leading `#` from a raw `window.location.hash` value, then split off
 * any querystring. Returns `[pathPart, queryPart]` where `queryPart` is the
 * raw substring after `?` (or `null` if absent).
 */
function splitHash(hash: string): { path: string; query: string | null } {
  const trimmed = hash.startsWith('#') ? hash.slice(1) : hash;
  const qIdx = trimmed.indexOf('?');
  if (qIdx === -1) return { path: trimmed, query: null };
  return { path: trimmed.slice(0, qIdx), query: trimmed.slice(qIdx + 1) };
}

function readQueryParam(query: string | null, key: string): string | null {
  if (query === null || query.length === 0) return null;
  // URLSearchParams handles + decoding and percent-decoding.
  try {
    const params = new URLSearchParams(query);
    const value = params.get(key);
    return value === null ? null : value;
  } catch {
    return null;
  }
}

export function parseRoute(hash: string): RouteState {
  if (typeof hash !== 'string') return { kind: 'unknown', raw: String(hash) };

  const { path, query } = splitHash(hash);

  // Home (empty hash or bare '#').
  if (path === '' || path === '/') {
    return { kind: 'home', projectId: null };
  }

  // Options.
  if (path === '/options') {
    return { kind: 'options' };
  }

  // Home scoped to a project.
  const homeMatch = HOME_PROJECT_RE.exec(path);
  if (homeMatch) {
    return { kind: 'home', projectId: decodeURIComponent(homeMatch[1]) };
  }

  // Board sub-routes (order matters — most-specific first).
  const briefMatch = BOARD_BRIEF_RE.exec(path);
  if (briefMatch) {
    return {
      kind: 'brief',
      boardId: decodeURIComponent(briefMatch[1]),
      ideaId: decodeURIComponent(briefMatch[2]),
    };
  }

  const handoffMatch = BOARD_HANDOFF_RE.exec(path);
  if (handoffMatch) {
    return {
      kind: 'handoff',
      boardId: decodeURIComponent(handoffMatch[1]),
      briefId: decodeURIComponent(handoffMatch[2]),
    };
  }

  const logMatch = BOARD_LOG_RE.exec(path);
  if (logMatch) {
    return { kind: 'log', boardId: decodeURIComponent(logMatch[1]) };
  }

  const mapMatch = BOARD_MAP_RE.exec(path);
  if (mapMatch) {
    return { kind: 'map', boardId: decodeURIComponent(mapMatch[1]) };
  }

  const boardMatch = BOARD_RE.exec(path);
  if (boardMatch) {
    const rawIdea = readQueryParam(query, 'idea');
    return {
      kind: 'board',
      boardId: decodeURIComponent(boardMatch[1]),
      ideaId: rawIdea,
    };
  }

  return { kind: 'unknown', raw: hash };
}

/**
 * Inverse of `parseRoute`. Returns a hash string (with leading `#`) suitable
 * for assignment to `window.location.hash` or `<a href>`.
 *
 * `unknown` routes serialize back to their original raw string.
 */
export function formatRoute(route: RouteState): string {
  switch (route.kind) {
    case 'home':
      return route.projectId === null
        ? ''
        : `#/p/${encodeURIComponent(route.projectId)}`;
    case 'board': {
      const base = `#/b/${encodeURIComponent(route.boardId)}`;
      if (route.ideaId === null) return base;
      return `${base}?idea=${encodeURIComponent(route.ideaId)}`;
    }
    case 'brief':
      return `#/b/${encodeURIComponent(route.boardId)}/brief/${encodeURIComponent(route.ideaId)}`;
    case 'handoff':
      return `#/b/${encodeURIComponent(route.boardId)}/handoff/${encodeURIComponent(route.briefId)}`;
    case 'log':
      return `#/b/${encodeURIComponent(route.boardId)}/log`;
    case 'map':
      return `#/b/${encodeURIComponent(route.boardId)}/map`;
    case 'options':
      return '#/options';
    case 'unknown':
      return route.raw;
  }
}
