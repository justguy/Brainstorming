# Brainstorming Orchestrator

A local-first brainstorming workspace where an AI facilitator works directly on your canvas, not in a chat sidebar.

Instead of asking an AI for ideas, the AI participates like a teammate:

- it adds ideas
- it connects them
- it challenges assumptions
- it revives discarded paths
- it helps move the work forward

All through explicit, typed actions, not vague chat responses.

## What Makes This Different

Most AI tools sit in a sidebar and generate text.

This system is different:

- AI acts on the workspace, not outside it
- draws connections between ideas
- attaches critique cards to specific panels and tucks them behind the host card until expanded
- proposes new ideas as draggable scout cards on the canvas
- groups and reshapes the board
- AI is bounded and controllable
- operates through explicit tools (`WebMCP`)
- can be paused or throttled
- backs off when its suggestions are rejected
- stages ideas instead of forcing them (`Shadow Mode`)
- everything is reversible
- AI actions are tracked and can be undone
- no hidden mutations
- no AI drift
- local-first by default
- runs fully in-browser
- no required backend
- your data stays with you

## What Is Shipped Today

### Standalone Web App

Shipped. This is the primary surface and runs at `http://localhost:6611`.

- Free-form canvas: drag, group, merge, discard, restore
- Supporting-doc extraction with facts injected into reasoning
- Local-doc search + attach tools for user-authorized folders
- Connection finder plus on-canvas connection overlay
- Candidate ideas from outside-knowledge scouting, including draggable scout cards
- Attached critique cards for devil's-advocate challenges with inline accept/dismiss
- Signal control for bounded suggestions, critiques, and connections
- Local autonomous facilitator with idle-gated automation
- Facilitator peer/host controls plus shared pause/autonomy state
- AI-tagged history and undo/redo support
- Global WebMCP board tools plus selected-idea lifecycle/bead tools when `navigator.modelContext` is available

### Chrome Extension

Shipped.

- 8-phase structured brainstorming pipeline
- BYOK for Gemini, OpenAI, and Anthropic
- Active-tab WebMCP discovery with explicit user consent
- Side-panel workflow plus export

### Same-Browser Sync Baseline

Partially shipped.

- Idea-row sync uses Yjs + `BroadcastChannel` + `y-indexeddb`
- Facilitator peer state, host election, staged insights, and shared pause/autonomy state sync across local peers
- This is not yet full board collaboration across every entity type

## Not Shipped Yet

- Full-board collaborative sync across groups, docs, suggestions, critiques, connections, and history
- WebRTC peer collaboration
- Cross-device persistence
- Cloud backup
- Extension-origin WebMCP tool exposure on `chrome-extension://` pages

These are actively planned in the roadmap.

## What This Enables

Instead of this:

`Give me ideas for a CSV importer`

You get this:

- you add an idea to the board
- AI proposes 2 alternative approaches as scout cards on the canvas
- AI draws a connection between overlapping ideas
- AI drops a critique:
  `This breaks with large files — you're assuming memory fits`
- AI revives a discarded idea when it becomes relevant again

Now you're not brainstorming with a tool.
You're working with a collaborator.

## Core Concept: AI Through Tools (WebMCP)

The AI does not decide what to do loosely.

It operates through explicit actions like:

- `capture_idea`
- `get_idea`
- `get_canvas`
- `get_board`
- `move_panel`
- `draw_connection`
- `critique_idea`
- `scout_ideas`
- `move_suggestion`
- `discard_idea` / `restore_idea`
- `advance_phase`
- `get_bead_state`

This makes behavior:

- predictable
- inspectable
- controllable

## WebMCP Tools

The standalone web app exposes WebMCP tools when `navigator.modelContext` is available. In the current Chrome preview flow, that means Chrome/Chromium 146+ with `chrome://flags/#enable-webmcp-testing` enabled.

If WebMCP is unavailable, the app still works normally. The tool surface just does not register.

### What The Tools Do

