# 8-Screen Implementation Plan

Companion to `Design/Screen Map.html` (visual reference) and `Design/Build Spec.html` (contract). This file is the working plan; tasks live in the `brainstorming-orchestrator` tracker under the **screens-v2** swimlane.

---

## 0. Decisions (locked in)

| # | Decision | Choice |
|---|---|---|
| 1 | Brief storage shape | `briefState` stays embedded on `Idea` for live derivation. New `briefs` IDB store holds explicit version snapshots and margin notes. |
| 2 | Connection enum | Keep `revives_killed` as a 6th kind. Spec's 5 kinds extend the existing 4; no data migration needed. |
| 3 | Persona autonomy | UI dial wires through to existing role gating. Cost caps and budget-enforcing layer **deferred** to v2. |
| 4 | Handoff scope | **Real LLM-driven interrogation at handoff** — personas critique the brief one final time before ship. Real channel integrations (GitHub, Notion, Linear, Slack) included. |
| 5 | `local-board` id | Keep stable. Existing hash links continue to resolve. New boards under default project use UUIDs. |

---

## 1. Executive summary

- 8 screens ≠ 8 weeks of greenfield. ~70% of Screen 02 already exists; the real work is introducing a **Project layer** above the single board, a **Persona** data entity, a **versioned Brief**, and a **routing parser**.
- One amendment to the spec's M1–M5 order: insert **M0 scaffolding** (Project entity + DB v11 migration + route parser + thin Home shim) before M1 so M1's data work has a consumer.
- **Don't create a parallel `events` store.** Derive `LogEvent` as a read-side projection over the existing `changeSets`. Append-only is already a property of the system; spec satisfied without dual-write risk.
- **Two pre-reqs gate progress:** (1) safe IDB migration of existing user boards into a default project, (2) a Persona facade that maps to role files in `src/orchestrator/roles/`.
- Time-of-build feel: M0 unblocks; M2 feels like progress (Screen 02 mostly works); M3 is where the system gains intelligence; M4 is "now it's a product"; M5 is icing.

---

## 2. Data-model migration

| Entity | Status today | Target file | Action |
|---|---|---|---|
| `Project` | does not exist | `src/types.ts` | new interface |
| `Board` | exists as `BoardRecord` in `src/board/types.ts` | extend in place | add `projectId`, `summary`, `status`, `currentPhase`, `activePersonas`, `lastActivityAt`, `openedBy` |
| `Idea` | exists in `src/types.ts` | extend in place | add `pinnedToBoardIds`, `parentIdeaId`, `contradictions`, `state` (`draft \| live \| settled \| muted`), `authorRef`, `color: StickyColor` |
| `Connection` | exists in `src/types.ts` | extend in place | add `from/to`, `type` mapping, `authorRef`, `confidence`, `reasoning`, `supersededBy`. Keep `kind` enum **with all 6 kinds** (existing 4 + `depends_on` + `evidence_for`). |
| `Cluster` | partially exists as `IdeaGroup` | extend `IdeaGroup` in place | add `source`, `confidence`, `haloColor`, `state` |
| `Persona` | does not exist | `src/types.ts` + `src/personas/registry.ts` | new entity. Built-ins (Scout/Synthesizer/Devil/Historian) defined as constants; custom ones in IDB |
| `LogEvent` | partially modeled by `ChangeSetRecord` | new derived projection at `src/storage/logEventProjection.ts` | **Read-side view** over existing `changeSets`. Do not create a parallel store. |
| `Brief` | partially exists as `BriefState` embedded on `Idea` | new top-level entity + new IDB store | `BriefState` stays for live derivation; `Brief` adds `versions[]` + `marginNotes[]` + ship status |

**New files:**

- `src/types.ts` — extend with `Project`, `Persona`, `Brief`, `MarginNote`, `LogEvent`, `StickyColor`, `AutonomyLevel`.
- `src/board/types.ts` — extend `BoardRecord` with project-scoped fields.
- `src/storage/projects.ts` — `getProject`, `ensureProject`, `listProjects`, `updateProject`.
- `src/storage/personas.ts` — persona CRUD + roster queries.
- `src/storage/briefs.ts` — brief CRUD + version snapshots.
- `src/storage/logEventProjection.ts` — read-side projection over `changeSets`/`beatRuns`/`beatReviewSessions`.
- `src/storage/db.ts` — bump `DB_VERSION` from 10 to 11; add `projects`, `personas`, `briefs` stores.

