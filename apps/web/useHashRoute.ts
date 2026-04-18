import { useCallback, useEffect, useState } from 'react';

export function useHashRoute(): [string, (hash: string) => void] {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigate = useCallback((nextHash: string) => {
    window.location.hash = nextHash;
  }, []);

  return [hash, navigate];
}
