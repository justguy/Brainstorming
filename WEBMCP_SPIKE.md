# WebMCP Side Panel Surface Spike

**Agent:** W2 — Side Panel Surface Spike
**Date:** 2026-04-16
**Status:** Code complete; runtime validation pending (requires Chrome 146+ with flag)

---

## Hypothesis

`navigator.modelContext` is injected by Chrome into standard web pages. Whether it is
also injected into `chrome-extension://` side panel origins is **not documented** in
the WebMCP Early Preview spec. Extension origins are sandboxed differently from regular
tab origins, and the Chrome 146 WebMCP implementation may restrict injection to
`https://` pages only.

This spike writes the full registration code and a runtime probe so the question can
be answered empirically rather than by assumption.

---

## What We Built

Five files under `src/webmcp/`:

| File | Purpose |
|---|---|
| `src/webmcp/webmcp-ambient.d.ts` | TypeScript ambient declaration — augments `Navigator` with `modelContext` using `declare global` |
| `src/webmcp/detectSupport.ts` | Runtime probe; exports `detectWebMcpSupport()` and `logSupportStatus()` |
| `src/webmcp/registerPanelTools.ts` | Registers `list_ideas`, `get_idea`, `capture_idea`, `export_handoff` |
| `src/webmcp/registerPhaseTools.ts` | Registers one per-phase tool (phase-specific input or `advance_phase`) |
| `WEBMCP_SPIKE.md` | This file |

All code compiles clean (`npm run typecheck` and `npm run build` both pass).

The registration code is currently dead-loaded (no UI file mounts it yet — W1 owns those entry points). W1 can wire it in by calling `registerPanelTools()` on side-panel mount and `registerPhaseTools(idea.phase, idea.id)` when a phase becomes active.

---

## Detection Logic

`detectWebMcpSupport()` in `src/webmcp/detectSupport.ts`:

1. If `navigator` is unavailable (service worker context) → `{ supported: false, reason: 'unknown' }`.
2. If `typeof navigator.modelContext !== 'undefined'` → `{ supported: true, capabilities: { imperative: true, declarative: true } }`.
3. If absent, parse User-Agent for `Chrome/<major>`:
   - Major not found → `{ supported: false, reason: 'not_chrome' }`.
   - Major < 146 → `{ supported: false, reason: 'not_chrome' }`.
   - Major >= 146 → `{ supported: false, reason: 'flag_disabled' }` _(flag likely off, or extension origins not supported)_.

`logSupportStatus()` prints a colour-coded console marker and sets `window.__WEBMCP_STATUS` for DevTools inspection (`window.__WEBMCP_STATUS` in the console).

---

## How to Test

### Prerequisites

1. Download and install **Chrome 146 or later** (Canary channel as of April 2026).
   - Check your version: `chrome://version`
2. Enable the WebMCP testing flag:
   - Navigate to `chrome://flags/#enable-webmcp-testing`
   - Set it to **Enabled**
   - Relaunch Chrome when prompted.
3. Install the **Model Context Tool Inspector** extension from the `webmcp-tools` repo
   (`webmcp-tools/extensions/tool-inspector/` — load unpacked from `dist/`).

### Load the Extension

4. Navigate to `chrome://extensions`
5. Enable **Developer mode** (top-right toggle).
6. Click **Load unpacked** and select the `dist/` folder of this repo.
7. Note the extension ID (shown under the extension card).

### Wire Up the Detection Call (until W1 mounts it)

Until W1 calls `logSupportStatus()` from the side panel entry point, you can call it
manually from DevTools:

```js
// In the side panel's DevTools console (right-click → Inspect on the side panel):
import('/src/webmcp/detectSupport.js').then(m => m.logSupportStatus());
// Or, after the build:
// Open chrome-extension://<id>/src/sidepanel/index.html in DevTools
// Then in console: window.__WEBMCP_STATUS
```

Or have W1 add to `src/sidepanel/main.tsx`:

```ts
import { logSupportStatus } from '../webmcp/detectSupport';
logSupportStatus(); // runs once on panel open
```

### Run the Test

8. Click the extension icon or open the side panel (via the side panel button in Chrome's toolbar).
9. Right-click the side panel → **Inspect** to open its DevTools.
10. In the Console, look for the `[WEBMCP]` log line:
    - `[WEBMCP] supported=true ...` → proceed to step 11.
    - `[WEBMCP] supported=false reason=flag_disabled` → flag not enabled or extension origin not supported; see Contingency below.
    - `[WEBMCP] supported=false reason=not_chrome` → not on Chrome 146+.
11. Also run: `window.__WEBMCP_STATUS` in the console to inspect the full object.

### Verify Tools with the Inspector

12. Open the Tool Inspector extension on the side panel's URL:
    - In the Inspector popup, select the side panel's origin (`chrome-extension://<id>/...`).
    - If tools are listed (`list_ideas`, `get_idea`, `capture_idea`, `export_handoff`) → spike succeeded.

---

## Expected Outcomes

| Console output | Tool Inspector shows tools | Result |
|---|---|---|
| `supported=true`, `imperative=true` | Yes — our tools listed | **Spike succeeded.** Proceed to full integration: have W1 mount `registerPanelTools()` + `registerPhaseTools()` in the side panel lifecycle. |
| `supported=true`, `imperative=true` | No tools visible | Registration may have failed silently. Check for console errors after `registerTool()` calls. |
| `supported=false, reason=flag_disabled` | N/A | Chrome 146+ is running but either (a) the flag is off — enable it and retry, or (b) extension origins are not supported in this Chrome version. Use W3 (web app surface) as the agent-facing surface instead. |
| `supported=false, reason=not_chrome` | N/A | Not running Chrome 146+. Install Canary. |

---

## Contingency: If the API Is Not Available in Extension Origins

The WebMCP V1 spec may restrict `navigator.modelContext` injection to `https://` web
pages only. If that is confirmed, three options are available:

### Option A — Wait for Chrome to Expand Support

Keep all code in `src/webmcp/` as-is. The ambient declarations, detection logic, and
tool descriptors are spec-compliant and will activate automatically once Chrome extends
support to extension side panel origins.

**No code changes needed. Zero risk.**

### Option B — Use the Web App Surface (W3)

Agent W3 is building a standalone web app (`apps/web/`) that imports the same
`src/storage/` and `src/orchestrator/` modules and registers the same tools via WebMCP.
If extension origins are unsupported, direct users to open the web app in a tab alongside
the extension. The extension continues to own state; the web app is purely the
WebMCP-facing surface.

**Recommended fallback for V1 if Option A timeline is unknown.**

### Option C — Content Script Trampoline (Design Note Only; do not implement yet)

A content script running in a regular tab (`https://` origin) *does* get
`navigator.modelContext` injected. The side panel could `chrome.tabs.sendMessage()` to
a "WebMCP host" content script, which registers tools on behalf of the side panel and
forwards `execute()` calls back via message passing.

**Tradeoffs:**
- Requires a tab to be open with the host content script active.
- Adds message-passing latency and serialization complexity.
- Tool calls must remain JSON-serializable (no Promises in transit, callbacks wrapped).
- Content scripts run in page origin — tool names must avoid collisions with site tools.

**Document as design note only. Implement only if Options A and B are ruled out.**
