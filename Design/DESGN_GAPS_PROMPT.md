# DESIGN GAPS + MUST-HAVES — Brainstorming Orchestrator

**Audience:** an LLM (or engineer) that will apply the visual design in this prototype to the real W3 web app (`apps/web/`).

**Context you must hold in your head before editing code:**
- The real app is a WebMCP-driven canvas app, not a chat UI.
- The LLM is a *role system*, not a chatbot: `Scout`, `Synthesizer`, `Challenger`, `Historian`, `Facilitator`.
- The board state is authoritative; the turn log is a view.
- Autonomy is graded: `Passive Observer` / `Guided Co-Pilot` / `Active Challenger`, with an auto-backoff that can drop effective mode into `Shadow`.
- 12 beads over `SUB_PHASES` drive the lifecycle; `advance_phase` is the *only* hard transition; `suggest_next_bead` and `flag_bead_for_review` are soft.
- Every mutation the AI makes must carry `origin: 'ai'` and be reversible via `AI Undo`.

If any design choice below conflicts with those invariants, the invariants win.

---

## 1. HOW TO USE THIS FILE

When I send you a design task, you must:

1. Read this file top to bottom before touching code.
2. Match the design against the **Must-haves** (§3) and the **Gap map** (§4). If a gap applies, resolve it using the listed strategy — do not invent a new pattern.
3. Use the **Visual contract** (§5), **Motion contract** (§6), and **Voice contract** (§7) as hard rules. They are not suggestions.
4. If a task can't be satisfied without violating a rule here, stop and flag it. Do not smuggle a chat sidebar into the app because the prompt asked for "where the AI talks."

---

## 2. WHAT THE DESIGN GETS RIGHT (keep these)

These are load-bearing. Do not regress.

- **On-canvas AI presence.** No sidebar chat. The persona dock, ghost stickies, margin-note critiques, connection overlay, and turn-log popover are the AI's whole UI.
- **Two interchangeable themes** (`theme-sketch`, `theme-whiteboard`) backed by one token set. Every new component must render in both.
- **Tombstone pattern for dismissals.** `dismissedCritiques`, `dismissedGhosts`, `deletedKeys` are arrays the user can undo. Nothing the AI places is hard-written until the human accepts it — ghosts → `admit_suggestion`, critiques → `critique_idea` (persists but is dismissable), connections → user can delete and the deletion sticks.
- **Four-kind connection vocabulary with distinct stroke treatments:** `builds_on` solid, `contradicts` red dashed, `shared_theme` grey dotted, `revives_killed` green arrow. Matches the implementation's `Connection.kind` enum exactly.
- **"Thinking beat" is visible.** Candidates appear, get scratched out, survivors commit. This is the visual contract for client-side confidence filtering — keep it.
- **Hand-drawn voice** (Kalam + Caveat) for content on the board. UI chrome stays in Inter. Mono for timestamps and log meta.

---

## 3. MUST-HAVES (non-negotiable for v1)

Any implementation pass must satisfy all of these. If one is missing, the design is incomplete.

### M1. Autonomy dial — visible, on-canvas, not a settings menu
The dial is a first-class UI affordance, not a preference toggle buried in Settings. Three named profiles must be reachable in two clicks from anywhere on the canvas:
- `Passive Observer` — staging only, no canvas mutation.
- `Guided Co-Pilot` — idle-gated actions during lulls.
- `Active Challenger` — full peer: draws connections, lands critiques, scouts alternatives.

The dial must show **configured ceiling** AND **effective mode** distinctly, because auto-backoff can drop effective below ceiling without the human noticing otherwise. Use a small secondary caption under the dial when they differ: `Ceiling: Active Challenger → Effective: Guided Co-Pilot (reading the room)`.

### M2. Shadow mode has a home — the Insight Feed
When the effective mode is throttled, the robot still thinks; it just stages output in the Insight Feed / Robot's Notes drawer instead of mutating the canvas. Design requirements:
- Collapsible drawer accessible from the persona dock. Never auto-opens.
- Items labeled by intent: `Tool Suggestion`, `Web Context`, `Grouping Proposal`, `Critique Draft`, `Scout Draft`, `Connection Draft`.
- Each item has explicit actions mapped to real WebMCP verbs: Admit (`admit_suggestion`), Elaborate (`elaborate_suggestion`), Attach (`attach_supporting_doc`), Group (`group_ideas`), Shelve (`discard_idea`), Dismiss (`dismiss_suggestion`).
- Passive canvas signal while items are staged: a subtle bead badge / persona-dock glow. No popups.

