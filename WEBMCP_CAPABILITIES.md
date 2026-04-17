# WebMCP Capabilities, Gaps, Issues, and Opportunities

**Status:** living doc — update whenever a tool is added, removed, or a new issue is discovered.
**Companion docs:** `ROADMAP.md` (forward-looking plan for facilitator mode + sync), `WEBMCP_INTEGRATION_NOTES.md` (retrospective on W1/W2/W3), `WEBMCP_SPIKE.md` (W2 test plan).
**Last updated:** 2026-04-17 (Current Sprint = Facilitator Mode in §2g; paginated `get_turn_log` promoted into the sprint; former C3 removed from §3b; sync blocked until sprint ships)

This document is the map. It tracks (1) what the orchestrator can do through WebMCP today, (2) what an agent can't do yet but should be able to, (3) what breaks or is awkward, and (4) where WebMCP could take the product next. The goal is to drive WebMCP to its full potential and evaluate the API honestly as we do.

---

## 1. Current Capabilities

### 1a. Tools the web app *exposes* (`apps/web/webmcp-tools.ts`)

Registered via `navigator.modelContext.registerTool`. Split into two lifetimes:

- **Global** — registered once at mount, cleared on unmount.
- **Lifecycle** — registered per selected idea, re-registered on idea/phase change.

#### Global (always available)

| Tool | Kind | Purpose |
|---|---|---|
| `list_ideas` | read | List all non-archived ideas (id, text, readiness, phase, tags). |
| `get_idea` | read | Return a full idea object including `briefState` and `turnLog`. |
| `capture_idea` | write | Create a new idea from raw text + optional tags, select it. |
| `export_handoff` | write | Download the handoff markdown for a green-readiness idea. |
| `get_canvas` | read | Snapshot canvas layout — all visible ideas' `(x, y, groupId)` plus group themes. |
| `move_panel` | write | Set a panel's `(x, y)`. Pure positional. |
| `group_ideas` | write | Group two ideas; kicks off `groupThemer` LLM role. |
| `ungroup_idea` | write | Remove an idea from its group (group auto-deleted if empty). |
| `merge_ideas` | write | Run `ideaMerger` synthesis; archives originals, creates merged idea. |
| `attach_supporting_doc` | write | Creates a supporting doc, runs `docFactExtractor` synchronously, returns `{ docId, status, summary, facts }`. |
| `list_supporting_docs` | read | Lists all supporting docs attached to an idea with summaries + facts. |
| `get_supporting_doc` | read | Returns a single doc including full rawText. |
| `delete_supporting_doc` | write | Removes a doc; its facts stop being injected into phase prompts. |
| `retry_doc_extraction` | write | Flips a doc back to `processing` and re-runs the extractor. |
| `discard_idea` | write | Soft-deletes an idea into the discard pile; it stays indexed so the scout / connection finder can still see it. |
| `restore_idea` | write | Pulls an idea back out of the discard pile (status → `captured`). |
| `list_discarded_ideas` | read | Lists the pile newest-first. Feeds agent-driven revival workflows. |
| `find_connections` | write | Runs the `connectionFinder` role over live + discarded ideas + ready docs. Populates the Connections panel. Results are ephemeral. |
| `scout_ideas` | write | Runs the `outsideKnowledgeScout` role. Materialises up to 6 pending `ScoutSuggestion` rows and paints them as ghost panels. |
| `list_suggestions` | read | Filterable by `status: 'pending' \| 'admitted' \| 'dismissed' \| 'all'`. Default `pending`. |
| `admit_suggestion` | write | Promotes a pending suggestion into a real idea (tagged `from-scout`, preserving elaboration if any). Returns the new idea id via the completion payload. |
| `elaborate_suggestion` | write | Runs the `suggestionElaborator` role and stores elaboration + sub-parts + implications on the suggestion. |
| `dismiss_suggestion` | write | Marks the suggestion dismissed. It stays indexed so the scout won't re-propose it. |

#### Lifecycle (re-registered per selected idea)

| Tool | Applies at | Purpose |
|---|---|---|
| `advance_phase` | any phase | Run the current sub-phase's role; supports `skip` for skippable micros. |
| `submit_clarifications` | phase 2 | Submit answers to clarification questions. |
| `select_approach` | phase 3 | Choose one of the synthesized approaches with a short rationale. |
| `pin_lens` / `dismiss_lens` / `note_lens` | phase 0.5 | Patch individual lens entries. |
| `respond_to_challenge` | phase 2.5 | Accept / defer / rebut a devil's-advocate challenge. |
| `mark_stress_handled` | phase 4.5 | Mark a stress-test edge case as handled with an optional response. |
| `choose_next_step` | phase 8 | Set the recommended post-brainstorm action. |

