# Prompt — Align the WHITEBOARD theme with the Target Design

Paste the block below into your coding agent. This is the companion to
`Whiteboard Alignment Prompt.md` (which addressed the sketch theme). The
whiteboard theme needs a different treatment — it should read as **dry-erase
marker on a glossy board**, not "sketch with cooler colors."

## Read before editing

1. `DESIGN_PROMPT.md` — full file, but pay attention to §COLOR, §TYPOGRAPHY.
2. `DESIGN_GAPS_PROMPT.md` — §3 Must-haves (M1–M10), §5 Visual contract,
   §G2, G3, G4, G7, G8, G10, G11, G13, G14 apply identically in this theme.
3. `brainstorm.css` — search for `body.theme-whiteboard`. That is the
   existing scope for whiteboard-specific overrides. All changes below must
   live under that selector, not in the base tokens.
4. `Clarifications Redesign.html` — reference for layout primitives, but
   **ignore its paper/Kalam aesthetic** — whiteboard is a different mode.

## Core mental model for this theme

Whiteboard mode = **marker ink on glass**. Think:
- Translucent marker fills (the sticky `background: rgba(255,255,255,0.55)` +
  colored outline is correct — keep it).
- **No torn paper.** The torn clip-path polygon is a sketch-theme concept. In
  whiteboard, stickies are clean rounded rectangles with slightly imperfect
  marker-stroke borders (use a subtle `filter: url(#wobble)` SVG turbulence,
  not a polygon).
- **No Kalam on stickies.** Kalam is a paper-pen font. Whiteboard uses a
  marker font — **Permanent Marker** or **Reenie Beanie** for sticky titles,
  and **Architects Daughter** or just Inter 500 for body.
- **No offset ink drop shadows.** Those read as paper-on-paper. Whiteboard
  objects get a subtle glow (`0 0 0 4px rgba(<color>, 0.12)`) + thin flat
  shadow (`0 2px 8px rgba(31,42,46,0.08)`) — already correct for stickies;
  apply the same treatment to bubbles, dock, drawers.
- **Paper grid becomes graph grid.** Cooler, thinner lines, lighter pencil
  rather than warm cream. Already correct.

If a fix in the sketch-theme prompt contradicts the above, the whiteboard
treatment above wins for this pass. Do not let the two themes collapse into
one look.

## What's wrong in the current whiteboard (from the screenshot)

### 1. Stickies are still torn-paper polygons

- Current: torn-edge clip-path is applied in whiteboard theme too. Reads like
  ripped construction paper, not a marker outline.
- Fix: inside `body.theme-whiteboard .sticky`, set `clip-path: none;` and give
  a gentle marker-wobble via an SVG turbulence filter:
  ```css
  body.theme-whiteboard .sticky {
    clip-path: none;
    border-radius: 10px;
    filter: url(#marker-wobble);
  }
  ```
  Inject the filter once at the root of the canvas:
  ```html
  <svg width="0" height="0" style="position:absolute">
    <filter id="marker-wobble">
      <feTurbulence baseFrequency="0.012" numOctaves="2" seed="3"/>
      <feDisplacementMap in="SourceGraphic" scale="1.6"/>
    </filter>
  </svg>
  ```
- Sticky rotation: drop from ±1.5° (sketch) to ±0.4°. Markers on a board are
  placed more deliberately than notes tossed on paper.

### 2. Sticky typography is wrong

- Current: titles in Kalam (handwriting pen). Bodies in Kalam.
- Fix:
  - Titles: `font-family: "Permanent Marker", "Reenie Beanie", cursive;`
    weight 400, 17–19px, color = `var(--sticky-fill)` (already the existing
    variable).
  - Body: `font-family: "Architects Daughter", "Inter", sans-serif;` 14px,
    color `var(--ink-soft)`. Under 2 lines stays in the marker font; >2 lines
    falls back to Inter (readability).
- Add to the `<link>` in `index.html`:
  `Permanent+Marker&family=Architects+Daughter` via Google Fonts.

### 3. Tag chips are boxed rectangles with no fill

