# WebMCP Integration Notes

**Date:** 2026-04-16
**Scope:** How each of the three parallel WebMCP integrations in the Brainstorming Orchestrator uses the `navigator.modelContext` API, and what friction we hit along the way.

---

## Context

WebMCP is a proposed browser standard (Chrome 146 early preview, enabled via `chrome://flags/#enable-webmcp-testing`). It gives AI agents a stable contract for interacting with web apps — either imperative (`navigator.modelContext.registerTool`) or declarative (annotated HTML forms). We pursued three parallel surfaces so we could learn the value, limits, and possibilities of the API in our use case:

| Track | Role | What it tests |
|---|---|---|
| W1 — Consume | Extension reads tools on the active tab | Can the orchestrator use *other* sites' WebMCP tools as live context for brainstorming? |
| W2 — Expose (Side Panel) | Extension registers tools inside its own side panel | Is `navigator.modelContext` injected into `chrome-extension://` origins? |
| W3 — Expose (Web App) | Standalone `apps/web/` surface registers tools | A clean, spec-compliant way to expose the app to agentic browsers without extension restrictions |

---

## W1 — Consuming Tools from the Active Tab

### How it uses WebMCP

The extension **reads** WebMCP tools that live on whatever site the user is currently viewing, then feeds that context into the brainstorming LLM pipeline so phases can reason about what the current page can actually *do*.

- **Entry:** `src/webmcp/contextBridge.ts` exposes `queryActiveTabTools()` and `invokeActiveTabTool(name, input)`.
- **Mechanism:** Uses `chrome.scripting.executeScript({ target, world: 'MAIN', func })` to run code in the page's main JavaScript world. That is the only world in which `navigator.modelContext` is visible.
- **Discovery:** In the injected function we read `navigator.modelContext`, then fall through three possible ways to enumerate tools:
  1. `modelContext.listTools()` (future API shape)
  2. `modelContext._tools` (internal `Map` exposed by the Chrome 146 preview)
  3. `window.__webmcp_tools__` (polyfill/demo sentinel used by `webmcp-tools` samples)
- **Invocation:** Same `executeScript` channel, but this time we find the tool by name and call `tool.execute(input)`. Chrome auto-awaits the returned Promise across the `executeScript` boundary.
- **Wiring:**
  - `src/sidepanel/SidePanel.tsx` shows a consent banner and a "Detected tools (N)" chip when `queryActiveTabTools()` returns a non-null context.
  - `src/workspace/Workspace.tsx` renders a collapsible **"Live context from &lt;origin&gt;"** panel with an **Invoke** modal for each tool.
  - `src/orchestrator/ctmcp.ts` appends `[LIVE TOOL CONTEXT from <origin>]` as a system message so every phase sees the page's capabilities.
  - `src/orchestrator/stateMachine.ts` calls `queryActiveTabTools()` at Phase 0/1 and persists the snapshot on the `Idea.liveToolContext` field.

### Issues encountered

- **The two-world problem.** Content scripts run in an *isolated world* that does **not** see `navigator.modelContext`. Our first attempt used a persistent content script — it always returned `undefined`. Fix: drop the content script and use `chrome.scripting.executeScript({ world: 'MAIN' })` on demand. This added `"scripting"` and `"activeTab"` to `manifest.json` but removed the need for a `content_scripts` entry.
  - **Hard rule for W1:** do **not** reintroduce a persistent content script to read or register WebMCP tools. The isolated-world gap is a permanent spec choice, not a bug to be worked around. On-demand `executeScript({ world: 'MAIN' })` is the only supported path for W1, both for reads and future invocations.
- **No standard "list tools" API.** The WebMCP Early Preview spec documents registration but not enumeration. We had to probe an internal `_tools` Map and fall back to a sentinel variable. If Chrome changes the internal shape, W1 will silently return zero tools. Fix forward: add a standard `modelContext.listTools()` once it lands.
- **Scheme restrictions.** `chrome.scripting` cannot inject into `chrome://`, `chrome-extension://`, `about:`, or the new-tab page. We short-circuit those in `queryActiveTabTools()` and return `null` so the UI gracefully says "No detected tools."
- **Cross-origin `execute()` results.** Tool outputs have to survive structured-clone across worlds. We wrap errors in a `{ __error: string }` sentinel rather than throwing, because thrown exceptions in the MAIN-world callback don't propagate cleanly.
- **User-consent UX.** Reading tool metadata from an arbitrary tab is low-risk, but *invoking* a tool executes JS in that page's world. The side panel requires an explicit consent click before invocation is enabled.

---

## W2 — Exposing Tools from the Side Panel (Spike)

### How it uses WebMCP

The extension would **register its own tools** (`list_ideas`, `get_idea`, `capture_idea`, `export_handoff`, plus per-phase tools) via `navigator.modelContext.registerTool` inside the side panel document. If this works, an agentic browser could drive the Brainstorming Orchestrator directly from the side panel without opening a separate tab.