### 1b. Tools the extension *consumes* (`src/webmcp/contextBridge.ts`)

| Surface | Behavior |
|---|---|
| `queryActiveTabTools()` | Reads WebMCP tools from whichever tab the user is viewing via `chrome.scripting.executeScript({ world: 'MAIN' })`. Probes `listTools()`, `_tools` Map, then `window.__webmcp_tools__`. |
| `invokeActiveTabTool(name, input)` | Runs a detected tool in the host tab's main world; structured-clone-safe result. |
| State-machine integration | Phase 0 / Phase 1 auto-snapshot tools into `Idea.liveToolContext`, which `ctmcp.payloadToMessages` renders into every subsequent phase prompt as `[LIVE TOOL CONTEXT from <origin>]`. |
| Sidepanel consent UX | "Detected tools (N)" chip + explicit consent before any invocation. |

### 1c. Supporting infrastructure

- `safeRegisterTool()` — swallows StrictMode duplicate-name races (`apps/web/webmcp-tools.ts`).
- `dispatchAndWait()` — CustomEvent + `tool-completion-${requestId}` handshake so tool `execute()` promises don't resolve until React state has committed.
- `AbortController` scoped per tool group (global vs lifecycle) so tools are unregistered in the right order.
- `chrome-shim.ts` polyfill lets the same `src/` codebase run in the standalone web app where `chrome.*` APIs don't exist.

---

## 2. Missing Capabilities

Ranked roughly by leverage. "Supporting docs" is the motivating example — everything in the UI should have a WebMCP verb so an agent can do what a human can.

### 2a. Supporting documents — SHIPPED (2026-04-17)

The five verbs (`attach_supporting_doc`, `list_supporting_docs`, `get_supporting_doc`, `delete_supporting_doc`, `retry_doc_extraction`) are registered as global tools in `apps/web/webmcp-tools.ts`. They persist to the same IDB `docs` store the DocsModal writes to and emit `brainstorm:docsChanged` CustomEvents so the IdeaPanel doc-count pill and any open DocsModal refresh automatically.

Follow-up opportunities: an agent-level "summarize all docs for this idea" helper, and batch `attach_supporting_docs` that accepts an array so an agent scanning a tab can push multiple excerpts in one call.

### 2b. Canvas / groups

| Tool | Kind | Rationale |
|---|---|---|
| `rename_group` | write | Override the LLM-generated theme. |
| `get_group` | read | Single-group lookup with member ideas. |
| `disband_group` | write | Remove all members at once (vs one-by-one `ungroup_idea`). |
| `arrange_panels` | write | Batch layout: `grid`, `cluster-by-group`, `timeline`. Agent-driven tidy. |
| `archive_idea` | write | Hard archive (distinct from discard). `discard_idea` / `restore_idea` shipped 2026-04-17 and cover most of the soft-delete need; archive is now only for the post-merge hidden-originals case. |

### 2c. Workspace / briefState

| Tool | Kind | Rationale |
|---|---|---|
| `list_ambiguities` / `resolve_ambiguity` | read/write | Let an agent triage ambiguities without going through `advance_phase`. |
| `add_rule` / `remove_rule` | write | Direct control of `mustStayTrueRules`. Today only the LLM can touch them. |
| `add_success_criterion` / `add_out_of_scope` / `add_open_question` | write | Manual brief editing from an agent. |
| `set_problem_statement` / `set_audience` / `set_desired_outcome` | write | Phase-0 fields. Currently only emerge from `advance_phase`. |
| `list_risks` / `patch_risk` | read/write | Risk grid is phase 4 output; no agent surface today. |

### 2d. Turn log / observability

| Tool | Kind | Rationale |
|---|---|---|
| `get_turn_log` | read | **Scheduled in current sprint — see §2g.** Paginated turn-log reader; `get_idea` will stop returning the full `turnLog` payload and direct agents here. |
| `get_phase_history` | read | Compact timeline of phase transitions and readiness changes. |

### 2e. Settings / providers

| Tool | Kind | Rationale |
|---|---|---|
| `list_providers` / `set_active_provider` | read/write | Agent can switch between Gemini / OpenAI / Anthropic without opening Options. |
| `get_density` / `set_density` | read/write | Output density preference. |
| Explicitly NOT exposing: `set_api_key`. BYOK secrets stay user-only. |

### 2f. Active-tab consumption (W1)

