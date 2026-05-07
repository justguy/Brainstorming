# Maintainers

## Status: Looking for Maintainers

This project is being opened to community ownership. The original author (Adi Levinshtein) is unable to continue active development and is inviting contributors to take it forward.

If you are interested in becoming a maintainer — empowered to triage issues, review PRs, cut releases, and steer the roadmap — please open an issue titled **"Maintainer interest: <your-handle>"** introducing yourself, your background, and which areas you'd like to own (web app, extension, WebMCP, sync, docs, etc.).

## Current Maintainers

- **Adi Levinshtein** ([@justguy](https://github.com/justguy)) — original author, transitioning to a reduced-availability advisory role.

## Areas Looking for Owners

- **Web app** (`apps/web/`) — canvas, facilitator UI, idea lifecycle.
- **Chrome extension** (`src/`) — sidepanel, providers, BYOK config.
- **WebMCP tool surface** — see `WEBMCP_README.md` and `WEBMCP_CAPABILITIES.md`.
- **Sync layer** (Yjs, IndexedDB, future WebRTC / cross-device).
- **Docs and onboarding** — README polish, demo videos, tutorials.

Each area can have multiple co-owners. Active contributors will be invited to the maintainer team after a track record of merged PRs and constructive review.

## How Maintainership Works (Proposed)

1. **Triage:** any maintainer may label, close, or reassign issues.
2. **Reviews:** PRs need approval from at least one maintainer (two for changes that touch the WebMCP tool surface or storage schema).
3. **Releases:** release authority rotates; maintainers tag versions and publish notes.
4. **Roadmap:** decisions on direction happen in GitHub Discussions or via RFC issues. Major changes need lazy consensus among active maintainers.

This governance model is a starting point — once a stable maintainer team forms, the team is encouraged to revise it by PR.

## Contact

- Security issues: see [`SECURITY.md`](./SECURITY.md).
- General questions: open a GitHub issue or discussion.
- Maintainer-private matters: contact [@justguy](https://github.com/justguy) on GitHub.