### M3. Bead flow — the 12-step visualizer
A persistent, compact bead strip (horizontal, top or bottom of canvas) representing the 12 `SUB_PHASES` entries. Per-bead states the design must render:
- `locked` (future, muted)
- `active` (current, pulsing subtle)
- `completed` (filled, checked)
- `needs_attention` (`flag_bead_for_review` result, small red dot)
- `soft_nudge` (`suggest_next_bead` result, gentle pulse; distinct from `active`)

Clicking a completed bead opens its recorded state (lenses, challenges, stress tests, etc.). The strip is observational — clicking does not transition; only `advance_phase` does that.

### M4. AI-origin tagging everywhere
Every surface that shows AI output must be identifiable as AI-authored at a glance:
- Ghost stickies: dashed border + peach color + small persona avatar chip.
- AI-committed ideas (post-thinking-beat): solid peach sticky with a small "by Dev" chip in the corner.
- Connections drawn by AI: identical stroke to user-drawn but with a tiny mid-path persona dot; hover reveals `origin: ai · rationale`.
- Critiques: always AI-authored; the red torn-paper note is the AI-origin signal.
- Turn-log rows: `origin` badge (`ai` / `user` / `edit`) in mono, left-aligned.

This is what makes `AI Undo` discoverable.

### M5. AI Undo — a filtered reversal affordance
Plain undo reverts *any* recent change. `AI Undo` reverts the last AI-authored change set only. Design a dedicated button in the persona dock labeled `Undo robot` (or `↶ robot`) that:
- Is enabled only when an AI-origin change exists in the recent history window.
- Tooltips the specific change that will be reverted (e.g., "Undo: Dev drew 'contradicts' between A and B").
- Never reverts user-authored changes made after the AI change; skips them.

### M6. Role-to-beat binding is legible
The persona dock should surface which role is active for the current beat, not just "Dev is thinking…". Use the role name inline: `Dev · Scout` / `Dev · Synthesizer` / `Dev · Challenger` / `Dev · Historian` / `Dev · Facilitator`. Role determines which verbs the robot can reach and what tone its output takes (§7).

### M7. Supporting docs are a first-class surface on the idea
Every idea panel must show:
- Paperclip pill with count (`📎 3` style, but use a real paperclip glyph, not emoji, unless the design system allows emoji).
- Click opens a compact docs popover anchored to the idea, not a global modal.
- Docs can be attached from the Insight Feed (`Attach to Idea X?`) or from the docs popover.

### M8. Discard pile — bottom-left drawer with recall
Discarded ideas do not vanish. They collapse into a bottom-left pile with a count. Clicking expands to a list. `Historian` role can surface "Should we revive this?" into the Insight Feed when context warrants. Restoring puts the sticky back at its last known position with a brief re-entry animation.

### M9. Reduced-motion honored globally
Under `prefers-reduced-motion`, the thinking beat compresses to ≤400ms total, scratch-out animation is skipped (strike-through appears instantly), connection draw is a fade-in not a stroke-dash. The design must not rely on motion alone to convey state — every motion pairs with a text label.

### M10. Idle-gating everywhere AI writes
AI never writes during typing, dragging, or within 1.2s of the last pointer/text event. Design must expose a visible idle indicator: a hair-thin progress bar under the persona avatar that fills from 0→1 during the 1.2–2.0s idle window, then triggers the beat. This makes the rhythm teachable; users learn when the robot will act.

---

## 4. GAP MAP — where the prototype diverges from the implementation

Each row: **gap → why it matters → resolution.**

### G1. Beat vocabulary mismatch
- **Gap:** the prototype talks about 5 "beats" (scout, connect, critique, cluster, summarise). The app uses 5 **roles** (Scout, Synthesizer, Challenger, Historian, Facilitator) that each own several WebMCP verbs across 12 beads.
- **Why:** a "beat" is a UI event; a role is an agent contract. Collapsing them loses the Historian (`restore_idea` / `discard_idea`) and the Facilitator (`advance_phase` / rule capture) entirely.
- **Resolution:** rename "beats" → "roles" in all copy, tokens, and component names. Use the role-to-tool map from `ROADMAP.md` §4.5a as the source of truth. Cluster becomes a Synthesizer output, not its own beat; summarise becomes a Facilitator action at beads 7/8, not a manual button.

