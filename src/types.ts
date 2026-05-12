import type { ActiveTabToolContext } from './webmcp/types';
export type { ActiveTabToolContext } from './webmcp/types';
import type { BeatSourceRef } from './beats/types';

export type IdeaStatus = 'captured' | 'in_progress' | 'blocked' | 'ready_for_handoff' | 'archived' | 'discarded';
// Phase may be an integer (main phase 0-8) or a decimal (micro step, e.g. 0.5, 2.5, 4.5).
// The canonical sub-phase registry lives in src/orchestrator/subPhases.ts.
export type Phase = number;
export type BoardId = string;
export type ProjectId = string;
export type Density = 'simple' | 'standard' | 'expert';
export type ProviderId = 'gemini' | 'openai' | 'anthropic';

// --- Sticky / Idea visual + lifecycle (M1, bo-110) ---
// `StickyColor` is the canonical palette for the `<Sticky>` primitive (Build
// Spec §02). Names map to design tokens consumed by `apps/web/primitives/`.
export type StickyColor =
  | 'yellow'
  | 'pink'
  | 'blue'
  | 'green'
  | 'purple'
  | 'orange'
  | 'gray';

// `IdeaState` is the lifecycle facet that the screens-v2 surfaces (Bloom mode,
// settled-thread halos, mute) read. It is orthogonal to the legacy `IdeaStatus`
// pipeline ('captured' → 'archived') which remains the source of truth for the
// orchestrator. Both coexist by design: the screens-v2 layer overlays `state`
// on top of `status` for visual treatment.
export type IdeaState = 'draft' | 'live' | 'settled' | 'muted';

// Authorship attribution for Ideas / Connections / margin notes. Decoupled
// from the existing actor types so screens-v2 can attribute to a Persona by
// id without dragging the full ChangeActor surface.
export type IdeaAuthorKind = 'user' | 'persona' | 'role' | 'system';
export interface IdeaAuthorRef {
  kind: IdeaAuthorKind;
  // For kind='persona' this is a Persona.id; for 'role' a roleId; for 'user'
  // typically 'self'; for 'system' an opaque source identifier.
  id: string;
  label?: string;
}

// A contradiction is a lightweight pointer to another Idea that materially
// disagrees with this one. Surfaced by Devil's-advocate / Critic personas.
// The cross-board view (Screen 03) renders contradictions as red-tinged edges.
export interface IdeaContradiction {
  // Idea.id of the conflicting idea. May reference a discarded idea.
  ideaId: string;
  // 1-2 sentence explanation. Optional so legacy data without rationale loads.
  rationale?: string;
  // Persona / role / user that surfaced the contradiction.
  authorRef?: IdeaAuthorRef;
  // Optional connection id when the contradiction was materialised as a
  // Connection of kind='contradicts'. Lets the inspector deep-link.
  connectionId?: string;
  createdAt: number;
}

// --- Project entity (M0) ---
// A Project sits above one or more Boards. The default workspace ships with a
// single project (`local-project`) so existing single-board users see no change.
// `autonomyDial` controls how proactive the LLM personas are; UI dial wires
// through to existing role-gating in src/orchestrator/.
export type AutonomyLevel = 'silent' | 'whispers' | 'active' | 'takes-pen';

export interface Project {
  id: ProjectId;
  title: string;
  autonomyDial: AutonomyLevel;
  summary?: string;
  principles?: string[];
  // bo-161 (M5 / Screen 03): AI-detected theme overlap between boards in this
  // project. Produced by the `themeOverlapDetector` role; the cross-board map
  // (Screen 03) renders each entry as an edge between two BoardThumbnails.
  // Stored on the Project (rather than a new IDB store) to keep the shape
  // simple and avoid an extra v12 migration — re-runs replace the whole list.
  crossBoardEdges?: CrossBoardEdge[];
  createdAt: number;
  updatedAt: number;
}