- **Multi-tool invocation pattern.** Today `invokeActiveTabTool` is a single call. An orchestrator that wants "invoke tool X, feed output to tool Y, then summarize" would benefit from a declarative `chain` helper or at least structured pagination of tool outputs.
- **Persistent tool directory per idea.** Currently we snapshot at phase 0/1 only. A refresh action or scheduled re-snapshot would let mid-phase changes (e.g., user opens a different tab) reach the orchestrator.

### 2g. Current Sprint — Facilitator Mode (see `ROADMAP.md` §2)

In flight on the W3 standalone web app. All three ship together; `get_turn_log` is in scope because the two new roles increase turn-log churn.

| Tool | Kind | Rationale |
|---|---|---|
| `draw_connection` | write | Create a `Connection` and render an SVG line between two idea panels. Reads from existing Connection records so the overlay is a view over `find_connections` output. |
| `critique_idea` | write | Run new `devilsAdvocate` role. Returns structured `{ risks[], hiddenAssumptions[], counterExamples[] }` about one idea. New `critiques` store (DB_VERSION → 5). |
| `list_critiques` / `dismiss_critique` | read / write | Lifecycle companions for `critique_idea`. |
| `get_turn_log` | read | Paginated turn-log reader with `{ cursor, limit }`. `get_idea` trims `turnLog` to `{ totalTurns, latestTurnAt }` once this ships. Closes the former C3 in §3b. |

### 2g.1 Longer-horizon facilitator tools (see `ROADMAP.md` §4)

| Tool | Kind | Rationale |
|---|---|---|
| `search_local_docs` | read | File System Access API-backed local RAG over a user-granted folder of PRDs / specs. Blocked on per-session permission UX. |
| `cross_pollinate` | write | Dedicated role that pairs ideas from distinct authors/groups and proposes a merged third. Partially covered by `scout_ideas` today. |

### 2h. Sync & multi-peer (planned — see `ROADMAP.md` §3)

| Tool | Kind | Rationale |
|---|---|---|
| `join_room` / `leave_room` | write | Connect to a shared Y.Doc via BroadcastChannel (same browser) or `y-webrtc` (cross-machine). |
| `list_peers` | read | Returns connected peers from `y-awareness`. |
| `claim_ai_host` / `release_ai_host` | write | One-peer-runs-observer guarantee for the autonomous facilitator. Lowest clientID wins by default; this tool lets an agent override. |
| `set_ai_paused` | write | Global toggle. Stops all autonomous observer triggers immediately. |

---

## 3. Known Issues

### 3a. Spec / runtime

| # | Symptom | Root cause | Workaround | Long-term fix |
|---|---|---|---|---|
| I1 | No enumeration API. Can't ask the browser "what tools are registered here?" | `modelContext.listTools()` not shipped in Chrome 146 preview. | Probe `_tools` Map, then `window.__webmcp_tools__`. Brittle. | Track spec — call `listTools()` when available. |
| I2 | `navigator.modelContext` not visible in isolated worlds. | MAIN-world-only injection. | `chrome.scripting.executeScript({ world: 'MAIN' })`. | N/A — spec choice. |
| I3 | Unknown whether `chrome-extension://` origins get `modelContext`. | W2 validation blocked on Chrome Canary + flag. | W3 web app sidesteps entirely. | Chrome extends origin support OR we ship W3 as the agent surface. |
| I4 | `registerTool` throws `InvalidStateError: Duplicate tool name` on StrictMode remount. | AbortController unregister is not always synchronous in the preview. | `safeRegisterTool()` swallows that one error. | Spec clarification on teardown timing; or make register idempotent. |
| I5 | Tool outputs must be structured-cloneable. | Cross-world message boundary. | Wrap errors as `{ __error: string }`; avoid DOM refs, live Promises. | N/A — standard cross-world constraint. |
| I6 | `chrome.scripting` blocked on `chrome://`, `chrome-extension://`, `about:`, new-tab. | Extension permission model. | Short-circuit `queryActiveTabTools()` to return `null`. | N/A. |

### 3b. Our code

| # | Symptom | Notes |
|---|---|---|
| C1 | `dispatchAndWait` times out silently if no listener acks. | Default timeout 10s; canvas tools bumped to 20s. A generic "listener missing" path would be safer. |
| C2 | Lifecycle tools rely on React's `useEffect` re-registering when `selectedIdea.id` or `phase` changes. If React suspends or a slow re-render happens, there's a gap where stale tools remain. | Rare in practice; watch for it during phase transitions. |
| C3 | No rate limiting. An agent could hammer `advance_phase` and run up LLM bills. | Consider a per-idea cooldown or an explicit "agent is driving" mode toggle. |
| C4 | `capture_idea` defaults the panel position from `createdAt` cascade; an agent dropping 50 ideas programmatically gets a visual mess. | Expose `panel.x/y` as optional input on `capture_idea`. |
| C5 | Canvas tools listen via CustomEvent. If the user navigates to `#/options` while an agent is driving, listeners unmount. | Acceptable for now; document it. |