**IDB v11 upgrade callback** (when `oldVersion < 11`):

1. Create `projects`, `personas`, `briefs` stores.
2. Insert default `Project { id: 'local-project', title: 'My workspace', autonomyDial: 'active' }`.
3. Iterate every existing `BoardRecord`, patch in `projectId: 'local-project'`, `status: 'active'`, `currentPhase: 1`, `lastActivityAt: updatedAt`. **The existing `'local-board'` keeps its id** — hash deep-links continue to resolve.
4. Seed four built-in personas (Scout/Synthesizer/Devil/Historian) into `personas` with `active: true`, `scope: 'project'`.
5. No back-fill of `Brief` rows — briefs come into existence only on graduation.

---

## 3. Routing changes

Today: `useHashRoute()` returns the raw hash string. App.tsx does `hash === '#/options'`.

Plan:

- New file `apps/web/routing/parseRoute.ts` exporting `parseRoute(hash: string): RouteState`.
- `RouteState` is a discriminated union: `home | board | brief | handoff | log | map | options | unknown`.
- ~30 lines of regex matching. **No router library.**
- `apps/web/useHashRoute.ts` (or new `apps/web/routing/useRoute.ts`) layers parser on top, returns `[RouteState, navigate]`.
- `App.tsx` becomes `switch (route.kind)`.

**Route table** (Build Spec §04):

| Hash | Lands on |
|---|---|
| `` (empty) or `#/p/:projectId` | Screen 01 (home) |
| `#/b/:boardId` | Screen 02 (canvas) |
| `#/b/:boardId?idea=:id` | Screen 02 with idea inspector-focused |
| `#/b/:boardId/map` | Screen 03 |
| `#/b/:boardId/brief/:ideaId` | Screen 04 |
| `#/b/:boardId/log` | Screen 06 |
| `#/b/:boardId/handoff/:briefId` | Screen 07 |
| `#/options` | Options |

---

## 4. Shared primitives

Per Build Spec §02 — list, current state, gap, target file:

- **`<Sticky>`** — exists piecemeal in `src/canvas/reactflow/IdeaNoteNode.tsx` and `apps/web/IdeaFocusSlot.tsx`. Extract `apps/web/primitives/Sticky.tsx` with `mode: 'card' | 'chip' | 'thumbnail'`.
- **`<ConnectionLine>`** — exists as `src/canvas/ConnectionOverlay.tsx`. Extract `apps/web/primitives/ConnectionLine.tsx` with the 6-kind grammar (5 from spec + `revives_killed` legacy). Adapter at `src/connections/kindMapping.ts`.
- **`<PhaseStrip>`** — partial: `apps/web/BoardBeadStrip.tsx` is the per-idea bead strip. Build `apps/web/primitives/PhaseStrip.tsx` taking arbitrary `currentPhase`.
- **`<PersonaChip>`** — does not exist. Build `apps/web/primitives/PersonaChip.tsx`. `apps/web/PeerPresenceStrip.tsx` is a style template.
- **`<NudgeCard>`** — partial in `AppCompanionRail.tsx` / `RobotNotesSummary.tsx`. Extract `apps/web/primitives/NudgeCard.tsx` with canonical `[accept] [preview] [dismiss]` triple.
- **`<ConfirmBar>`** — does not exist. Build `apps/web/primitives/ConfirmBar.tsx`. **Behavior change:** phase advances must route through this gate.
- **`<BoardThumbnail>`** — does not exist. Build `apps/web/primitives/BoardThumbnail.tsx`.

Color tokens: reuse `--y --p --b --pe --g --l` from `src/styles.css`.

---

## 5. Per-screen outline

