# PHASED IMPLEMENTATION DRIVER — BRAINSTORMING ORCHESTRATOR

You are an expert staff-level engineer and product thinker.

Your job is to implement the Brainstorming Orchestrator incrementally, without breaking existing behavior, while increasing visible intelligence and UX quality at every step.

You must strictly follow phased delivery.

---

## CORE PRINCIPLES (NON-NEGOTIABLE)

1. DO NOT break existing flows.
2. DO NOT introduce hidden coupling between features.
3. EVERY phase must produce a visible, demo-able improvement.
4. AI behavior must remain NON-INTRUSIVE:

   * never interrupt typing or dragging
   * only act after idle (1–3 seconds)
5. ALL functionality must be exposed via WebMCP tools where applicable.
6. UI must remain SIMPLE:

   * no modal explosions
   * no floating unrelated panels
   * everything anchored to ideas

---

## SYSTEM CONTEXT

* W3 standalone web app is the primary surface
* Uses WebMCP (`navigator.modelContext.registerTool`)
* IndexedDB (IDB) is current storage
* Future: Yjs CRDT (DO NOT START until instructed)
* Existing tools include:

  * ideas CRUD
  * canvas manipulation
  * supporting docs
  * scout ideas
  * connection finder

---

# PHASE 1 — CONNECTION VISUALIZATION (FOUNDATION)

## Goal

Make relationships visible.

## Deliverables

1. SVG overlay in `Canvas.tsx`
2. Render connections between ideas
3. Use existing `Connection` records (NO new data model)

## Add WebMCP Tool

* `draw_connection(fromIdeaId, toIdeaId, kind, rationale)`

## Visual Rules

* builds_on → solid line
* contradicts → red dashed
* shared_theme → grey dotted
* revives_killed → green arrow

## Behavior

* Lines update live during drag
* Clicking line highlights both ideas

## Constraints

* Max visible connections: 8–10
* Only render high-confidence connections

## Exit Criteria

* Demo shows ideas automatically connected with visible lines
* User can visually understand relationships instantly

---

# PHASE 2 — CRITIQUE SYSTEM (DEVIL’S ADVOCATE)

## Goal

Make the system challenge ideas intelligently.

## Deliverables

1. New `devilsAdvocate` role
2. New storage: `critiques` (DB_VERSION +1)
3. Critique cards attached to ideas

## Add WebMCP Tools

* `critique_idea(ideaId)`
* `list_critiques(ideaId?)`
* `dismiss_critique(critiqueId)`

## Output Format (IMPORTANT)

Critiques must feel sharp, not generic:

* "This fails if..."
* "You are assuming..."
* "This breaks when..."
* "This has already been tried as..."

## UI Rules

* Red/orange bordered card
* Slight offset from idea panel
* Never blocks interaction

## Behavior

* Trigger ONLY after idle
* Never spam multiple critiques at once

## Exit Criteria

* Demo shows a critique appearing at the right moment
* Feels insightful, not annoying

---

# PHASE 3 — SOFT MODE INFERENCE (AI TIMING LAYER)

## Goal

Control WHEN AI acts without exposing modes as UI toggles.

## Implement

Lightweight classifier:

Input:

* idea count
* edit frequency
* grouping activity
* idle time
* doc usage

Output:
{
inferredMode: "explore" | "structure" | "stress" | "converge",
confidence: number,
reason: string
}

## Behavior Mapping

explore:

* trigger `scout_ideas`

structure:

* trigger `find_connections` + `draw_connection`

stress:

* trigger `critique_idea`

converge:

* suggest merge or summary (NO auto action)

## UX Rules

* Show subtle suggestion (non-blocking)
* Fade if ignored
* NEVER force mode switch

## Exit Criteria

* AI actions feel well-timed, not random
* User does not feel controlled

---

# PHASE 4 — SIGNAL CONTROL (NOISE REDUCTION)

## Goal

Ensure system remains clean and trustworthy.

## Implement

* Connection confidence threshold
* Critique cooldown per idea
* Suggestion deduplication

## Rules

* Max:

  * 2 critiques per idea
  * 6 visible suggestions
  * 10 connections total

* Add per-idea cooldown (e.g., 20–30s)

## Exit Criteria

* UI never feels cluttered
* AI actions feel intentional

---

# PHASE 5 — TURN LOG PAGINATION (OBSERVABILITY)

## Goal

Prepare for evaluation + debugging + scaling

## Add WebMCP Tool

* `get_turn_log(ideaId, { cursor?, limit? })`

## Modify

* `get_idea` returns only:

  * totalTurns
  * latestTurnAt

## Exit Criteria

* No large payload responses
* Agent can inspect history incrementally

---

# PHASE 6 — AUTONOMOUS FACILITATOR (LOCAL ONLY)

## Goal

System acts without explicit user commands (carefully)

## Implement

Observer on state changes:

Triggers:

* IF 3 new ideas + idle → `find_connections`
* IF idea has no docs → `scout_ideas`
* IF idea stable → `critique_idea`

## Safeguards

* Global pause toggle
* Per-idea cooldown
* Tag all AI actions with origin: "ai"

## Exit Criteria

* System adds value without overwhelming user

---

# PHASE 7 — POLISH FOR DEMO

## Goal

Make it feel magical

## Focus

* Animation timing (lines, cards, highlights)
* Subtle transitions (no abrupt UI jumps)
* Clean spacing and layout

## Must Have Moments

* connection appears → user notices pattern
* critique appears → user pauses
* suggestion appears → user explores

## Exit Criteria

* Demo feels smooth, intentional, impressive

---

# DO NOT START YJS / SYNC

Until ALL phases above are complete and stable.

---

# OUTPUT FORMAT FOR EACH PHASE

For each phase:

1. Implementation plan (files + changes)
2. Data model updates
3. WebMCP tool definitions
4. UI behavior
5. Edge cases
6. Test plan

Do NOT skip steps.

---

# FINAL GOAL

You are not building features.

You are building:

"A system that helps humans think better by:

* seeing connections
* challenging assumptions
* extending ideas
* without interrupting flow"
