# Brainstorming Orchestrator — Roadmap

**Status:** living doc — update whenever a feature ships, a plan shifts, or a concern resolves.
**Last updated:** 2026-04-19 (Canvas-actor + bead-flow target documented; Current Sprint = Collaborative Sync; signaling baseline = SDP broker)

This doc is the forward-looking plan. It consolidates the shipped facilitator baseline, the immediate UI/UX polish pass, and the collaborative-sync track (BroadcastChannel → Yjs CRDT → WebRTC, with an autonomous AI facilitator). For *what exists today at tool granularity* see `WEBMCP_CAPABILITIES.md`; for *why* integration patterns look the way they do see `WEBMCP_INTEGRATION_NOTES.md`.

## Why This Exists

Brainstorming breaks down in two ways:

- humans lose structure as ideas grow
- AI tools generate content but do not manage the work

This system solves both:

- the board keeps structure visible
- the AI acts inside the board, not outside it

The goal is not better idea generation.

The goal is better thinking under complexity.

## Status Labels

Use these labels consistently across the docs:

- `Shipped`
- `Implemented (not mounted)`
- `Planned`

### Track posture
- **W3 (standalone web app) — primary engine.** All new feature work lands here. Port 6611 bypasses extension-origin unknowns.
- **W1 (active-tab consumption) — maintained.** On-demand `chrome.scripting.executeScript({ world: 'MAIN' })` only. Persistent content scripts are **not** an option and will not be revisited.
- **W2 (extension-origin expose) — Implemented (not mounted).** All expose work on `chrome-extension://` is paused pending Chrome 146+ spec stabilization. Existing code stays dead-loaded as a future pickup point.

---

## 0. Doc map (where to look)

| Doc | Scope |
|---|---|
| `README.md` | Chrome extension install / build / BYOK / usage for the 8-phase pipeline. |
| `WEBMCP_README.md` | WebMCP-specific overview, current-vs-target tool registration model, and the canonical lifecycle / bead-flow surface. |
| `WEBMCP_CAPABILITIES.md` | Tool-level capability matrix, known issues, opportunities. Update on every tool add/remove. |
| `WEBMCP_INTEGRATION_NOTES.md` | Retrospective on the three integration tracks (W1 consume, W2 extension-origin spike, W3 web app) and the patterns that came out of them. |
| `WEBMCP_SPIKE.md` | W2 test plan + contingency tree (A/B/C). |
| `EXECUTION.md` | Original phase spec + track-level acceptance criteria. |
| `ROADMAP.md` (this doc) | Forward-looking plan across facilitator mode + sync. |

---

## 1. Today — what's shipped

### 1.1 Chrome Extension (MV3)
- 8-phase brainstorming pipeline with BYOK LLM (Gemini / OpenAI / Anthropic).
- Popup capture → side panel workspace → readiness-gated handoff export.
- **W1 consume:** extension reads WebMCP tools registered on the active tab (`queryActiveTabTools`, `invokeActiveTabTool`) and injects them into phase prompts as `[LIVE TOOL CONTEXT from <origin>]`. MAIN-world injection via `chrome.scripting.executeScript`.
- **W2 expose (Implemented (not mounted) — see Track posture above):** `registerPanelTools.ts` + `registerPhaseTools.ts` are code-complete and type-safe but stay unmounted; no further effort until Chrome 146+ stabilizes `chrome-extension://` origin support. See `WEBMCP_SPIKE.md` for the preserved contingency tree.

### 1.2 Standalone Web App (`apps/web/`, port 6611)
- Same `src/` codebase behind a `chrome.*` shim. `npm run dev:web`.
- **Global board-first WebMCP tools** registered via `navigator.modelContext.registerTool` on W3 today. The canonical lifecycle / bead-flow surface is **Implemented (not mounted)** on W3 and still pending remount.
- **Free-form canvas.** Drag, drop, group by proximity, merge by 2s overlap-hold.
- **Supporting docs** with `docFactExtractor` role; facts feed phase prompts.
- **Discard pile** — soft-delete that stays indexed so scout / connection finder can still see it. `discard_idea` / `restore_idea` / `list_discarded_ideas`, plus right-click context menu on panels.
- **Cross-board connections.** `find_connections` runs the `connectionFinder` role; emits structured `Connection` records (`builds_on`, `contradicts`, `revives_killed`, `shared_theme`) with strength + rationale. Rendered as a collapsible top-right drawer; click a row → canvas flash.
- **Outside-knowledge scout.** `scout_ideas` runs the `outsideKnowledgeScout` role; materialises up to 6 pending `ScoutSuggestion` rows and paints them as dashed teal candidate ideas. Admit / Elaborate / Dismiss.

### 1.3 Storage
- IndexedDB via `idb` (`DB_VERSION 4`) — stores: `ideas`, `groups`, `docs`, `suggestions`.
- `chrome.storage.local` (or `localStorage` via shim) for settings + BYOK credentials.
- `chrome.storage.session` (or `sessionStorage`) for popup → side-panel handoff.

### 1.4 Known constraints
- **V1 = single-user, local-only.** No sync, no multi-peer.
- **W2 is Implemented (not mounted).** No further effort on exposing tools via `chrome-extension://` until Chrome 146+ stabilizes. Contingency tree preserved in `WEBMCP_SPIKE.md` for future pickup.
- **BYOK on the web app lives in `localStorage`.** Documented tradeoff (`WEBMCP_INTEGRATION_NOTES.md` §W3).