- Current: `SHADOW`, `CONTROL-PLANE`, `WORKFLOW`, `CHALLENGE`, `MANAGER`,
  `REVIEW`, `PROVENANCE`, `AI`, `+6`, `MERGED+2`, `UNDO`, `PROVENANCE` — all
  rendered as identical thin-border rectangles. Reads like a sparse
  spreadsheet.
- Fix, whiteboard-specific: tags become **highlighter swipes**, not boxes.
  ```css
  body.theme-whiteboard .sticky .tag {
    background: color-mix(in srgb, var(--sticky-fill) 14%, transparent);
    border: none;
    color: var(--sticky-fill);
    font-family: "JetBrains Mono", monospace;
    font-size: 9.5px;
    letter-spacing: 0.08em;
    padding: 1px 6px;
    border-radius: 2px;
    text-transform: uppercase;
  }
  ```
- Cap at 2 tags on the sticky body. `STEP N/8` metadata moves off the sticky
  entirely — it lives on the bead strip.
- Merge-count (`MERGED+2`, `+6`) becomes a small chip next to the sticky
  title, not inline with semantic tags.

### 4. Critiques are floating red serif text

- Current: `CRITIQUE` label in Plex Mono, body in a red serif, hanging in
  space with a single stray underline.
- Fix: route through the `.margin-note` primitive but re-style for whiteboard:
  - Background: `rgba(255, 232, 196, 0.92)` — soft marker-highlighter amber.
    Already in place; verify it's applied.
  - **No rotation, no torn clip-path** (both already nulled for whiteboard —
    confirm).
  - Header row: `DEV · CHALLENGER` (Plex Mono 9.5px, accent blue) + strength
    dots (1–3 small filled circles in `--accent-contradict`).
  - Body font: Architects Daughter or Inter 500 at 13px. **Never red.** Only
    the `CRITIQUE` pill itself is red-accent.
  - Connect critique → target sticky with a thin red dashed line (matches
    `contradicts` stroke vocabulary). Without that line, the note floats
    without anchor.
  - Actions bottom row: `dismiss` · `handled` (Plex Mono lowercase).

### 5. Open Questions don't live in bubbles

- Current: `OPEN QUESTION` + red text, identical treatment to critiques.
- Fix: different primitive. Open questions = speech bubble with tail, not a
  margin note. In whiteboard mode the bubble is:
  ```
  background: rgba(255,255,255,0.92);
  border: 2px solid var(--ink);
  border-radius: 14px;
  box-shadow: 0 2px 0 rgba(31,42,46,0.12), 0 4px 12px rgba(31,42,46,0.06);
  filter: url(#marker-wobble);   /* subtle marker edge */
  ```
  Tail: a small triangle in the same color, pointing at the anchored sticky.
  Label row: `OPEN QUESTION` in Plex Mono, color `var(--accent-ai)` (blue),
  **not red**. Red is reserved for contradicts/critique.
- Inline italicized term in the question gets a highlighter swipe
  (`background: rgba(46,134,199,0.15)`), matching the clarifications-redesign
  `.qbubble .qb-q em` pattern.

### 6. Persona dock is the only thing that feels right — finish it

The dock is roughly on-target: avatar, `DEV · IDLE`, one Kalam line, four
buttons (`pause`, `nudge me`, `turn log`, `UNDO ROBOT`). Adjustments:

- Replace the Kalam persona line with **Architects Daughter 13px** or Inter
  500 — no Kalam in whiteboard.
- `UNDO ROBOT` is ALL CAPS and stands out. Lowercase it to `undo robot` to
  match the other dock buttons (DESIGN_PROMPT §COPY CONVENTIONS). Disabled
  state when no AI-origin change exists.
- `nudge me` currently shows as dashed underline — that's ambiguous. Give it
  the same flat marker button treatment as `pause` but without the dark fill.
- Add the **autonomy dial** above the persona avatar (M1). Three segments:
  `passive observer · guided co-pilot · active challenger`. Marker-stroke
  segmented control — 2px ink border, active segment filled ink-dark, others
  translucent white. Below it, when ceiling ≠ effective, a Plex Mono caption:
  `ceiling: active challenger → effective: guided co-pilot`.
