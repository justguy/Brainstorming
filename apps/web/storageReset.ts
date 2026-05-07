/**
 * Local-data reset for the standalone web app.
 *
 * The app is local-first: ideas, docs, suggestions, critiques, and credentials
 * live in the browser only (IndexedDB + a small localStorage namespace). There
 * is no server-side store. Clearing browser data, switching browsers, or using
 * incognito wipes the board.
 *
 * `resetAllLocalData` deletes the app's IndexedDB database, clears its
 * localStorage namespace, and reloads. The Yjs-backed sync layer is rebuilt
 * from scratch on the next load.
 */

const APP_DB_NAME = 'brainstorming-orchestrator';
const LOCAL_STORAGE_PREFIX = 'brainstorm:';

async function deleteAppDatabase(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(APP_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });

  if (typeof indexedDB.databases === 'function') {
    try {
      const all = await indexedDB.databases();
      for (const info of all) {
        if (info.name && info.name.startsWith('y-indexeddb:brainstorm')) {
          await new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(info.name as string);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          });
        }
      }
    } catch {
      // Some browsers don't support indexedDB.databases() — skip silently.
    }
  }
}

function clearAppLocalStorage(): void {
  if (typeof localStorage === 'undefined') return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LOCAL_STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}

export async function resetAllLocalData(options?: { reload?: boolean }): Promise<void> {
  await deleteAppDatabase();
  clearAppLocalStorage();
  if (options?.reload !== false && typeof window !== 'undefined') {
    window.location.reload();
  }
}