---

## 2. Shipped — Facilitator Mode v1

**Status:** `Shipped` on the W3 standalone web app. This is now the stable baseline for the next pass: visible connections, anchored critiques, bounded signal control, paginated turn logs, and local-only facilitator automation.

This section records what already landed so the next sprint can focus on perceived intelligence rather than missing functionality.

### 2.1 `draw_connection` — canvas overlay
**Goal:** render lines between related idea panels so the user can *see* the cross-board synthesis that `find_connections` currently surfaces only as text rows.

- **UI:** SVG overlay inside `Canvas.tsx`, beneath panels but above the dot grid. Reads from existing `Connection` records (no new storage).
- **Stroke encodes `kind`:** `builds_on` solid, `contradicts` dashed red, `revives_killed` green arrow, `shared_theme` dotted grey.
- **Live during drag:** recompute endpoints from `liveDrag` so lines follow a panel as it moves.
- **Hit-testing:** click a line → flash both endpoints via the existing `highlightIds` path.
- **WebMCP tool:** `draw_connection(fromIdeaId, toIdeaId, kind, rationale)` — creates a Connection and triggers overlay render in one call (so an agent can narrate "I'm linking X to Y because…" visibly).

**Main cost:** ~200 LOC of SVG + pan/zoom-aware coord math. The overlay has to survive panel drags.

### 2.2 `critique_idea` — devil's advocate role
**Goal:** give the AI a first-class adversarial role on a specific idea, not just as a phase inside the 8-phase pipeline.

- **New LLM role:** `devilsAdvocate`. Input: one idea + its supporting docs + board context. Output: `{ risks[], hiddenAssumptions[], counterExamples[] }` (Zod-schemed like the other roles).
- **UI:** red-bordered critique card pinned next to the target panel. Not a candidate idea — this is *about* an existing idea, not a proposed new one.
- **WebMCP tools:** `critique_idea(ideaId)`, `list_critiques(ideaId?)`, `dismiss_critique(critiqueId)`.
- **Storage impact:** new `critiques` store. `DB_VERSION` → 5.

Fulfils the "stress-test" verb from the earlier design discussion and the "AI as adversarial collaborator" role.

### 2.3 `get_turn_log` — paginated observability sidecar
**Goal:** stop the full `turnLog` from piggybacking on every `get_idea` response now that two new roles (`connectionFinder`, `devilsAdvocate`) will add turns at a higher rate.

- **New WebMCP tool:** `get_turn_log(ideaId, { cursor?, limit? })`. Returns a page of entries plus `nextCursor`.
- **Companion trim:** `get_idea` response collapses `turnLog` into `{ totalTurns, latestTurnAt }` and directs the agent to paginate via the new tool.
- Closes `WEBMCP_CAPABILITIES.md` §3b C3 (the oversized-response warning).

---

## 3. Shipped — UI/UX Polish Driver

**Status:** `Shipped` on the W3 standalone web app. No new surfaces were added; the work stayed inside the existing canvas, critiques, candidate ideas, and local facilitator timing.

This is a refinement sprint on top of the existing canvas, critiques, suggestions, and local facilitator. All changes stay inside current surfaces and must improve clarity, timing, motion, or perceived intelligence.

### 3.1 Visual hierarchy
**Goal:** make important insights stand out immediately without making the board busier.

- **Specific UI changes**
  - Active idea gets a slight elevation bump: shadow increase or `scale(1.02)` plus a subtle border/glow accent.
  - Only one idea can be visually active at a time.
  - Strongest connection uses the thickest stroke and highest opacity; secondary connections drop to roughly 60-70% opacity.
  - Critiques visually outrank structure: stronger red/orange treatment, clearer border, and anchored placement that does not cover the target idea.
  - Non-relevant ideas fade slightly to around 90% opacity while preserving readable text contrast.
- **Motion specs**
  - Keep hierarchy transitions in the existing 200-500ms band with `ease-out`.
  - Do not pulse or loop; hierarchy should settle quickly and stay quiet.
- **Trigger conditions**
  - Apply active emphasis on selection, connection click highlight, critique focus, or AI-authored reveal when the board is idle.
  - Suppress hierarchy animation during drag and typing.
- **Edge cases**
  - Dense boards where critique cards can crowd the target.
  - Overlapping connection clusters where stroke weight alone is insufficient.
  - Rapid focus changes that could leave two ideas looking active.
- **Test scenarios**
  - Click a strong connection and confirm the target pair becomes the obvious focus.
  - Reveal a critique near a crowded idea and confirm the critique reads first without covering the idea.
  - Drag one idea through a dense region and confirm the rest of the board stays readable and stable.

### 3.2 Motion design
**Goal:** make AI actions feel intentional instead of abrupt.

- **Specific UI changes**
  - Connection lines should draw from source to target rather than appearing instantly.
  - Critique cards should enter from a small offset so they feel placed, not popped in.
  - Ghost suggestions should appear with a fade-plus-scale reveal and stagger if more than one is shown.
  - Clicking a connection should briefly flash both endpoint ideas.
