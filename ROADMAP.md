# Brainstorming Orchestrator — Roadmap

**Status:** living doc — update whenever a feature ships, a plan shifts, or a concern resolves.
**Last updated:** 2026-04-17 (Facilitator Mode + UI/UX Polish shipped; Current Sprint = Collaborative Sync; signaling baseline = SDP broker)

This doc is the forward-looking plan. It consolidates the shipped facilitator baseline, the immediate UI/UX polish pass, and the collaborative-sync track (BroadcastChannel → Yjs CRDT → WebRTC, with an autonomous AI facilitator). For *what exists today at tool granularity* see `WEBMCP_CAPABILITIES.md`; for *why* integration patterns look the way they do see `WEBMCP_INTEGRATION_NOTES.md`.

### Track posture
- **W3 (standalone web app) — primary engine.** All new feature work lands here. Port 6611 bypasses extension-origin unknowns.
- **W1 (active-tab consumption) — maintained.** On-demand `chrome.scripting.executeScript({ world: 'MAIN' })` only. Persistent content scripts are **not** an option and will not be revisited.
- **W2 (extension-origin expose) — iced.** All expose work on `chrome-extension://` is paused pending Chrome 146+ spec stabilization. Existing code stays dead-loaded as a future pickup point.

---

## 0. Doc map (where to look)

| Doc | Scope |
|---|---|
| `README.md` | Chrome extension install / build / BYOK / usage for the 8-phase pipeline. |
| `WEBMCP_README.md` | WebMCP-specific overview and full tool inventory for the web-app surface (23 global + 10 lifecycle). |
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
- **W2 expose (iced — see Track posture above):** `registerPanelTools.ts` + `registerPhaseTools.ts` are code-complete and type-safe but stay unmounted; no further effort until Chrome 146+ stabilizes `chrome-extension://` origin support. See `WEBMCP_SPIKE.md` for the preserved contingency tree.

### 1.2 Standalone Web App (`apps/web/`, port 6611)
- Same `src/` codebase behind a `chrome.*` shim. `npm run dev:web`.
- **23 global + 10 lifecycle WebMCP tools** registered via `navigator.modelContext.registerTool`. Full inventory in `WEBMCP_CAPABILITIES.md` §1a.
- **Free-form canvas.** Drag, drop, group by proximity, merge by 2s overlap-hold.
- **Supporting docs** with `docFactExtractor` role; facts feed phase prompts.
- **Discard pile** — soft-delete that stays indexed so scout / connection finder can still see it. `discard_idea` / `restore_idea` / `list_discarded_ideas`, plus right-click context menu on panels.
- **Cross-board connections.** `find_connections` runs the `connectionFinder` role; emits structured `Connection` records (`builds_on`, `contradicts`, `revives_killed`, `shared_theme`) with strength + rationale. Rendered as a collapsible top-right drawer; click a row → canvas flash.
- **Outside-knowledge scout.** `scout_ideas` runs the `outsideKnowledgeScout` role; materialises up to 6 pending `ScoutSuggestion` rows and paints them as dashed teal **ghost panels**. Admit / Elaborate / Dismiss.

### 1.3 Storage
- IndexedDB via `idb` (`DB_VERSION 4`) — stores: `ideas`, `groups`, `docs`, `suggestions`.
- `chrome.storage.local` (or `localStorage` via shim) for settings + BYOK credentials.
- `chrome.storage.session` (or `sessionStorage`) for popup → side-panel handoff.

### 1.4 Known constraints
- **V1 = single-user, local-only.** No sync, no multi-peer.
- **W2 is iced.** No further effort on exposing tools via `chrome-extension://` until Chrome 146+ stabilizes. Contingency tree preserved in `WEBMCP_SPIKE.md` for future pickup.
- **BYOK on the web app lives in `localStorage`.** Documented tradeoff (`WEBMCP_INTEGRATION_NOTES.md` §W3).

---

## 2. Shipped — Facilitator Mode v1

**Status:** shipped on the W3 standalone web app. This is now the stable baseline for the next pass: visible connections, anchored critiques, bounded signal control, paginated turn logs, and local-only facilitator automation.

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
- **UI:** red-bordered critique card pinned next to the target panel. Not a ghost — this is *about* an existing idea, not a proposed new one.
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

**Status:** shipped on the W3 standalone web app. No new surfaces were added; the work stayed inside the existing canvas, critiques, ghost suggestions, and local facilitator timing.

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
  - Suggestion overflow while the user is already inspecting one ghost panel.
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
  - Normalize spacing and alignment between cards, overlays, and ghost suggestions.
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

