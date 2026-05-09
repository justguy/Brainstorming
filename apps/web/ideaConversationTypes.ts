// Shared types for the Focus & Bloom idea-conversation surfaces.
// Kept presentational — no orchestrator coupling.

export type ConversationPersona =
  | 'scout'
  | 'synth'
  | 'devil'
  | 'historian'
  | 'user';

export interface ConversationDelta {
  kind: 'info' | 'warn' | 'bad';
  label: string;
}

export interface ConversationOption {
  /** Stable key surfaced back via `onPickOption`. */
  key: string;
  /** Option text — may contain `**bold**` markdown rendered as <b>. */
  text: string;
}

export interface ConversationTurn {
  id: string;
  persona: ConversationPersona;
  /** Small UPPERCASE chip e.g. "challenger", "asks", "edit". */
  role: string;
  /** Human-readable timestamp e.g. "2m", "now". */
  whenLabel: string;
  /** Body text — may contain <em>...</em> tags rendered as highlighted spans. */
  body: string;
  deltas?: ConversationDelta[];
  /** A/B/C choice cards under the body. */
  options?: ConversationOption[];
}

export interface PhaseStep {
  /** Phase number e.g. 0, 0.5, 1, 2, 2.5. */
  number: number;
  shortLabel: string;
  /** Long label for tooltips. */
  longLabel: string;
  status: 'done' | 'active' | 'queued' | 'locked';
  optional: boolean;
  /** Optional meta string e.g. "12m", "live", "queued", "—", "opt". */
  meta?: string;
}

export interface NeighborIdea {
  ideaId: string;
  relationship:
    | 'overlaps'
    | 'shares-theme'
    | 'parent'
    | 'child'
    | 'contradicts';
  /** Display string e.g. "↗ overlaps". */
  relationshipLabel: string;
  title: string;
  why: string;
  swatchTone: 'peach' | 'blue' | 'pink' | 'green' | 'lilac' | 'yellow';
}
