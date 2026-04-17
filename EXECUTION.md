# Brainstorming Orchestrator — Execution Plan (v2)

**Goal:** Chrome Extension (MV3) that captures ideas and runs them through an 8-phase brainstorming pipeline using a user-supplied LLM (BYOK/BYOS across OpenAI, Anthropic, Gemini). Exports a Phase-8 handoff artifact the user can paste into any Canvas-style workspace.

**Core architectural principle:** The extension owns the state machine, the critical-thinking protocol (ct-mcp), and constraint enforcement. The user's LLM is a **replaceable computation engine** invoked per-phase with a structured micro-task. It never decides phase transitions. It always returns schema-validated JSON.

**Scope:** Extension-only, client-side inference, no backend. Storage is local-first (IndexedDB). Multiplayer deferred to V1.1.

**Tech:** Vite + React 18 + TypeScript + Tailwind + `idb` + `zod` (schema validation) + Manifest V3.

---

## Directory Layout

```
Brainstorming/
├── EXECUTION.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── public/
│   ├── manifest.json
│   └── icons/
├── src/
│   ├── types.ts                     (shared domain types + ct-mcp payload types)
│   ├── background/
│   │   └── service-worker.ts
│   ├── popup/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── Popup.tsx
│   ├── options/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── Options.tsx              (provider picker + BYOK for each)
│   ├── sidepanel/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── SidePanel.tsx
│   ├── workspace/
│   │   ├── Workspace.tsx
│   │   ├── PhaseSection.tsx
│   │   ├── markdown.tsx
│   │   └── fallbacks/               (static UI for graceful degradation)
│   │       ├── PremortemQuestions.tsx
│   │       └── ApproachTemplate.tsx
│   ├── providers/                   (LLM adapter layer — the "universal router")
│   │   ├── BaseProvider.ts          (interface contract)
│   │   ├── geminiProvider.ts
│   │   ├── openaiProvider.ts
│   │   ├── anthropicProvider.ts
│   │   └── index.ts                 (provider registry + selectProvider())
│   ├── orchestrator/
│   │   ├── ctmcp.ts                 (payload builder: sys + state + ambiguities + rules + task)
│   │   ├── stateMachine.ts          (owns phase transitions; LLM never decides)
│   │   ├── roles/                   (micro-agent prompts + schemas)
│   │   │   ├── ambiguityExtractor.ts
│   │   │   ├── clarificationAuthor.ts
│   │   │   ├── approachSynthesizer.ts
│   │   │   ├── rulesExtractor.ts
│   │   │   ├── premortemRedTeam.ts
│   │   │   ├── briefComposer.ts
│   │   │   ├── selfReviewer.ts
│   │   │   └── readinessJudge.ts
│   │   ├── retryAndFallback.ts      (schema-validation retry + graceful degradation hook)
│   │   └── readinessGate.ts
│   ├── storage/
│   │   ├── db.ts
│   │   ├── ideas.ts
│   │   └── settings.ts
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Badge.tsx
│   │   └── IdeaListItem.tsx
│   └── styles.css
└── README.md
```

---

## Shared Type Contract (`src/types.ts`)