**Status:** next executable workstream. The local-first facilitator and UX polish layers are green on W3, so the remaining major product track is the storage/sync rewrite.

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
- **AI-origin tag.** Every Y update produced by the observer carries `origin: 'ai'` in the transaction. Peers de-dupe via that tag, so even if election is briefly split-brain we don't get duplicate ghost panels.

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
| D4 | Autonomous AI facilitator, not user-triggered. | User preference. Mitigation: global pause toggle + per-idea cooldowns + AI-host election so only one peer runs the observer. |
| D5 | `critique_idea` gets its own store, not a field on `Idea`. | Critiques are multi-valued and have independent lifecycle (dismiss without touching the idea). Mirrors how `suggestions` relates to ideas. |
| D6 | `draw_connection` reads from existing `Connection` records rather than a new model. | Connection finder already produces the structured data; overlay is a view, not a new source of truth. |

---

## 7. Open questions & concerns

| # | Question | Why it matters | Current lean |
|---|---|---|---|
| Q1 | IDB migration strategy on the Yjs cutover — one-shot at boot, or lazy-on-read? | One-shot is simpler but stalls first load; lazy adds complexity but keeps the app snappy. | One-shot, with a spinner. Brainstorming boards are small. |
| Q2 | Duplicate observer firings across peers during split-brain. | Duplicate ghost panels undermine trust in the facilitator. | `y-awareness` election + `origin: 'ai'` dedup as belt-and-suspenders. |
| Q3 | Cost control on autonomous AI. | An always-on observer × BYOK = real money. | Global pause + per-idea cooldowns + `set_ai_paused` WebMCP tool before enabling autonomy by default. |
| Q4 | Should `critique_idea` land before or after sync? | Pre-sync is simpler; post-sync means critiques arrive live for other peers. | Before sync. Role is local; UI is identical. |
| Q5 | Is the SVG-overlay coord math worth the effort vs. the Connections drawer we already have? | Drawer lists facts; overlay is the walk-through payoff. | Yes — the visual is the whole point. |
| Q6 | File System Access per-session permission UX. | Re-granting a folder every reload kills the "silent background search" pitch. | Defer `search_local_docs` until we accept the reload cost or Chrome ships persistent grants. |
| Q7 | Manual signaling vs. signaling broker, if we want to stay truly serverless. | Puritan P2P is principled; users will hate paste-a-token. | Broker-but-SDP-only. "Data is P2P" stays literally true. |
| Q8 | Do we let the AI register itself as a peer, or is it always a local observer on one peer? | Two designs: *AI-as-peer* (agent runs in its own tab/worker and appears in `list_peers`) vs *AI-as-local-role* (one elected peer runs the observer for everyone). | AI-as-local-role with election; avoids a second running instance. |
| Q9 | What happens to in-flight `dispatchAndWait` promises when a peer disconnects mid-call? | Today they time out at 10-20s; in a multi-peer world this becomes user-visible. | Surface a "peer dropped" toast; treat the tool call as failed locally. |
| Q10 | How much motion is enough to feel intelligent before it starts feeling theatrical? | Too little looks abrupt; too much looks like gimmickry and slows expert use. | Keep reveals short, directional, and idle-gated; optimize for legibility over spectacle. |
| Q11 | How aggressively should weak signals be suppressed versus merely faded? | Hiding too much can make the AI seem silent; showing too much erodes trust. | Hide weak connections entirely, fade secondary structure, and cap visible counts hard. |

---

## 8. Non-goals (explicit)

- **No central server for idea data.** Persistence is local; sync is P2P. The signaling broker in §4.3 only passes SDP, never Y-doc contents.
- **No new surfaces for the UX polish sprint.** Timing, motion, and hierarchy improvements must land inside the current canvas, cards, overlays, and ghost suggestions.
- **No hiding BYOK keys on the web surface.** `localStorage` is the documented tradeoff (see `WEBMCP_INTEGRATION_NOTES.md` §W3). If you want a hardened key boundary, use the extension.
- **No cross-session AI memory.** Each idea is its own context; we do not build a "knows your team over time" model.
- **No mid-idea provider switching in `turnLog`.** Provider is tracked at idea level; per-turn provenance is out of scope for V1.x.

---

## 9. How to update this doc

- Feature ships → move the relevant sub-section from §3 / §4 / §5 into §1 or §2, add a date, update `WEBMCP_CAPABILITIES.md` §1 in the same PR.
- New concern → add row in §7 with a current lean. Delete the row (don't strike through) when it's resolved and capture the resolution in §6.
- Architectural decision → add row in §6 and cross-link from `WEBMCP_CAPABILITIES.md` / `WEBMCP_INTEGRATION_NOTES.md` if it changes patterns there.
- Bump "Last updated" at the top whenever this doc is edited.
