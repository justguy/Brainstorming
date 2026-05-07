# Contributing to Brainstorming Orchestrator

Thanks for your interest in contributing! This project is community-driven and looking for new maintainers and contributors. See [`MAINTAINERS.md`](./MAINTAINERS.md) for the current ownership status.

## Quick Start

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/Brainstorming.git
cd Brainstorming

# 2. Install
npm install

# 3. Run the web app
npm run dev:web
# open http://localhost:6611
```

You'll need an LLM API key (Gemini, OpenAI, or Anthropic) to exercise AI flows. Keys are entered in the app settings (BYOK) and stored only in your browser — never commit them.

## Prerequisites

- Node.js 20+
- npm 10+
- Chromium-based browser (Chrome 146+ recommended for WebMCP testing)
- An LLM API key for at least one provider

## Project Layout

- `apps/web/` — standalone web app (primary surface)
- `src/` — Chrome extension (background, sidepanel, providers)
- `src/canvas/` — React Flow canvas + idea nodes
- `docs/` — verification checklists
- `WEBMCP_*.md` — WebMCP architecture and tool inventory
- `ROADMAP.md` — forward plan and open work

For a deeper architectural tour, read `README.md` then `WEBMCP_README.md`.

## Development Loop

```bash
npm run dev:web         # web app at http://localhost:6611
npm run typecheck       # TypeScript check (must pass)
npm run build           # extension build → dist/
npm run build:web       # web build       → dist-web/
```

Before opening a PR, run all four. CI will run them too.

## Loading the Extension Locally

1. `npm run build`
2. `chrome://extensions` → enable Developer Mode → "Load unpacked" → select `dist/`

## Branching & PRs

- Branch from `main`. Use a descriptive name: `fix/connection-overlay-flicker`, `feat/cross-device-sync`.
- Keep PRs focused — one logical change per PR.
- Reference the issue you're solving (`Closes #123`).
- Include before/after screenshots or a short clip for any UI change.
- The PR template will prompt you for a test plan; please fill it in.

### Commit messages

We prefer present-tense, imperative summaries:

```
Add connection-overlay debouncing to fix jitter on drag
Fix critique card stacking order when host card is collapsed
```

No strict format is enforced. Multi-paragraph bodies are welcome for non-trivial changes.

## What to Work On

If you're new, look for issues labeled **`good first issue`** or **`help wanted`**. Beyond that, the [`ROADMAP.md`](./ROADMAP.md) lists larger initiatives that are open for ownership:

- Full-board collaborative sync (groups, docs, suggestions, critiques, connections, history)
- WebRTC peer collaboration
- Cross-device persistence / cloud backup
- Extension-origin WebMCP tool exposure

## Code Style

- TypeScript strict mode is on. New code should typecheck cleanly.
- Match surrounding formatting; we don't currently run a formatter in CI.
- Keep components reasonably small and colocated with their hooks/helpers.
- Prefer explicit, typed WebMCP tool surfaces over ad-hoc message passing — this is a core design principle.

## Testing

Test infrastructure is light today. If you add or change critical flows, please:

1. Describe the manual test steps in the PR description.
2. Run `npm run typecheck` and both build commands.
3. If you're touching the canvas, exercise drag, group, merge, discard/restore, and undo at minimum.

## Reporting Bugs

Open an issue using the bug template. Include:

- Browser + version
- Whether WebMCP flag is enabled
- Steps to reproduce
- What you expected vs. what happened
- Console errors if any

## Security Issues

**Do not open public issues for security vulnerabilities.** See [`SECURITY.md`](./SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the MIT License (see [`LICENSE`](./LICENSE)).

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). Be kind.