```ts
export type IdeaStatus = 'captured' | 'in_progress' | 'blocked' | 'ready_for_handoff' | 'archived';
export type Phase = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type Density = 'simple' | 'standard' | 'expert';
export type ProviderId = 'gemini' | 'openai' | 'anthropic';

// --- Provider-agnostic message format (like OpenAI chat schema) ---
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// --- Role-specific artifacts produced by each micro-agent ---
export type Severity = 'high' | 'medium' | 'low';
export type ResolutionMode = 'ask' | 'assume' | 'prototype' | 'research' | 'defer';
export type AmbiguityType =
  | 'terminology' | 'goal' | 'scope' | 'audience' | 'ux'
  | 'data_process' | 'integration' | 'operational'
  | 'policy_legal_security' | 'ownership';

export interface Ambiguity {
  id: string;
  type: AmbiguityType;
  plainLanguage: string;
  severity: Severity;
  resolutionMode: ResolutionMode;
}

export interface ClarificationQuestion {
  id: string;
  ambiguityId: string;
  question: string;
  answer?: string;
}

export interface Approach {
  id: string;
  label: string;
  summary: string;
  scores: {
    speed: number; cost: number; complexity: number; maintainability: number;
    teamBurden: number; userValue: number; operationalLoad: number;
    adoptionRisk: number; reversibility: number; complianceRisk: number;
  };
  rejectionReason?: string;
}

export interface RiskItem { id: string; description: string; likelihood: Severity; impact: Severity; }

export interface BriefState {
  problemStatement?: string;
  audience?: string;
  desiredOutcome?: string;
  mustStayTrueRules: string[];
  chosenApproachId?: string;
  approaches: Approach[];
  rejectedApproaches: Approach[];
  risks: RiskItem[];
  successCriteria: string[];
  outOfScope: string[];
  openQuestions: string[];
  nextStep?: 'planning' | 'prototyping' | 'research' | 'stakeholder_review' | 'defer';
}

export interface Idea {
  id: string;
  rawText: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  status: IdeaStatus;
  phase: Phase;
  briefState: BriefState;
  ambiguities: Ambiguity[];
  clarifications: ClarificationQuestion[];
  turnLog: LlmMessage[];              // flattened audit trail across all micro-agent calls
  artifactMd?: string;                // rendered workspace markdown (derived from briefState)
  readiness: 'red' | 'yellow' | 'green';
  providerUsed?: ProviderId;
}

export interface ProviderCredentials {
  gemini?: string;
  openai?: string;
  anthropic?: string;
}

export interface Settings {
  credentials: ProviderCredentials;
  activeProvider: ProviderId;
  activeModel: string;                // e.g. 'gemini-2.5-pro', 'gpt-4o', 'claude-sonnet-4-6'
  density: Density;
}

// --- ct-mcp payload that every micro-agent call is built from ---
export interface CtMcpPayload {
  roleSystemPrompt: string;           // the micro-agent's role definition
  briefState: BriefState;             // current state (feeds constraint-forcing)
  detectedAmbiguities: Ambiguity[];   // what's still unresolved
  mustStayTrueRules: string[];        // cross-reference target (constraint forcing)
  task: string;                       // the specific ask for this turn
  outputJsonSchema: object;           // zod-derived JSON schema the model must return
}
```

---

## Provider Adapter Contract (`src/providers/BaseProvider.ts`)

```ts
export interface LlmCallArgs {
  model: string;
  messages: LlmMessage[];
  jsonSchema?: object;                // if present, force structured output
  maxTokens?: number;
  onChunk?: (delta: string) => void;  // streaming callback
}

export interface LlmCallResult {
  raw: string;
  parsedJson?: unknown;
  usage?: { input: number; output: number };
}

export interface BaseProvider {
  id: ProviderId;
  availableModels: string[];
  validateCredentials(key: string): Promise<boolean>;
  call(args: LlmCallArgs & { apiKey: string }): Promise<LlmCallResult>;
}
```

Each provider (`geminiProvider`, `openaiProvider`, `anthropicProvider`) implements this. All calls are made from the extension's service worker — keys live in `chrome.storage.local` only, never leave the device. `providers/index.ts` exposes `selectProvider(id): BaseProvider`.

---

## ct-mcp: Critical-Thinking Model Context Protocol

Every LLM call is built by `src/orchestrator/ctmcp.ts`:

```
buildPayload(role, idea, task) → CtMcpPayload
  - role = one of 8 micro-agent roles
  - briefState = current Idea.briefState
  - detectedAmbiguities = Idea.ambiguities (unresolved only)
  - mustStayTrueRules = Idea.briefState.mustStayTrueRules (injected on EVERY call)
  - task = role-specific instruction
  - outputJsonSchema = role-specific Zod schema as JSON schema

payload → LlmMessage[] → provider.call({ messages, jsonSchema })
```

Constraint-forcing: rules from earlier phases are re-injected on every subsequent call so the model must stay consistent. The state machine validates the returned JSON; on failure, `retryAndFallback.ts` kicks in.

---

## Micro-Agent Roles

Each role in `src/orchestrator/roles/` exports:
```ts
{
  id: string;
  systemPrompt: string;        // role definition, no giant monolithic prompt
  schema: z.ZodType;           // output contract
  buildTask(idea): string;     // role-specific task instruction
  parse(raw): ParsedResult;    // from structured output → domain type
}
```

| Role                   | Runs at Phase | Output                                  |
|------------------------|---------------|-----------------------------------------|
| `ambiguityExtractor`   | 0 → 1         | `Ambiguity[]`                           |
| `clarificationAuthor`  | 1 → 2         | up to 3 `ClarificationQuestion[]`       |
| `approachSynthesizer`  | 2 → 3         | 2–3 `Approach[]` with scores            |
| `rulesExtractor`       | 3 → 4         | `mustStayTrueRules: string[]`           |
| `premortemRedTeam`     | 4             | `RiskItem[]` + failure modes            |
| `briefComposer`        | 4 → 5         | full `BriefState` update + `artifactMd` |
| `selfReviewer`         | 6             | contradictions, gaps, blockers          |
| `readinessJudge`       | 6 → 7/8       | `{ready, blockers, recommendedNext}`    |

