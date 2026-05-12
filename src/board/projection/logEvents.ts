/**
 * bo-119 — LogEvent projection over changeSets / beatRuns.
 *
 * Build Spec §01 defines the canonical `LogEvent` shape:
 *
 *   LogEvent {
 *     id, boardId, ts,
 *     kind: "idea-created" | "idea-edited" | "connection-drawn" |
 *           "cluster-proposed" | "phase-advanced" | "ai-nudge" |
 *           "persona-toggled" | "role-run" | ...,
 *     authorRef: { kind, id },
 *     payload: <kind-specific JSON>,
 *     reversed: boolean
 *   }
 *
 * IMPLEMENTATION_PLAN §2 explicitly requires this be a *read-side projection*
 * over the existing `changeSets` / `beatRuns` (and later `beatReviewSessions`)
 * — never a parallel store. This module is the pure function consumed by both
 * Screen 06 (log scrubber) and the existing `BoardHistoryPanel`.
 *
 * The function is intentionally side-effect free and synchronous so it can be
 * memoised by callers. It does *not* reach into IDB; the orchestration layer
 * loads `changeSets` + `beatRuns` and passes them through.
 *
 * Mapping rules (changeSet.kind → LogEvent.kind):
 *   capture_idea                                   → idea-created
 *   move_idea / update_idea / discard_idea /
 *     restore_idea / merge_ideas                   → idea-edited
 *   group_ideas / ungroup_idea / set_group_theme   → cluster-proposed
 *   replace_connections                            → connection-drawn
 *   create_suggestion / create_critique /
 *     create_beat_review_session                   → ai-nudge
 *   admit_suggestion / dismiss_suggestion /
 *     dismiss_critique / elaborate_suggestion /
 *     move_suggestion / keep_beat_review_item /
 *     scratch_beat_review_item                     → nudge-resolved
 *   create_doc / update_doc / delete_doc /
 *     update_tweaks / ai_undo                      → board-meta
 *
 * `beatRuns` always emit `role-run` events. They sit alongside changeSet
 * events and are interleaved by timestamp at the end.
 */

import type {
  BoardPatchOp,
  ChangeActor,
  ChangeSetRecord,
  ChangeSetKind,
  ChangeSetStatus,
  BeatRunRecord,
} from '../types';
import type { BoardId } from '../../types';
import type { BeatName, BeatTrigger, BeatSize } from '../../beats/types';

// -- Author resolution --------------------------------------------------------

export type LogAuthorKind = 'user' | 'ai' | 'tool' | 'system';

export interface LogAuthorRef {
  /** Coarse author class — drives chip color in Screen 06 / BoardHistoryPanel. */
  kind: LogAuthorKind;
  /** Stable identity. For now `'self'` for users, persona/role id for AI. */
  id: string;
  /** Surface that produced the change (canvas, beat, webmcp, …). */
  source: ChangeActor['source'];
  /** Beat / role tag if the action was AI driven. */
  beat?: BeatName;
  /** Display label as supplied on the original change. */
  label?: string;
}

// -- Discriminated union ------------------------------------------------------

interface LogEventBase {
  /** Stable event id — derived from the source record id (no new ids minted). */
  id: string;
  boardId: BoardId;
  /** Epoch ms. Sort key for the timeline. */
  ts: number;
  authorRef: LogAuthorRef;
  /** True when the source was undone (changeSet.status === 'undone'). */
  reversed: boolean;
  /**
   * Provenance backref so consumers can drill into the underlying record
   * without re-deriving identifiers.
   */
  source:
    | { kind: 'changeSet'; changeSetId: string; seq: number; status: ChangeSetStatus }
    | { kind: 'beatRun'; beatRunId: string };
}

export interface IdeaCreatedLogEvent extends LogEventBase {
  kind: 'idea-created';
  payload: {
    summary: string;
    affectedIdeaIds: string[];
  };
}