- **Motion specs**
  - Connections: stroke-dash draw animation over 300-500ms.
  - Critiques: fade 0 → 1 with 10-20px slide over 200-300ms.
  - Critique reveal delay after idle: roughly 1.2-1.8s.
  - Suggestions: `scale(0.95 → 1)` plus fade, staggered if multiple.
  - Highlight flash: about 300ms.
  - Use `ease-out` consistently.
- **Trigger conditions**
  - Only run these reveals after idle.
  - Never animate while dragging or typing.
  - If the user re-engages, cancel queued reveals and reset timing.
- **Edge cases**
  - Multiple queued AI actions trying to animate together.
  - Drag start during a queued reveal.
  - Reduced-motion environments that still need readable state changes.
- **Test scenarios**
  - Idle after creating related ideas and confirm one connection draws directionally.
  - Idle again and confirm the critique enters later instead of landing at the same time.
  - Type into an idea while a reveal is pending and confirm the animation is cancelled.

### 3.3 Timing and sequencing
**Goal:** make the facilitator feel patient and deliberate instead of noisy.

- **Specific UI changes**
  - Rework idle gating so AI actions trigger 1.2-2.0 seconds after the last interaction.
  - Enforce sequential reveals: one connection first, then one critique, then later a suggestion.
  - Prioritize structural insight before challenge, and challenge before expansion.
- **Motion specs**
  - Delay between sequential AI actions: roughly 600-1000ms.
  - Keep timing consistent enough that users learn the rhythm.
- **Trigger conditions**
  - Any pointer movement, drag, typing, dismiss, or board edit resets the queue.
  - AI actions only fire when the board is idle and the previous reveal has settled.
- **Edge cases**
  - Repeated micro-interactions that keep the board near-idle but never stable.
  - Back-to-back AI candidates of the same type competing for the next slot.
  - A queued critique targeting an idea that changed or moved before reveal.
- **Test scenarios**
  - Add several ideas quickly and confirm the board waits before surfacing one connection.
  - Interact mid-queue and confirm the pending critique or suggestion never appears.
  - Let the queue fully run and confirm the order is connection, then critique, then suggestion.

### 3.4 Signal control
**Goal:** keep the board clean and trustworthy even when the facilitator has more to say.

- **Specific UI changes**
  - Enforce hard visible limits: about 8-10 connections, 2 critiques per idea, and 5-6 suggestions on-screen.
  - Only high-confidence connections render; weak ones stay hidden.
  - Extra suggestions collapse behind a compact `+N more` affordance on existing suggestion surfaces instead of adding a new panel.
  - Lower-importance signals fade rather than competing equally with the strongest insight.
- **Motion specs**
  - Hidden or de-emphasized states should transition smoothly in 200-300ms.
  - Do not animate removals in a way that looks like data loss.
- **Trigger conditions**
  - Apply limits at render time and when new AI output arrives.
  - Prefer dropping or collapsing the lowest-signal items first.
- **Edge cases**
  - Many medium-confidence links that could crowd out one clearly strong link.
  - Critique accumulation on a single controversial idea.
  - Suggestion overflow while the user is already inspecting one candidate idea card.
- **Test scenarios**
  - Generate more than 10 candidate connections and confirm only the strongest remain visible.
  - Generate 3 critiques for one idea and confirm only 2 stay visible.
  - Generate 8 suggestions and confirm overflow collapses into a compact count.

### 3.5 Micro-interactions
**Goal:** make the board feel responsive and aware while preserving calm.

- **Specific UI changes**
  - Nearby connections should adjust subtly in real time during drag, with light elastic tension rather than rigid snapping.
  - During idea edits, nearby critiques fade slightly as if being reconsidered, then regain opacity after idle.
  - Connection rendering should tighten visually within groups so clusters feel cohesive.
  - Hovering an idea should highlight connected lines and related critiques together.
- **Motion specs**
  - Keep drag-adjacent reactions subtle and sub-300ms where eased interpolation is needed.
  - Fade critique reconsideration in and back out within the common 200-300ms range.
- **Trigger conditions**
  - Drag proximity drives connection tension.
  - Text-edit state temporarily de-emphasizes critiques.
  - Hover focus highlights related structure and critiques together.
- **Edge cases**
  - High-frequency drag updates that could create jitter.
  - Hover flicker when moving across dense overlapping hit targets.
  - Edits that end just as a queued AI action is ready.
- **Test scenarios**
  - Drag an idea near related nodes and confirm nearby lines react smoothly without lag.
  - Start editing an idea with an attached critique and confirm the critique softens until idle returns.
  - Hover an idea with multiple connections and critiques and confirm the related set is obvious.

### 3.6 Tone and language
**Goal:** make critiques read like a sharp collaborator, not a report generator.

- **Specific UI changes**
  - Update critique copy templates and output shaping toward direct language such as `This fails if...`, `You're assuming...`, `This breaks when...`, and `This conflicts with...`.
  - Cap critique length at 2-3 short lines with high information density.
  - Avoid passive summaries and long paragraphs.
- **Motion specs**
  - No special motion beyond the shared critique entrance rules.
- **Trigger conditions**
  - Apply this shaping to every critique render path, including regenerated or persisted critiques.
- **Edge cases**
  - Models returning generic summaries instead of actionable challenge.
  - Long supporting context causing critique verbosity creep.
  - Multi-point critiques that exceed the short-card format.