---

## 4. Opportunities

### 4a. Agent-first workflows

- **"Drive the brainstorm from a PRD."** Agent in a PRD tab: reads the doc, calls `capture_idea` with excerpts, `attach_supporting_doc` (once built) with the full PRD, then `advance_phase` through phase 8 with the user watching the workspace update live. End-state: handoff markdown exported automatically.
- **"Tidy my canvas."** Agent calls `get_canvas`, clusters ideas by tag/theme, calls `move_panel` + `group_ideas` to produce a tidy arrangement. Needs `arrange_panels` for batch mode.
- **"Merge stale duplicates."** Agent scans ideas for semantic similarity via `list_ideas` + `get_idea`, proposes merges, calls `merge_ideas`. Good test of multi-step tool chains.
- **"Cross-idea synthesis."** After several ideas reach phase 8, an agent reads all their briefs and produces a portfolio-level summary. Needs a new `summarize_portfolio` tool or just a read-only `list_briefs`.

### 4b. Consuming active-tab tools (W1)

- **Linear / Jira as live context.** If the active tab registers a `search_issues` tool, Phase 0 ambiguity extraction can reference actual ticket titles. Already works in principle; needs a testbed page that exposes realistic tools.
- **Auto-invoke on phase transition.** Opt-in: when a phase completes, call specific tools on the active tab to reflect state (e.g., create a Linear ticket at phase 8). Gated behind a second, stronger consent.
- **Detection of the handoff consumer.** If the active tab is `github.com/.../issues/new`, the orchestrator could pre-fill via detected tools instead of exporting markdown for the user to paste.

### 4c. Agent affordances

- **Tool self-descriptions.** Make each `description` usable as few-shot context for an agent, including what state transitions the tool triggers (e.g., `advance_phase` "advances phase, may produce ambiguities or lenses the user may need to review"). Today descriptions are okay; could be richer.
- **Return structured "next step" hints.** Tools like `advance_phase` could return `{ status: 'ok', nextPhase, nextAction?: 'user_input_required' | 'agent_can_continue' }`. That gives an agent a loop cue without having to poll.
- **Dry-run mode.** `merge_ideas` with `{ dryRun: true }` returns what *would* happen without mutating — useful for proposing changes before committing.

### 4d. Observability / evaluation

- **WebMCP usage logging.** We don't yet log which tools an agent called, with what inputs, and how the user reacted. A per-idea `agentActivity` log would let us evaluate whether WebMCP is actually getting used and where agents get stuck.
- **A "WebMCP playground" page.** Inside `/#/options`, a panel that shows every registered tool, input schema, and a "Try it" form. Useful for manual QA and for recording test cases.
- **End-to-end test harness.** Script that spawns a headless Chrome with the flag, opens the web app, and invokes a scripted sequence of tools. Failures here would catch regressions from the spec drift in I1/I4.

### 4e. New product surfaces enabled by WebMCP

- **Browser-wide idea capture.** Any page could expose an `orchestrator_capture_idea` tool via our extension's content script so that highlighting text + invoking turns any page into an idea source — making the brainstormer a real daily driver.
- **Multi-device sync via agent.** Have the agent read `list_ideas` from one context and push them into another (e.g., desktop → work account). Avoids us building a real backend.

---

## 5. Testing Cadence

- **Per-PR smoke:** `npm run dev:web` → open Model Context Tool Inspector (Chrome 146+ canary) → verify all registered tools appear and each executes without `InvalidStateError`.
- **Per-release soak:** Run the full phase ladder (0 → 8) from inside the inspector, with `advance_phase` driving. Record results in a test log.
- **Per-gap closure:** When adding a new tool from §2, also add an entry in §3/§4 if you find an issue or new opportunity during implementation.

---

## 6. Update Protocol

- Adding a tool: update §1 table + add a corresponding test in §5. Remove from §2 if it closes a gap.
- Discovering a bug: add row in §3 with symptom / root cause / workaround / proposed fix.
- Spotting an opportunity: add bullet in §4, date-stamp it so stale items can be pruned.
- Every time this doc is edited, bump "Last updated" at the top.