export interface IdeaEditedLogEvent extends LogEventBase {
  kind: 'idea-edited';
  payload: {
    summary: string;
    /** Coarse sub-kind — keeps the union flat while preserving fidelity. */
    operation:
      | 'move'
      | 'update'
      | 'discard'
      | 'restore'
      | 'merge';
    affectedIdeaIds: string[];
  };
}

export interface ConnectionDrawnLogEvent extends LogEventBase {
  kind: 'connection-drawn';
  payload: {
    summary: string;
    affectedConnectionIds: string[];
  };
}

export interface ClusterProposedLogEvent extends LogEventBase {
  kind: 'cluster-proposed';
  payload: {
    summary: string;
    operation: 'group' | 'ungroup' | 'theme';
    affectedGroupIds: string[];
    affectedIdeaIds: string[];
  };
}

export interface AiNudgeLogEvent extends LogEventBase {
  kind: 'ai-nudge';
  payload: {
    summary: string;
    /** Which kind of nudge: a Scout suggestion, a critique, or a review session. */
    surface: 'suggestion' | 'critique' | 'review-session';
    affectedIds: string[];
  };
}

export interface NudgeResolvedLogEvent extends LogEventBase {
  kind: 'nudge-resolved';
  payload: {
    summary: string;
    /**
     * `accept` covers admit / keep, `dismiss` covers dismiss / scratch,
     * `edit` covers elaborate / move (mutate without resolution).
     */
    resolution: 'accept' | 'dismiss' | 'edit';
    affectedIds: string[];
  };
}

export interface BoardMetaLogEvent extends LogEventBase {
  kind: 'board-meta';
  payload: {
    summary: string;
    /** `tweaks`, `doc`, or `ai-undo`. */
    surface: 'tweaks' | 'doc' | 'ai-undo';
    affectedIds: string[];
  };
}

export interface RoleRunLogEvent extends LogEventBase {
  kind: 'role-run';
  payload: {
    beat: BeatName;
    roleId: string;
    trigger: BeatTrigger;
    size: BeatSize;
    ok: boolean;
    usedFallback: boolean;
    focusIdeaId?: string;
    /** Failure reason when ok === false. */
    reason?: string;
    startedAt: number;
    finishedAt: number;
  };
}

export type LogEvent =
  | IdeaCreatedLogEvent
  | IdeaEditedLogEvent
  | ConnectionDrawnLogEvent
  | ClusterProposedLogEvent
  | AiNudgeLogEvent
  | NudgeResolvedLogEvent
  | BoardMetaLogEvent
  | RoleRunLogEvent;

export type LogEventKind = LogEvent['kind'];

// -- Public API ---------------------------------------------------------------

/**
 * Pure projection: takes the raw append-only feeds and produces an ordered
 * `LogEvent[]`. Order is ascending by timestamp, then by changeSet seq for
 * deterministic ties.
 *
 * Inputs need not be sorted. The function does not mutate them.
 */
export function projectLogEvents(
  changeSets: readonly ChangeSetRecord[],
  beatRuns: readonly BeatRunRecord[],
): LogEvent[] {
  const events: LogEvent[] = [];

  for (const record of changeSets) {
    const event = changeSetToLogEvent(record);
    if (event) events.push(event);
  }

  for (const run of beatRuns) {
    events.push(beatRunToLogEvent(run));
  }

  events.sort(compareLogEvents);
  return events;
}

// -- Internals: changeSet → LogEvent -----------------------------------------

