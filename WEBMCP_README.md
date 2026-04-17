# Brainstorming Orchestrator × WebMCP

How this app uses WebMCP — what it exposes, what it consumes, and how the plumbing works end-to-end.

> See also:
> - [`ROADMAP.md`](./ROADMAP.md) — forward-looking plan (facilitator mode + sync/CRDT/autonomous AI).
> - [`WEBMCP_CAPABILITIES.md`](./WEBMCP_CAPABILITIES.md) — living capability map, gaps, issues, opportunities.
> - [`WEBMCP_INTEGRATION_NOTES.md`](./WEBMCP_INTEGRATION_NOTES.md) — retrospective on the three surfaces (W1/W2/W3).
> - [`WEBMCP_SPIKE.md`](./WEBMCP_SPIKE.md) — extension-origin spike + test procedure.
> - [`README.md`](./README.md) — general install/build.

---

## 1. What WebMCP Is (One Paragraph)

WebMCP is a draft browser standard shipped as an Early Preview in Chrome 146 (behind `chrome://flags/#enable-webmcp-testing`). It gives agentic browsers a stable contract for interacting with web apps:

- A page calls `navigator.modelContext.registerTool(tool, { signal })` to expose typed actions with JSON-Schema inputs.
- A browser-side agent (copilot sidebar, MCP inspector extension) can list those tools and call `tool.execute(input)` to drive the page.

It is **MAIN-world only** (invisible to isolated worlds / content scripts) and today has **no standard enumeration API** — we probe internals until one lands.

## 2. What This App Does With It

The Brainstorming Orchestrator is an 8-phase structured brainstorming pipeline (capture idea → extract ambiguities → run lens/challenge/stress-test micro-roles → synthesize approaches → produce a handoff markdown). WebMCP lets an external agent drive that pipeline without simulated clicks.

Concretely, the agent can:

- **Shape the board.** Capture new ideas, move/group/merge panels on the canvas, ungroup, archive via merge.
- **Curate the board.** Discard ideas (they leave the canvas but stay indexed for the scout/connection finder) and restore them later.
- **Drive a phase.** Call `advance_phase` (with optional `userInput`, optional `skip` for skippable micros).
- **Patch micro-step outputs.** Pin/dismiss/note lenses, accept/defer/rebut challenges, mark stress tests handled.
- **Feed in context.** Attach supporting docs (PRD excerpts, notes) that get refined by an LLM into facts and auto-injected into every future phase prompt.
- **Find connections.** Ask the LLM connection finder to surface links across live ideas, discarded ideas, and ready docs — `builds_on`, `contradicts`, `revives_killed`, or `shared_theme`.
- **Scout outside-in.** Run the outside-knowledge scout to propose ghost ideas drawn from analogies, adjacent fields, contrarian readings, or the user's own docs. Admit one onto the canvas, ask for elaboration, or dismiss.
- **Export.** Pull the markdown handoff when readiness goes green.

And the extension can *consume* WebMCP tools from whatever tab the user is looking at (W1) — so Phase 0/1 ambiguity extraction can reason about what the current page can actually do.

## 3. Tool Inventory (at a glance)

Full descriptions and schemas live in `apps/web/webmcp-tools.ts`. Tracking gaps and plans lives in `WEBMCP_CAPABILITIES.md` §2.

### Global (registered once; available whenever the app is open)

```
Ideas / capture / export
  list_ideas                read
  get_idea                  read
  capture_idea              write
  export_handoff            write

Canvas / groups
  get_canvas                read
  move_panel                write
  group_ideas               write
  ungroup_idea              write
  merge_ideas               write

Supporting docs (agent-accessible version of the DocsModal)
  attach_supporting_doc     write   (runs docFactExtractor synchronously)
  list_supporting_docs      read
  get_supporting_doc        read
  delete_supporting_doc     write
  retry_doc_extraction      write

Discard pile (soft-delete with recall)
  discard_idea              write
  restore_idea              write
  list_discarded_ideas      read

Cross-board synthesis
  find_connections          write   (runs connectionFinder; results are ephemeral)

Outside-knowledge scout (ghost suggestions)
  scout_ideas               write   (runs outsideKnowledgeScout; materializes ghost panels)
  list_suggestions          read
  admit_suggestion          write   (promotes a ghost to a real idea)
  elaborate_suggestion      write   (runs suggestionElaborator; stores elaboration)
  dismiss_suggestion        write   (keeps it indexed so scout won't re-propose)
```