- **Entry:** `src/webmcp/registerPanelTools.ts` + `src/webmcp/registerPhaseTools.ts`.
- **Detection:** `src/webmcp/detectSupport.ts` runs a runtime probe that prints `[WEBMCP] supported=<bool> reason=<…>` and sets `window.__WEBMCP_STATUS` for DevTools inspection.
- **Lifetime:** Each tool is registered with an `AbortController` signal so it cleans up when the idea changes or the panel closes.
- **Ambient types:** `src/webmcp/webmcp-ambient.d.ts` augments `Navigator` with `modelContext` under `declare global`, so the rest of the codebase can type-check against the draft API.

### Issues encountered

- **Unknown whether `navigator.modelContext` is injected into `chrome-extension://` origins.** This is the core open question. The WebMCP Early Preview spec describes injection for web pages but is silent on extension origins. Our typecheck and build both pass; the empirical question only resolves on Chrome 146 Canary with the flag enabled.
- **Status: officially iced pending Chrome spec updates.** `registerPanelTools()` is written and type-safe, but mounting it is **paused indefinitely** — no further W2 effort until Chrome 146+ stabilizes `chrome-extension://` origin support for `navigator.modelContext`. Existing code stays dead-loaded as a future pickup point; all expose work continues through W3. This supersedes the earlier "awaiting validation" framing.
- **Contingency plan already codified.** `WEBMCP_SPIKE.md` documents three paths:
  - **A** — wait for Chrome to expand origin support (zero code change; our code activates automatically)
  - **B** — use W3's web app as the primary agent surface (**recommended** if A has no timeline)
  - **C** — content-script trampoline that registers tools in a regular tab on behalf of the panel (design-note only; adds latency, serialization constraints, and tool-name collision risk)
- **No runtime validation performed yet.** Testing requires Chrome Canary 146+ with the WebMCP flag enabled plus the Model Context Tool Inspector extension. See `WEBMCP_SPIKE.md` §"How to Test" for the repro procedure.

---

## W3 — Exposing Tools from a Standalone Web App

### How it uses WebMCP

A parallel surface at `apps/web/` (served by `vite.config.web.ts` on port **6611**) runs the same `src/` codebase as a regular web page and registers **23 global + 10 lifecycle tools** via `navigator.modelContext.registerTool`. This is the spec-aligned path and sidesteps the extension-origin question entirely.

- **Entry:** `apps/web/main.tsx` → `installChromeShim()` → `<App />` inside `React.StrictMode`.
- **Chrome API polyfill:** `apps/web/chrome-shim.ts` implements enough of `chrome.storage.local`, `chrome.storage.session`, `chrome.runtime.sendMessage`, `chrome.downloads`, and `chrome.sidePanel` (no-op) that every existing `src/` module — storage, settings, orchestrator — runs unchanged. `chrome.storage.*` is backed by `localStorage`/`sessionStorage` with a `brainstorm:` prefix.
- **LLM calls:** In the extension, `LLM_CALL` messages are brokered by a service worker that holds the API key. In the web app, the shim dynamic-imports `selectProvider()` and calls it directly (same origin, same isolation model as any BYOK app).
- **Tool registration:** `apps/web/webmcp-tools.ts` registers:
  - **23 global tools** spanning idea CRUD (`list_ideas`, `get_idea`, `capture_idea`, `update_idea_content`, `discard_idea`, `restore_idea`, `list_discarded_ideas`), canvas layout (`move_idea_panel`, `group_ideas`, `ungroup_idea`, `merge_ideas`), supporting docs (`add_supporting_doc`, `list_supporting_docs`, `delete_supporting_doc`), cross-board synthesis (`find_connections`), outside-knowledge scout (`scout_ideas`, `list_suggestions`, `admit_suggestion`, `elaborate_suggestion`, `dismiss_suggestion`), plus `curate_board`, `select_idea`, and `export_handoff`.
  - **10 lifecycle tools** — `advance_phase`, `regenerate_phase`, `submit_clarifications`, `select_approach`, `confirm_rules`, `choose_next_step`, plus a few re-scoped per-phase helpers.
