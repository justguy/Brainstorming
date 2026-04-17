/**
 * chrome-shim.ts — polyfills chrome.* globals for the web app environment.
 *
 * This shim must be installed (via installChromeShim()) at the very top of
 * main.tsx BEFORE any src/ imports so that all extension-world modules that
 * reference chrome.* see a working implementation.
 *
 * Storage mapping:
 *   chrome.storage.local  → localStorage  (key prefix "brainstorm:")
 *   chrome.storage.session → sessionStorage (key prefix "brainstorm:")
 *
 * LLM calls:
 *   chrome.runtime.sendMessage({ type: 'LLM_CALL', payload })
 *   → resolved by reading credentials from localStorage + calling provider directly.
 */

const STORAGE_PREFIX = 'brainstorm:';

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function storageGet(
  storage: Storage,
  keysArg: string | string[] | null | undefined,
  cb?: (result: Record<string, unknown>) => void,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  if (keysArg === null || keysArg === undefined) {
    // Return everything under prefix
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) {
        const bare = k.slice(STORAGE_PREFIX.length);
        try {
          result[bare] = JSON.parse(storage.getItem(k) ?? 'null');
        } catch {
          result[bare] = storage.getItem(k);
        }
      }
    }
  } else {
    const keys = Array.isArray(keysArg) ? keysArg : [keysArg];
    for (const key of keys) {
      const raw = storage.getItem(STORAGE_PREFIX + key);
      if (raw !== null) {
        try {
          result[key] = JSON.parse(raw);
        } catch {
          result[key] = raw;
        }
      }
    }
  }

  const promise = Promise.resolve(result);
  if (cb) promise.then(cb);
  return promise;
}

function storageSet(
  storage: Storage,
  items: Record<string, unknown>,
  cb?: () => void,
): Promise<void> {
  for (const [key, value] of Object.entries(items)) {
    storage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  }
  const promise = Promise.resolve();
  if (cb) promise.then(cb);
  return promise;
}

function storageRemove(
  storage: Storage,
  keys: string | string[],
  cb?: () => void,
): Promise<void> {
  const ks = Array.isArray(keys) ? keys : [keys];
  for (const key of ks) {
    storage.removeItem(STORAGE_PREFIX + key);
  }
  const promise = Promise.resolve();
  if (cb) promise.then(cb);
  return promise;
}

// ---------------------------------------------------------------------------
// LLM_CALL handler — calls provider directly without the service worker
// ---------------------------------------------------------------------------