### Lifecycle (re-registered per selected idea)

```
Phase driver
  advance_phase             write   (supports skip for micro-steps)

Phase-2 inputs
  submit_clarifications     write

Phase-3 inputs
  select_approach           write

Phase-0.5 (lenses)
  pin_lens                  write
  dismiss_lens              write
  note_lens                 write

Phase-2.5 (challenges)
  respond_to_challenge      write

Phase-4.5 (stress tests)
  mark_stress_handled       write

Phase-8 (wrap-up)
  choose_next_step          write
```

### Consuming from the active tab (W1)

```
src/webmcp/contextBridge.ts
  queryActiveTabTools()     snapshot tools registered on the current tab
  invokeActiveTabTool()     call one (requires explicit user consent)
```

## 4. Architecture

Three surfaces share the same `src/` code. They differ in *where* `navigator.modelContext` is visible and *how* secrets/state are handled.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Host (Chrome 146+)                         │
│                                                                     │
│  ┌──────────────┐    ┌────────────────┐    ┌────────────────────┐   │
│  │ W3 Web App   │    │ W1 Active Tab  │    │ W2 Extension Side  │   │
│  │ apps/web/    │    │ (any page)     │    │ Panel (deferred)   │   │
│  │              │    │                │    │                    │   │
│  │ register*()  │    │ register*()    │    │ register*() blocked│   │
│  │   (exposes)  │    │   (exposes)    │    │ until Chrome opens │   │
│  │              │    │                │    │ modelContext to    │   │
│  └──────┬───────┘    └───────┬────────┘    │ chrome-extension://│   │
│         │                    │             └────────────────────┘   │
│         │                    │                                      │
│         │  register + call   │  queryActiveTabTools                 │
│         │                    │  invokeActiveTabTool                 │
│         ▼                    ▼                                      │
│  ┌────────────────┐   ┌────────────────────────────────────┐        │
│  │  Agentic       │   │  Extension Service Worker /         │       │
│  │  Browser /     │   │  Side Panel (src/sidepanel)         │       │
│  │  MCP Inspector │   │  uses chrome.scripting.executeScript│       │
│  └────────────────┘   │  ({world: 'MAIN'}) to read tools    │       │
│                       │  from the user's other tabs         │       │
│                       └────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────┘
```

### 4a. Tool-registration lifecycle (W3)

```
App mount
  └─ useBrainstormingTools(selectedIdea)          (apps/web/webmcp-tools.ts)
        │
        ├─ globalAc = new AbortController()
        │     safeRegisterTool(listIdeas, ...)
        │     safeRegisterTool(getIdea, ...)
        │     safeRegisterTool(captureIdea, ...)
        │     … (23 global tools total as of 2026-04-17)
        │
        └─ lifecycleAc (re-created whenever selectedIdea.id or phase changes)
              safeRegisterTool(advancePhase, ...)
              safeRegisterTool(submitClarifications, ...)    (phase 2)
              safeRegisterTool(pinLens/dismissLens/noteLens) (when lenses present)
              …

App unmount
  globalAc.abort()
  lifecycleAc.abort()
```

`safeRegisterTool()` swallows the `InvalidStateError: Duplicate tool name` that the Chrome 146 preview throws when React.StrictMode remount races the abort signal. It logs a warning; the original registration stays live for the page lifetime.

### 4b. UI ↔ tool handshake (`dispatchAndWait`)

Tool `execute()` must not resolve until React state has actually updated, otherwise the agent sees a stale app. We bridge with a CustomEvent + per-call ack event:

```
  Tool execute()
    │
    ├─ dispatches   CustomEvent("brainstorm:advancePhase", {..., requestId})
    │
    ├─ App.tsx listener for "brainstorm:advancePhase":
    │     · runs advance(idea, userInput, skip)
    │     · updates state
    │     · dispatches CustomEvent(`tool-completion-${requestId}`)
    │
    └─ dispatchAndWait() resolves once it sees the completion event
       (default 8 s timeout, bumped to 20–30 s for LLM-bound tools)
