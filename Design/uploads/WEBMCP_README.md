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
- **Scout outside-in.** Run the outside-knowledge scout to propose candidate ideas drawn from analogies, adjacent fields, contrarian readings, or the user's own docs. Admit one onto the canvas, ask for elaboration, or dismiss.
- **Export.** Pull the markdown handoff when readiness goes green.

And the extension can *consume* WebMCP tools from whatever tab the user is looking at (W1) — so Phase 0/1 ambiguity extraction can reason about what the current page can actually do.

The target facilitation model is not "AI in a sidebar." The autonomous agent should behave like a peer on the canvas: it materializes candidate ideas, draws connections, drops critique cards, shelves or revives ideas, and nudges the team along the bead flow instead of narrating from a detached chat rail.

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

Outside-knowledge scout (candidate ideas)
  scout_ideas               write   (runs outsideKnowledgeScout; materializes candidate ideas)
  list_suggestions          read
  admit_suggestion          write   (promotes a candidate idea to a real idea)
  elaborate_suggestion      write   (runs suggestionElaborator; stores elaboration)
  dismiss_suggestion        write   (keeps it indexed so scout won't re-propose)

Facilitator coordination
  list_peers                read
  claim_ai_host             write
  release_ai_host           write
  set_ai_paused             write
```

Important current-state note: as of `2026-04-19`, the W3 web app mounts the global board-first tool surface. The lifecycle tools below are the canonical bead-flow interface, but that phase-local registration layer still needs to be re-mounted on W3.

### Lifecycle (canonical bead-flow surface; target W3 remount)

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

### Planned bead-state coordination tools

```
Bead state / facilitation nudges
  get_bead_state            read    (derived view over SUB_PHASES + idea state)
  suggest_next_bead         write   (soft nudge / pulse, not a hard transition)
  flag_bead_for_review      write   (marks a completed bead for revisit)

Autonomy controls
  get_ai_autonomy_state     read    (current facilitator profile + recent backoff signals)
  set_ai_autonomy_mode      write   (Passive Observer | Guided Co-Pilot | Active Challenger)
  undo_ai_change            write   (reverts a targeted AI-authored change set)
```

`slide_bead` is intentionally not listed as a separate tool. The bead UI may expose that label, but the only hard transition path should remain `advance_phase`.

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

### 4a. Tool-registration lifecycle (current vs target on W3)

Current W3 registration state:

```
App mount
  └─ useBrainstormingTools(selectedIdea)          (apps/web/webmcp-tools.ts)
        │
        ├─ globalAc = new AbortController()
        │     safeRegisterTool(listIdeas, ...)
        │     safeRegisterTool(getIdea, ...)
        │     safeRegisterTool(captureIdea, ...)
        │     … (global board-first tools)
        │
        └─ no phase-local lifecycle controller mounted on W3 today

App unmount
  globalAc.abort()
```

Target bead-flow registration state:

```
App mount / selected idea changes
  └─ useBrainstormingTools(selectedIdea)
        │
        ├─ globalAc = new AbortController()
        │     safeRegisterTool(listIdeas, ...)
        │     safeRegisterTool(captureIdea, ...)
        │     safeRegisterTool(findConnections, ...)
        │     safeRegisterTool(drawConnection, ...)
        │     …
        │
        └─ lifecycleAc = new AbortController()
              keyed to { selectedIdea.id, selectedIdea.phase }
              safeRegisterTool(advancePhase, ...)
              safeRegisterTool(submitClarifications, ...)     (phase 2)
              safeRegisterTool(selectApproach, ...)           (phase 3)
              safeRegisterTool(pinLens/dismissLens/noteLens)  (phase 0.5)
              safeRegisterTool(respondToChallenge, ...)       (phase 2.5)
              safeRegisterTool(markStressHandled, ...)        (phase 4.5)
              safeRegisterTool(chooseNextStep, ...)           (phase 8)
              safeRegisterTool(getBeadState, ...)             (read-only)
              safeRegisterTool(suggestNextBead, ...)          (soft nudge)
              safeRegisterTool(flagBeadForReview, ...)        (review marker)

Idea / phase changes
  lifecycleAc.abort()
  lifecycleAc = new AbortController()
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

For new lifecycle writes such as `add_rule`, `remove_rule`, `patch_risk`, `suggest_next_bead`, and `flag_bead_for_review`, use the handshake path rather than bare `brainstorm:ideasChanged`. Those tools need deterministic completion after the board commit and React writeback; the refresh event alone is too weak because it carries no mutation-specific ack or payload.

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

### 4d. Target facilitation model — beads + canvas actor

The goal is to build an autonomous agent that mimics the facilitation leadership style directly inside the shared workspace.

- The robot is not a sidebar chatbot. It should have an on-canvas presence: persona dock, activity feed, cursor, candidate ideas, critique cards, and visible connection overlays.
- The `Beads` metaphor is a derived visualization over the 12 canonical entries in `SUB_PHASES`. Each bead reflects runtime state such as `locked`, `active`, `completed`, or `needs_attention`.
- `get_bead_state` should be a derived read model over `idea.phase`, readiness, fallback markers, review flags, and per-phase metadata. There should be no second bead-state store.
- `suggest_next_bead` is a soft coordination tool: pulse the next bead, add a facilitator note, or mark where the team appears stuck. It should not change the phase.
- `flag_bead_for_review` is a durable review marker when new information undermines a previously completed bead.
- `advance_phase` remains the only hard phase-transition mechanism. Any future UI label such as `slide_bead` is just an alias over `advance_phase`.

This model maps cleanly onto the existing board verbs:

- **Dumping and reviving ideas.** `discard_idea` shelves a stalling idea into the bottom-left pile; `restore_idea` pulls it back when a later connection or roadblock makes it relevant again.
- **Making connections.** `find_connections` reasons in the background and `draw_connection` makes the relationship visible with an on-canvas line instead of a chat message.
- **Challenging the room.** `critique_idea` drops a red-bordered devil's-advocate card directly onto the board so the team has to answer the hidden assumption.
- **Providing alternatives.** `scout_ideas` materializes teal candidate ideas from outside knowledge or adjacent domains, letting the team admit or dismiss them on the board itself.

### 4e. LLM job descriptions — role-to-tool map

The facilitator should not run as a generic text model. It needs explicit operating roles with bounded missions, bead ranges, and tool reach.

Use the canonical `SUB_PHASES` numbering when binding these roles:

| Role | Mission | Primary W1/W3 context | Primary WebMCP verbs | Primary beads |
|---|---|---|---|---|
| Scout | Prevent the team from working in a vacuum. Pull in outside knowledge, active-tab context, algorithms, and relevant docs. | W1 `liveToolContext`, supporting docs, ambiguity state | `scout_ideas`, `attach_supporting_doc` | `0`, `0.5`, `2` |
| Synthesizer | Find shared themes, synergies, and contradictions across active ideas. | W3 board graph, live ideas, connections, groups | `find_connections`, `draw_connection`, `group_ideas` | `2`, `5` |
| Challenger | Break the happy path before implementation. Surface hidden assumptions and edge cases. | dominant idea, existing critiques, rules, stress state | `critique_idea`, `mark_stress_handled` | `2.5`, `4`, `4.5` |
| Historian | Preserve long-term board memory so earlier ideas are not lost when context shifts. | discarded index, current ambiguity/rules state, board history | `restore_idea`, `discard_idea` | `1`, `3` |
| Facilitator | Keep momentum, enforce the bead flow, and lock in constraints and next steps. | bead state, readiness, rules, history, autonomy mode | `advance_phase`, planned `add_rule` / `remove_rule`, `choose_next_step`, `export_handoff` | `3`, `6`, `7`, `8` |

Canonical directives for each role:

- **Scout**
  Directive: analyze current ambiguities, inspect W1 active-tab tool context, and look for relevant external documentation, algorithms, or existing tools that change the board's options.
  Output target: staged or admitted scout suggestions, optional supporting-doc attach proposals.

- **Synthesizer**
  Directive: review all active ideas, find shared themes or contradictions, and propose structure that reduces duplicate effort.
  Output target: connection proposals, grouping proposals, or visible connection overlays.

- **Challenger**
  Directive: target the highest-risk assumption on the board, generate the sharpest actionable challenge, and force hidden risks into the open before implementation.
  Output target: critique cards and stress-handling follow-through.

- **Historian**
  Directive: compare the live board against the discarded archive and revive or shelf ideas when context shifts make that the right move.
  Output target: restore/shelve proposals tied to present ambiguities or rules.

- **Facilitator**
  Directive: monitor bead progress, detect stalling or consensus, propose advancing the bead state, and ensure must-stay-true constraints and handoff decisions are captured.
  Output target: bead progression, rule capture, next-step selection, and handoff export.

### 4f. Dynamic autonomy engine

Autonomy should be adjustable and reversible. The facilitator is not always equally loud.

- **Explicit control: facilitation dial.** The current `set_ai_paused` tool is the floor. The target model expands that into named profiles the team can set globally:
  - `Passive Observer` — listens, prepares context, and may softly pulse a bead or stage a suggestion, but does not mutate the canvas without explicit invocation.
  - `Guided Co-Pilot` — acts only during idle windows. This is the home for idle-gated triggers like connection discovery, docless-idea scouting, or contradiction surfacing.
  - `Active Challenger` — behaves like an equal participant: draws connections, lands critique cards, revives discarded ideas, and can shelf stale ideas while the session is live.
- **Implicit control: auto-backoff.** The robot should watch the reception of its recent actions. Repeated `dismiss_suggestion`, `dismiss_critique`, or equivalent review rejections are negative feedback signals. If the team keeps rejecting the last few AI injections, the engine should throttle itself down a level and temporarily suppress higher-interruption roles such as `outsideKnowledgeScout` or `devilsAdvocate`.
- **Recovery path.** Backoff should decay over time rather than permanently neutering the facilitator. If the team later accepts or keeps AI output, the facilitator can earn its way back toward the configured ceiling.
- **State model.** The derived autonomy state should include at least:
  - configured ceiling (`paused`, `observer`, `copilot`, `challenger`)
  - effective mode after backoff
  - recent AI action counts
  - recent dismiss / keep / accept counts
  - temporary cooldown expiry timestamps
- **Rolling window.** Use a short memory rather than an all-time score. A concrete starting shape is:
  `aiRecentActions: [{ id, kind: 'scout' | 'critique' | 'connect', ideaId?, startedAt, outcome: 'pending' | 'accepted' | 'rejected' | 'ignored' }]`
- **Interceptor points.** The existing WebMCP verbs already give us the hooks:
  - `dismiss_suggestion` / `dismiss_critique` update the matching recent AI action to `rejected`
  - `admit_suggestion` updates the originating scout action to `accepted`
  - future review keep/scratch actions should feed the same outcome model
- **Threshold check.** Before background facilitator roles run, compute recent rejection pressure from the rolling window. A practical starting policy is `3 rejections in the last 5 autonomous actions => downgrade one level and apply a cooldown`.
- **Shadow mode.** Cooling down does not mean the robot stops monitoring. In Shadow mode, it still generates candidate critiques, scout ideas, and structural observations during idle windows, but execution is intercepted and the payloads are staged instead of mutating the board immediately.
- **Staged insights.** A concrete shape is:
  `pendingInsights: [{ id, beadId, kind: 'scout' | 'critique' | 'connection', payload, createdAt, sourceActionId }]`
  The strongest implementation path is to evolve the existing review-session / review-item surfaces into a `Robot's Notes` drawer rather than inventing an unrelated staging UI.
- **Insight Feed.** The preferred Shadow-mode UX is a transient inbox/drawer that silently collects staged robot thoughts. Items should be labeled by intent such as `Tool Suggestion`, `Web Context`, or `Grouping Proposal`.
- **Passive UI signals.** While shadowed, the facilitator should communicate via subtle bead badges/glow and the notes drawer, not by landing artifacts directly on the canvas.
- **Action mapping.** Feed actions should map directly onto the existing WebMCP tools:
  - accept / bring to canvas → `admit_suggestion`
  - ask for elaboration → `elaborate_suggestion`
  - dismiss but keep indexed → `dismiss_suggestion`
  - shelve for later → `discard_idea`, later `restore_idea`
  - accept grouping proposal → `group_ideas`
- **External-info path.** When the robot finds relevant web or document context, the feed should offer a suggestion like `Attach to Idea X?` and route acceptance through `attach_supporting_doc` or the local-doc attachment tools instead of silently mutating the idea prompt context.
- **Ramp-up triggers.** The robot should regain active permissions from human trust signals:
  - a user keeps/adopts a staged note
  - the team manually advances to the next bead
  - the team explicitly invokes a robot-helping tool such as `find_connections`
- **Transparency.** When backoff triggers, the canvas should show that the facilitator noticed. Dim the facilitator presence or surface a brief status like `Reading the room. Stepping back to let you drive.`

### 4g. Technical execution loop — Node + React

When the facilitator is in active or shadowed autonomy modes, the execution loop should be:

1. The Node-side orchestrator selects the appropriate role for the current bead and room state.
2. The role prompt produces a structured proposal that targets an existing W3 WebMCP verb rather than free-form prose.
3. If the effective autonomy mode allows execution, the proposal dispatches through the normal WebMCP/event handshake and mutates the board.
4. If the effective autonomy mode is `Shadow`, the proposal is tagged as AI-originated and staged into the `Insight Feed` / `Robot's Notes` surface instead of mutating the canvas immediately.
5. The React surface shows the staged proposal via bead badges, the notes drawer, or both, and the team decides whether to admit, expand, group, attach, shelve, or dismiss it.

This keeps the LLM tightly coupled to the actual tool surface: roles think, tools act, and Shadow mode simply intercepts execution without turning the AI off.

### 4h. Safe reversals — AI Undo

High-autonomy moves need a first-class escape hatch.

- The current board model already records durable change sets with `actor`, `forward`, and `inverse` patches, and AI-authored changes are labeled distinctly in history.
- Today that gives us a strong base: generic undo / redo exists, history already surfaces AI actors, and AI-generated moves can be identified without heuristics.
- The target UX is an `AI Undo` affordance that filters for AI-authored changes and lets the team instantly revert a specific robot move or a short recent chain of robot moves.
- In the future CRDT sync model, the same concept extends via transaction `origin: 'ai'`, so AI reversals can stay scoped to AI-authored mutations without trampling concurrent human edits.

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
Open http://localhost:6611. Visit `#/options`, paste an API key (Gemini / OpenAI / Anthropic). Open the Model Context Tool Inspector — you should see the global board-first tools registered today. The lifecycle bead-flow remount described above is target architecture, not the current W3 registration state.

### Try a current scripted agent flow
A quick manual script you can run from the inspector on W3 today:
1. `capture_idea` with `rawText: "Ship a CSV importer for Q3"`.
2. `attach_supporting_doc` with pasted product context — watch the supporting-doc pill update on the canvas.
3. `scout_ideas` — teal candidate ideas should appear as adjacent alternatives.
4. `critique_idea` on the main idea — a red critique card should land on the board.
5. `find_connections` — connection candidates should populate the board-facing connection surfaces.
6. `draw_connection` on a high-signal pair — the relationship becomes visible directly on the canvas.
7. `discard_idea` on a weak idea, then `restore_idea` — confirm the robot can shelve and revive work without leaving the board metaphor.

The lifecycle bead-flow tools (`advance_phase`, `submit_clarifications`, `select_approach`, and the micro-step patch tools) remain the canonical interface for the 12-step flow, but the W3 remount is still pending.

### Try the cross-idea tools
Build up a handful of ideas first, then:
1. `scout_ideas` — candidate ideas appear in teal along the right of the canvas.
2. `list_suggestions` — confirm the rawText / rationale / source fields.
3. `elaborate_suggestion` on one — the candidate idea card gains a "Show elaboration" expander.
4. `admit_suggestion` — a real idea replaces the candidate idea, tagged `from-scout`.
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
  db.ts                     IDB schema (boards, ideas, groups, docs, suggestions, critiques,
                             connections, turns, settings, reviews) — DB_VERSION = 10
  docs.ts                   Supporting-doc CRUD + markDocReady / markDocFailed
  suggestions.ts            ScoutSuggestion CRUD + admit/dismiss/setElaboration helpers

src/docs/
  DocsModal.tsx             Paste-and-refine UI (same IDB the agent tools write to)

src/canvas/
  IdeaPanel.tsx             Draggable panel + 📎 docs pill + right-click Discard menu + flash highlight
  Canvas.tsx                Proximity grouping + merge-hold UX + candidate-idea rendering
  DiscardPile.tsx           Bottom-left collapsible drawer for discarded ideas (preview / restore)
  ConnectionsPanel.tsx      Top-right collapsible drawer for LLM connection results (click-to-flash)
  GhostPanel.tsx            Dashed teal card for pending candidate ideas (Admit / Elaborate / Dismiss)
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
| W1 | Extension consumes tabs' WebMCP tools | `Shipped`. Phase 0/1 snapshots into `Idea.liveToolContext`. Rendered in every phase prompt. |
| W2 | Extension side panel *exposes* tools | `Implemented (not mounted)`. Awaiting Chrome support for `chrome-extension://` origins. |
| W3 | Standalone web app exposes tools | `Shipped` for the global board-first surface. Lifecycle bead-flow remount is `Implemented (not mounted)`. |

## 9. Where to Contribute

Start with `WEBMCP_CAPABILITIES.md` §2 ("Missing Capabilities"). Each row is a small, self-contained tool you can add inside `apps/web/webmcp-tools.ts`, wire through App.tsx if it needs React state, and mark as `Shipped` by moving the row from §2 to §1 and bumping the "Last updated" line.

If you hit a new bug or spec friction, append to §3. If you find a new product surface WebMCP unlocks, append to §4.
