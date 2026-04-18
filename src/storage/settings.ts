import type { Settings, ProviderId, ProviderCredentials } from '../types';
import type { SettingsRecord } from '../board/types';
import { getDb } from './db';

const STORAGE_KEY = 'settings';
const SETTINGS_RECORD_ID = 'settings:global';
const WEB_STORAGE_PREFIX = 'brainstorm:';

const DEFAULT_SETTINGS: Settings = {
  credentials: {},
  activeProvider: 'gemini',
  activeModel: 'gemini-2.5-pro',
  density: 'standard',
};

function mergeSettings(stored?: Partial<Settings>): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    credentials: {
      ...DEFAULT_SETTINGS.credentials,
      ...(stored?.credentials ?? {}),
    },
  };
}

async function readSettingsRecord(): Promise<SettingsRecord | undefined> {
  const db = await getDb();
  return db.get('settings', SETTINGS_RECORD_ID);
}

async function writeSettingsRecord(
  value: Settings,
  options: { migratedFrom?: SettingsRecord['migratedFrom'] } = {},
): Promise<SettingsRecord> {
  const db = await getDb();
  const existing = await db.get('settings', SETTINGS_RECORD_ID);
  const now = Date.now();
  const record: SettingsRecord = {
    id: SETTINGS_RECORD_ID,
    value,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    migratedFrom: options.migratedFrom ?? existing?.migratedFrom,
  };
  await db.put('settings', record);
  return record;
}

function canReadChromeStorage(): boolean {
  return typeof chrome !== 'undefined'
    && typeof chrome.storage !== 'undefined'
    && typeof chrome.storage.local !== 'undefined';
}

async function readLegacyChromeStorage(): Promise<Partial<Settings> | undefined> {
  if (!canReadChromeStorage()) return undefined;

  try {
    return await new Promise<Partial<Settings> | undefined>((resolve, reject) => {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        if (chrome.runtime?.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(result[STORAGE_KEY] as Partial<Settings> | undefined);
      });
    });
  } catch {
    return undefined;
  }
}

function readLegacyLocalStorage(): Partial<Settings> | undefined {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(`${WEB_STORAGE_PREFIX}${STORAGE_KEY}`);
    if (!raw) return undefined;
    return JSON.parse(raw) as Partial<Settings>;
  } catch {
    return undefined;
  }
}

async function ensureSettingsRecord(): Promise<SettingsRecord> {
  const existing = await readSettingsRecord();
  if (existing) {
    const merged = mergeSettings(existing.value);
    if (JSON.stringify(merged) === JSON.stringify(existing.value)) {
      return existing;
    }
    return writeSettingsRecord(merged, { migratedFrom: existing.migratedFrom });
  }

  const legacyChrome = await readLegacyChromeStorage();
  if (legacyChrome) {
    return writeSettingsRecord(mergeSettings(legacyChrome), {
      migratedFrom: 'chrome.storage.local',
    });
  }

  const legacyLocal = readLegacyLocalStorage();
  if (legacyLocal) {
    return writeSettingsRecord(mergeSettings(legacyLocal), {
      migratedFrom: 'localStorage',
    });
  }

  return writeSettingsRecord(mergeSettings());
}

/** Return persisted settings, falling back to defaults for any missing fields. */
export async function getSettings(): Promise<Settings> {
  const record = await ensureSettingsRecord();
  return mergeSettings(record.value);
}

/** Shallow-merge patch into current settings, persist, and return the new value. */
export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = {
    ...current,
    ...patch,
    credentials: {
      ...current.credentials,
      ...(patch.credentials ?? {}),
    } as ProviderCredentials,
  };
  await writeSettingsRecord(next);
  return next;
}

/** Return the stored API key for a given provider, or undefined if not set. */
export async function getCredential(providerId: ProviderId): Promise<string | undefined> {
  const settings = await getSettings();
  return settings.credentials[providerId];
}

/** Persist an API key for a given provider. */
export async function setCredential(providerId: ProviderId, key: string): Promise<void> {
  await setSettings({ credentials: { [providerId]: key } as ProviderCredentials });
}
