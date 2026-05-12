# Prompt — Align the Whiteboard UI with the Target Design

Paste the block below into your coding agent. It references two files already in
this project — `DESIGN_PROMPT.md` and `DESIGN_GAPS_PROMPT.md` — as the source of
truth for tokens and invariants. Do not restate those rules; point at them.

---

## Task

Adjust the current whiteboard canvas (seen in the attached screenshot) so it
matches the visual and interaction language established in
`Clarifications Redesign.html` and codified in `DESIGN_PROMPT.md` +
`DESIGN_GAPS_PROMPT.md`.

Treat this as a **visual and structural alignment pass**, not a rewrite. Keep
the data layer, layout logic, and component boundaries intact.

## Read before editing

1. `DESIGN_PROMPT.md` — §COLOR, §TYPOGRAPHY, §PRIMITIVES, §VOICE, §QUALITY BAR.
2. `DESIGN_GAPS_PROMPT.md` — §3 Must-haves (M1–M10), §5 Visual contract,
   §6 Motion contract.
3. `Clarifications Redesign.html` — the "AFTER" panel is the reference for
   sticky geometry, qbubble, persona dock, bead strip, and the qstrip queue.

If a rule in those files conflicts with anything below, those files win.

## What's wrong in the current whiteboard (from the screenshot)

Go through each of these. Do not invent new patterns — every fix maps to an
existing token or primitive.

### 1. Sticky notes read as rectangles, not paper

- Current: rounded-corner rectangles with subtle drop shadows, rotated slightly.
- Target: **torn-paper** clip-path (copy the polygon from
  `Clarifications Redesign.html` `.sticky`), chunky **offset ink shadow**
  (`2px 3px 0 rgba(26,24,20,0.25), 4px 6px 14px rgba(26,24,20,0.15)`), not a
  soft blurred shadow.
- Typography on stickies: title in **Kalam 700 at ~18–22px**, body in Kalam 400
  at 14–15px. No Inter inside a sticky.
- Remove the grey "Open" chip in the sticky corner — replace with the
  `ai-authored` stamp (small dark circle "ai", top-right) when `idea.ai` is
  true. Match `brainstorm.css` `.sticky.ai-authored::after`.
- Each sticky rotated deterministically by id, ±1.5°. Never re-random on
  re-render.

### 2. Critiques are floating red text, not notes

- Current: bare red-serif text floating over the canvas labeled "CRITIQUE".
- Target: **torn-paper margin note** — use the `.margin-note` primitive from
  `brainstorm.css`. Background `#fff4e3`, rotated −2°, Patrick Hand or
  `--f-hand-arch`, ink-red accent only on the label pill. The body is ink, not
  red.
- Per §G8, critique card header shows role + strength:
  `Dev · Challenger` + 1–3 strength dots. If the payload has
  `{ risks, hiddenAssumptions, counterExamples }`, expose them as three small
  tabs (`risk · assumption · counter`) inside the same note. Actions:
  `dismiss` and `handled` (lowercase, Plex Mono).

### 3. "Open Question" blocks look identical to critiques

- Current: another floating red-serif block.
- Target: route these through the `<CritiqueBubble>` / speech-bubble primitive
  (`.qbubble` in the reference file), not the margin-note primitive. Bubble
  has: avatar chip + `OPEN QUESTION` eyebrow in mono (ink-blue, not red), body
  in Kalam, tail pointing at the anchored sticky, and primary/ghost action
  buttons. Connect bubble → target sticky with a thin ink line (SVG path,
  `.ink-line`) so provenance is visible.

### 4. Tags under stickies are SaaS pills

- Current: grey/blue/purple rounded-pill tags (`IDEA`, `WORKFLOW`, `CHALLENGE`,
  `BOARD`, `PROVENANCE`, `UNDO`, `MERGED FROM 2`, etc.) — reads like a CRM.
- Target: **ink-outlined chips** in `--f-mono`, 10px, uppercase,
  letter-spacing 0.1em, no saturated fills. Color only when the tag carries
  semantic meaning from the token list (contradicts/revives/shared/scout).
- Cap at 2 tags per sticky. If more exist, collapse to `+N`.
- `STEP 1/8`, `STEP 4.5/8` etc. belong on the **bead strip** (see §7), not on
  the sticky.

### 5. Top bar is generic app chrome

