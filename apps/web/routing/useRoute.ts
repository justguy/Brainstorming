import { useCallback, useMemo } from 'react';
import { useHashRoute } from '../useHashRoute';
import { formatRoute, parseRoute, type RouteState } from './parseRoute';

/**
 * Layered hook on top of `useHashRoute` that returns a parsed `RouteState`
 * plus a `navigate` callback accepting either a `RouteState` value or a raw
 * hash string. We deliberately reuse the lower-level hook (rather than
 * replacing it) so existing raw-hash consumers keep working until they
 * migrate.
 */
export function useRoute(): [RouteState, (next: RouteState | string) => void] {
  const [hash, setHash] = useHashRoute();
  const route = useMemo(() => parseRoute(hash), [hash]);

  const navigate = useCallback(
    (next: RouteState | string) => {
      const target = typeof next === 'string' ? next : formatRoute(next);
      setHash(target);
    },
    [setHash],
  );

  return [route, navigate];
}