### G2. No Insight Feed / Robot's Notes in the prototype
- **Gap:** the prototype's ghost stickies always land on the canvas. The real app has a Shadow mode that stages output in a drawer.
- **Why:** without this, the autonomy dial has no meaningful "down" state. `Passive Observer` becomes "do nothing" instead of "stage thoughts silently."
- **Resolution:** add the Insight Feed component per M2. Ghost stickies only materialize on the canvas in `Guided Co-Pilot` or `Active Challenger` effective modes. In any lower effective mode, they go to the feed with a bead-badge signal.

### G3. No autonomy dial visible on canvas
- **Gap:** the prototype assumes "the AI just does things." The real app has three profiles + auto-backoff.
- **Why:** without a dial, the human can't tune the robot, and can't see when backoff has throttled it.
- **Resolution:** add the dial per M1. Place it in the persona dock, top or right of the avatar. Reflect effective-vs-ceiling state with the caption pattern.

### G4. Bead flow not represented
- **Gap:** prototype shows a freeform canvas. Real app has 12 beads with lenses / challenges / stress tests / rules per bead.
- **Why:** without the bead strip, users can't see progress or find where they are in the structured flow. `suggest_next_bead` and `flag_bead_for_review` have no visual home.
- **Resolution:** add a compact horizontal bead strip per M3.

### G5. No visible AI-origin marker on connections/ideas
- **Gap:** the prototype renders AI-authored and user-authored stickies the same after commit.
- **Why:** `AI Undo` and trust hinge on provenance. Users need to distinguish at a glance.
- **Resolution:** follow M4's specifics — persona chip on committed AI stickies, mid-path persona dot on AI connections, `origin` badge in turn-log rows.

### G6. Turn log isn't paginated or filtered
- **Gap:** prototype shows a flat scrolling list. Real app has `get_turn_log(ideaId, {cursor, limit})`.
- **Why:** turn logs will get long fast with two new roles writing (Challenger + Synthesizer) per idea.
- **Resolution:** turn-log popover must:
  - page in 20s, "Load earlier" button at top
  - filter chips: `All` / `AI` / `User` / `Critique` / `Edit`
  - pin-to-top action per row
  - "Transfer to board" action that creates a new sticky on the canvas near the current idea (not replaces it)

### G7. No `AI Undo` affordance
- **Gap:** prototype has no dedicated undo for AI moves.
- **Why:** this is an explicit roadmap item (§4.7) and a trust-critical feature.
- **Resolution:** add per M5.

### G8. Critiques don't express role or strength
- **Gap:** prototype critiques are uniform red torn-paper notes with free text.
- **Why:** the `devilsAdvocate` role returns structured output: `{ risks[], hiddenAssumptions[], counterExamples[] }` with a strength score.
- **Resolution:** critique card gets:
  - a small header row: `Dev · Challenger` + strength dots (1–3)
  - the body can cycle between the three sub-types; if all three are present, use small tabs inside the card (`Risk · Assumption · Counter`)
  - `Dismiss` and `Handled` actions; `Handled` maps to `mark_stress_handled` at beats 4/4.5

### G9. Supporting docs aren't on idea cards
- **Gap:** prototype idea cards don't show an attached-docs count.
- **Why:** docs feed every phase prompt; their presence changes what the AI will do.
- **Resolution:** implement M7. Use a paperclip glyph + number. Clicking opens a popover, not a global modal.

### G10. Discard pile not designed
- **Gap:** prototype has no shelf for dismissed ideas.
- **Resolution:** implement M8 with a bottom-left collapsible drawer.

### G11. Scout ghost stickies don't carry confidence
- **Gap:** ghost stickies in the prototype are uniformly weighted.
- **Why:** client-side filtering depends on confidence; the thinking beat visualizes that filter.
- **Resolution:** ghost sticky shows a small confidence bar (thin, bottom edge, opacity encodes score). Low-confidence scratch-outs during the thinking beat should visibly correspond to low bars.

### G12. Peer presence (future sync) not accommodated
- **Gap:** prototype assumes single user. Sync is Planned, not Shipped, but the design should reserve space.
- **Resolution:** reserve a top-right peer chip row (avatars in a stack). Keep empty/hidden for v1; document the slot so future work doesn't have to relayout.