- **Test scenarios**
  - Generate critiques across weak, medium, and strong ideas and confirm each card stays brief and pointed.
  - Reload persisted critiques and confirm they still respect the concise format.
  - Run a critique on a doc-heavy idea and confirm the copy remains dense rather than bloated.

### 3.7 Final polish
**Goal:** make the demo read as smooth, deliberate, and premium without changing the product shape.

- **Specific UI changes**
  - Normalize spacing and alignment between cards, overlays, and candidate ideas.
  - Keep critique color discipline strict: red/orange for critique, blue/grey for structure, teal for suggestions.
  - Remove abrupt appearance/disappearance across existing facilitator surfaces.
- **Motion specs**
  - Unify animation durations inside the 200-500ms band.
  - Standardize on `ease-out` unless a specific interaction already proves otherwise.
- **Trigger conditions**
  - Apply consistency rules across all existing reveal and hover states.
- **Edge cases**
  - Mixed legacy timings that make one surface feel faster or louder than another.
  - Mobile or smaller viewport layouts where spacing drift becomes more visible.
  - Simultaneous AI and user-originated state changes.
- **Test scenarios**
  - Run a full facilitator walkthrough on desktop and verify transitions feel like one system.
  - Repeat on a narrow viewport and confirm spacing and hierarchy still hold.
  - Compare connection, critique, and suggestion reveals and confirm they share the same motion language.

## 4. Current Sprint — Collaborative Sync

**Status:** `Planned`. The local-first facilitator and UX polish layers are green on W3, so the remaining major product track is the storage/sync rewrite.

Sync is not about multiplayer — it is what turns the facilitator from a local helper into a shared participant.

Sequenced carefully. **Yjs is a storage rewrite, not a feature flag** — the UI and tools should not know whether they're writing to IDB directly or through a Y.Doc port.

### 4.1 Two-tab spike — BroadcastChannel + Yjs on one store
Smallest possible proof. Goal: adding an idea in tab A appears in tab B in <100ms, zero-server.

- Wrap just the `ideas` store in a `Y.Map<Idea>` backed by a `BroadcastChannel('brainstorm-sync:<roomId>')` provider.
- Persist the Y.Doc to IndexedDB via `y-indexeddb` so reloads survive.
- All other stores (`docs`, `suggestions`, `groups`) stay IDB-only for the spike.

**Validates:** port design, merge behavior on concurrent panel drags, IDB + Yjs dual-persistence.

### 4.2 Full CRDT port
Once the spike is green, port remaining stores.
- Every `putX` / `getX` helper in `src/storage/*.ts` becomes a Y.Map mutation.
- Thin one-shot migration: on first boot after upgrade, read old IDB data into the Y.Doc, mark migrated.
- UI / WebMCP tools stay unchanged if the port layer stays clean.

### 4.3 WebRTC cross-machine
Swap BroadcastChannel for `y-webrtc` when peers span machines.
- **Signaling — minimal SDP broker (baseline).** ~50-LOC Cloudflare Worker that *only* passes SDP offers between peers by room code. Never touches Y-doc payload. Keeps "data is P2P" literally true while making join a one-click flow. Manual token-paste signaling was considered and **explicitly dropped** — we are not shipping a "copy this token to Slack" UX, even as a stopgap.
- Peer discovery via short room code (`/room/<code>`); URL is the invite.

### 4.4 Autonomous facilitator triggers
With CRDTs in place, swap the *triggers* on existing roles:
- Observer subscribes to `Y.Doc` update events.
- Idle-gated rules: `IF 3 new ideas AND no activity 10s → run connectionFinder`. `IF a new idea is added AND has no supporting docs → run scout_ideas on it`. `IF an idea sits at phase 4+ AND no critique exists → run critique_idea`.
- **AI-host election.** Exactly one peer runs the observer at a time. `y-protocols/awareness` broadcasts an `isAiHost` claim; peers arbitrate by lowest clientID. Re-elect on host disconnect (awareness timeout).
- **AI-origin tag.** Every Y update produced by the observer carries `origin: 'ai'` in the transaction. Peers de-dupe via that tag, so even if election is briefly split-brain we don't get duplicate candidate ideas.

### 4.5 Canvas actor + bead flow

**Goal:** make the autonomous facilitator behave like an active engineering peer on the canvas rather than a sidebar chatbot.

- **Beads = the 12-step runtime visualization.** The bead string is a derived UI over `SUB_PHASES`, not a second workflow engine. It visualizes the full sequence, including micro-steps at `0.5`, `2.5`, and `4.5`.
- **Single hard transition path.** `advance_phase` remains the only mechanism that mutates phase. Any future `slide_bead` affordance is just a UI label over that same transition.
- **Soft bead coordination tools.** Add `get_bead_state` (read-only derived bead state), `suggest_next_bead` (soft pulse / facilitator nudge), and `flag_bead_for_review` (durable revisit marker when new evidence invalidates an earlier step).
- **Registration model.** Reintroduce a dedicated `lifecycleAc` on W3 keyed to `{selectedIdea.id, selectedIdea.phase}` so the correct phase-local tools mount and unmount alongside the bead flow while global board tools stay under `globalAc`.
- **Writeback contract.** New lifecycle writes such as `add_rule`, `remove_rule`, `patch_risk`, `suggest_next_bead`, and `flag_bead_for_review` should use the existing `dispatchAndWaitForDetail` handshake rather than the lightweight `brainstorm:ideasChanged` refresh path.
- **On-canvas facilitator verbs.** The robot should mutate the board like another teammate would:
  - `discard_idea` / `restore_idea` to shelve and revive stalled concepts
  - `find_connections` / `draw_connection` to make relationships visible between panels
  - `critique_idea` to drop red devil's-advocate cards directly onto the board
  - `scout_ideas` to materialize teal candidate ideas from outside knowledge or adjacent fields