```

Read-only tools (`list_ideas`, `get_idea`, `list_supporting_docs`, …) skip this dance — they just hit IDB directly.

Some write tools also skip it — the supporting-doc tools do their work inline (storage + LLM extraction) and emit a lightweight `brainstorm:docsChanged` event afterwards so the pill counts and any open DocsModal refresh. That pattern is fine when the tool owns its async work and the UI just needs to know to reload.

The discard tools use the same lightweight pattern: they mutate IDB directly and emit `brainstorm:ideasChanged` so the canvas and pile drawer reload. The scout/connections/suggestion-action tools use an enriched `dispatchAndWaitForDetail` variant whose completion event carries a payload (suggestion's new idea id, connection count, etc.) so the tool can return something more useful than a bare "ok".

### 4c. Phase-prompt injection from W1 + docs

```
stateMachine.advance(idea)
  │
  ├─ queryActiveTabTools()         ← only at phases 0/1 (cached on idea.liveToolContext)
  │
  ├─ listDocsForIdea(idea.id)      ← supporting docs (status === 'ready')
  │
  ├─ buildPayload(role, idea, task, liveToolContext, supportingDocs)
  │
  └─ payloadToMessages(payload)
        ├─ ## Current Brief State
        ├─ ## Unresolved Ambiguities
        ├─ ## MUST-STAY-TRUE RULES
        ├─ ## Supporting Context      ← docs' summaries + facts (cap 30 facts)
        └─ [LIVE TOOL CONTEXT from …] ← W1 tools, when present
```

Both extra context sources flow through the same `payloadToMessages` so every phase role — ambiguity extraction, clarification authoring, approach synthesis, pre-mortem — sees them automatically.

## 5. How to Try It

### Chrome setup
1. Install Chrome 146 Canary (or newer) — https://www.google.com/chrome/canary/.
2. Open `chrome://flags/#enable-webmcp-testing`, set to **Enabled**, relaunch.
3. (Recommended) Install the **Model Context Tool Inspector** extension from the Chrome Web Store so you can list/call tools from a panel.

### Run the web app surface (W3, recommended)
```bash
npm install
npm run dev:web           # Vite dev server on http://localhost:6611
```
Open http://localhost:6611. Visit `#/options`, paste an API key (Gemini / OpenAI / Anthropic). Open the Model Context Tool Inspector — you should see all 23 global tools registered. Select an idea → lifecycle tools (advance_phase, etc.) appear scoped to it.

### Try a scripted agent flow
A quick manual script you can run from the inspector:
1. `capture_idea` with `rawText: "Ship a CSV importer for Q3"`.
2. `attach_supporting_doc` with pasted product context — watch the pill update on the canvas.
3. `advance_phase` — Phase 0 ambiguity extraction runs, prompt now includes doc facts.
4. `list_supporting_docs` for the idea — confirm facts came through.
5. `advance_phase` repeatedly until Phase 8.
6. `export_handoff`.

### Try the cross-idea tools
Build up a handful of ideas first, then:
1. `scout_ideas` — ghost panels appear in teal along the right of the canvas.
2. `list_suggestions` — confirm the rawText / rationale / source fields.
3. `elaborate_suggestion` on one — the ghost panel gains a "Show elaboration" expander.
4. `admit_suggestion` — a real idea replaces the ghost, tagged `from-scout`.
5. `discard_idea` on a live idea — it leaves the canvas and lands in the bottom-left pile.
6. `find_connections` — watch the Connections panel fill. Click a row to flash the linked panels.
7. `restore_idea` — pull one back from the pile.

### Load the extension (W1 consumption + UI)
```bash
npm run build
```
Then `chrome://extensions` → **Load unpacked** → select `dist/`. Open any page that registers WebMCP tools — the side panel shows **"Detected tools (N)"** and Phase 0 captures them onto the idea automatically.

## 6. Key Files

