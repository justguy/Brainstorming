import type { Settings, ProviderId, ProviderCredentials } from '../types';

const STORAGE_KEY = 'settings';

const DEFAULT_SETTINGS: Settings = {
  credentials: {},
  activeProvider: 'gemini',
  activeModel: 'gemini-2.5-pro',
  density: 'standard',
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readFromStorage(): Promise<{ [key: string]: unknown }> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

function writeToStorage(data: { [key: string]: unknown }): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Return persisted settings, falling back to defaults for any missing fields. */
export async function getSettings(): Promise<Settings> {
  const result = await readFromStorage();
  const stored = result[STORAGE_KEY] as Partial<Settings> | undefined;
  if (!stored) return { ...DEFAULT_SETTINGS, credentials: {} };
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    credentials: { ...DEFAULT_SETTINGS.credentials, ...(stored.credentials ?? {}) },
  };
}

/** Shallow-merge patch into current settings, persist, and return the new value. */
export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = {
    ...current,
    ...patch,
    // credentials are merged one level deeper to avoid wiping keys not in patch
    credentials: {
      ...current.credentials,
      ...(patch.credentials ?? {}),
    } as ProviderCredentials,
  };
  await writeToStorage({ [STORAGE_KEY]: next });
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