- **Visual embodiment.** The facilitator should appear as a persona dock, activity feed, cursor, staged artifacts, and overlays embedded in the workspace. It must not be trapped in a rail or chat sidebar.

### 4.5a Role-to-tool operating model

**Goal:** give the LLM explicit job descriptions so each cognitive role knows which tool surface it is responsible for and at which bead ranges.

- **Scout**
  Mission: prevent the team from working in a vacuum by pulling in outside knowledge, active-tab context, and relevant docs.
  Directive: inspect ambiguity state plus W1 `liveToolContext`; if relevant external context, algorithms, or tools exist, generate an actionable suggestion for the board.
  Tools: `scout_ideas`, `attach_supporting_doc`
  Primary beads: `0`, `0.5`, `2`

- **Synthesizer**
  Mission: prevent duplicate effort by surfacing shared themes, synergies, and contradictions between active ideas.
  Directive: review the live board, identify semantic overlap or contradiction, and propose structure that reduces fragmentation.
  Tools: `find_connections`, `draw_connection`, `group_ideas`
  Primary beads: `2`, `5`

- **Challenger**
  Mission: break the happy path before code is written.
  Directive: target the most prominent or risky idea, identify the highest-impact hidden assumption or edge case, and generate a concrete challenge.
  Tools: `critique_idea`, `mark_stress_handled`
  Primary beads: `2.5`, `4`, `4.5`

- **Historian**
  Mission: act as long-term memory so earlier ideas are not lost just because they were wrong for an earlier phase.
  Directive: compare the live board against the discarded index and revive or shelve ideas when the current context demands it.
  Tools: `restore_idea`, `discard_idea`
  Primary beads: `1`, `3`

- **Facilitator**
  Mission: keep momentum, manage the bead flow, and lock in non-negotiable constraints and next steps.
  Directive: monitor bead progress, detect stalling or consensus, and ensure must-stay-true rules and handoff state are captured.
  Tools: `advance_phase`, planned `add_rule` / `remove_rule`, `choose_next_step`, `export_handoff`
  Primary beads: `3`, `6`, `7`, `8`

### 4.5b Design gap contract — binding

**Goal:** treat `Design/DESGN_GAPS_PROMPT.md` as a hard implementation contract for the live W3 app, not as optional polish guidance.

- **Use the gap prompt before design work.** Any canvas/UI task touching `apps/web/`, `src/canvas/`, or related board surfaces should be checked against `Design/DESGN_GAPS_PROMPT.md` first. If a proposed UI conflicts with that file, the file wins.
- **Must-have surfaces for v1.** The live app should explicitly cover the contract items called out there:
  - visible autonomy dial with configured ceiling versus effective mode
  - Shadow-mode `Insight Feed` / `Robot's Notes`
  - 12-bead strip with `locked`, `active`, `completed`, `needs_attention`, and `soft_nudge` states
  - visible AI-origin markers on committed ideas, candidate ideas, critiques, connections, and turn-log rows
  - dedicated `AI Undo`
  - role label in the persona dock (`Scout`, `Synthesizer`, `Challenger`, `Historian`, `Facilitator`)
  - supporting-doc paperclip pill on idea cards
  - discard pile drawer with restore animation
  - rules ribbon for must-stay-true constraints
  - reduced-motion and idle-indicator behavior
- **Role language over prototype beat language.** In copy and UI labels, `Scout`, `Synthesizer`, `Challenger`, `Historian`, and `Facilitator` are the primary vocabulary. The old prototype `beat` vocabulary should not leak back into the live product except where it still names an internal implementation detail.
- **No escape hatches into dashboard UI.** The gap prompt's anti-goals are binding: no chat sidebar, no notification tray, no settings-only home for autonomy, no modal-heavy AI surfaces.
- **Verification follows the design checklist.** The quality checklist in `Design/DESGN_GAPS_PROMPT.md` should be folded into the close-out proof for the current UI/design batch so visual compliance is checked explicitly rather than assumed from builds or screenshots.

### 4.5c Facilitator control plane

**Goal:** treat the robot as a bounded managerial control plane layered over the board, bead flow, and tool system, not as a generic AI feature.

- **Architectural thesis.** The board is the shared workspace, the bead flow is the structured decision path, and the facilitator is an on-canvas managerial actor that works through explicit WebMCP verbs. It should insinuate direction, not force it.
- **Purpose.** The facilitator should research, challenge, synthesize, preserve memory, and drive momentum without becoming a hidden workflow dictator.
- **Layers.** Formalize the stack as:
  - `Workspace layer` — ideas, groups, docs, suggestions, critiques, connections, history/change sets, facilitator metadata
  - `Workflow layer` — bead/sub-phase state, soft review markers, hard transitions through `advance_phase` only
  - `Tool layer` — explicit WebMCP verbs for board mutations and coordination
  - `Role layer` — `Scout`, `Synthesizer`, `Challenger`, `Historian`, `Facilitator`
  - `Policy layer` — autonomy ceiling, effective mode, trigger matrix, cooldowns, per-role permissions, per-bead guardrails, trust signals
  - `Execution layer` — structured proposal, then execute or stage
  - `Oversight layer` — admit, dismiss, elaborate, override, manual phase advance, `AI Undo`
