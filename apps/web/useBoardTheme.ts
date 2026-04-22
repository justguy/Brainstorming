import { useEffect, useRef, useState } from 'react';
import type { BoardThemeMode } from '../../src/types';
import { getSettings, setSettings } from '../../src/storage/settings';

export function useBoardTheme(): {
  boardTheme: BoardThemeMode;
  setBoardTheme: (theme: BoardThemeMode) => Promise<void>;
} {
  const [boardTheme, setBoardThemeState] = useState<BoardThemeMode>('whiteboard');
  const userOverrideRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    getSettings()
      .then(settings => {
        if (cancelled || userOverrideRef.current) return;
        setBoardThemeState(settings.boardTheme);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.dataset.boardTheme = boardTheme;
    return () => {
      delete document.body.dataset.boardTheme;
    };
  }, [boardTheme]);

  async function setBoardTheme(theme: BoardThemeMode): Promise<void> {
    userOverrideRef.current = true;
    setBoardThemeState(theme);
    await setSettings({ boardTheme: theme });
  }

  return { boardTheme, setBoardTheme };
}