### Screen 01 · Multi-board home (P1)
- Files: `apps/web/screens/HomeScreen.tsx`, `home/BoardTile.tsx`, `home/CrossBoardSearchOverlay.tsx`, `home/NewBoardPrompt.tsx`.
- Data: Project, Board[], LogEvent digest per board.
- New hook: `apps/web/useProjectSync.ts`. `useBoardSync` becomes board-scoped; mounted by BoardScreen.
- Reuse: `<BoardThumbnail>`, `<NudgeCard>`, header pill from `AppHeaderBar`.
- Build position: M4.

### Screen 02 · Cluster view (P1)
- Files: `apps/web/screens/BoardScreen.tsx` (wraps current `BoardAppView`), `board/ClusterHaloLayer.tsx`, `board/ZoomViewToggle.tsx`.
- Data: Board, Idea[], Connection[], Cluster[] (extended IdeaGroup), Persona[].
- State adds: `zoomLevel`, `viewMode: 'sticky' | 'cluster' | 'map'`.
- Reuse: full canvas pipeline (`BoardCanvasStage`, `BoardWorkspaceOverlays`, `IdeaBloomLayer`, `IdeaFocusSlot`, `useCanvasIdeaMutations`).
- Cluster zoom: CSS `transform: scale()` over React Flow viewport. **Don't render two canvases.**
- Build position: M2 (sticky zoom, no AI), M3 (cluster zoom + Synthesizer).

### Screen 03 · Cross-board map (P2)
- Files: `apps/web/screens/MapScreen.tsx`, `map/BoardPlanet.tsx`, `map/PrinciplesDrawer.tsx`, `src/orchestrator/roles/themeOverlapDetector.ts`.
- Data: Project.principles, Board[], derived edges (cross-board pinned ideas + AI theme overlap).
- Layout: manual gravity grid (no d3-force; tiny board count).
- Build position: M5.

### Screen 04 · The Brief (P1)
- Files: `apps/web/screens/BriefScreen.tsx`, `brief/BriefSection.tsx`, `brief/MarginNoteList.tsx`, `brief/BriefVersionPicker.tsx`, `apps/web/useBriefSync.ts`.
- Data: Idea (source) + Connection[] (children) + Brief (versions, margin notes) + Persona[] + LogEvent[].
- Reuse: existing `Workspace.tsx` already renders phase sections — Brief is a richer presentation, not greenfield.
- Versioning: snapshot on `⌘S` only (auto-versioning would explode the store).
- Build position: M4.

### Screen 05 · Connection inspector (P2, popover)
- Files: `apps/web/screens/board/ConnectionInspectorPopover.tsx`, `board/useConnectionInspector.ts`.
- Data: Connection, Idea from/to, LogEvent history.
- Action: flip type creates new Connection with `supersededBy` back-pointer.
- Reuse: `<ConnectionLine>` mini map, `<PersonaChip>`. Soft-delete pattern from `boardController.dismissCritique`.
- Build position: M2 (validates the line model early).

### Screen 06 · Project log + scrubber (P2)
- Files: `apps/web/screens/LogScreen.tsx`, `log/LogEventList.tsx`, `log/TimelineScrubber.tsx`, `src/storage/logEventProjection.ts`.
- Data: projected LogEvent[] from `changeSets` + `beatRuns`, Persona[] (author resolution), Board.
- Scrubber adds `peekTs` state via new `useBoardLogReplay` hook.
- Reuse: `apps/web/BoardHistoryPanel.tsx` is the v0 of LogEventList — refactor in place.
- Fork-from-here: new mutation `forkBoardAtSeq(boardId, seq) → newBoard` in `src/board/forkController.ts`.
- Build position: M2 (feed only), M4 (scrubber + fork).

### Screen 07 · Handoff (P3 → upgraded P2 by decision #4)
- Files: `apps/web/screens/HandoffScreen.tsx`, `handoff/ChannelCard.tsx`, `handoff/PreShipInterrogator.tsx`, `handoff/formatters/{githubIssue,slackPost,linearTicket,notionDoc}.ts`, `handoff/integrations/{githubAdapter,notionAdapter,linearAdapter,slackAdapter}.ts`.
- **Real LLM-driven pre-ship interrogation:** active personas re-read the brief, post final critiques as nudges. User must address or dismiss before ship.
- **Real channel integrations:** OAuth + actual API writes to GitHub/Notion/Linear/Slack. Channel auth lives in Options.
- Build position: M5 (formatters + interrogator), M5+ (channel integrations one at a time).

