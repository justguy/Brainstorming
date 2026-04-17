# Brainstorming Orchestrator

Brainstorming Orchestrator is a local-first idea workspace with two shipped surfaces:

- A Chrome extension for the original 8-phase brainstorming pipeline.
- A standalone web app with WebMCP tools, a free-form canvas, supporting docs, connection finding, critique cards, ghost suggestions, and a local autonomous facilitator.

## Status

- `PHASED_IMPL.md`: complete.
- `ROADMAP.md` current sprint (`Facilitator Mode v1`): complete.
- Remaining roadmap work is still future work: collaborative sync, Yjs, WebRTC multi-peer, and other stretch items in `ROADMAP.md`.

## What Is Shipped

### Chrome extension

- Manifest V3 extension build.
- BYOK provider support for Gemini, OpenAI, and Anthropic.
- 8-phase structured brainstorming pipeline.
- Popup capture, side panel workspace, readiness-gated export.

### Standalone web app

- Runs at `http://localhost:6611` in dev mode.
- WebMCP surface with global and lifecycle tools.
- Free-form canvas with drag, group, merge, discard, and restore flows.
- Supporting-doc extraction and board-aware idea scouting.
- Connection finder plus on-canvas connection overlay.
- Manual `draw_connection` tool.
- Persisted critiques with anchored critique cards and dismiss flow.
- Soft-mode inference with subtle timing hints.
- Signal controls: bounded suggestions, bounded critiques, bounded connections.
- Paginated turn-log access via `get_turn_log`.
- Local autonomous facilitator with pause toggle and AI-origin action tagging.

## Not Shipped Yet

- Collaborative sync.
- Yjs storage cutover.
- WebRTC peer collaboration.
- Centralized cloud persistence.
- Cross-session AI memory.

## Prerequisites

- Node.js 20+
- npm 10+
- Chromium-based browser for the extension
- At least one LLM API key for Gemini, OpenAI, or Anthropic

## Install

```bash
npm install
```

## Development

### Standalone web app

```bash
npm run dev:web
```

- Dev server: `http://localhost:6611`
- Primary surface for new feature work

### Chrome extension

```bash
npm run dev
```

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
- `ROADMAP.md`: forward plan beyond the shipped facilitator work.
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