function changeSetToLogEvent(record: ChangeSetRecord): LogEvent | null {
  const base = {
    id: `cs:${record.id}`,
    boardId: record.boardId,
    ts: record.committedAt,
    authorRef: actorToAuthor(record.actor),
    reversed: record.status === 'undone',
    source: {
      kind: 'changeSet' as const,
      changeSetId: record.id,
      seq: record.seq,
      status: record.status,
    },
  };

  const ideaIds = collectAffected(record, 'ideas');
  const groupIds = collectAffected(record, 'groups');
  const connectionIds = collectAffected(record, 'connections');
  const suggestionIds = collectAffected(record, 'suggestions');
  const critiqueIds = collectAffected(record, 'critiques');
  const reviewSessionIds = collectAffected(record, 'beatReviewSessions');
  const reviewItemIds = collectAffected(record, 'beatReviewItems');
  const docIds = collectAffected(record, 'docs');

  switch (record.kind) {
    case 'capture_idea':
      return {
        ...base,
        kind: 'idea-created',
        payload: { summary: record.summary, affectedIdeaIds: ideaIds },
      };

    case 'move_idea':
    case 'update_idea':
    case 'discard_idea':
    case 'restore_idea':
    case 'merge_ideas':
      return {
        ...base,
        kind: 'idea-edited',
        payload: {
          summary: record.summary,
          operation: ideaEditOperation(record.kind),
          affectedIdeaIds: ideaIds,
        },
      };

    case 'group_ideas':
    case 'ungroup_idea':
    case 'set_group_theme':
      return {
        ...base,
        kind: 'cluster-proposed',
        payload: {
          summary: record.summary,
          operation: clusterOperation(record.kind),
          affectedGroupIds: groupIds,
          affectedIdeaIds: ideaIds,
        },
      };

    case 'replace_connections':
    case 'flip_connection_type':
    case 'soft_delete_connection':
    case 'unsoft_delete_connection':
      return {
        ...base,
        kind: 'connection-drawn',
        payload: { summary: record.summary, affectedConnectionIds: connectionIds },
      };

    case 'create_suggestion':
      return {
        ...base,
        kind: 'ai-nudge',
        payload: { summary: record.summary, surface: 'suggestion', affectedIds: suggestionIds },
      };

    case 'create_critique':
      return {
        ...base,
        kind: 'ai-nudge',
        payload: { summary: record.summary, surface: 'critique', affectedIds: critiqueIds },
      };

    case 'create_beat_review_session':
      return {
        ...base,
        kind: 'ai-nudge',
        payload: {
          summary: record.summary,
          surface: 'review-session',
          affectedIds: reviewSessionIds,
        },
      };

    case 'admit_suggestion':
      return {
        ...base,
        kind: 'nudge-resolved',
        payload: { summary: record.summary, resolution: 'accept', affectedIds: suggestionIds },
      };

    case 'dismiss_suggestion':
      return {
        ...base,
        kind: 'nudge-resolved',
        payload: { summary: record.summary, resolution: 'dismiss', affectedIds: suggestionIds },
      };

    case 'dismiss_critique':
      return {
        ...base,
        kind: 'nudge-resolved',
        payload: { summary: record.summary, resolution: 'dismiss', affectedIds: critiqueIds },
      };

    case 'elaborate_suggestion':
    case 'move_suggestion':
      return {
        ...base,
        kind: 'nudge-resolved',
        payload: { summary: record.summary, resolution: 'edit', affectedIds: suggestionIds },
      };

    case 'keep_beat_review_item':
      return {
        ...base,
        kind: 'nudge-resolved',
        payload: { summary: record.summary, resolution: 'accept', affectedIds: reviewItemIds },
      };

    case 'scratch_beat_review_item':
      return {
        ...base,
        kind: 'nudge-resolved',
        payload: { summary: record.summary, resolution: 'dismiss', affectedIds: reviewItemIds },
      };

    case 'create_doc':
    case 'update_doc':
    case 'delete_doc':
      return {
        ...base,
        kind: 'board-meta',
        payload: { summary: record.summary, surface: 'doc', affectedIds: docIds },
      };

    case 'update_tweaks':
      return {
        ...base,
        kind: 'board-meta',
        payload: { summary: record.summary, surface: 'tweaks', affectedIds: [] },
      };

    case 'ai_undo':
      return {
        ...base,
        kind: 'board-meta',
        payload: {
          summary: record.summary,
          surface: 'ai-undo',
          affectedIds: [...ideaIds, ...connectionIds, ...groupIds, ...suggestionIds, ...critiqueIds],
        },
      };

    default:
      // Exhaustiveness guard — surface unknown kinds at compile time when
      // ChangeSetKind grows. Returns null at runtime so an unrecognised entry
      // does not crash the timeline.
      return assertNeverChangeSetKind(record.kind);
  }
}