- Add the **idle-gate bar** (M10): 2px hairline under the avatar, fills over
  1.2–2.0s in `var(--sticky-fill-blue)` marker color, resets on any pointer/
  text event.
- Swap role label `DEV · IDLE` to show the actual role when thinking:
  `DEV · CHALLENGER`, `DEV · SCOUT`, `DEV · SYNTHESIZER`, etc. (M6).

### 7. Topbar is half-built

- Current left: small brand chip + two mystery circular icons (clock + pin?).
  Keep the brand chip.
- Current center: **empty**. Previous iteration had a centered board title
  chip; now there's nothing. Replace with the **rules ribbon** (G13, M13):
  up to 5 compact rule chips in a horizontal row, `+N` overflow at the end.
  Each chip:
  ```
  background: rgba(255,255,255,0.85);
  border: 1.5px solid var(--ink);
  border-radius: 999px;
  padding: 3px 10px 3px 8px;
  font-family: "Inter", sans-serif; font-size: 11px;
  ```
  with a small `origin` dot on the left (ink for user, blue for ai) and an
  `×` on the right.
- Current right: `+`, `chain/link`, undo, redo, and what looks like a
  solid-black square icon. Restyle the cluster as a marker-outline toolbar
  (`.icon-btn` in whiteboard mode is already correct — verify). Kill the
  solid-black square — if it's the theme toggle, move it into Tweaks.

### 8. No bead strip visible

Add the 12-bead strip along the bottom center of the canvas (M3, §G4).
Whiteboard-specific styling:
```css
body.theme-whiteboard .beads {
  background: rgba(255,255,255,0.88);
  border: 1.5px solid var(--ink);
  border-radius: 999px;
  box-shadow: 0 2px 0 rgba(31,42,46,0.12);
}
body.theme-whiteboard .beads .bead.done    { background: #2a9f5e; }
body.theme-whiteboard .beads .bead.active  { background: #2e88b8; box-shadow: 0 0 0 3px rgba(46,136,184,0.25); }
body.theme-whiteboard .beads .bead.flag    { background: #c93d5e; }
body.theme-whiteboard .beads .bead.nudge   { background: #e0a500; animation: soft-pulse 1.4s ease-in-out infinite; }
```
Five states (`locked`, `active`, `completed`, `needs_attention`, `soft_nudge`)
must all be visually distinct. Clicking a completed bead opens its recorded
state popover; clicking does not advance the phase.

### 9. No insight feed / shadow mode home

Per M2 + G2, add a collapsible drawer reachable from the persona dock. In
whiteboard mode it slides up from the bottom-right as a translucent white
panel:
```
background: rgba(255,255,255,0.92);
border: 1.5px solid var(--ink);
border-radius: 12px 12px 0 0;
box-shadow: 0 -2px 0 rgba(31,42,46,0.12), 0 -6px 20px rgba(31,42,46,0.06);
```
Each item is a compact row with: intent label (`Scout Draft`, `Connection
Draft`, `Critique Draft`, `Grouping Proposal`, `Tool Suggestion`,
`Web Context`), a one-line preview, and explicit verb-mapped action buttons
(`admit`, `elaborate`, `attach`, `group`, `shelve`, `dismiss`).

### 10. No discard pile

Bottom-left, below the persona dock, a collapsible stack (M8). Collapsed:
small icon + count. Expanded: list of killed stickies with `restore` buttons.
Restore animation: 340ms cubic-bezier(0.2, 1, 0.3, 1), sticky fades back in
at its last position.

### 11. No visible connection layer

Screenshot shows stickies with zero ink between them. Connection strokes in
whiteboard theme:
- `builds_on`       → 2.5px solid `var(--ink)`
- `contradicts`     → 2.5px dashed 8,5 `#c93d5e`
- `shared_theme`    → 1.5px dotted `#8a8578`
- `revives_killed`  → 2.5px solid `#2a9f5e` + arrowhead
All with `filter: url(#marker-wobble)` for the marker look. AI-authored
connections get a small persona dot at mid-path (§M4).

### 12. Bottom-right telemetry stripe

- Current: `LOCAL-FIRST · INDEXEDDB · HOST LOCAL` — debug chrome in the
  default UI.