### G13. `add_rule` / MUST-STAY-TRUE rules not surfaced
- **Gap:** prototype has no UI for the "must-stay-true" rules the Facilitator locks in.
- **Why:** rules are injected into every future phase prompt; they're structurally important.
- **Resolution:** rules live in a pinned ribbon at the top of the canvas with max 5 visible ("+N more" overflow). Each rule is a compact chip: short text + origin badge + small × to remove. Adding a rule uses `add_rule`; removing uses `remove_rule`.

### G14. No visible signal-control / throttling state
- **Gap:** prototype doesn't indicate when connection/critique/suggestion caps are hit.
- **Resolution:** when a cap is hit, the persona dock shows a calm text line: `Holding 3 more thoughts in notes` (link to the Insight Feed). Never a modal.

---

## 5. VISUAL CONTRACT

Hard rules. Copy into the implementation tokens file verbatim.

### Palette (both themes share)
```
--ink: #1a1814
--ink-soft: #4a4640
--paper: #f6f1e4        (sketch)   / #f0ece0 (whiteboard)
--paper-dark: #ece6d6
--accent-contradict: #c94a3a        (critique, contradicts, needs_attention)
--accent-revives: #2f8f5e           (revives_killed, accept, handled)
--accent-shared: #8a8578             (shared_theme, muted structure)
--sticky-yellow: #f4d95b (user idea)
--sticky-blue:   #9ec5e8 (anchor / seed)
--sticky-green:  #9cd4a6 (AI-committed)
--sticky-peach:  #f3c596 (ghost / scout candidate)
--sticky-pink:   #f5a3b3 (contested)
--sticky-lilac:  #c7b5e5 (tangent)
```

### Stroke treatments for connections
- `builds_on`       → 2px solid `--ink`
- `contradicts`     → 2px dashed 8,5 `--accent-contradict`
- `shared_theme`    → 1.5px dotted 1,5 `--accent-shared`
- `revives_killed`  → 2px solid `--accent-revives` + arrowhead

### Typography
- Display / section heads: Caveat 32–68px
- Hand-writing on stickies: Kalam 14–16px
- UI chrome, turn log, settings, popovers: Inter 12–17px
- Timestamps, origin badges, tool names, codes: IBM Plex Mono 10–13px
- **Never use hand-drawn fonts for paragraphs.** Longer than two lines → Inter.

### Spacing / radii / shadow
- `--radius-sticky: 10px`, `--radius-md: 8px`, `--radius-sm: 4px`
- Sticky shadow: `0 4px 10px rgba(0,0,0,0.14), 1px 1px 0 rgba(0,0,0,0.06)`
- Card shadow (drawers, popovers): `3px 3px 0 rgba(26,24,20,0.15)`
- Dashed/torn borders: 1.5px, irregular only on stickies and critiques, never on UI chrome

### Forbidden
- Gradient backgrounds
- Emoji as affordances (paperclip, pin, checkmark must be SVG glyphs)
- Rounded-pill containers with a left-border accent ("Shadcn card" trope)
- `Inter` / `Roboto` for any hand-drawn moment
- Any component that renders differently in one theme and not the other

---

## 6. MOTION CONTRACT

### Global clock
- Everything lives in 200–500ms with `ease-out`.
- Staggers in 80–120ms intervals for sibling reveals.
- Idle gate: 1.2–2.0s after last pointer/text event.

### Thinking beat (full duration ≤ 1.8s; ≤ 400ms under reduced-motion)
1. Persona avatar pulses; hair-thin idle bar fills 0→1 (1.2–2.0s).
2. Candidates enter near focus idea, staggered 280ms, class `.thinking-candidate`.
3. Scratches: rejected candidates cross-hatched one at a time, 420ms each (skip under reduced-motion; use instant strike-through).
4. Survivors pulse blue briefly (`.thinking-survive`), then commit as real ideas with `ai: true` and a persona chip.

### Connection draw
- Stroke-dash 300–500ms per path, staggered 120ms.
- Hover any line → mid-path × for delete (persistent tombstone).
- Click a connection → both endpoints flash 300ms.

### Critique reveal
- Fade 0→1 + 10–20px slide, 200–300ms.
- Delay 1.2–1.8s after idle.
- If the target idea moves while the critique is queued, re-anchor; don't fire until stable.

### Signal control motion
- Fading / de-emphasis uses 200–300ms opacity transition.
- Never animate removal — items disappear instantly to avoid implying data loss.