- Current: "Brainstorm · A Thinking Partner" chip, a centered "AI
  Brainstorming" title, a cluster of `+ / link / undo / redo / sketch` icons.
- Target, per DESIGN_PROMPT §LAYOUT:
  - Flat 56px topbar, paper-colored, 1.5px ink bottom border.
  - Left: brand chip exactly as in `.brand-chip` (Kalam title + Plex Mono sub).
  - Center: **rules ribbon** (§G13). Max 5 rule chips + `+N more`. If empty,
    render nothing — no placeholder title.
  - Right: icon cluster becomes a marker-stroke segmented toolbar
    (`.icon-btn`), using ink outlines and chunky offset shadows. Labels on
    hover are Plex Mono lowercase.
  - Remove the lowercase `sketch` button — theme switch lives inside Tweaks
    per §9 QUALITY CHECKLIST.

### 6. No autonomy dial, no effective-mode indicator

- Add the autonomy dial (M1) inline in the persona dock, not as a settings
  popover. Three named positions: `passive observer`, `guided co-pilot`,
  `active challenger`. Below the dial, a Plex Mono caption showing
  `ceiling: X → effective: Y` when they differ (auto-backoff state).
- Where it goes: left column of the persona dock, above the persona line.

### 7. No bead strip

- Add the 12-bead horizontal strip (M3) along the **bottom center** of the
  canvas. Copy `.beads` geometry from `Clarifications Redesign.html`:
  pill container, 1.4px ink border, offset shadow, 10px circles.
- Five bead states must be distinguishable at a glance: `locked`, `active`
  (pulsing), `completed` (filled green), `needs_attention` (red dot),
  `soft_nudge` (gentle pulse, not the same as active).
- Clicking a completed bead opens its recorded state in a popover.
  Clicking does **not** advance phase — only `advance_phase` does.

### 8. Persona dock (bottom-left) is too chat-like