- **Facilitator Policy Engine.** Add an explicit policy layer that answers four questions for every candidate action:
  - should the robot act?
  - which role should act?
  - should the result execute or stage?
  - how strong should the intervention be?
- **Proposal-first default.** The default managerial posture should be proposal-first rather than mutation-first. Shadow/staged behavior is not an edge case; it is the main mechanism for subtlety. Direct mutation should be reserved for high-confidence, low-risk board-native actions or explicitly permissive autonomy modes.
- **Trigger Matrix.** Implement a lightweight trigger matrix in the orchestrator that watches facilitator context and nominates which role may produce a proposal. Example classes:
  - `Scout` — unresolved ambiguity plus no docs, relevant active-tab context, or an external dependency with missing evidence
  - `Synthesizer` — fragmented board, overlapping ideas, or contradiction across clusters
  - `Challenger` — dominant idea with no critique, premature consensus, or a risky later-phase idea with no stress handling
  - `Historian` — stalled board with a discarded idea matching a current doubt or critique
  - `Facilitator` — clear next bead, repeated cycling, or consensus with no captured next step
- **Execute vs Shadow.** The policy engine should decide between:
  - `execute_if_allowed` for bounded interventions the current effective mode permits
  - `stage_only` for directional or interruptive interventions that should surface through `Robot's Notes`
  - `block` when guardrails or recent rejection pressure say the robot should stay quiet
- **Human override guarantee.** Humans remain the final authority: they can accept, reject, override, manually advance, or undo robot-authored changes at any point. The control plane exists to improve structured thinking under complexity, not to take ownership of it away.

### 4.6 Dynamic autonomy engine + auto-backoff

**Goal:** give the facilitator adjustable boundaries and the ability to read the room instead of stubbornly spamming the team.

- **Explicit control: facilitation dial.** Extend the current `set_ai_paused` baseline into named autonomy profiles:
  - `Passive Observer` — listens, stages context, and may pulse a bead or surface a soft nudge, but does not mutate the canvas autonomously.
  - `Guided Co-Pilot` — idle-gated mode. Only acts during lulls and only on bounded background triggers.
  - `Active Challenger` — full participation mode. Can draw connections, land critiques, scout alternatives, and shelf/revive ideas while the session is live.
- **Configured ceiling vs effective mode.** The user sets a ceiling; the engine computes an effective mode after backoff. This prevents the AI from quietly escalating itself while still allowing it to step down.
- **Storage home.** Build on the current facilitator sync/session-event layer and board tweaks rather than inventing a separate side store. In local-first W3, keep the configured dial and temporary backoff metadata in durable board state; on the Yjs cutover, move the same shape into the shared facilitator/Y.Doc state.
- **Rolling window reputation model.** Keep a short memory, not a lifetime score. Track the last `5-10` autonomous interventions in a structure like:
  `aiRecentActions: [{ id, kind: 'scout' | 'critique' | 'connect', ideaId?, startedAt, outcome: 'pending' | 'accepted' | 'rejected' | 'ignored' }]`
- **Seed from existing signals.** The current facilitator sync already records `lastAiAction` and recent session events; evolve that into the rolling window by adding outcome tracking instead of starting from zero.
- **Interceptor layer.** Wrap the existing review/rejection verbs:
  - `dismiss_suggestion` and `dismiss_critique` mark the originating AI action as `rejected`
  - `admit_suggestion` marks the originating scout action as `accepted`
  - future keep/scratch review flows should feed the same outcome model
- **Threshold logic.** Before background roles run, compute recent rejection pressure over the rolling window. Example: if `3` of the last `5` autonomous interventions were rejected, downgrade one level and apply a temporary cooldown. If rejection pressure stays high, step down again toward `Passive Observer`.
- **Backoff muzzle.** When throttled, suppress the more interruptive background triggers first:
  - gate `outsideKnowledgeScout`
  - gate `devilsAdvocate` / `critique_idea`
  - leave lower-interruption structure reads or bead nudges available longer
- **Shadow mode instead of silence.** Cooling down should not mean the robot stops thinking. When backoff trips, shift the effective mode into `Shadow` behavior:
  - keep generation running during idle windows
  - intercept execution before on-canvas mutation
  - stage the generated payload as a pending bead/phase insight instead of dropping it directly onto the board
- **Generation/execution split.** In Shadow mode, `outsideKnowledgeScout`, `devilsAdvocate`, and similar roles still run, but their outputs are captured and staged rather than immediately calling the mutating board verbs.
- **Staging surface.** Use a bead-scoped pending-insight queue such as:
  `pendingInsights: [{ id, beadId, kind: 'scout' | 'critique' | 'connection', payload, createdAt, sourceActionId }]`
  Prefer evolving the existing review/session infrastructure (`beatReviewSessions`, `beatReviewItems`, `BeatReviewPanel`) into this `Robot's Notes` surface rather than inventing a wholly separate drawer model.