- Fix: hide behind a dev flag, or move into Tweaks panel under a "developer
  info" section. Do not show to users by default.

## Global whiteboard fixes

- **Fonts.** Kalam is removed from all on-canvas content in whiteboard mode.
  Replace with Permanent Marker (titles), Architects Daughter / Inter
  (body). Plex Mono stays for metadata, timestamps, tags, buttons.
- **Shadows.** Replace every remaining `3px 4px 0 rgba(26,24,20,0.18)`
  (paper-style offset shadow) with `0 2px 0 rgba(31,42,46,0.12)` + optional
  `0 4px 12px rgba(31,42,46,0.06)` glow. Already true for some surfaces —
  sweep all of them.
- **Pills.** Remove saturated-fill SaaS pills (`#7a4ae0`, solid yellow/green/
  blue tags). Replace with highlighter swipes (see §3).
- **Lowercase** every button label, ≤2 words, no trailing period.
- **Add** a visible `marker-wobble` SVG filter to the canvas root so any
  whiteboard element can opt into it via `filter: url(#marker-wobble)`.

## Voice pass on existing copy

Current persona line reads:
`pressing on 'shadow mode stages edits before execution.'. listening for weak spots.`

That's 14 words, starts lowercase, no sycophancy — already obeys §VOICE.
Only issue: the repeated sticky title swallows the signal. Tighten:

> `pressing on 'shadow mode'. three weak spots queued.`

Then wire the `three weak spots queued` phrase to actually link into the
insight feed when clicked (opens the drawer, filtered to `Critique Draft`).

Critique bodies shown (`Shadow mode can turn into permanent hesitation unless
the promotion path…`, `If the robot speaks before the artifact appears, it
becomes a narrator i…`) are correct Challenger voice — keep them. Fix the
truncation: on a torn-paper margin-note primitive we had a width constraint;
the whiteboard version should not truncate critiques with ellipses. Either
expand the note or add a `read more` action (Plex Mono lowercase) that
expands in place.

## Acceptance checklist — whiteboard theme

- [ ] Zero torn-paper clip-paths on stickies or notes in whiteboard mode.
- [ ] Zero Kalam anywhere on canvas in whiteboard mode.
- [ ] Every sticky has a marker-wobble SVG filter and a colored outline with
      translucent white fill.
- [ ] Tags are highlighter swipes in the sticky-fill color, not bordered
      pills. Max 2 per sticky; `STEP N/8` moves to bead strip.
- [ ] Critiques render as non-rotated amber margin notes with role header and
      strength dots; body is ink, not red; connected to target with a red
      dashed line.
- [ ] Open questions render as speech bubbles with tails and blue eyebrow
      labels, not red margin notes.
- [ ] Persona dock shows: autonomy dial (3-segment marker control), role
      label (`DEV · <ROLE>`), one-line thought (Architects Daughter/Inter),
      four lowercase buttons (`pause`, `nudge me`, `turn log`, `undo robot`),
      idle-gate hair bar under avatar.
- [ ] Rules ribbon occupies topbar center; max 5 chips + overflow; empty
      state shows nothing (no placeholder).
- [ ] 12-bead strip renders bottom-center with five distinct states.
- [ ] Insight feed drawer reachable from dock; `passive observer` routes AI
      output here instead of to canvas.
- [ ] Discard drawer present bottom-left with restore animation.
- [ ] Connection layer renders with correct marker-wobble strokes per kind;
      AI connections show mid-path persona dot.
- [ ] `LOCAL-FIRST · INDEXEDDB · HOST LOCAL` stripe hidden by default.
- [ ] `prefers-reduced-motion` honored globally (no pulse, no stroke-dash,
      no scratch-out).
- [ ] Theme switch persists via `__edit_mode_set_keys` in Tweaks.

## Out of scope

- Do not redesign the inspector (`Inspector Redesign.html` covers that).
- Do not add new connection kinds, colors, or fonts beyond those listed.
- Do not merge the sketch and whiteboard themes. Both themes must ship and
  render every component correctly.
- Do not add chat sidebars, search bars, share buttons, or empty-state
  illustrations.
