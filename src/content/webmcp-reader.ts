/**
 * webmcp-reader.ts
 *
 * NOT used as a persistent content script. This file documents the IIFE
 * logic that contextBridge.ts injects programmatically via
 * chrome.scripting.executeScript with world: 'MAIN'.
 *
 * Kept here as a reference / alternative entry point if a static content
 * script is ever preferred over programmatic injection.
 *
 * Design choice: programmatic injection (executeScript) is preferred because:
 *   1. It runs only after explicit user consent in the side panel.
 *   2. No persistent content script means zero overhead on every page load.
 *   3. activeTab + scripting permissions are narrower than <all_urls> match patterns.
 *
 * If you switch to a static content script, add to manifest.json:
 *   "content_scripts": [{
 *     "matches": ["<all_urls>"],
 *     "js": ["src/content/webmcp-reader.ts"],
 *     "world": "MAIN",
 *     "run_at": "document_idle"
 *   }]
 * and remove the executeScript calls in contextBridge.ts.
 */

// This module intentionally exports nothing — it is a documentation stub.
export {};