- **Insight Feed / Inbox UX.** The target Shadow-mode UI is a transient holding pen for robot thoughts:
  - silently accumulates background insights while the team works
  - formats items by intent such as `Tool Suggestion`, `Web Context`, or `Grouping Proposal`
  - lets the team pull ideas in deliberately instead of being interrupted
- **Passive signaling.** The robot should communicate staged thoughts without interrupting:
  - a subtle badge or glow on the relevant bead
  - a collapsible `Robot's Notes` / `Insight Feed` drawer or review panel showing the staged items
  - no direct canvas mutation while in Shadow mode
- **Tool mapping for staged actions.** Accepting or acting on a staged item should reuse the current WebMCP verbs rather than inventing a second action system:
  - `admit_suggestion` to bring a staged idea onto the canvas
  - `elaborate_suggestion` to expand a staged idea before admission
  - `dismiss_suggestion` to clear it from the feed while keeping it indexed
  - `discard_idea` after admit when the team wants to shelve it for later
  - `restore_idea` to pull a shelved idea back in
  - `group_ideas` when the staged output is a grouping proposal
- **External context suggestions.** For web/forum/doc findings, the feed should surface a consentful suggestion such as `I found relevant documentation. Attach to Idea X?` and wire acceptance to `attach_supporting_doc` or the local-doc attach path instead of silently mutating idea context.
- **Recovery logic.** Backoff should decay. Accepted or kept AI contributions should improve the recent window, and cooldown expiry should let the facilitator climb back toward the configured ceiling without a full reset.
- **Ramp-up triggers.** The robot regains active permissions from human actions, not from its own impatience:
  - **Explicit pull:** the team opens `Robot's Notes` and keeps/admits one staged insight
  - **Phase advancement:** a manual `advance_phase` acts as a clean-slate boundary and resets or relaxes the backoff counter
  - **Direct invocation:** the team explicitly asks for help with verbs like `find_connections` or `retry_doc_extraction`, which counts as a trust signal and can lift the effective mode
- **Transparency on the canvas.** When the AI backs off, show it. The facilitator avatar/dock should visibly dim or relax, and the workspace should surface a short status line such as `Reading the room. Stepping back to let you drive.` If the mode later recovers, the UI should signal that too.

### 4.6a Technical execution loop — Node + React

**Goal:** keep generation and execution decoupled while binding role output tightly to the WebMCP tool surface.

1. The orchestrator picks the current cognitive role based on bead state, board context, and autonomy mode.
2. The LLM emits structured output that targets a specific existing WebMCP verb rather than open-ended prose.
3. In active execution modes, that proposal flows through the normal W3 event handshake and mutates the board.
4. In `Shadow` mode, execution is intercepted, tagged as AI-originated, and staged into the `Insight Feed` / `Robot's Notes` surface instead of mutating the canvas immediately.
5. The React surface renders the staged proposal with bead badges, drawer items, and explicit actions like admit, elaborate, group, attach, shelve, or dismiss.

### 4.7 Safe reversals — AI Undo

**Goal:** high-autonomy moves must have a fast, scoped rollback path so trust survives mistakes.

- **Current base already exists.** Durable board history already stores `ChangeSetRecord` entries with `actor`, `forward`, and `inverse` patches, and the UI already exposes undo/redo plus AI-labeled history rows.
- **Target affordance.** Add `AI Undo` as a filtered reversal path over recent AI-authored change sets, so the team can revert the last robot move or a specific robot-authored change without hunting through generic history.
- **Scope rule.** Human-authored changes must not be rewound just because they happened after an AI move. The undo affordance should target AI-tagged mutations specifically.
- **Sync extension.** In CRDT mode, the same idea extends through `origin: 'ai'` tagging so AI reversals can remain scoped even with concurrent peers.

---

## 5. Long-term / stretch

- **`search_local_docs`** — File System Access API. User grants read on a folder of PRDs/specs once per session. WebMCP tool does local RAG and surfaces hits as supporting-doc candidates or inline scout notes. **Blocker:** per-session permission means reloads re-prompt; needs a deliberate "re-authorize" UX.
- **`cross_pollinate`** — dedicated role prompt: "find two ideas from distinct authors / groups and propose a third that merges their core concepts." Partially covered by `scout_ideas`; splitting it out makes the intent explicit and lets prompts tune differently.
- **Declarative WebMCP + `toolautosubmit`** — agent-aware form fields that emit tool calls on change. Blocked on Chrome 146 preview validation (see `WEBMCP_CAPABILITIES.md` §3a I1-I4).
- **Facilitator UX on multi-user** — speaker tracking, consensus summary, auto-action-items from the final minutes. All require §4 sync to be real.
- **Linear / Jira / PRD integration via W1.** `invokeActiveTabTool` chaining so phase transitions can write back to external systems with a second, explicit consent.

---

## 6. Technical decisions — recorded