async function handleLlmCall(payload: {
  providerId: string;
  model: string;
  messages: unknown[];
  jsonSchema?: object;
  maxTokens?: number;
}): Promise<unknown> {
  // Read credentials from localStorage via the shim prefix
  const settingsRaw = localStorage.getItem(STORAGE_PREFIX + 'settings');
  let apiKey: string | undefined;
  if (settingsRaw) {
    try {
      const settings = JSON.parse(settingsRaw);
      apiKey = settings?.credentials?.[payload.providerId];
    } catch {
      // ignore
    }
  }

  if (!apiKey) {
    throw new Error(
      `No API key configured for provider "${payload.providerId}". ` +
        'Open #/options to add your key.',
    );
  }

  // Dynamic import so we don't pull providers into the shim module itself.
  // By the time this runs, the shim is already installed.
  const { selectProvider } = await import('../../src/providers/index');
  const provider = selectProvider(payload.providerId as import('../../src/types').ProviderId);

  const result = await provider.call({
    model: payload.model,
    messages: payload.messages as import('../../src/types').LlmMessage[],
    jsonSchema: payload.jsonSchema,
    maxTokens: payload.maxTokens,
    apiKey,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Message listener registry (no-op stubs for onMessage)
// ---------------------------------------------------------------------------

const messageListeners: Array<(msg: unknown, sender: unknown, respond: (r: unknown) => void) => void> = [];

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

export function installChromeShim(): void {
  if (typeof globalThis.chrome !== 'undefined' && (globalThis.chrome as { __shimInstalled?: boolean }).__shimInstalled) {
    return; // Already installed (e.g. running inside real extension)
  }

  const makeStorage = (storage: Storage) => ({
    get(
      keysArg: string | string[] | null | undefined,
      cb?: (result: Record<string, unknown>) => void,
    ): Promise<Record<string, unknown>> {
      return storageGet(storage, keysArg, cb);
    },
    set(
      items: Record<string, unknown>,
      cb?: () => void,
    ): Promise<void> {
      return storageSet(storage, items, cb);
    },
    remove(
      keys: string | string[],
      cb?: () => void,
    ): Promise<void> {
      return storageRemove(storage, keys, cb);
    },
    clear(cb?: () => void): Promise<void> {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
      }
      for (const k of keys) storage.removeItem(k);
      const promise = Promise.resolve();
      if (cb) promise.then(cb);
      return promise;
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).chrome = {
    __shimInstalled: true,

    storage: {
      local: makeStorage(localStorage),
      session: makeStorage(sessionStorage),
    },

    runtime: {
      lastError: undefined as undefined | { message: string },

      /**
       * sendMessage — handles LLM_CALL and OPEN_SIDE_PANEL.
       * Returns a Promise AND accepts an optional callback (same as extension API).
       */
      sendMessage(
        message: { type: string; payload?: unknown },
        cb?: (response: unknown) => void,
      ): Promise<unknown> {
        const promise = (async () => {
          if (message.type === 'LLM_CALL') {
            try {
              const result = await handleLlmCall(message.payload as Parameters<typeof handleLlmCall>[0]);
              return { ok: true, result };
            } catch (err) {
              const error = err instanceof Error ? err.message : String(err);
              return { ok: false, error };
            }
          }

          if (message.type === 'OPEN_SIDE_PANEL') {
            // No-op: this is the web app, there is no side panel to hand off to.
            console.info(
              '[chrome-shim] OPEN_SIDE_PANEL ignored — this is the web app, ' +
                'the side panel hand-off is for the extension.',
            );
            return { ok: true, result: null };
          }

          console.warn('[chrome-shim] Unhandled sendMessage type:', message.type);
          return { ok: true, result: null };
        })();

        if (cb) promise.then(cb);
        return promise;
      },

      onMessage: {
        addListener(
          _cb: (msg: unknown, sender: unknown, respond: (r: unknown) => void) => void,
        ) {
          // No background worker in web app — no-op
          messageListeners.push(_cb);
        },
        removeListener(
          _cb: (msg: unknown, sender: unknown, respond: (r: unknown) => void) => void,
        ) {
          const idx = messageListeners.indexOf(_cb);
          if (idx !== -1) messageListeners.splice(idx, 1);
        },
      },

      openOptionsPage() {
        // Navigate to the in-app options route
        window.location.hash = '#/options';
      },
    },

    downloads: {
      download(
        options: { url: string; filename?: string },
        cb?: () => void,
      ): void {
        const a = document.createElement('a');
        a.href = options.url;
        if (options.filename) a.download = options.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Revoke in next tick to give the browser time to start the download
        setTimeout(() => URL.revokeObjectURL(options.url), 1000);
        if (cb) cb();
      },
    },

    sidePanel: {
      open(_options?: unknown) {
        console.info(
          '[chrome-shim] sidePanel.open() no-op — ' +
            'this is the web app. Side panel hand-off is extension-only.',
        );
        return Promise.resolve();
      },
    },

    action: {
      onClicked: {
        addListener(_cb: unknown) {
          // No-op in web context — action clicks are extension UI only
        },
      },
    },

    tabs: {
      query(_queryInfo: unknown, cb?: (tabs: unknown[]) => void): Promise<unknown[]> {
        const result: unknown[] = [];
        if (cb) cb(result);
        return Promise.resolve(result);
      },
    },
  };
}