// bo-161 — output edge for the themeOverlapDetector role; persisted on
// `Project.crossBoardEdges`. `boardA` and `boardB` are always distinct and the
// pair is canonicalised at write time so (A,B) and (B,A) collapse to one edge.
// `confidence` is 0.0–1.0; the UI uses it to weight stroke width.
export interface CrossBoardEdge {
  boardA: BoardId;
  boardB: BoardId;
  themes: string[];
  confidence: number;
  rationale?: string;
  // Epoch ms when this edge was last produced. Helps the UI fade stale edges
  // when boards have moved on without a re-run of the detector.
  detectedAt?: number;
}

// --- Persona entity (M1/M3-pre, bo-120) ---
// A Persona is a thin facade over one or more orchestrator role files. Built-in
// kinds map to a fixed roster (see src/personas/registry.ts); 'custom' personas
// are user-created with a free-form roleIds list. Scope determines whether the
// persona is roster-wide (project) or board-only.
export type PersonaKind = 'scout' | 'synthesizer' | 'devil' | 'historian' | 'custom';
export type PersonaScope = 'project' | 'board';

export interface Persona {
  id: string;
  name: string;
  kind: PersonaKind;
  roleIds: string[];
  scope: PersonaScope;
  active: boolean;
  projectId?: ProjectId;
  boardId?: BoardId;
  /**
   * Optional free-form description / system-prompt-ish narrative supplied
   * when a custom persona is authored. Built-ins leave this undefined; the
   * field is purely human-facing today (no orchestrator gating reads it yet).
   */
  description?: string;
  createdAt: number;
  updatedAt: number;
}

// --- Brief entity (M4, bo-151) ---
// `BriefState` (defined further down on `Idea`) stays embedded for live
// derivation. `Brief` is a top-level entity holding explicit version snapshots
// + persona-attributed margin notes + ship status. Briefs come into existence
// only when an idea graduates (no back-fill on existing data).
export type BriefShipStatus = 'draft' | 'ready' | 'shipped' | 'archived';
export type MarginNoteStatus = 'open' | 'resolved' | 'dismissed';

export interface MarginNote {
  id: string;
  briefId: string;
  authorPersonaId?: string;          // resolves to Persona.id; undefined => user
  authorLabel?: string;              // denormalised display label, e.g. "Devil's Advocate"
  text: string;
  anchorSection?: string;            // optional: which brief section this annotates
  anchorVersionId?: string;          // optional: pin to a specific version
  status: MarginNoteStatus;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  resolvedBy?: string;               // 'user' | personaId | role string
  resolutionNote?: string;
}

export interface BriefVersion {
  id: string;
  briefId: string;
  seq: number;
  // Snapshot of the BriefState that produced this version, plus a rendered
  // markdown projection so historical versions are stable across schema drift.
  briefState: BriefState;
  artifactMd?: string;
  authoredBy?: string;               // 'user' | personaId | role
  note?: string;                     // user-supplied label for the snapshot
  createdAt: number;
}

export interface Brief {
  id: string;
  boardId: BoardId;
  ideaId: string;
  projectId?: ProjectId;
  shipStatus: BriefShipStatus;
  versions: BriefVersion[];          // append-only; latest is versions[length-1]
  marginNotes: MarginNote[];
  createdAt: number;
  updatedAt: number;
  shippedAt?: number;
}

// --- Provider-agnostic message format (like OpenAI chat schema) ---
export interface LlmMessageMeta {
  phase?: Phase;
  phaseLabel?: string;
  roleId?: string;
  provider?: ProviderId;
  model?: string;
  source?: 'phase_run' | 'user_input' | 'system' | 'workspace' | 'webmcp_tool';
  entryKind?: 'start' | 'task' | 'result' | 'fallback' | 'note';
  runSurface?: 'llm_role' | 'webmcp_tool' | 'user_edit' | 'system';
  liveToolOrigin?: string;
  liveToolNames?: string[];
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  meta?: LlmMessageMeta;
}