### Cancel rules
- Any pointer/text activity cancels queued reveals and clears the idle bar.
- Queued beats don't compound; the newest pointer event is authoritative.

---

## 7. VOICE CONTRACT

The AI has a name (`Dev`) and a deliberate tone. Tone differs per role.

### Universal rules
- ≤ 22 words per line.
- No "Great idea!", "Here's what I think", "Hope this helps", "Let me know".
- No emoji in output.
- No summaries unless the Facilitator role is active AND the user asked.
- Never rhetorical questions unless it's a Challenger line.

### Per role
- **Scout** — pragmatic, slightly curious. Frames: "You might be missing…", "Adjacent field does this as…". Output: 3–5 candidate titles ≤ 9 words each + rationale ≤ 16 words.
- **Synthesizer** — structural, declarative. Frames: "These share…", "A and B contradict on…". Output: `Connection[]` with ≤ 10-word rationale.
- **Challenger** — sharp, devil's advocate. Required openers: `This fails if…`, `You're assuming…`, `This breaks when…`, `This conflicts with…`. Never upbeat. Output: structured `{ risks, hiddenAssumptions, counterExamples }` with strength 0–1.
- **Historian** — quiet, contextual. Frames: "Previously shelved: …", "This revives…". Never proposes new ideas from scratch; only surfaces prior ones.
- **Facilitator** — calm, procedural. Frames: "Locking in: …", "Next: …", "Ready to advance?". Owns `advance_phase`, `add_rule`, `choose_next_step`, `export_handoff`.

---

## 8. LLM OUTPUT CONTRACT (for the models that drive the roles)

Every role call is JSON-only. Free text in any field → reject the response and retry once.

```jsonc
// scout_ideas response
{ "candidates": [
  { "title": "", "rationale": "", "color": "peach|blue|green|lilac|pink", "confidence": 0.0 }
] }

// find_connections response
{ "connections": [
  { "fromIdeaId": "", "toIdeaId": "", "kind": "builds_on|contradicts|shared_theme|revives_killed",
    "rationale": "", "strength": 0.0 }
] }

// critique_idea response
{ "risks": [""], "hiddenAssumptions": [""], "counterExamples": [""], "strength": 0.0 }

// suggest_next_bead response (soft)
{ "beadId": "", "reason": "", "urgency": "low|medium|high" }

// flag_bead_for_review response
{ "beadId": "", "reason": "" }
```

Client-side filtering uses the `confidence` / `strength` field and the current autonomy ceiling:
- `Passive Observer`: always stage (Shadow).
- `Guided Co-Pilot`: commit if ≥ 0.55 AND idle; else stage.
- `Active Challenger`: commit if ≥ 0.30; else drop.

---

## 9. QUALITY CHECKLIST (must pass before any design ships)

- [ ] Renders identically correct in `theme-sketch` and `theme-whiteboard`.
- [ ] Every AI-authored element has a visible origin marker.
- [ ] Autonomy dial shows both ceiling and effective mode.
- [ ] Insight Feed accessible; Shadow mode verifiable by dropping to Passive Observer.
- [ ] Bead strip rendered with all 5 per-bead states covered.
- [ ] `AI Undo` button present and correctly enabled/disabled.
- [ ] Turn log paginated with filter chips and transfer action.
- [ ] Discard pile collapsible at bottom-left with restore animation.
- [ ] Supporting-docs paperclip on every idea card.
- [ ] Rules ribbon at top of canvas (max 5 visible + overflow).
- [ ] Reduced-motion path respected.
- [ ] No emoji, no gradients, no Shadcn card tropes.
- [ ] All AI copy obeys the role voice rules.
- [ ] Every tweak lands under `Tweaks` toggle; theme switch persists via `__edit_mode_set_keys`.

---

## 10. WHAT NOT TO BUILD (design anti-goals)

- A chat sidebar. The persona dock is the chat.
- A global modal that steals focus. Popovers anchored to ideas only.
- A "mode switch" that hides features behind it. All roles are always available; autonomy changes *when* they run, not *whether*.
- A notification tray. The Insight Feed is the only queue.
- A settings page for tone, temperature, or verbosity of the AI. Tone is defined per role here; do not expose knobs.
- A "New AI feature" wizard. The robot already knows its job.

If you find yourself drawing any of the above, stop and re-read §3.
