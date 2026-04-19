import { DEFAULT_BOARD_ID, type BoardTweaksRecord } from '../board/types';
import { getDb } from './db';

export const TWEAKS_RECORD_PREFIX = 'tweaks:';
const WEB_STORAGE_PREFIX = 'brainstorm:';
const LEGACY_TWEAK_KEYS = ['tweaks', 'tweaks:global'];

export function createBoardTweaksRecord(
  boardId = DEFAULT_BOARD_ID,
  values: Record<string, unknown> = {},
  now = Date.now(),
): BoardTweaksRecord {
  return {
    id: `${TWEAKS_RECORD_PREFIX}${boardId}`,
    boardId,
    values,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getBoardTweaks(boardId = DEFAULT_BOARD_ID): Promise<BoardTweaksRecord> {
  const db = await getDb();
  const existing = await db.get('tweaks', `${TWEAKS_RECORD_PREFIX}${boardId}`);
  if (existing) return existing;

  const legacyValues = (await readLegacyChromeTweaks(boardId)) ?? readLegacyLocalTweaks(boardId) ?? {};
  const tweaks = createBoardTweaksRecord(boardId, legacyValues);
  await db.put('tweaks', tweaks);
  return tweaks;
}

export async function updateBoardTweaks(
  boardId = DEFAULT_BOARD_ID,
  patch: Record<string, unknown>,
): Promise<BoardTweaksRecord> {
  const db = await getDb();
  const current = await getBoardTweaks(boardId);
  const updated: BoardTweaksRecord = {
    ...current,
    values: {
      ...current.values,
      ...patch,
    },
    updatedAt: Date.now(),
  };
  await db.put('tweaks', updated);
  return updated;
}

function canReadRealChromeStorage(): boolean {
  return typeof chrome !== 'undefined'
    && !(chrome as { __shimInstalled?: boolean }).__shimInstalled
    && typeof chrome.storage !== 'undefined'
    && typeof chrome.storage.local !== 'undefined';
}

async function readLegacyChromeTweaks(boardId: string): Promise<Record<string, unknown> | undefined> {
  if (!canReadRealChromeStorage()) return undefined;

  for (const key of legacyTweakKeys(boardId)) {
    const raw = await new Promise<unknown>((resolve, reject) => {
      chrome.storage.local.get(key, result => {
        if (chrome.runtime?.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(result[key]);
      });
    }).catch(() => undefined);
    const values = coerceLegacyTweakValues(raw);
    if (values) return values;
  }
  return undefined;
}

function readLegacyLocalTweaks(boardId: string): Record<string, unknown> | undefined {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return undefined;
  }

  for (const key of legacyTweakKeys(boardId)) {
    const raw = window.localStorage.getItem(`${WEB_STORAGE_PREFIX}${key}`);
    if (!raw) continue;
    try {
      const values = coerceLegacyTweakValues(JSON.parse(raw));
      if (values) return values;
    } catch {
      // ignore malformed legacy payloads
    }
  }

  return undefined;
}

function legacyTweakKeys(boardId: string): string[] {
  return [...new Set([`${TWEAKS_RECORD_PREFIX}${boardId}`, ...LEGACY_TWEAK_KEYS])];
}

function coerceLegacyTweakValues(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  if ('values' in raw) {
    const values = (raw as { values?: unknown }).values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) return undefined;
    return values as Record<string, unknown>;
  }
  return raw as Record<string, unknown>;
}