- **UI ↔ agent handshake:** Tools that mutate React state use a `dispatchAndWait()` helper: the tool dispatches a `CustomEvent` (`brainstorm:selectIdea`, `brainstorm:advancePhase`, etc.), and the App-level listener fires a `tool-completion-<requestId>` event after the state update commits. This keeps `execute()` consistent with the WebMCP contract that the UI must have finished updating before the tool resolves. Tools that need a structured return payload (`admit_suggestion → admittedIdeaId`, `scout_ideas → count`, `find_connections → count`) use the richer `dispatchAndWaitForDetail<T>` variant, which pulls the App-side completion event's `detail` object back through the promise.
- **Lightweight refresh channel:** Canvas mutations that don't need a handshake (`discard_idea`, `add_supporting_doc`, etc.) emit a fire-and-forget `brainstorm:ideasChanged` / `brainstorm:docsChanged` event, and the App re-reads IndexedDB. This avoids the full `dispatchAndWait` plumbing for purely additive changes.
- **Lifetime:** `useBrainstormingTools(selectedIdea)` uses two `AbortController`s — one for global tools (mount lifetime) and one for lifecycle tools (re-created on `selectedIdea.id` or `phase` change).

### Issues encountered

- **React StrictMode + `Duplicate tool name`.** The most visible bug. StrictMode mounts, cleans up, then re-mounts every effect in dev. Chrome's WebMCP preview does **not** always remove tools synchronously when the `AbortSignal` fires, so the second mount threw `InvalidStateError: Failed to execute 'registerTool' on 'ModelContext': Duplicate tool name`. Fix: added a `safeRegisterTool()` helper that swallows `InvalidStateError` specifically for duplicate-name cases and re-throws everything else. The tool stays registered under the first (aborted) controller for the page lifetime, which matches the actual app lifecycle anyway.
- **Same-origin BYOK.** Without a service worker there's nowhere to hide the API key from the page's JS context. Keys live in `localStorage` under `brainstorm:credentials`. That's the standard BYOK web-app tradeoff — documented in `#/options` — but it's a different trust model than the extension.
- **No API key → silent-looking failure.** Clicking **Advance** without an active provider throws `No API key configured for provider "<id>". Open #/options to add your key.` The error is caught in `Workspace.tsx` and shown inline, but was initially perceived as a crash. The UI now has three on-ramps: header Options button, amber banner above the idea list, and a "Configure provider" CTA on the welcome screen.
- **Port conflicts.** Originally 5173, switched to **6611** (`strictPort: true` for both `server` and `preview`) to avoid collisions with other Vite projects on the machine.
- **Same codebase, two Vite configs.** `vite.config.ts` uses `@crxjs/vite-plugin` for the MV3 build; `vite.config.web.ts` is plain Vite + React for the web app. Aliased `@src` so `apps/web/` can reach `src/` without traversing `../../` everywhere.

---

## Cross-Cutting Observations

- **`navigator.modelContext` is MAIN-world only.** This single fact drove most of the architecture: W1 needs `executeScript({ world: 'MAIN' })` to read it, W2's viability depends on whether Chrome extends that injection to `chrome-extension://`, and W3 dodges the issue by being a regular web page.
- **No standard enumeration API.** W1 had to probe `_tools` and sentinels. Once `modelContext.listTools()` ships, W1 simplifies substantially.
- **AbortController lifecycle under StrictMode is not reliable.** Not a W3-only issue — any React app registering tools in an effect will hit it. The `safeRegisterTool` pattern is reusable verbatim in W2 if/when its mount happens.
- **The contract survives cross-world boundaries, but only if outputs are structured-cloneable.** No callbacks, no DOM refs, no live Promises. We wrap errors in `{ __error }` objects and serialize tool outputs to JSON-compatible values.
- **User consent is a UX problem, not just a security problem.** W1's "detected tools" indicator + explicit Invoke button set expectations clearly; automatically calling tools on the user's behalf would have felt invasive even though the API allows it.

---

## Current Status

| Track | Status |
|---|---|
| W1 | Implemented and wired into sidepanel + workspace + ctmcp payload. Works on any tab whose site registers WebMCP tools. |
| W2 | **Iced.** Code-complete, typecheck passes, not mounted, no further effort until Chrome 146+ stabilizes `chrome-extension://` origin support for `navigator.modelContext`. Contingency tree preserved in `WEBMCP_SPIKE.md` for future pickup. |
| W3 | Implemented at `apps/web/` on port 6611. `npm run dev:web` starts the surface. 23 global + 10 lifecycle tools registered, including discard pile, cross-board connection finder, and outside-knowledge scout (ghost panels with admit / elaborate / dismiss). `safeRegisterTool` + `dispatchAndWaitForDetail<T>` patterns in place. |

## References

- `EXECUTION.md` §"Phase 4 — WebMCP" — original spec for the three tracks.
- `WEBMCP_SPIKE.md` — W2's detailed findings, test procedure, and contingency tree.
- `src/webmcp/contextBridge.ts` — W1 query + invoke.
- `src/webmcp/registerPanelTools.ts`, `src/webmcp/registerPhaseTools.ts` — W2 registration (dead-loaded).
- `apps/web/webmcp-tools.ts` — W3 registration + `safeRegisterTool` helper.
- `apps/web/chrome-shim.ts` — `chrome.*` polyfill that lets `src/` code run unchanged in the web context.