// --- Role-specific artifacts produced by each micro-agent ---
export type Severity = 'high' | 'medium' | 'low';
export type ResolutionMode = 'ask' | 'assume' | 'prototype' | 'research' | 'defer';
export type AmbiguityResolutionStatus = 'open' | 'resolved' | 'deferred' | 'dismissed';
export type IdeaActorType = 'user' | 'ai' | 'tool' | 'system';
export type IdeaActorSource = 'canvas' | 'webmcp' | 'workspace' | 'beat' | 'system';
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
  resolution?: {
    status: AmbiguityResolutionStatus;
    note?: string;
    resolvedBy?: string;
    resolvedAt?: number;
  };
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

export interface RiskItem {
  id: string;
  description: string;
  likelihood: Severity;
  impact: Severity;
  sourceQuestionId?: string;
  sourceQuestion?: string;
  userNote?: string;
  createdAt?: number;
  updatedAt?: number;
}

// Proactive "outside-the-box" content generated by micro-step roles between main phases.
export type LensKind = 'outside_in' | 'analogy' | 'contrarian' | 'user_voice';
export type UserVerdict = 'pinned' | 'dismissed' | 'pending';

export interface LensEntry {
  id: string;
  kind: LensKind;
  frame: string;           // e.g. "If this were a cooking show…" / "A hostile regulator reads this spec…"
  insight: string;         // the actual angle / reframing
  provocation: string;     // the question that forces the user to think
  verdict: UserVerdict;
  userNote?: string;       // user's reaction/reply
}

export type ChallengeStance = 'accept' | 'defer' | 'rebut' | 'pending';

export interface ChallengeEntry {
  id: string;
  critique: string;        // devil's-advocate punch
  evidenceAsk: string;     // what proof would put this to rest
  stance: ChallengeStance;
  userRebuttal?: string;
}

export interface StressResult {
  id: string;
  ruleIndex: number;       // index into briefState.mustStayTrueRules
  edgeCase: string;        // the scenario that might break the rule
  breakMode: string;       // why it breaks
  handled: boolean;        // user marked as addressed
  userResponse?: string;
}

export interface BeadSuggestion {
  phase: Phase;
  reason: string;
  suggestedAt: number;
  actorType: IdeaActorType;
  actorSource: IdeaActorSource;
  actorLabel?: string;
}

export interface BeadReviewFlag {
  id: string;
  phase: Phase;
  reason: string;
  flaggedAt: number;
  actorType: IdeaActorType;
  actorSource: IdeaActorSource;
  actorLabel?: string;
}

export interface BeadCoordinationState {
  suggestedNext?: BeadSuggestion;
  reviewFlags: BeadReviewFlag[];
}

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
  // New micro-step buckets — populated by proactive LLM roles between main phases.
  lenses: LensEntry[];
  challenges: ChallengeEntry[];
  stressResults: StressResult[];
}

// Floating-canvas panel geometry. Optional on older ideas; defaults filled at hydrate time.
export interface Panel {
  x: number;
  y: number;
  width: number;
  height: number;
  groupId?: string; // if set, the idea belongs to a group (see IdeaGroup)
}

// A group of related ideas formed by proximity on the canvas.
export interface IdeaGroup {
  id: string;
  boardId?: BoardId;
  theme?: string;           // short LLM-generated theme ("Things that touch auth")
  sharedQuestion?: string;  // a question that holds the group together
  ideaIds: string[];
  createdAt: number;
  updatedAt: number;
}

// --- Scout suggestions — "ghost" ideas proposed by the outsideKnowledgeScout ---
// Surfaced onto the canvas in a distinct colour. The user can admit (promote to
// a real idea), elaborate (ask the scout for more detail / rationale), or
// dismiss (drop it from the pool). Admitted suggestions reference the new idea.
export type ScoutSuggestionStatus = 'pending' | 'admitted' | 'dismissed';