- Workspace reads and setup: `list_ideas`, `get_idea`, `get_turn_log`, `capture_idea`, `get_canvas`, `get_board`, `export_handoff`
- Canvas mutation: `move_panel`, `move_suggestion`, `group_ideas`, `ungroup_idea`, `merge_ideas`, `discard_idea`, `restore_idea`
- Board analysis and idea generation: `find_connections`, `draw_connection`, `critique_idea`, `list_critiques`, `dismiss_critique`, `scout_ideas`, `cross_pollinate`, `run_beat`, `list_suggestions`, `admit_suggestion`, `elaborate_suggestion`, `dismiss_suggestion`
- Supporting docs: `attach_supporting_doc`, `list_supporting_docs`, `get_supporting_doc`, `delete_supporting_doc`, `retry_doc_extraction`
- Local-doc intake: `search_local_docs`, `attach_local_doc_candidate`
- Facilitator controls: `list_peers`, `get_ai_autonomy_state`, `claim_ai_host`, `release_ai_host`, `set_ai_paused`, `set_ai_autonomy_mode`
- Selected-idea lifecycle and bead tools: `advance_phase`, `submit_clarifications`, `select_approach`, `respond_to_challenge`, `mark_stress_handled`, `choose_next_step`, `add_rule`, `remove_rule`, `list_risks`, `patch_risk`, `list_ambiguities`, `resolve_ambiguity`, `get_phase_history`, `get_bead_state`, `suggest_next_bead`, `flag_bead_for_review`

### How To Use Them

1. Run `npm run dev:web` and open `http://localhost:6611`.
2. Open the app in a WebMCP-capable Chromium build with the WebMCP flag enabled.
3. Use a WebMCP inspector or browser agent to list the page's registered tools.
4. Global board tools are available as soon as the app loads.
5. Select an idea to expose the lifecycle/bead tool set for that idea and its current phase.
6. For `search_local_docs`, first authorize a folder from the supporting-doc UI. The tool will otherwise return a re-authorization message instead of silently reading files.
7. In the extension flow, allowing the WebMCP consent banner snapshots active-tab tool metadata into the idea context; invoking active-tab tools remains an explicit, user-consented action.

For the deeper inventory and architecture notes, see `WEBMCP_README.md` and `WEBMCP_CAPABILITIES.md`.

## Architecture: WebMCP and the Internal UI Share One Write Path

A common question when you start contributing: "If WebMCP exposes the board to
external agents, why doesn't the internal UI also call WebMCP — wouldn't that
unify the code paths?"

It already *is* unified, but at a different layer than you might expect.
WebMCP and the internal UI are two **entry points** that converge on a single
**downstream write path** (a window event → one handler → IndexedDB).
Understanding this matters before you add new mutations, because the wrong
layer to put logic in will silently break audit logs, the turn log, undo, or
external-agent parity.

### The two entry points

```
                       brainstorm:apply_ambiguity_resolution
                                          ▲
                ┌─────────────────────────┼─────────────────────────┐
                │                                                   │
   Internal UI button                              WebMCP tool: apply_ambiguity_resolution
                │                                                   │
   Runs LLM (free-text → structured args)           Receives structured args FROM the agent
                │                                                   │
   Dispatches event with structured args             Dispatches event with structured args
                │                                                   │
                └─────────────────┬─────────────────────────────────┘
                                  ▼
                Single handler patches idea via boardController → IDB → UI refresh
```

The two entry points sit at **different orchestration layers**, which is why
they aren't merged:

| Aspect | Internal UI button | WebMCP tool |
|---|---|---|
| Caller | A user clicking in the React app | An external agent (Claude, the extension, a browser AI) |
| Input | Free-text the user typed (or a model suggestion) | Structured arguments the agent has already produced |
| LLM step | Yes — runs `runAdhocRole(...)` to convert text to structured args | No — the agent already ran its own LLM round |
| Availability | Always works in any browser | Requires `navigator.modelContext` (Chrome 146+) |

The WebMCP tool is intentionally a thin shim: it validates arguments and
dispatches the same event. It does not run an LLM internally — that would mean
"agent calls our tool, our tool calls another LLM," which mixes layers.

### Why we don't route the internal UI through WebMCP

You could try to "unify" by having the internal button call the WebMCP tool.
That doesn't help, because:

1. The internal button **must run the LLM step** to produce structured
   arguments. WebMCP tools take args as input, so the button would still need
   to do the LLM call up front. Routing through WebMCP just adds an extra hop
   to the same destination.
2. WebMCP requires `navigator.modelContext`, which isn't available in every
   browser. The internal UI cannot depend on a surface that may not exist.
3. The internal button needs React state (loading flags, inline error
   surfaces, suggestion drafts). WebMCP tools only see their arguments.

### Where new mutations go