```
apps/web/
  webmcp-tools.ts           All W3 tool registrations + safeRegisterTool + dispatchAndWait
  App.tsx                   Event listeners that wire tools to React state
  chrome-shim.ts            chrome.* polyfills so src/ runs unchanged in the web context
  main.tsx                  Entry point (installs shim, mounts App)

src/webmcp/
  contextBridge.ts          queryActiveTabTools + invokeActiveTabTool (W1)
  detectSupport.ts          Runtime probe; sets window.__WEBMCP_STATUS
  webmcp-ambient.d.ts       Navigator.modelContext type augmentation
  registerPanelTools.ts     W2 — dead-loaded pending chrome-extension:// support
  registerPhaseTools.ts     W2 — same

src/orchestrator/
  ctmcp.ts                  buildPayload + payloadToMessages (renders W1 context + doc facts)
  stateMachine.ts           Loads liveToolContext + supportingDocs before every role call
  adhocRole.ts              Invokes a role outside the phase ladder (used by docFactExtractor,
                             groupThemer, ideaMerger, connectionFinder, outsideKnowledgeScout,
                             suggestionElaborator)
  roles/connectionFinder.ts       Cross-board synthesis role (ephemeral output)
  roles/outsideKnowledgeScout.ts  Ghost-suggestion generator (persisted via 'suggestions' store)
  roles/suggestionElaborator.ts   Expands one suggestion into elaboration + sub-parts + implications

src/storage/
  db.ts                     IDB schema (ideas, groups, docs, suggestions) — DB_VERSION = 4
  docs.ts                   Supporting-doc CRUD + markDocReady / markDocFailed
  suggestions.ts            ScoutSuggestion CRUD + admit/dismiss/setElaboration helpers

src/docs/
  DocsModal.tsx             Paste-and-refine UI (same IDB the agent tools write to)

src/canvas/
  IdeaPanel.tsx             Draggable panel + 📎 docs pill + right-click Discard menu + flash highlight
  Canvas.tsx                Proximity grouping + merge-hold UX + ghost-panel rendering
  DiscardPile.tsx           Bottom-left collapsible drawer for discarded ideas (preview / restore)
  ConnectionsPanel.tsx      Top-right collapsible drawer for LLM connection results (click-to-flash)
  GhostPanel.tsx            Dashed teal card for pending scout suggestions (Admit / Elaborate / Dismiss)
```

## 7. Patterns and Conventions

- **`safeRegisterTool(tool, {signal})`** — always go through this; never call `navigator.modelContext.registerTool` directly.
- **`dispatchAndWait(eventName, detail, successMessage, timeoutMs?)`** — the CustomEvent-with-requestId pattern. Use for write tools that mutate React state. Resolves with a fixed success string.
- **`dispatchAndWaitForDetail<T>(eventName, detail, timeoutMs?)`** — same handshake, but returns the completion event's `detail` payload. Use when the tool needs a value back (e.g., the new idea id from `admit_suggestion`, or the suggestion count from `scout_ideas`).
- **`brainstorm:*` CustomEvents** — the event name convention. App.tsx is the sole owner of listeners; tools fire, listeners update state.
- **`brainstorm:docsChanged` / `brainstorm:ideasChanged` (no requestId)** — the lighter pattern for tools that do their own async work and just need the UI to refresh counts / reload lists. Listener is best-effort.
- **`AbortController` per lifetime** — global tools get one controller; lifecycle tools get another that's re-created when the selected idea or its phase changes.
- **Output must be structured-cloneable** — no DOM refs, no functions, no live Promises in a tool's return. Wrap errors as `{ __error: string }`. Strings, numbers, arrays, plain objects only.
- **Read tools hit IDB directly** — `listIdeas`, `getIdea`, `listDocsForIdea`, `listGroups`. No event dance required.
- **User consent on W1 invocation** — metadata reads are free; `invokeActiveTabTool` requires an explicit click before it is enabled.

## 8. Current Status

| Track | Surface | Status |
|---|---|---|
| W1 | Extension consumes tabs' WebMCP tools | Implemented. Phase 0/1 snapshots into `Idea.liveToolContext`. Rendered in every phase prompt. |
| W2 | Extension side panel *exposes* tools | Code-complete, **not mounted.** Awaiting Chrome support for `chrome-extension://` origins. |
| W3 | Standalone web app exposes tools | **Primary surface.** 23 global + 10 lifecycle tools registered. Full flow works end-to-end in the Model Context Tool Inspector. |

## 9. Where to Contribute

Start with `WEBMCP_CAPABILITIES.md` §2 ("Missing Capabilities"). Each row is a small, self-contained tool you can add inside `apps/web/webmcp-tools.ts`, wire through App.tsx if it needs React state, and mark as shipped by moving the row from §2 to §1 and bumping the "Last updated" line.

If you hit a new bug or spec friction, append to §3. If you find a new product surface WebMCP unlocks, append to §4.