export interface ScoutSuggestion {
  id: string;
  boardId?: BoardId;
  rawText: string;                      // the suggestion body, in idea-panel shape
  rationale: string;                    // why the scout thinks this is worth considering
  source: string;                       // e.g. "analogy: healthcare triage", "contrarian take", "adjacent field: ops"
  automationKey?: string;               // deterministic key for AI-triggered dedupe across peers
  status: ScoutSuggestionStatus;
  sourceIdeaIds?: string[];             // exact source pair for cross-pollinated suggestions when applicable
  relatedIdeaIds?: string[];            // ids of board ideas the scout leaned on
  elaboration?: string;                 // fleshed-out version if the user asked for elaboration
  admittedIdeaId?: string;              // if admitted, the id of the promoted real Idea
  panel?: Panel;                        // floating-canvas position for the ghost panel
  createdAt: number;
  updatedAt: number;
}

// --- Cross-board connections surfaced by the connectionFinder LLM role ---
// A connection links two or more ideas (possibly including discarded ones).
// supportingDocIds refer to SupportingDoc ids when the evidence came from docs.
//
// Six-kind grammar for screens-v2 (M1 / bo-111):
//  - The five spec kinds: 'builds_on' | 'contradicts' | 'shared_theme' |
//    'depends_on' | 'evidence_for'.
//  - Plus 'revives_killed', the legacy 6th kind retained from the original
//    4-kind canvas model. No data migration needed.
//
// Consumers that only know the legacy 4 kinds should route the new variants
// through `kindMapping` in src/connections/kindMapping.ts so the existing
// canvas (ConnectionOverlay / reactflowHelpers) keeps rendering correctly.
export type ConnectionKind =
  | 'builds_on'
  | 'contradicts'
  | 'revives_killed'
  | 'shared_theme'
  | 'depends_on'
  | 'evidence_for';

// The 4-kind subset understood by the legacy canvas / overlay code path.
// `kindMapping.toLegacyKind` projects every ConnectionKind onto this subset.
export type LegacyConnectionKind =
  | 'builds_on'
  | 'contradicts'
  | 'revives_killed'
  | 'shared_theme';
export type ConnectionStrength = 'weak' | 'medium' | 'strong';

// Lifecycle facet for connections (Build Spec §s05). `active` is the default
// for legacy rows; `superseded` marks a row whose kind was flipped (the new
// row's id is stored on `supersededBy`); `deleted` is the soft-delete state
// used by the inspector's "↶ delete" action so the row survives for log
// replay while disappearing from canvas renderers.
export type ConnectionState = 'active' | 'superseded' | 'deleted';

export interface Connection {
  id: string;
  boardId?: BoardId;
  kind: ConnectionKind;
  ideaIds: string[];            // usually 2, may be more for shared_theme
  supportingDocIds?: string[];  // ids of docs the LLM cited as evidence
  rationale: string;            // 1-3 sentences explaining the link
  strength: ConnectionStrength;
  createdAt: number;
  // Lifecycle marker (Build Spec §s05). Undefined / 'active' renders normally;
  // 'superseded' rows were replaced by a later flip-type write (see
  // `supersededBy`); 'deleted' rows are soft-deleted and hidden from canvas
  // while remaining in the changeSet log for replay.
  state?: ConnectionState;
  // When this row was created via "flip type" on an existing connection, the
  // id of the row this one replaced. The inspector / log scrubber follow the
  // pointer to surface the kind-history of a line.
  supersededBy?: string;
  // Author attribution for connections drawn / edited from screens-v2. Older
  // rows omit this; the connection-finder role is assumed when missing.
  authorRef?: IdeaAuthorRef;
}

export type CritiqueStatus = 'active' | 'dismissed';

export interface IdeaCritique {
  id: string;
  boardId?: BoardId;
  ideaId: string;
  critique: string;
  evidenceAsk: string;
  automationKey?: string;               // deterministic key for AI-triggered dedupe across peers
  status: CritiqueStatus;
  source: 'devils_advocate';
  createdAt: number;
  updatedAt: number;
}

// Supporting document attached to an idea — NOT an idea itself, but context
// that the LLM can reference while moving the idea through the phases.
// Refined once at upload into a short summary + a list of facts the orchestrator
// can inject into phase prompts.
export type SupportingDocStatus = 'processing' | 'ready' | 'failed';