---

## Retry + Graceful Degradation (`src/orchestrator/retryAndFallback.ts`)

1. **First attempt:** call provider with JSON schema. Parse + validate with Zod.
2. **On parse failure:** retry once with `"Your previous response failed schema validation. Return ONLY valid JSON matching: <schema>"`.
3. **On second failure:** surface a **graceful-degradation UI**:
   - Premortem → static list of rigorous challenge questions (`fallbacks/PremortemQuestions.tsx`).
   - Approach synthesis → blank approach template user fills manually (`fallbacks/ApproachTemplate.tsx`).
   - Others → plain textarea with role guidance.
4. Mark `idea.readiness = 'yellow'` whenever a fallback is used so the user knows the AI portion is incomplete.

---

## Execution Phases

### Phase 1 — Scaffold ✅ DONE
Skeleton in place, stubs compile, `npm install` + `npm run build` pass.

**Amendments for v2:**
- Remove `@google/genai`-only dependency; add `zod` for schema validation. Keep `@google/genai` only inside `geminiProvider.ts` (or replace with raw `fetch` to keep one dependency path per provider).
- Host permissions expand: `https://generativelanguage.googleapis.com/*`, `https://api.openai.com/*`, `https://api.anthropic.com/*`.
- Update `src/types.ts` to match the v2 contract above.
- Add stub files for new paths (`providers/*`, `orchestrator/roles/*`, `orchestrator/ctmcp.ts`, `orchestrator/retryAndFallback.ts`, `workspace/fallbacks/*`).

### Phase 2 — Feature modules (3 Sonnet agents in parallel)

**Agent 2A — Storage + service worker** (`src/storage/`, `src/background/service-worker.ts`)
- `db.ts`: `idb` schema for `ideas` object store (indexes on `status`, `updatedAt`).
- `ideas.ts`: CRUD + `appendTurn(ideaId, LlmMessage)`, `updateBriefState`, `setReadiness`.
- `settings.ts`: `chrome.storage.local` wrapper; structure matches `Settings` type v2 (credentials per provider).
- `service-worker.ts`: on install set defaults; open side panel on action click; **route all provider calls from the worker** (centralized place where keys are read, so content/UI scripts never touch credentials).
- Export a `smokeTest()` that round-trips an idea with all v2 fields.

**Agent 2B — Providers + orchestrator + roles** (`src/providers/`, `src/orchestrator/`)
- Scaffold amendments: add `zod` to deps if not already; expand host_permissions.
- `providers/`:
  - `BaseProvider.ts` — the interface above.
  - `geminiProvider.ts` — uses Gemini REST API (or `@google/genai` if scaffold keeps it). `responseSchema` for structured output.
  - `openaiProvider.ts` — uses `/v1/chat/completions` with `response_format: { type: 'json_schema', ... }`.
  - `anthropicProvider.ts` — uses `/v1/messages` with tool-use forcing for schema adherence.
  - `index.ts` — `selectProvider`, shared model catalog (Gemini 2.5 Pro/Flash, GPT-4o/4o-mini, Claude Sonnet/Haiku 4.x).
- `orchestrator/ctmcp.ts` — `buildPayload(role, idea, task): CtMcpPayload`, plus `payloadToMessages(payload): LlmMessage[]`.
- `orchestrator/roles/*` — 8 role modules as specified above. Keep system prompts **short and role-scoped**. Schemas in Zod.
- `orchestrator/stateMachine.ts` — `advance(idea, userInput): Promise<Idea>` that: (1) looks at `idea.phase`, (2) picks the role, (3) builds ct-mcp payload, (4) calls provider via router, (5) parses/validates, (6) updates `briefState`/`ambiguities`/etc., (7) bumps phase, (8) re-renders `artifactMd`. **The LLM never decides phase.**
- `orchestrator/retryAndFallback.ts` — retry-once + fallback signalling.
- `orchestrator/readinessGate.ts` — uses `readinessJudge` role; if blockers exist, returns `{ready: false, blockers}` and the UI shows 🛑.

**Agent 2C — UI shell** (`src/popup/`, `src/options/`, `src/sidepanel/`, `src/workspace/`, `src/ui/`)
- `Popup.tsx`: quick capture (textarea + tags + Save / Brainstorm now).
- `Options.tsx`: provider picker (radio); per-provider API key fields (password inputs, only the active provider is required); model dropdown scoped to active provider; density radio. Validate key with `provider.validateCredentials()` on save.
- `SidePanel.tsx`: left = idea list (with readiness badge), right = `<Workspace>`.
- `Workspace.tsx`: renders `artifactMd` with collapsible `<PhaseSection>`s; for each unlocked phase with pending user input, show textarea + Submit (→ `stateMachine.advance`). If a fallback was triggered, render the corresponding `fallbacks/*` component instead of AI output.
- Export button: enabled only when readiness = green; downloads `handoff_<slug>.md` and copies to clipboard.
- `ui/`: primitives.

