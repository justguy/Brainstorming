/**
 * MV3 Service Worker — Brainstorming Orchestrator
 *
 * Responsibilities:
 *  1. On install: initialise default settings if absent.
 *  2. On action click: open the side panel for the current tab.
 *  3. Message broker: handle LLM_CALL and OPEN_SIDE_PANEL messages from UI contexts.
 *
 * All provider API keys are read here — UI scripts never touch credentials.
 */

// Phase 3 fix: convert dynamic provider import to static so Rollup/crxjs bundles
// it correctly into the service-worker chunk. The @vite-ignore dynamic import was
// left over from Agent 2B's parallel-development guard and is no longer needed.
import { selectProvider } from '../providers/index';
import * as settings from '../storage/settings';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const log = (...args: unknown[]) => console.log('[bg]', ...args);
const warn = (...args: unknown[]) => console.warn('[bg]', ...args);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LlmCallPayload = {
  providerId: string;
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  jsonSchema?: object;
  maxTokens?: number;
};

type IncomingMessage =
  | { type: 'LLM_CALL'; payload: LlmCallPayload }
  | { type: 'OPEN_SIDE_PANEL'; ideaId?: string };

type OutgoingMessage =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Install: set default settings
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  log('onInstalled', details.reason);
  try {
    // getSettings already merges defaults, so a single read+write seeds the store
    const current = await settings.getSettings();
    await settings.setSettings(current);
    log('Default settings initialised');
  } catch (err) {
    warn('Failed to initialise settings', err);
  }
});

// ---------------------------------------------------------------------------
// Action click: open side panel
// ---------------------------------------------------------------------------

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
    log('Side panel opened for tab', tab.id);
  } catch (err) {
    warn('Failed to open side panel', err);
  }
});

// ---------------------------------------------------------------------------
// Message broker
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: IncomingMessage, _sender, sendResponse: (msg: OutgoingMessage) => void) => {
    // Must return true to keep the channel open for async response
    handleMessage(message)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err: unknown) => {
        const error =
          err instanceof Error ? err.message : String(err ?? 'Unknown error');
        sendResponse({ ok: false, error });
      });
    return true;
  },
);

async function handleMessage(message: IncomingMessage): Promise<unknown> {
  switch (message.type) {
    case 'LLM_CALL':
      return handleLlmCall(message.payload);

    case 'OPEN_SIDE_PANEL':
      return handleOpenSidePanel(message.ideaId);

    default: {
      // Exhaustive check — TypeScript narrows `message` to `never` here
      const _exhaustive: never = message;
      throw new Error(`Unknown message type: ${(_exhaustive as { type: string }).type}`);
    }
  }
}

// ---------------------------------------------------------------------------
// LLM_CALL handler
// ---------------------------------------------------------------------------

async function handleLlmCall(payload: LlmCallPayload): Promise<unknown> {
  const { providerId, model, messages, jsonSchema, maxTokens } = payload;

  // Read API key — keys never leave the service worker
  const apiKey = await settings.getCredential(
    providerId as import('../types').ProviderId,
  );
  if (!apiKey) {
    throw new Error(`No API key configured for provider: ${providerId}`);
  }

  // Phase 3 fix: use statically-imported selectProvider instead of dynamic import.
  const provider = selectProvider(providerId as import('../types').ProviderId);
  const result = await provider.call({ model, messages, jsonSchema, maxTokens, apiKey });
  log('LLM_CALL completed for provider', providerId);
  return result;
}

// ---------------------------------------------------------------------------
// OPEN_SIDE_PANEL handler (called from popup)
// ---------------------------------------------------------------------------

async function handleOpenSidePanel(ideaId?: string): Promise<void> {
  // Get the active tab so we can open the panel in the right window
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab found to open side panel');
  }

  // Phase 3 fix: persist the pendingIdeaId so the side panel can read it on mount.
  // chrome.storage.session is cleared when the browser session ends — perfect for
  // short-lived handoff state.
  if (ideaId) {
    await chrome.storage.session.set({ pendingIdeaId: ideaId });
    log('Persisted pendingIdeaId', ideaId);
  }

  await chrome.sidePanel.open({ tabId: tab.id });
  log('Side panel opened', ideaId ? `for idea ${ideaId}` : '');
}