function ideaEditOperation(kind: ChangeSetKind): IdeaEditedLogEvent['payload']['operation'] {
  switch (kind) {
    case 'move_idea':
      return 'move';
    case 'discard_idea':
      return 'discard';
    case 'restore_idea':
      return 'restore';
    case 'merge_ideas':
      return 'merge';
    default:
      return 'update';
  }
}

function clusterOperation(kind: ChangeSetKind): ClusterProposedLogEvent['payload']['operation'] {
  switch (kind) {
    case 'group_ideas':
      return 'group';
    case 'ungroup_idea':
      return 'ungroup';
    default:
      return 'theme';
  }
}

// -- Internals: beatRun → LogEvent -------------------------------------------

function beatRunToLogEvent(run: BeatRunRecord): RoleRunLogEvent {
  return {
    id: `br:${run.id}`,
    boardId: run.boardId,
    ts: run.finishedAt,
    authorRef: {
      kind: 'ai',
      id: run.roleId,
      source: 'beat',
      beat: run.beat,
      label: run.roleId,
    },
    reversed: false,
    source: { kind: 'beatRun', beatRunId: run.id },
    kind: 'role-run',
    payload: {
      beat: run.beat,
      roleId: run.roleId,
      trigger: run.trigger,
      size: run.size,
      ok: run.ok,
      usedFallback: run.usedFallback,
      focusIdeaId: run.focusIdeaId,
      reason: run.reason,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    },
  };
}

// -- Helpers ------------------------------------------------------------------

function actorToAuthor(actor: ChangeActor): LogAuthorRef {
  return {
    kind: actor.type,
    id: actor.label ?? actor.beat ?? actor.type,
    source: actor.source,
    beat: actor.beat,
    label: actor.label,
  };
}

function collectAffected(record: ChangeSetRecord, store: string): string[] {
  const seen = new Set<string>();
  for (const target of record.affected) {
    if (target.store === store) seen.add(target.id);
  }
  // Fall back to scanning patches when `affected` was not populated for this
  // store but a forward op clearly references it. Belt-and-braces against
  // partially-populated records.
  if (seen.size === 0) {
    for (const op of record.forward) {
      const id = patchTargetId(op, store);
      if (id) seen.add(id);
    }
  }
  return Array.from(seen);
}

function patchTargetId(op: BoardPatchOp, store: string): string | null {
  const prefix = `/stores/${store}/`;
  if (!op.path.startsWith(prefix)) return null;
  return op.path.slice(prefix.length);
}

function compareLogEvents(left: LogEvent, right: LogEvent): number {
  if (left.ts !== right.ts) return left.ts - right.ts;
  // Tie-breaker: changeSet seq is monotonic per board, beatRuns sort after
  // changeSets at the same timestamp so the run completion follows the
  // changeSet it produced.
  const leftSeq = left.source.kind === 'changeSet' ? left.source.seq : Number.POSITIVE_INFINITY;
  const rightSeq = right.source.kind === 'changeSet' ? right.source.seq : Number.POSITIVE_INFINITY;
  if (leftSeq !== rightSeq) return leftSeq - rightSeq;
  return left.id.localeCompare(right.id);
}

function assertNeverChangeSetKind(kind: never): null {
  // Intentional: do not throw — the timeline must keep rendering even if a new
  // ChangeSetKind ships before this projection learns about it.
  void kind;
  return null;
}