### Phase 3 — Integration + Polish (1 Sonnet agent)
- Wire `Popup → SidePanel` via `chrome.sidePanel.open()` + query param / message.
- Density toggle → client-side filter (hide sections marked with `### ⚙️ Expert Annex` when density = simple).
- Readiness badge computed from `idea.readiness`.
- `README.md` updates: provider setup instructions for each of 3 options.
- Final `npm run build` clean. Manually verifiable via `chrome://extensions → Load unpacked → dist/`.

---

## Open Decisions

- **Storage:** local-first IndexedDB confirmed. Multiplayer/cloud deferred to V1.1.
- **Providers V1:** Gemini, OpenAI, Anthropic. OAuth (Google) deferred to V1.1.
- **Inference location:** all from service worker, client-side. Keys in `chrome.storage.local`.
- **Structured output:** every role uses JSON schema; retry once; then fallback UI.

## Known Unknowns

- Exact Anthropic structured-output path (tool-use forcing vs. `response_format`) — Agent 2B picks whichever is stable in 2026.
- Whether `@google/genai` supports JSON schema mode cleanly — Agent 2B may swap to raw `fetch`.
- Token-usage tracking: tracked but not gated in V1.

---

## Phase 4 — WebMCP Integration (3 parallel agents)

WebMCP is a Chrome-146+ browser standard exposing structured tools to agentic browsers via `navigator.modelContext.registerTool(...)` or annotated HTML forms. We pursue three integrations in parallel.

### Agent W1 — Live tool context from active tab

Read WebMCP tools from the user's currently-open tab and feed them into the ct-mcp payload during Phase 0/1 so the orchestrator can invoke real-site data probes (e.g., `get_order_stats` on an admin dashboard) during ambiguity extraction.

**Files W1 owns:**
- `src/webmcp/contextBridge.ts` (side-panel side — messages the content script)
- `src/webmcp/types.ts` (shared tool-descriptor types)
- `src/content/webmcp-reader.ts` (content script — reads `navigator.modelContext`)
- modifies: `public/manifest.json` (adds `scripting`, `activeTab` perms + content_scripts), `src/orchestrator/ctmcp.ts` (payload includes `liveToolContext`), `src/orchestrator/stateMachine.ts` (queries bridge at Phase 0/1), `src/sidepanel/SidePanel.tsx` (consent banner + detected-tools display), `src/workspace/Workspace.tsx` (live-context section)

### Agent W2 — Side panel WebMCP surface spike

Register our brainstorming operations as WebMCP tools inside the side panel so external agentic browsers could drive the 8-phase flow without scraping. **Unknown:** whether `navigator.modelContext` is injected into `chrome-extension://` side panel origins.

**Files W2 owns:**
- `src/webmcp/registerPanelTools.ts` (global tools: `list_ideas`, `get_idea`, `capture_idea`, `export_handoff`)
- `src/webmcp/registerPhaseTools.ts` (per-phase tools: `submit_clarifications`, `select_approach`, `confirm_rules`)
- `src/webmcp/detectSupport.ts` (runtime probe, exposes `window.__WEBMCP_STATUS`)
- `src/webmcp/webmcp-ambient.d.ts` (type augmentation for `navigator.modelContext`)
- `WEBMCP_SPIKE.md` (findings + test plan)

### Agent W3 — Parallel web-app surface

Mount the same React components as a standalone web app at a URL. Register the full brainstorming tool set so any agentic browser can drive sessions from any tab.

**Files W3 owns:**
- `apps/web/index.html`, `apps/web/main.tsx`, `apps/web/App.tsx`
- `apps/web/chrome-shim.ts` (polyfills `chrome.storage.local`, `chrome.runtime.sendMessage`, `chrome.downloads`)
- `apps/web/webmcp-tools.ts` (registers all brainstorming tools)
- `apps/web/Options.tsx` (web-native settings page)
- `vite.config.web.ts` (second build target)
- modifies: `package.json` (scripts `build:web`, `dev:web`)

Reuses existing `src/storage/`, `src/orchestrator/`, `src/providers/`, `src/workspace/`, `src/ui/` modules by shimming the `chrome.*` globals — no refactor to extension code.
