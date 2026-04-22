# Board UI Verification Checklist

Purpose: deterministic close-out checklist for the board UI issues reopened in `bo-038` through `bo-042`.

Do not mark the design batch complete from typecheck/build alone. Run this checklist on the actual app surface.

## Viewports

- `1280x800`
- `1440x900`
- `390x844`

## Setup

1. Open the standalone board app with an empty or low-density board.
2. Confirm the right rail is visible and the canvas is usable.
3. Keep the browser console open so unexpected runtime errors are visible during the run.

## Workflow 1: Facilitator Reachability

1. Without scrolling the main page, verify the rail shows:
   - `AI Facilitator`
   - `Scout beat`
   - `Board beats`
2. Scroll the rail only.
3. Confirm the lower sections remain reachable without losing the canvas or trapping scroll.
4. Confirm session detail is demoted below the primary facilitator controls.

Pass:
- Primary facilitator actions are visible above the fold.
- Rail scroll works independently and predictably.
- `Board beats` is reachable on all three viewports.

Fail:
- `Scout beat` or `Board beats` is clipped off with no usable rail scroll.
- The page uses competing scroll regions that hide primary actions.
- Session diagnostics dominate the first screenful.

## Workflow 2: Add Note

1. Click `New note` from the header.
2. Enter note text and submit.
3. Watch for immediate feedback in the header or composer.
4. Confirm the new note appears on the canvas near the current viewport.
5. If the app reports the note was saved but not confirmed onscreen, use `Show note`.

Pass:
- The create action is discoverable in primary chrome.
- Successful create gives visible confirmation.
- The note is centered or clearly revealed on the canvas.
- Failure states are explicit, not silent.

Fail:
- Submitting a note appears to do nothing.
- The note lands off-screen with no recovery path.
- The composer closes without success or failure feedback.

## Workflow 3: Connections

1. Ensure at least two notes exist.
2. Open `Connections`.
3. Verify the manual authoring affordance is obvious.
4. Create one manual connection with rationale.
5. Confirm the saved connection appears in the list.
6. Click the saved connection and confirm the linked notes highlight on the canvas.
7. Run facilitator link discovery and confirm the manual connection remains available.

Pass:
- A user can clearly create a connection without guessing.
- Saved connections are inspectable and highlight the relevant notes.
- Facilitator scans do not erase the manual authoring path.

Fail:
- Connections still read like a passive diagnostic drawer.
- Manual add is hidden, disabled without explanation, or ambiguous.
- Saved connections are not inspectable from the board surface.

## Workflow 4: Facilitator Legibility

1. Observe the `AI Facilitator` card before triggering any beat.
2. Confirm it communicates:
   - who is guiding
   - what state it is in now
   - what next action is available
3. Trigger `Scout beat`.
4. Confirm the facilitator state changes and the result lands on the canvas rather than only in the rail.

Pass:
- The facilitator reads like an active guide, not telemetry plumbing.
- Current state and next action are obvious without expanding secondary diagnostics.
- AI output lands inline on the board.

Fail:
- The facilitator is visually buried under diagnostics.
- The user cannot tell what the AI is doing.
- The rail acts like a side chat instead of a dock for canvas-first actions.

## Workflow 5: Scout Suggestions And Critiques

1. Trigger `Scout beat` or run `scout_ideas`.
2. Confirm at least one scout suggestion appears directly on the canvas.
3. Drag the scout card to a new position and release.
4. Confirm it does not snap back, and its new position survives normal board re-renders.
5. Trigger one critique on a visible note.
6. Confirm the attached critique sits behind the note with only its title/tab visible.
7. Click the critique tab once and confirm the full card comes forward with action controls.
8. Click the critique card again and confirm it tucks back behind the note.

Pass:
- Scout suggestions behave like first-class canvas artifacts, including drag and persisted placement.
- Critiques default to an attached background state instead of covering the note body.
- Expanding and collapsing a critique does not cause card flicker or misplaced layering.

Fail:
- A scout card cannot be repositioned.
- A scout card snaps back to its old location after release.
- Critiques always render full-front and obscure their host note.
- Critique expand/collapse causes z-index glitches or transient jumps.

## Workflow 6: Docs Panel Stability

1. Open supporting docs for a note.
2. Leave the docs panel open while moving notes, selecting other notes, and triggering facilitator actions.
3. Watch the panel header/body during unrelated board updates.

Pass:
- `Loading docs…` appears only on the initial load or an intentional doc refresh.
- Normal board activity does not remount or flash the docs panel.

Fail:
- The panel repeatedly flashes `Loading docs…` during unrelated board changes.
- The docs surface blinks or resets focus while the board updates.

## Sign-off

Only close `bo-038`, `bo-039`, `bo-040`, `bo-041`, and `bo-042` after this checklist is executed on all listed viewports and the actual outcomes are attached to the tracker close-out.
