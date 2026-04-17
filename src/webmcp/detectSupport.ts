/**
 * Runtime detection of WebMCP support in the current browsing context.
 *
 * WebMCP requires:
 *   - Chrome 146+ (or a Chromium build that ships navigator.modelContext)
 *   - The chrome://flags/#enable-webmcp-testing flag enabled
 *
 * This module is intentionally side-effect-free at import time.
 * Call `detectWebMcpSupport()` and `logSupportStatus()` explicitly.
 */

// The ambient declarations in webmcp-ambient.d.ts extend Navigator globally.
// TypeScript picks them up automatically; no runtime import is needed.

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SupportStatus =
  | {
      supported: true;
      capabilities: {
        /** `navigator.modelContext.registerTool` is available. */
        imperative: boolean;
        /**
         * Declarative form-based tools (toolname= attributes) may be parsed
         * by the browser. We cannot probe this at runtime — always reported
         * as `true` when the API is present (the browser decides).
         */
        declarative: boolean;
      };
    }
  | {
      supported: false;
      reason:
        | 'api_missing'       // navigator.modelContext is undefined
        | 'not_chrome'        // UA does not indicate Chrome 146+
        | 'flag_disabled'     // Chrome 146+ detected but API absent — flag likely off
        | 'unknown';          // Cannot determine; treat as unsupported
    };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimum Chrome major version that ships the WebMCP API. */
const MIN_CHROME_VERSION = 146;

/**
 * Returns the Chrome major version extracted from the User-Agent string,
 * or `null` if the UA does not look like Chrome.
 */
function extractChromeMajorVersion(): number | null {
  if (typeof navigator === 'undefined') return null;
  // User-Agent format: "Chrome/146.0.0.0"
  const match = navigator.userAgent.match(/Chrome\/(\d+)/);
  if (!match) return null;
  const version = parseInt(match[1], 10);
  return isNaN(version) ? null : version;
}

// ---------------------------------------------------------------------------
// Core detection
// ---------------------------------------------------------------------------

/**
 * Probes the runtime for WebMCP API availability.
 *
 * Decision tree:
 *   1. If `navigator.modelContext` is defined → supported (imperative = true).
 *   2. If UA indicates Chrome >= 146 → flag likely not enabled → `flag_disabled`.
 *   3. If UA is not Chrome → `not_chrome`.
 *   4. Otherwise → `unknown`.
 */
export function detectWebMcpSupport(): SupportStatus {
  // Guard: navigator may not exist in service workers without DOM access.
  if (typeof navigator === 'undefined') {
    return { supported: false, reason: 'unknown' };
  }

  // Primary check — the API is injected when supported + flag enabled.
  if (typeof navigator.modelContext !== 'undefined') {
    const mc = navigator.modelContext!;
    return {
      supported: true,
      capabilities: {
        imperative: typeof mc.registerTool === 'function',
        declarative: true, // browser-controlled; assume yes when API present
      },
    };
  }

  // API absent — try to distinguish why.
  const chromeMajor = extractChromeMajorVersion();

  if (chromeMajor === null) {
    // Not Chrome at all.
    return { supported: false, reason: 'not_chrome' };
  }

  if (chromeMajor >= MIN_CHROME_VERSION) {
    // Chrome is new enough but the flag is likely off (or extension origins
    // are not yet supported — which is the main unknown for this spike).
    return { supported: false, reason: 'flag_disabled' };
  }

  // Chrome but too old.
  return { supported: false, reason: 'not_chrome' };
}

// ---------------------------------------------------------------------------
// Logging + window sentinel
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    /** Set by `logSupportStatus()` for quick DevTools inspection. */
    __WEBMCP_STATUS?: SupportStatus;
  }
}

/**
 * Detects WebMCP support, logs the result to the console with clear markers,
 * and writes it to `window.__WEBMCP_STATUS` for easy DevTools inspection.
 *
 * Safe to call multiple times; each call re-probes and re-logs.
 */
export function logSupportStatus(): void {
  const status = detectWebMcpSupport();

  // Persist for DevTools convenience.
  if (typeof window !== 'undefined') {
    window.__WEBMCP_STATUS = status;
  }

  if (status.supported) {
    const { imperative, declarative } = status.capabilities;
    console.info(
      `%c[WEBMCP] supported=true | imperative=${imperative} declarative=${declarative}`,
      'color: #22c55e; font-weight: bold;',
    );
    console.info('[WEBMCP] navigator.modelContext =', navigator.modelContext);
  } else {
    type FailReason = 'api_missing' | 'not_chrome' | 'flag_disabled' | 'unknown';
    const reasonMessages: Record<FailReason, string> = {
      api_missing:   'navigator.modelContext is undefined',
      not_chrome:    'User-Agent does not indicate Chrome 146+',
      flag_disabled: 'Chrome 146+ detected, but API is absent — check chrome://flags/#enable-webmcp-testing',
      unknown:       'Unable to determine support status',
    };
    const detail = reasonMessages[status.reason as FailReason] ?? status.reason;
    console.warn(
      `%c[WEBMCP] supported=false | reason=${status.reason}`,
      'color: #f59e0b; font-weight: bold;',
    );
    console.warn(`[WEBMCP] Detail: ${detail}`);
    console.warn('[WEBMCP] window.__WEBMCP_STATUS has been set for DevTools inspection.');
  }
}
