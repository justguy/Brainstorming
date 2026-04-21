import { useEffect, useState } from 'react';
import type { BoardThemeMode } from '../../src/types';
import { setSettings } from '../../src/storage/settings';

export function useBoardTheme(): {
  boardTheme: BoardThemeMode;
  setBoardTheme: (theme: BoardThemeMode) => Promise<void>;
} {
  const [boardTheme, setBoardThemeState] = useState<BoardThemeMode>('whiteboard');

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.dataset.boardTheme = boardTheme;
    return () => {
      delete document.body.dataset.boardTheme;
    };
  }, [boardTheme]);

  async function setBoardTheme(theme: BoardThemeMode): Promise<void> {
    setBoardThemeState(theme);
    await setSettings({ boardTheme: theme });
  }

  return { boardTheme, setBoardTheme };
}