### Screen 08 · Persona panel (P2)
- Files: `apps/web/screens/personas/PersonaPanel.tsx`, `personas/AutonomyDial.tsx`, `personas/PersonaDetailDrawer.tsx`, `personas/CustomPersonaForm.tsx`.
- Data: Persona[] (project + board scope merged), Project.autonomyDial.
- Autonomy dial is a 4-stop UI control wired to existing role-gating. **Cost caps deferred** (decision #3).
- Reuse: extend `useFacilitatorSync.ts` boolean pause → 4-stop dial.
- Persona ↔ role mapping at `src/personas/registry.ts` (facade over `src/orchestrator/roles/`).
- Build position: M3.

---

## 6. Build order & milestones

### M0 · Scaffolding (~3 days)
- Route parser + RouteState union.
- Project entity + `src/storage/projects.ts` + DB v11 migration.
- Trivial `HomeScreen` shim that lists boards by title.
- `useProjectSync` hook.
- Migration test: seed v10 DB, open at v11, assert board visible under default project.

### M1 · Foundations (week 1–2)
- Extend Idea/Connection/Board types with new fields.
- Build the seven shared primitives.
- LogEvent projection.
- **Acceptance:** Trust 1 (every change has LogEvent).

### M2 · The board works (week 2–4)
- Refactor `App.tsx` body → `BoardScreen.tsx`.
- **Screen 05** Connection inspector popover.
- **Screen 06** log feed (no scrubber).
- Migrate `BoardHistoryPanel` → `LogEventList`.
- Adopt new Connection fields with adapter.
- **Acceptance:** Trust 1, Trust 3 (5s undo). Coherence 2 (partial).

### M3 · AI joins the room (week 4–6)
- **Screen 08** Persona panel + autonomy dial.
- Wire dial through `runScout`, `runConnectionFinder`, `runCritiqueIdea` so `silent` actually silences them.
- **Screen 02** cluster zoom + Synthesizer halos.
- Generalize nudge surfaces to `<NudgeCard>` and obey the §04 Nudge Protocol.
- **Acceptance:** Trust 2 (no auto-apply below `takes-pen`). Coherence 2.

### M4 · Output & navigation (week 6–8)
- **Screen 01** Multi-board home polish.
- **Screen 04** Brief.
- **Screen 06** scrubber + fork-from-here.
- **Acceptance:** Coherence 1 (sticky↔brief sync). Recoverability 1, 2, 3. Discoverability 1.

### M5 · System scale (week 8+)
- **Screen 03** Cross-board map + principles.
- **Screen 07** Handoff (interrogator + formatters).
- **Screen 07** Channel integrations (one at a time): GitHub → Notion → Linear → Slack.
- Custom personas.

---

## 7. Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | IDB migration loses existing user boards | High | v11 upgrade back-fills `projectId: 'local-project'`. Test seeds v10, opens at v11, asserts visibility. Add "reset workspace" escape in Options. |
| 2 | Persona infra not real today (only roles) | High | Persona = thin facade. Map to role functions via `src/personas/registry.ts`. **Cost caps deferred (decision #3).** |
| 3 | Cluster zoom perf at 200+ ideas | Medium | Use `transform: scale()` over React Flow viewport. Profile with seed board before declaring done. |
| 4 | Channel integrations are large | High | Spec one at a time post-M5. Treat each as its own multi-day mini-project. Ship interrogator + formatters first; integrations behind feature flags. |
| 5 | Styling drift between mockups and Tailwind tokens | Medium | New screens import zero new fonts; read only from `src/styles.css`. Code-review checklist. |

---

## 8. Open design questions (non-blocking)

- Empty-state Home when project has zero boards.
- "Shared with you" tab — multiplayer story not yet defined.
- Auto-versioning of briefs (currently snapshot on `⌘S`).
- `pinnedToBoardIds` propagation — single source of truth or per-board copy with sync arrow? (Recommend single source.)
- Demo data per new board vs. only the very first.
- Do briefs survive board archive? (Recommend yes — they are project-level outputs.)