- Current: shows a mini paragraph "Looking at 'Shadow mode stages edits before
  execution.' Want me to press on it?" with `pause / nudge me / turn log /
  UNDO` actions stacked.
- Target per M6 and DESIGN_PROMPT §PERSONA DOCK:
  - Avatar (40×40, ink-outlined, chunky shadow) + role label
    `DEV · CHALLENGER` in Plex Mono accent color + **one** Kalam line of
    current thought. Max 22 words. Truncate with `…` if longer.
  - Three buttons only: `pause`, `nudge me`, `turn log`.
  - A fourth dedicated button **`undo robot`** (M5, §G7) — enabled only when
    an AI-origin change exists in recent history; tooltip names the specific
    change. This is separate from global undo.
  - A hair-thin idle-gate progress bar under the avatar (M10), fills 0→1 over
    1.2–2.0s, then triggers the next beat. Cancels on any pointer/text event.

### 9. No connections layer visible

- The screenshot shows stickies with no ink between them. Make sure the
  `<ConnectionLayer>` is rendering. When it renders:
  - `builds_on` → 2px solid ink, organic bezier
  - `contradicts` → 2px dashed 8,5 `--accent-contradict`
  - `shared_theme` → 1.5px dotted `--accent-shared`
  - `revives_killed` → 2px solid `--accent-revives` + arrowhead
  - AI-authored connections get a tiny persona dot at mid-path (§M4).

### 10. No insight feed / shadow-mode home

- Add the collapsible **Insight Feed** drawer (M2, §G2), accessed from the
  persona dock. Never auto-opens. When `effective_mode` drops below
  `guided_co_pilot`, ghost stickies land here instead of on the canvas. Items
  labeled by intent (`Scout Draft`, `Connection Draft`, `Critique Draft`,
  `Grouping Proposal`, `Tool Suggestion`, `Web Context`). Explicit verb-mapped
  actions per item (admit, elaborate, attach, group, shelve, dismiss).

### 11. No discard pile

- Add the bottom-left discard drawer (M8). Collapsed: small stack icon + count.
  Expanded: list of killed stickies with restore button. Restore animates the
  sticky back to its last position (340ms bouncy ease).

### 12. Supporting docs not surfaced on stickies

- Per M7, each idea gets a small paperclip glyph + count in its meta row.
  Click → popover anchored to the sticky, not a global modal. Use an SVG
  paperclip, not emoji.

### 13. Bottom-right viewport controls

- Current: `− 100% + Fit`, then a `LOCAL-FIRST · INDEXPDB · HOST LOCAL` stripe.
- Keep the zoom controls but restyle with `.icon-btn` ink-outline treatment.
- The telemetry stripe reads like debug chrome — hide it behind a dev flag,
  not in the default canvas. If it must stay, move to the topbar's right edge
  as a single Plex Mono line at `--ink-faint`, 9.5px.

### 14. The top-right "CONNECTIONS" helper panel

- Currently looks like a blue toast tutorial. Kill it from the default canvas.
  If a first-time hint is needed, use a torn-paper `<MarginNote>` primitive
  with a `hint` label, dismissable, not a persistent floating div.

## Global fixes

- Replace every `font-family: system-ui | Inter | Roboto | SF Pro` on on-canvas
  content with Kalam / Caveat / Crimson Pro / Plex Mono per §TYPOGRAPHY.
  Inter stays only for UI chrome (dock buttons, dial labels, turn-log rows).
- Replace every soft blurred box-shadow (`0 x y rgba(0,0,0,.08)`) with the
  chunky offset ink shadow (`3px 4px 0 rgba(26,24,20,0.18)`) on anything on
  paper. Popovers and drawers use `3px 3px 0 rgba(26,24,20,0.15)`.
- Remove pill-shaped rounded tags with saturated fills anywhere on canvas.
- Lowercase every button label, ≤2 words, no trailing period.
- Add a 1.5px ink bottom border to the topbar. No 1px hairlines on canvas
  chrome.
- Sticky body paragraphs longer than 2 lines render in Inter at 13px, not
  Kalam. Kalam is for the title and short notes only.

## Voice pass on existing copy

The screenshot shows copy like:

- "Shadow mode stages edits before execution."
- "Manager robot presents actions,"
- "Review lane for suggestions and…"
- "Every intervention on the board shoul…"
- Persona line: "Looking at 'Shadow mode stages edits before execution.' Want
  me to press on it?"

Keep the sticky titles as written — they're user ideas. Rewrite the **persona
line** to obey §VOICE (≤22 words, no "Want me to", no sycophancy):

> `pressing on 'shadow mode'. three weak spots.` — with `press harder` and
> `dismiss` as actions, not `pause / nudge me` inline.

Critique and open-question bodies must start with Challenger openers:
`This fails if…`, `You're assuming…`, `This breaks when…`, `This conflicts
with…`. No rhetorical "Is it…?" questions unless the role is Challenger and
it's explicitly framed.

## Acceptance checklist — do not ship until every box is ticked

- [ ] Zero SaaS-pill tags with saturated fills on canvas.
- [ ] Zero soft blurred `rgba(0,0,0,.08)` shadows.
- [ ] Every sticky uses the torn-paper clip-path and offset ink shadow.
- [ ] Every sticky body uses Kalam for short content, Inter for >2-line
      paragraphs. No system-ui anywhere on canvas.
- [ ] Persona dock shows: autonomy dial, role label, ≤22-word line, four
      buttons (`pause`, `nudge me`, `turn log`, `undo robot`), idle-gate bar.
- [ ] Autonomy dial visibly distinguishes ceiling vs effective.
- [ ] Bead strip renders all five states and is present on every canvas
      screen.
- [ ] Insight feed drawer reachable from persona dock; shadow mode verified by
      dropping to `passive observer`.
- [ ] Discard drawer present bottom-left; restore animates.
- [ ] Connections render with correct stroke per kind; AI connections have a
      mid-path persona dot.
- [ ] Critiques render as torn-paper margin notes with role + strength header;
      open questions render as speech bubbles with tails, not as margin notes.
- [ ] Rules ribbon at top; max 5 + overflow.
- [ ] `prefers-reduced-motion` respected: no scratch-outs, no stroke-dash, no
      pulses >400ms.
- [ ] Every AI-authored object carries a visible origin marker (stamp, chip,
      dot, or badge) per §M4.
- [ ] Renders correctly in both `theme-sketch` and `theme-whiteboard`.

## Out of scope (do not do these unprompted)

- Don't redesign the idea inspector or detail panel — that's covered by
  `Inspector Redesign.html`.
- Don't add a chat sidebar. Don't add a "share" button, breadcrumbs, search
  bar, recent-activity feed, or empty-state illustration.
- Don't invent new colors, fonts, or connection kinds.
- Don't add filler content to pad empty space on the canvas. Negative space is
  correct.