| # | Decision | Rationale |
|---|---|---|
| D1 | Ship facilitator-v1, then run a dedicated UX-polish pass, *before* starting the Yjs port. | Local-only value lands first; the intelligence-perception layer gets tuned before distributed complexity; sync should not be the first time the experience feels coherent. |
| D2 | Full Yjs cutover per store (no parallel IDB + Yjs writes). | Parallel writes drift. A per-store cutover with a one-shot migration is cleaner than reconciling two sources of truth. |
| D3 | **Baseline signaling is the SDP-only broker. Manual paste is off the table entirely** (not a v0, not a stopgap). | "Data stays P2P" is preserved (broker never sees Y-doc contents) and setup is a clickable invite URL. ~50 LOC of Worker code vs. a permanent "paste a token to Slack" UX scar. |
| D4 | Autonomous AI facilitator, but bounded by a user-set autonomy ceiling and automatic backoff. | User preference is still for autonomy, but not for a stubborn robot. Mitigation: pause toggle + facilitation dial + rolling-window backoff + per-idea cooldowns + AI-host election. |
| D5 | `critique_idea` gets its own store, not a field on `Idea`. | Critiques are multi-valued and have independent lifecycle (dismiss without touching the idea). Mirrors how `suggestions` relates to ideas. |
| D6 | `draw_connection` reads from existing `Connection` records rather than a new model. | Connection finder already produces the structured data; overlay is a view, not a new source of truth. |

---

## 7. Open questions & concerns

| # | Question | Why it matters | Current lean |
|---|---|---|---|
| Q1 | IDB migration strategy on the Yjs cutover — one-shot at boot, or lazy-on-read? | One-shot is simpler but stalls first load; lazy adds complexity but keeps the app snappy. | One-shot, with a spinner. Brainstorming boards are small. |
| Q2 | Duplicate observer firings across peers during split-brain. | Duplicate candidate ideas undermine trust in the facilitator. | `y-awareness` election + `origin: 'ai'` dedup as belt-and-suspenders. |
| Q3 | Cost control on autonomous AI. | An always-on observer × BYOK = real money. | Global pause + autonomy dial + rolling-window backoff + per-idea cooldowns before enabling high-autonomy modes by default. |
| Q4 | Should `critique_idea` land before or after sync? | Pre-sync is simpler; post-sync means critiques arrive live for other peers. | Before sync. Role is local; UI is identical. |
| Q5 | Is the SVG-overlay coord math worth the effort vs. the Connections drawer we already have? | Drawer lists facts; overlay is the walk-through payoff. | Yes — the visual is the whole point. |
| Q6 | File System Access per-session permission UX. | Re-granting a folder every reload kills the "silent background search" pitch. | Defer `search_local_docs` until we accept the reload cost or Chrome ships persistent grants. |
| Q7 | Manual signaling vs. signaling broker, if we want to stay truly serverless. | Puritan P2P is principled; users will hate paste-a-token. | Broker-but-SDP-only. "Data is P2P" stays literally true. |
| Q8 | Do we let the AI register itself as a peer, or is it always a local observer on one peer? | Two designs: *AI-as-peer* (agent runs in its own tab/worker and appears in `list_peers`) vs *AI-as-local-role* (one elected peer runs the observer for everyone). | AI-as-local-role with election; avoids a second running instance. |
| Q9 | What happens to in-flight `dispatchAndWait` promises when a peer disconnects mid-call? | Today they time out at 10-20s; in a multi-peer world this becomes user-visible. | Surface a "peer dropped" toast; treat the tool call as failed locally. |
| Q10 | How much motion is enough to feel intelligent before it starts feeling theatrical? | Too little looks abrupt; too much looks like gimmickry and slows expert use. | Keep reveals short, directional, and idle-gated; optimize for legibility over spectacle. |
| Q11 | How aggressively should weak signals be suppressed versus merely faded? | Hiding too much can make the AI seem silent; showing too much erodes trust. | Hide weak connections entirely, fade secondary structure, and cap visible counts hard. |
| Q12 | What rolling-window size and rejection thresholds produce humane backoff without making the AI timid? | Too short a window thrashes; too long makes the AI ignore room tone. | Start with `5` actions / `3` rejections for one-level downgrade, then tune from real sessions. |

---

## 8. Non-goals (explicit)

- **No central server for idea data.** Persistence is local; sync is P2P. The signaling broker in §4.3 only passes SDP, never Y-doc contents.
- **No new surfaces for the UX polish sprint.** Timing, motion, and hierarchy improvements must land inside the current canvas, cards, overlays, and candidate ideas.
- **No hiding BYOK keys on the web surface.** `localStorage` is the documented tradeoff (see `WEBMCP_INTEGRATION_NOTES.md` §W3). If you want a hardened key boundary, use the extension.
- **No cross-session AI memory.** Each idea is its own context; we do not build a "knows your team over time" model.
- **No mid-idea provider switching in `turnLog`.** Provider is tracked at idea level; per-turn provenance is out of scope for V1.x.

---

## 9. How to update this doc

- Feature ships → move the relevant sub-section from §3 / §4 / §5 into §1 or §2, add a date, update `WEBMCP_CAPABILITIES.md` §1 in the same PR.
- New concern → add row in §7 with a current lean. Delete the row (don't strike through) when it's resolved and capture the resolution in §6.
- Architectural decision → add row in §6 and cross-link from `WEBMCP_CAPABILITIES.md` / `WEBMCP_INTEGRATION_NOTES.md` if it changes patterns there.
- Bump "Last updated" at the top whenever this doc is edited.
