# Brainstorming Orchestrator — Roadmap

**Status:** living doc — update whenever a feature ships, a plan shifts, or a concern resolves.
**Last updated:** 2026-04-17 (Current Sprint = Facilitator Mode; Sync blocked on §2; signaling baseline = SDP broker)

This doc is the forward-looking plan. It consolidates facilitator-mode additions (devil's advocate, drawn connections, local-doc search, cross-pollination) and the collaborative-sync track (BroadcastChannel → Yjs CRDT → WebRTC, with an autonomous AI facilitator). For *what exists today at tool granularity* see `WEBMCP_CAPABILITIES.md`; for *why* integration patterns look the way they do see `WEBMCP_INTEGRATION_NOTES.md`.

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

## 2. Current Sprint — Facilitator Mode v1

**Status:** in flight. Lands on the W3 standalone web app; no sync dependency. §3 (Collaborative Sync) is **blocked** until everything below ships and stabilizes.

Three pieces ship together: the visual `draw_connection` overlay, the adversarial `critique_idea` role, and a paginated `get_turn_log` sidecar so the extra turn-log churn from the two new roles doesn't overflow agent responses.

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

## 3. Next — Collaborative Sync

**Blocked on:** §2 Current Sprint shipping and stabilizing. No Yjs work starts until Facilitator Mode is green on W3.

Sequenced carefully. **Yjs is a storage rewrite, not a feature flag** — the UI and tools should not know whether they're writing to IDB directly or through a Y.Doc port.

### 3.1 Two-tab spike — BroadcastChannel + Yjs on one store
Smallest possible proof. Goal: adding an idea in tab A appears in tab B in <100ms, zero-server.

- Wrap just the `ideas` store in a `Y.Map<Idea>` backed by a `BroadcastChannel('brainstorm-sync:<roomId>')` provider.
- Persist the Y.Doc to IndexedDB via `y-indexeddb` so reloads survive.
- All other stores (`docs`, `suggestions`, `groups`) stay IDB-only for the spike.

**Validates:** port design, merge behavior on concurrent panel drags, IDB + Yjs dual-persistence.

### 3.2 Full CRDT port
Once the spike is green, port remaining stores.
- Every `putX` / `getX` helper in `src/storage/*.ts` becomes a Y.Map mutation.
- Thin one-shot migration: on first boot after upgrade, read old IDB data into the Y.Doc, mark migrated.
- UI / WebMCP tools stay unchanged if the port layer stays clean.

### 3.3 WebRTC cross-machine
Swap BroadcastChannel for `y-webrtc` when peers span machines.
- **Signaling — minimal SDP broker (baseline).** ~50-LOC Cloudflare Worker that *only* passes SDP offers between peers by room code. Never touches Y-doc payload. Keeps "data is P2P" literally true while making join a one-click flow. Manual token-paste signaling was considered and **explicitly dropped** — we are not shipping a "copy this token to Slack" UX, even as a stopgap.
- Peer discovery via short room code (`/room/<code>`); URL is the invite.

### 3.4 Autonomous facilitator triggers
With CRDTs in place, swap the *triggers* on existing roles:
- Observer subscribes to `Y.Doc` update events.
- Idle-gated rules: `IF 3 new ideas AND no activity 10s → run connectionFinder`. `IF a new idea is added AND has no supporting docs → run scout_ideas on it`. `IF an idea sits at phase 4+ AND no critique exists → run critique_idea`.
- **AI-host election.** Exactly one peer runs the observer at a time. `y-protocols/awareness` broadcasts an `isAiHost` claim; peers arbitrate by lowest clientID. Re-elect on host disconnect (awareness timeout).
- **AI-origin tag.** Every Y update produced by the observer carries `origin: 'ai'` in the transaction. Peers de-dupe via that tag, so even if election is briefly split-brain we don't get duplicate ghost panels.

---

## 4. Long-term / stretch

- **`search_local_docs`** — File System Access API. User grants read on a folder of PRDs/specs once per session. WebMCP tool does local RAG and surfaces hits as supporting-doc candidates or inline scout notes. **Blocker:** per-session permission means reloads re-prompt; needs a deliberate "re-authorize" UX.
- **`cross_pollinate`** — dedicated role prompt: "find two ideas from distinct authors / groups and propose a third that merges their core concepts." Partially covered by `scout_ideas`; splitting it out makes the intent explicit and lets prompts tune differently.
- **Declarative WebMCP + `toolautosubmit`** — agent-aware form fields that emit tool calls on change. Blocked on Chrome 146 preview validation (see `WEBMCP_CAPABILITIES.md` §3a I1-I4).
- **Facilitator UX on multi-user** — speaker tracking, consensus summary, auto-action-items from the final minutes. All require §3 sync to be real.
- **Linear / Jira / PRD integration via W1.** `invokeActiveTabTool` chaining so phase transitions can write back to external systems with a second, explicit consent.

---

## 5. Technical decisions — recorded

| # | Decision | Rationale |
|---|---|---|
| D1 | Ship facilitator-v1 (`draw_connection`, `critique_idea`) *before* starting the Yjs port. | Local-only features, no sync dependency; users get value immediately; validates the canvas-overlay architecture for when sync lands. |
| D2 | Full Yjs cutover per store (no parallel IDB + Yjs writes). | Parallel writes drift. A per-store cutover with a one-shot migration is cleaner than reconciling two sources of truth. |
| D3 | **Baseline signaling is the SDP-only broker. Manual paste is off the table entirely** (not a v0, not a stopgap). | "Data stays P2P" is preserved (broker never sees Y-doc contents) and setup is a clickable invite URL. ~50 LOC of Worker code vs. a permanent "paste a token to Slack" UX scar. |
| D4 | Autonomous AI facilitator, not user-triggered. | User preference. Mitigation: global pause toggle + per-idea cooldowns + AI-host election so only one peer runs the observer. |
| D5 | `critique_idea` gets its own store, not a field on `Idea`. | Critiques are multi-valued and have independent lifecycle (dismiss without touching the idea). Mirrors how `suggestions` relates to ideas. |
| D6 | `draw_connection` reads from existing `Connection` records rather than a new model. | Connection finder already produces the structured data; overlay is a view, not a new source of truth. |

---

## 6. Open questions & concerns

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

---

## 7. Non-goals (explicit)

- **No central server for idea data.** Persistence is local; sync is P2P. The signaling broker in §3.3 only passes SDP, never Y-doc contents.
- **No hiding BYOK keys on the web surface.** `localStorage` is the documented tradeoff (see `WEBMCP_INTEGRATION_NOTES.md` §W3). If you want a hardened key boundary, use the extension.
- **No cross-session AI memory.** Each idea is its own context; we do not build a "knows your team over time" model.
- **No mid-idea provider switching in `turnLog`.** Provider is tracked at idea level; per-turn provenance is out of scope for V1.x.

---

## 8. How to update this doc

- Feature ships → move the relevant sub-section from §2 / §3 / §4 into §1, add a date, update `WEBMCP_CAPABILITIES.md` §1 in the same PR.
- New concern → add row in §6 with a current lean. Delete the row (don't strike through) when it's resolved and capture the resolution in §5.
- Architectural decision → add row in §5 and cross-link from `WEBMCP_CAPABILITIES.md` / `WEBMCP_INTEGRATION_NOTES.md` if it changes patterns there.
- Bump "Last updated" at the top whenever this doc is edited.