export interface SupportingDoc {
  id: string;
  boardId?: BoardId;
  ideaId: string;
  title: string;          // user-provided or auto-generated from the first line
  rawText: string;        // the pasted content (trimmed, capped client-side)
  summary?: string;       // 1-2 sentences, LLM-produced
  facts: string[];        // 3-10 extracted facts, LLM-produced
  status: SupportingDocStatus;
  error?: string;         // only populated when status === 'failed'
  createdAt: number;
  updatedAt: number;
}

export interface Idea {
  id: string;
  boardId?: BoardId;
  rawText: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  lastTurnAt?: number;
  status: IdeaStatus;
  phase: Phase;
  briefState: BriefState;
  ambiguities: Ambiguity[];
  clarifications: ClarificationQuestion[];
  turnLog: LlmMessage[];              // flattened audit trail across all micro-agent calls
  liveToolContext?: ActiveTabToolContext; // WebMCP tools detected on the active tab at Phase 0/1
  artifactMd?: string;                // rendered workspace markdown (derived from briefState)
  readiness: 'red' | 'yellow' | 'green';
  providerUsed?: ProviderId;
  panel?: Panel;                       // floating-canvas position + group membership
  mergedFrom?: string[];               // if this idea was merged, the ids of the originals
  insights?: IdeaInsight[];
  beadCoordination?: BeadCoordinationState;
  // --- M1 / bo-110 screens-v2 widening (all optional for back-compat) ---
  // Cross-board pinning: an idea can appear (read-only) on additional boards
  // it was not originally captured on. Single source of truth lives on the
  // original idea — pinned boards reference by id only.
  pinnedToBoardIds?: BoardId[];
  // For ideas spawned from a parent (split / fork / "follow this thread").
  parentIdeaId?: string;
  // Materialised list of contradicting ideas (Devil's-advocate / Critic
  // personas). Connections of kind='contradicts' remain canonical; this is
  // a denormalised view for fast inspector rendering.
  contradictions?: IdeaContradiction[];
  // Lifecycle facet read by screens-v2 (Bloom, settled halos, mute).
  // Orthogonal to legacy `status`; defaults to 'live' at hydrate time.
  state?: IdeaState;
  // Who created the idea — Persona / role / user. Older ideas omit this.
  authorRef?: IdeaAuthorRef;
  // Sticky color for the canvas card. Older ideas render with the default
  // (yellow) until a user / role re-colors them.
  color?: StickyColor;
}

export interface IdeaInsight {
  id: string;
  text: string;
  sourceRefs: BeatSourceRef[];
  relatedGroupIds?: string[];
  beatRunId?: string;
  createdAt: number;
}

export interface ProviderCredentials {
  gemini?: string;
  openai?: string;
  anthropic?: string;
}

export type BoardThemeMode = 'whiteboard' | 'sketch';

export interface Settings {
  credentials: ProviderCredentials;
  activeProvider: ProviderId;
  activeModel: string;                // e.g. 'gemini-2.5-pro', 'gpt-4o', 'claude-sonnet-4-6'
  density: Density;
  boardTheme: BoardThemeMode;
  // When true, the orchestrator surfaces gentle peripheral coach nudges on
  // canvas during user idle / readiness plateau. Default ON.
  proactiveSuggestionsEnabled: boolean;
  // Show the green guidance callouts inside Focus / Bloom mode that label controls.
  // Toggleable from the top-right of the board. Default ON.
  guidanceNotesEnabled: boolean;
}

// --- ct-mcp payload that every micro-agent call is built from ---
export interface CtMcpPayload {
  roleSystemPrompt: string;           // the micro-agent's role definition
  briefState: BriefState;             // current state (feeds constraint-forcing)
  detectedAmbiguities: Ambiguity[];   // what's still unresolved
  mustStayTrueRules: string[];        // cross-reference target (constraint forcing)
  task: string;                       // the specific ask for this turn
  outputJsonSchema: object;           // zod-derived JSON schema the model must return
  liveToolContext?: ActiveTabToolContext; // WebMCP tools from active tab (Phase 0/1 only)
  supportingDocs?: SupportingDoc[];   // refined reference material attached to this idea
}