When you add a new board operation, follow this pattern:

1. **Define a window event** as the canonical mutation (`brainstorm:<verb>`).
2. **Write the handler** in `apps/web/useBrainstormLifecycleEvents.ts` (or a
   sibling). The handler calls the appropriate `boardController` method, adds
   turn-log entries, and persists to IDB.
3. **Internal callers** (React components, hooks) build the event payload and
   dispatch it. If they need an LLM to produce parts of the payload, they call
   `runAdhocRole(<role>, ...)` first.
4. **Register a WebMCP tool** in `apps/web/webmcp-tools.ts` that takes the
   structured args, validates them, and dispatches the same event.

This keeps both surfaces fully aligned: tests, audit logs, undo, history,
turn-log entries, and UI updates all flow through the single handler. No
silent divergence between what the user can do and what an agent can do.

### Where this is actively used

The pattern is most visible in the ambiguity-resolution flow
(`useAmbiguityResolutionFlow.ts` ↔ `webmcp-tools.ts:2015`), but it is the
underlying contract for every mutation:
`apply_ambiguity_resolution`, `add_rule`, `remove_rule`, `choose_next_step`,
`patch_risk`, `discard_idea`, `restore_idea`, `merge_ideas`, etc.

If you find yourself wanting to write directly to IDB from a UI handler,
or to skip the WebMCP registration for a new mutation: don't. The unified
event path is what keeps the agent surface honest.

## Autonomous Facilitator

The goal is not an assistant.

It is a facilitator that:

- keeps momentum
- surfaces risks
- connects ideas
- nudges progress

It operates in modes:

- `Passive Observer` — watches, stages insights
- `Guided Co-Pilot` — acts during idle moments
- `Active Challenger` — behaves like a full participant

And it adapts:

- repeated rejections -> it backs off
- accepted ideas -> it ramps up again
- cooldown does not mean silence; in `Shadow Mode` it keeps tracking, generating, and staging ideas in the `Insight Feed`

Architecturally, this is a managerial control plane layered over the board, bead flow, and WebMCP tool system.
It observes the workspace, selects a role, emits a structured proposal, and then either executes or stages that proposal under policy control.
Humans remain the final authority: they can accept, reject, override, advance manually, or undo AI-authored changes at any time.

## Prerequisites

- Node.js 20+
- npm 10+
- Chromium-based browser for the extension
- At least one LLM API key for Gemini, OpenAI, or Anthropic

## Development

```bash
npm install
npm run dev:web
```

Open: `http://localhost:6611`

## Builds

### Web app production build

```bash
npm run build:web
```

Output goes to `dist-web/`.

### Extension production build

```bash
npm run build
```

Output goes to `dist/`.

### Type check

```bash
npm run typecheck
```

## Load The Extension

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this repo's `dist/` directory.

## BYOK Setup

1. Open the extension options page or the standalone web app settings.
2. Choose Gemini, OpenAI, or Anthropic.
3. Paste the API key.
4. Select a model.
5. Save.

## Key Docs

- `README.md`: repo overview and current shipped status.
- `WEBMCP_README.md`: WebMCP overview and tool inventory.
- `WEBMCP_CAPABILITIES.md`: detailed capability matrix.
- `WEBMCP_INTEGRATION_NOTES.md`: integration decisions and tradeoffs.
- `PHASED_IMPL.md`: phased implementation driver that is now complete.
- `ROADMAP.md`: forward plan for facilitator evolution and sync.
- `KILLER_DEMO.md`: demo framing.
- `EXECUTION.md`: earlier execution and acceptance notes.

## Storage Model

- IndexedDB stores ideas, groups, docs, suggestions, critiques, and related local board state.
- `y-indexeddb` persists the same-browser Yjs sync layer used for idea rows and facilitator session state.
- Browser-local settings storage holds provider configuration and credentials for the shipped surfaces.
- The app is still local-first and browser-resident.

## Current Constraints

- Full board/entity sync is not complete yet. Current shipped sync is limited to idea rows plus facilitator session state across same-browser peers.
- No WebRTC or cross-device collaboration yet.
- No cloud backup.
- The standalone web app is the primary engine for ongoing work.
- The extension-origin WebMCP expose path remains paused as noted in `ROADMAP.md`.

## Verification

Current shipped facilitator work has been re-verified with:

```bash
npm run typecheck
npm run build
npm run build:web
```
