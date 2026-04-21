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
- Connection finder plus on-canvas connection overlay
- Candidate ideas from outside-knowledge scouting, including draggable scout cards
- Attached critique cards for devil's-advocate challenges with inline accept/dismiss
- Signal control for bounded suggestions, critiques, and connections
- Local autonomous facilitator with idle-gated automation
- AI-tagged history and undo/redo support
- Polished timing, motion, and hierarchy

### Chrome Extension

Shipped.

- 8-phase structured brainstorming pipeline
- BYOK for Gemini, OpenAI, and Anthropic
- Active-tab tool awareness through WebMCP consumption
- Side-panel workflow plus export

## Not Shipped Yet

- Collaborative sync (multi-user)
- Yjs CRDT storage
- WebRTC peer collaboration
- Cross-device persistence

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
- `get_board`
- `draw_connection`
- `critique_idea`
- `scout_ideas`
- `move_suggestion`
- `discard_idea` / `restore_idea`
- `advance_phase`

This makes behavior:

- predictable
- inspectable
- controllable

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
- Browser-local settings storage holds provider configuration and credentials for the shipped surfaces.
- The app is still local-only.

## Current Constraints

- No sync or multiplayer yet.
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
