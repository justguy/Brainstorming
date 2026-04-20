/**
 * webmcp-tools.ts — WebMCP tool registration for the Brainstorming Orchestrator web app.
 *
 * Pattern mirrors the react-flightsearch demo:
 *  - Board-first global tools are registered once on mount via the
 *    AbortController + signal approach.
 *  - Facilitator control-plane tools mount under their own scope.
 *  - Selected-idea lifecycle tools remount whenever the active idea or bead
 *    phase changes, so stale phase-local registrations do not leak.
 *
 * The dispatchAndWait helper fires a CustomEvent and waits for React state to
 * commit (the component dispatches a completion event in a useEffect that runs
 * after the state update).
 */

import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { AmbiguityResolutionStatus, Idea, IdeaGroup, SupportingDoc } from '../../src/types';
import { BEAT_NAMES, type BeatName } from '../../src/beats/types';
import { DEFAULT_BOARD_ID } from '../../src/board/types';
import { listIdeas, getIdea, getTurnLogPage, listDiscardedIdeas } from '../../src/storage/ideas';
import { getCritique, listCritiques, listCritiquesForIdea } from '../../src/storage/critiques';
import { listGroups } from '../../src/storage/groups';
import { getIdeaPhaseHistory } from '../../src/storage/phaseHistory';
import {
  listSuggestions as listAllSuggestions,
  listSuggestionsByStatus,
  getSuggestion,
} from '../../src/storage/suggestions';
import { listDocsForIdea, getDoc } from '../../src/storage/docs';
import type { LegacyToolIdea } from '../../src/workspace/legacyPhaseAdapter';
import { defaultBoardRepository } from './boardRepository';
import { createBoardController } from '../../src/storage/boardController';
import { createCrossPollinateTool } from './webmcpCrossPollinateTool';
import {
  createAttachLocalDocCandidateTool,
  searchLocalDocsTool,
  type SupportingDocToolResult,
} from './webmcpLocalDocTools';
import {
  claimAiHostTool,
  getAiAutonomyStateTool,
  listPeersTool,
  releaseAiHostTool,
  setAiAutonomyModeTool,
  setAiPausedTool,
} from './webmcpFacilitatorTools';
import { deriveIdeaBeadState, isKnownBeadPhase } from '../../src/orchestrator/beadState';
import { SUB_PHASES, findSubPhase } from '../../src/orchestrator/subPhases';

// ---------------------------------------------------------------------------
// safeRegisterTool — StrictMode-resilient registerTool wrapper
// ---------------------------------------------------------------------------
// Under React.StrictMode (dev), each effect runs: mount → cleanup → mount.
// Chrome's WebMCP preview does not always unregister synchronously when the
// AbortSignal fires, so the second mount throws InvalidStateError: "Duplicate
// tool name". We swallow that specific error because the tool is already
// registered (under the first controller) and will be cleaned up on page
// unload. Any other DOM error is re-thrown.

function safeRegisterTool(
  mc: ModelContext,
  tool: ModelContextTool,
  opts: { signal: AbortSignal },
): void {
  try {
    mc.registerTool(tool, opts);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'InvalidStateError') {
      console.warn(`[webmcp-tools] "${tool.name}" already registered (likely StrictMode remount) — skipping.`);
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// dispatchAndWait: fire a CustomEvent, wait for React to signal completion
// ---------------------------------------------------------------------------

function dispatchAndWait(
  eventName: string,
  detail: Record<string, unknown> = {},
  successMessage: string = 'Action completed successfully',
  timeoutMs = 8000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const completionEvent = `tool-completion-${requestId}`;

    const timeoutId = setTimeout(() => {
      window.removeEventListener(completionEvent, handleCompletion);
      reject(new Error(`Timed out waiting for UI to update (requestId: ${requestId})`));
    }, timeoutMs);

    const handleCompletion = () => {
      clearTimeout(timeoutId);
      window.removeEventListener(completionEvent, handleCompletion);
      resolve(successMessage);
    };

    window.addEventListener(completionEvent, handleCompletion);
    window.dispatchEvent(new CustomEvent(eventName, { detail: { ...detail, requestId } }));
  });
}

type ToolCompletionPayload<T extends object> = T & { ok: boolean; error?: string };

function dispatchAndWaitForResult<T extends object>(
  eventName: string,
  detail: Record<string, unknown> = {},
  timeoutMs = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const completionEvent = `tool-completion-${requestId}`;

    const timeoutId = setTimeout(() => {
      window.removeEventListener(completionEvent, handleCompletion as EventListener);
      reject(new Error(`Timed out waiting for UI to update (requestId: ${requestId})`));
    }, timeoutMs);

    const handleCompletion = (event: Event) => {
      const ev = event as CustomEvent<ToolCompletionPayload<T>>;
      clearTimeout(timeoutId);
      window.removeEventListener(completionEvent, handleCompletion as EventListener);
      if (!ev.detail?.ok) {
        reject(new Error(ev.detail?.error ?? 'Action failed'));
        return;
      }
      const { ok: _ok, error: _error, ...data } = ev.detail;
      resolve(data as T);
    };

    window.addEventListener(completionEvent, handleCompletion as EventListener);
    window.dispatchEvent(new CustomEvent(eventName, { detail: { ...detail, requestId } }));
  });
}

// ---------------------------------------------------------------------------
// Global tools — registered for the lifetime of the app
// ---------------------------------------------------------------------------

const listIdeasTool: ModelContextTool = {
  name: 'list_ideas',
  description:
    'Returns all brainstorming ideas in the workspace, sorted by last-updated descending. ' +
    'Use this to discover what ideas exist before operating on a specific one.',
  inputSchema: { type: 'object', properties: {} },
  outputSchema: {
    type: 'object',
    properties: {
      ideas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            rawText: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            status: { type: 'string' },
            phase: { type: 'number' },
            readiness: { type: 'string', enum: ['red', 'yellow', 'green'] },
            updatedAt: { type: 'number' },
          },
        },
      },
    },
  },
  annotations: { readOnlyHint: true },
  execute: async () => {
    const ideas = await listIdeas();
    return {
      ideas: ideas.map(i => ({
        id: i.id,
        rawText: i.rawText,
        tags: i.tags,
        status: i.status,
        phase: i.phase,
        readiness: i.readiness,
        updatedAt: i.updatedAt,
      })),
    };
  },
};

const getIdeaTool: ModelContextTool = {
  name: 'get_idea',
  description:
    'Retrieves the full state of a specific brainstorming idea by its ID, including its ' +
    'current phase, brief state, clarification questions, approaches, risks, and artifact markdown. ' +
    'The turn log is summarized here; use get_turn_log to paginate the full audit history.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The UUID of the idea to retrieve.',
        minLength: 1,
      },
    },
    required: ['id'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      idea: { type: 'object', description: 'Idea object with turn-log summary metadata.' },
    },
  },
  annotations: { readOnlyHint: true },
  execute: async (input) => {
    const { id } = input as { id: string };
    if (!id || typeof id !== 'string') {
      return 'ERROR: `id` must be a non-empty string.';
    }
    const idea = await getIdea(id);
    if (!idea) {
      return `ERROR: No idea found with id "${id}". Use list_ideas to see available ideas.`;
    }
    const { turnLog, ...ideaWithoutTurnLog } = idea;
    return {
      idea: {
        ...ideaWithoutTurnLog,
        turnLogSummary: {
          totalTurns: turnLog.length,
          latestTurnAt: idea.lastTurnAt ?? null,
        },
      },
    };
  },
};

const getTurnLogTool: ModelContextTool = {
  name: 'get_turn_log',
  description:
    'Returns a paginated page of turn-log entries for one idea. Use this when you need the audit trail beyond the summary returned by get_idea.',
  inputSchema: {
    type: 'object',
    properties: {
      ideaId: {
        type: 'string',
        minLength: 1,
        description: 'The idea id whose turn log should be paginated.',
      },
      cursor: {
        type: 'string',
        description: 'Optional pagination cursor from a previous get_turn_log response.',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        description: 'Optional page size. Defaults to 20, maximum 100.',
      },
    },
    required: ['ideaId'],
  },
  annotations: { readOnlyHint: true },
  execute: async (input) => {
    const { ideaId, cursor, limit } = input as { ideaId: string; cursor?: string; limit?: number };
    if (!ideaId) return 'ERROR: `ideaId` is required.';
    const idea = await getIdea(ideaId);
    if (!idea) return `ERROR: no idea with id ${ideaId}.`;

    const page = await getTurnLogPage(ideaId, { cursor, limit });
    return {
      ideaId,
      cursor: cursor ?? null,
      nextCursor: page.nextCursor,
      totalTurns: page.totalTurns,
      entries: page.entries,
    };
  },
};

const captureIdeaTool: ModelContextTool = {
  name: 'capture_idea',
  description:
    'Creates a new brainstorming idea and opens it in the workspace, beginning Phase 0 ' +
    '(ambiguity extraction). Use this when the user wants to start brainstorming a new concept.',
  inputSchema: {
    type: 'object',
    properties: {
      rawText: {
        type: 'string',
        description: 'The raw idea description as the user stated it. Should be at least 10 characters.',
        minLength: 1,
      },
      tags: {
        type: 'array',
        description: 'Optional list of topic tags (e.g. ["product", "ai", "mobile"]).',
        items: { type: 'string' },
      },
    },
    required: ['rawText'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      ideaId: { type: 'string', description: 'The UUID of the newly created idea.' },
      message: { type: 'string' },
    },
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { rawText, tags } = input as { rawText: string; tags?: string[] };
    if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
      return 'ERROR: `rawText` must be a non-empty string describing the idea.';
    }
    const { ideaId, error } = await dispatchAndWaitForDetail<{ ideaId?: string; error?: string }>(
      'brainstorm:captureIdea',
      { rawText: rawText.trim(), tags: tags ?? [] },
    );
    if (error || !ideaId) {
      return `ERROR: ${error ?? 'capture failed'}`;
    }
    return {
      ideaId,
      message: `Idea captured with id ${ideaId}. Phase 0 is ready — call advance_phase to begin ambiguity extraction.`,
    };
  },
};

const exportHandoffTool: ModelContextTool = {
  name: 'export_handoff',
  description:
    'Downloads the Phase-8 handoff artifact (Markdown) for an idea that has reached ' +
    'readiness=green. The file is saved to the user\'s Downloads folder. ' +
    'Only call this when the idea is at phase 8 with readiness green.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'UUID of the idea to export.',
        minLength: 1,
      },
    },
    required: ['id'],
  },
  outputSchema: {
    type: 'string',
    description: 'Success message or error description.',
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { id } = input as { id: string };
    if (!id || typeof id !== 'string') {
      return 'ERROR: `id` must be a non-empty string.';
    }
    const idea = await getIdea(id);
    if (!idea) {
      return `ERROR: No idea found with id "${id}".`;
    }
    if (idea.readiness !== 'green') {
      return `ERROR: Idea "${id}" has readiness="${idea.readiness}". Export is only available when readiness is "green".`;
    }
    if (!idea.artifactMd) {
      return `ERROR: Idea "${id}" has no artifact markdown yet. Advance through all phases first.`;
    }

    await dispatchAndWait(
      'brainstorm:exportHandoff',
      { ideaId: id },
      `Handoff artifact for "${idea.rawText.slice(0, 40)}" exported to Downloads.`,
    );
    return `Handoff artifact downloaded as handoff_${idea.id.slice(0, 8)}.md`;
  },
};

// ---------------------------------------------------------------------------
// Canvas tools — move, group, ungroup, merge, inspect
// ---------------------------------------------------------------------------

const getCanvasTool: ModelContextTool = {
  name: 'get_canvas',
  description:
    'Returns the current state of the idea canvas: visible ideas with their panel positions + groupIds, and all groups with their themes. ' +
    'Use this to understand how ideas are arranged spatially before calling move_panel, group_ideas, or merge_ideas.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: async () => {
    const [ideas, groups] = await Promise.all([listIdeas(), listGroups()]);
    const visible = ideas.filter(i => i.status !== 'archived');
    return {
      ideas: visible.map(i => ({
        id: i.id,
        rawText: i.rawText.slice(0, 160),
        x: i.panel?.x ?? 0,
        y: i.panel?.y ?? 0,
        groupId: i.panel?.groupId,
        readiness: i.readiness,
        phase: i.phase,
      })),
      groups: groups.map((g: IdeaGroup) => ({
        id: g.id,
        theme: g.theme,
        sharedQuestion: g.sharedQuestion,
        ideaIds: g.ideaIds,
      })),
    };
  },
};

const getBoardTool: ModelContextTool = {
  name: 'get_board',
  description:
    'Returns the current durable board document: board metadata, ideas, groups, supporting docs, suggestions, critiques, connections, role runs, tweaks, and undo/redo history state. ' +
    'Use this as the board-first read surface before invoking board automation routines or mutating board entities.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: async () => {
    const [document, history] = await Promise.all([
      defaultBoardRepository.forBoard(DEFAULT_BOARD_ID).loadDocument(),
      createBoardController(DEFAULT_BOARD_ID).getHistoryState(),
    ]);
    return {
      board: document.board,
      history,
      ideas: document.ideas.map(idea => ({
        id: idea.id,
        rawText: idea.rawText,
        status: idea.status,
        tags: idea.tags,
        panel: idea.panel,
        readiness: idea.readiness,
        phase: idea.phase,
        updatedAt: idea.updatedAt,
      })),
      groups: document.groups,
      docs: document.docs.map(doc => ({
        id: doc.id,
        ideaId: doc.ideaId,
        title: doc.title,
        status: doc.status,
        summary: doc.summary,
        facts: doc.facts,
        updatedAt: doc.updatedAt,
      })),
      suggestions: document.suggestions.map(suggestion => ({
        id: suggestion.id,
        rawText: suggestion.rawText,
        rationale: suggestion.rationale,
        source: suggestion.source,
        status: suggestion.status,
        relatedIdeaIds: suggestion.relatedIdeaIds ?? [],
        admittedIdeaId: suggestion.admittedIdeaId,
        updatedAt: suggestion.updatedAt,
      })),
      critiques: document.critiques.map(critique => ({
        id: critique.id,
        ideaId: critique.ideaId,
        critique: critique.critique,
        evidenceAsk: critique.evidenceAsk,
        status: critique.status,
        updatedAt: critique.updatedAt,
      })),
      connections: document.connections,
      beatRuns: document.beatRuns,
      tweaks: document.tweaks,
    };
  },
};

const movePanelTool: ModelContextTool = {
  name: 'move_panel',
  description:
    'Moves an idea panel to a new position on the canvas. Does NOT trigger grouping or merging — pure positional move. ' +
    'Coordinates are in canvas pixels from the top-left; typical canvas extent is roughly 0..2000 on both axes.',
  inputSchema: {
    type: 'object',
    properties: {
      ideaId: { type: 'string', minLength: 1 },
      x: { type: 'number', minimum: 0 },
      y: { type: 'number', minimum: 0 },
    },
    required: ['ideaId', 'x', 'y'],
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { ideaId, x, y } = input as { ideaId: string; x: number; y: number };
    if (!ideaId || typeof x !== 'number' || typeof y !== 'number') {
      return 'ERROR: `ideaId`, `x`, and `y` are required.';
    }
    await dispatchAndWait(
      'brainstorm:movePanel',
      { ideaId, x, y },
      `Moved idea ${ideaId} to (${x}, ${y}).`,
    );
    return `Panel for idea "${ideaId}" moved to (${x}, ${y}).`;
  },
};

const groupIdeasTool: ModelContextTool = {
  name: 'group_ideas',
  description:
    'Groups two ideas together. If either idea is already in a group, the other joins it; otherwise a new group is created. ' +
    'Triggers an LLM pass to name the group theme.',
  inputSchema: {
    type: 'object',
    properties: {
      ideaIdA: { type: 'string', minLength: 1 },
      ideaIdB: { type: 'string', minLength: 1 },
    },
    required: ['ideaIdA', 'ideaIdB'],
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { ideaIdA, ideaIdB } = input as { ideaIdA: string; ideaIdB: string };
    if (!ideaIdA || !ideaIdB || ideaIdA === ideaIdB) {
      return 'ERROR: provide two distinct ideaIds.';
    }
    await dispatchAndWait(
      'brainstorm:groupIdeas',
      { ideaIdA, ideaIdB },
      `Grouped ideas ${ideaIdA} and ${ideaIdB}.`,
      20000,
    );
    return `Ideas "${ideaIdA}" and "${ideaIdB}" are now grouped.`;
  },
};

const ungroupIdeaTool: ModelContextTool = {
  name: 'ungroup_idea',
  description: 'Removes an idea from whichever group it belongs to. The group is destroyed if it ends up empty.',
  inputSchema: {
    type: 'object',
    properties: {
      ideaId: { type: 'string', minLength: 1 },
    },
    required: ['ideaId'],
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { ideaId } = input as { ideaId: string };
    if (!ideaId) return 'ERROR: `ideaId` is required.';
    await dispatchAndWait(
      'brainstorm:ungroupIdea',
      { ideaId },
      `Removed ${ideaId} from its group.`,
    );
    return `Idea "${ideaId}" removed from its group.`;
  },
};

const mergeIdeasTool: ModelContextTool = {
  name: 'merge_ideas',
  description:
    'Merges two ideas into one via an LLM synthesis. The two originals are archived; a new merged idea is created ' +
    'with mergedFrom set to the original IDs. Use when the user wants to consolidate two related ideas.',
  inputSchema: {
    type: 'object',
    properties: {
      draggedId: { type: 'string', minLength: 1, description: 'The idea that was dragged onto the target.' },
      targetId: { type: 'string', minLength: 1, description: 'The idea that was the drop target.' },
    },
    required: ['draggedId', 'targetId'],
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { draggedId, targetId } = input as { draggedId: string; targetId: string };
    if (!draggedId || !targetId || draggedId === targetId) {
      return 'ERROR: provide two distinct ideaIds.';
    }
    await dispatchAndWait(
      'brainstorm:mergeIdeas',
      { draggedId, targetId },
      `Merged ideas ${draggedId} and ${targetId}.`,
      30000,
    );
    return `Merged ideas "${draggedId}" and "${targetId}" into a new idea. The originals are archived.`;
  },
};

// ---------------------------------------------------------------------------
// Discard-pile tools — move ideas in/out of the discarded bucket
// ---------------------------------------------------------------------------

const discardIdeaTool: ModelContextTool = {
  name: 'discard_idea',
  description:
    'Removes an idea from the canvas and moves it to the discard pile. The idea remains indexed — the ' +
    'connection finder, scout, and agents can still reason about discarded ideas. If the idea is in a group, ' +
    'it is first removed from the group (group is auto-deleted when empty).',
  inputSchema: {
    type: 'object',
    properties: {
      ideaId: { type: 'string', minLength: 1 },
      reason: {
        type: 'string',
        description: 'Optional short note explaining why this idea is being discarded (stored in tags for now).',
      },
    },
    required: ['ideaId'],
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { ideaId, reason } = input as { ideaId: string; reason?: string };
    if (!ideaId) return 'ERROR: `ideaId` is required.';
    const idea = await getIdea(ideaId);
    if (!idea) return `ERROR: no idea with id ${ideaId}.`;
    await dispatchAndWait(
      'brainstorm:discardIdea',
      { ideaId, reason },
      `Idea discarded: "${ideaId}"`,
    );
    return `Idea "${ideaId}" moved to discard pile.`;
  },
};

const restoreIdeaTool: ModelContextTool = {
  name: 'restore_idea',
  description:
    'Restores a discarded idea back onto the canvas (status becomes "captured"). The idea resumes at whatever ' +
    'phase it was at when discarded.',
  inputSchema: {
    type: 'object',
    properties: {
      ideaId: { type: 'string', minLength: 1 },
    },
    required: ['ideaId'],
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { ideaId } = input as { ideaId: string };
    if (!ideaId) return 'ERROR: `ideaId` is required.';
    const idea = await getIdea(ideaId);
    if (!idea) return `ERROR: no idea with id ${ideaId}.`;
    if (idea.status !== 'discarded') {
      return `ERROR: idea "${ideaId}" is not in the discard pile (status=${idea.status}).`;
    }
    await dispatchAndWait(
      'brainstorm:restoreIdea',
      { ideaId },
      `Idea restored: "${ideaId}"`,
    );
    return `Idea "${ideaId}" restored to the canvas.`;
  },
};

// ---------------------------------------------------------------------------
// Scout suggestion tools — the outside-knowledge scout proposes ghost ideas.
// ---------------------------------------------------------------------------

function dispatchAndWaitForDetail<T extends Record<string, unknown>>(
  eventName: string,
  detail: Record<string, unknown> = {},
  timeoutMs = 60_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const completionEvent = `tool-completion-${requestId}`;
    const timeoutId = setTimeout(() => {
      window.removeEventListener(completionEvent, handleCompletion as EventListener);
      reject(new Error(`Timed out waiting for ${eventName}.`));
    }, timeoutMs);
    const handleCompletion = (e: Event) => {
      clearTimeout(timeoutId);
      window.removeEventListener(completionEvent, handleCompletion as EventListener);
      resolve(((e as CustomEvent).detail ?? {}) as T);
    };
    window.addEventListener(completionEvent, handleCompletion as EventListener);
    window.dispatchEvent(new CustomEvent(eventName, { detail: { ...detail, requestId } }));
  });
}

const scoutIdeasTool: ModelContextTool = {
  name: 'scout_ideas',
  description:
    'Runs the outside-knowledge scout over the full board (live + discarded ideas + ready docs). The scout ' +
    'proposes up to 6 novel suggestions — drawn from analogies, adjacent fields, contrarian readings, or user docs. ' +
    'New suggestions appear on the canvas as dashed teal ghost panels. The user (or another tool) can then admit, ' +
    'elaborate, or dismiss each one.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: false },
  execute: async () => {
    const { count = 0 } = await dispatchAndWaitForDetail<{ count?: number }>('brainstorm:scout');
    return count === 0
      ? 'Scout ran — no new suggestions surfaced. The board may already be well-covered, or the scout is avoiding ideas already proposed.'
      : `Scout ran — ${count} ghost suggestion${count === 1 ? '' : 's'} added to the canvas.`;
  },
};

const crossPollinateTool = createCrossPollinateTool(() => dispatchAndWaitForDetail<{
  ok?: boolean;
  error?: string;
  suggestion?: {
    id: string;
    rawText: string;
    rationale: string;
    source: string;
    sourceIdeaIds: string[];
    relatedIdeaIds: string[];
    status: string;
  } | null;
}>('brainstorm:crossPollinate'));

const runBeatTool: ModelContextTool = {
  name: 'run_beat',
  description:
    'Runs a board-scoped automation routine by name. `scout`, `connect`, and `critique` use the live board flow and return committed entities. ' +
    '`cluster` and `summarise` materialize review candidates from the runtime so the app can keep or scratch them before commit. Use this as the board-first automation surface instead of phase-local tools.',
  inputSchema: {
    type: 'object',
    properties: {
      beat: {
        type: 'string',
        enum: [...BEAT_NAMES],
        description: 'Automation routine to invoke.',
      },
      focusIdeaId: {
        type: 'string',
        minLength: 1,
        description: 'Optional focus idea id. Required for `critique` and ignored by the other beats.',
      },
    },
    required: ['beat'],
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { beat, focusIdeaId } = input as { beat: BeatName; focusIdeaId?: string };
    if (!BEAT_NAMES.includes(beat)) {
      return `ERROR: routine must be one of ${BEAT_NAMES.join(', ')}.`;
    }
    if (beat === 'critique' && (!focusIdeaId || !focusIdeaId.trim())) {
      return 'ERROR: `focusIdeaId` is required when the routine is `critique`.';
    }
    const detail = await dispatchAndWaitForDetail<Record<string, unknown>>(
      'brainstorm:runBeat',
      { beat, focusIdeaId },
      90_000,
    );
    if (typeof detail.error === 'string' && detail.error.length > 0) {
      return `ERROR: ${detail.error}`;
    }
    return detail;
  },
};

const listSuggestionsTool: ModelContextTool = {
  name: 'list_suggestions',
  description:
    'Returns scout suggestions filtered by status (default: pending). Pending suggestions live on the canvas ' +
    'as ghost panels awaiting user judgement; admitted ones link to a real Idea id; dismissed ones stay indexed ' +
    'so the scout can avoid re-proposing them.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['pending', 'admitted', 'dismissed', 'all'],
        description: "Filter by status. 'all' returns everything. Default is 'pending'.",
      },
    },
  },
  annotations: { readOnlyHint: true },
  execute: async (input) => {
    const { status = 'pending' } = (input ?? {}) as { status?: 'pending' | 'admitted' | 'dismissed' | 'all' };
    const list = status === 'all'
      ? await listAllSuggestions()
      : await listSuggestionsByStatus(status);
    return {
      count: list.length,
      suggestions: list.map(s => ({
        id: s.id,
        rawText: s.rawText,
        rationale: s.rationale,
        source: s.source,
        status: s.status,
        relatedIdeaIds: s.relatedIdeaIds ?? [],
        sourceIdeaIds: s.sourceIdeaIds ?? [],
        elaboration: s.elaboration,
        admittedIdeaId: s.admittedIdeaId,
        createdAt: s.createdAt,
      })),
    };
  },
};

const admitSuggestionTool: ModelContextTool = {
  name: 'admit_suggestion',
  description:
    'Promotes a pending scout suggestion into a real idea on the canvas. The new idea inherits the suggestion\'s ' +
    "text (plus any elaboration and the scout's rationale) and is tagged with 'from-scout'. The suggestion\'s ghost " +
    'panel is replaced by the real one.',
  inputSchema: {
    type: 'object',
    properties: { suggestionId: { type: 'string', minLength: 1 } },
    required: ['suggestionId'],
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { suggestionId } = input as { suggestionId: string };
    if (!suggestionId) return 'ERROR: `suggestionId` is required.';
    const s = await getSuggestion(suggestionId);
    if (!s) return `ERROR: no suggestion with id ${suggestionId}.`;
    if (s.status !== 'pending') {
      return `ERROR: suggestion "${suggestionId}" is not pending (status=${s.status}).`;
    }
    const detail = await dispatchAndWaitForDetail<{ admittedIdeaId?: string; error?: string }>(
      'brainstorm:admitSuggestion',
      { suggestionId },
    );
    if (detail.error) return `ERROR: ${detail.error}`;
    return `Suggestion admitted as idea "${detail.admittedIdeaId ?? '?'}".`;
  },
};

const elaborateSuggestionTool: ModelContextTool = {
  name: 'elaborate_suggestion',
  description:
    'Asks the elaborator role to expand a pending suggestion into a concrete elaboration, sub-parts, and the ' +
    'implications of admitting it. The elaboration is stored on the suggestion; calling again is a no-op unless the ' +
    'user reruns. Use this before admitting when the suggestion seems promising but vague.',
  inputSchema: {
    type: 'object',
    properties: { suggestionId: { type: 'string', minLength: 1 } },
    required: ['suggestionId'],
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { suggestionId } = input as { suggestionId: string };
    if (!suggestionId) return 'ERROR: `suggestionId` is required.';
    const s = await getSuggestion(suggestionId);
    if (!s) return `ERROR: no suggestion with id ${suggestionId}.`;
    const detail = await dispatchAndWaitForDetail<{ ok?: boolean; error?: string }>(
      'brainstorm:elaborateSuggestion',
      { suggestionId },
    );
    if (detail.error) return `ERROR: ${detail.error}`;
    return `Suggestion "${suggestionId}" elaborated.`;
  },
};

const dismissSuggestionTool: ModelContextTool = {
  name: 'dismiss_suggestion',
  description:
    'Dismisses a pending scout suggestion. The ghost panel disappears from the canvas, but the suggestion stays ' +
    "indexed so future scout runs won't re-propose it.",
  inputSchema: {
    type: 'object',
    properties: { suggestionId: { type: 'string', minLength: 1 } },
    required: ['suggestionId'],
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { suggestionId } = input as { suggestionId: string };
    if (!suggestionId) return 'ERROR: `suggestionId` is required.';
    const s = await getSuggestion(suggestionId);
    if (!s) return `ERROR: no suggestion with id ${suggestionId}.`;
    const detail = await dispatchAndWaitForDetail<{ ok?: boolean; error?: string }>(
      'brainstorm:dismissSuggestion',
      { suggestionId },
    );
    if (detail.error) return `ERROR: ${detail.error}`;
    return `Suggestion "${suggestionId}" dismissed.`;
  },
};

const findConnectionsTool: ModelContextTool = {
  name: 'find_connections',
  description:
    'Runs the connection-finder over live ideas, discarded ideas, and ready supporting docs, ' +
    'then populates the Connections panel. Returns up to 10 links (often fewer) with kind ' +
    '(builds_on | contradicts | revives_killed | shared_theme), the involved idea ids, a rationale, and strength. ' +
    'Use this after making non-trivial changes to the board — the latest result is persisted to board state, and re-running refreshes it.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: false },
  execute: async () => {
    return new Promise<string>((resolve, reject) => {
      const requestId = Math.random().toString(36).substring(2, 15);
      const completionEvent = `tool-completion-${requestId}`;
      const timeoutId = setTimeout(() => {
        window.removeEventListener(completionEvent, handleCompletion as EventListener);
        reject(new Error('Timed out waiting for connection finder.'));
      }, 60_000);
      const handleCompletion = (e: Event) => {
        clearTimeout(timeoutId);
        window.removeEventListener(completionEvent, handleCompletion as EventListener);
        const detail = (e as CustomEvent<{ count?: number }>).detail ?? {};
        const count = detail.count ?? 0;
        resolve(
          count === 0
            ? 'Connection finder ran — no high-signal links found. Open the Connections panel to run again.'
            : `Connection finder ran — ${count} link${count === 1 ? '' : 's'} surfaced. Open the Connections panel to review.`,
        );
      };
      window.addEventListener(completionEvent, handleCompletion as EventListener);
      window.dispatchEvent(new CustomEvent('brainstorm:findConnections', { detail: { requestId } }));
    });
  },
};

const drawConnectionTool: ModelContextTool = {
  name: 'draw_connection',
  description:
    'Creates a visible connection between two currently visible canvas ideas and renders it immediately on the board. ' +
    'Use this when the relationship is already known and should be shown without re-running the full connection finder. ' +
    'This is board-scoped state and persists with the rest of the canvas.',
  inputSchema: {
    type: 'object',
    properties: {
      fromIdeaId: { type: 'string', minLength: 1, description: 'Source idea id on the visible canvas.' },
      toIdeaId: { type: 'string', minLength: 1, description: 'Target idea id on the visible canvas.' },
      kind: {
        type: 'string',
        enum: ['builds_on', 'contradicts', 'revives_killed', 'shared_theme'],
        description: 'Visual connection type to render between the two ideas.',
      },
      rationale: {
        type: 'string',
        minLength: 1,
        description: 'Short explanation of why these two ideas are linked.',
      },
    },
    required: ['fromIdeaId', 'toIdeaId', 'kind', 'rationale'],
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { fromIdeaId, toIdeaId, kind, rationale } = input as {
      fromIdeaId: string;
      toIdeaId: string;
      kind: 'builds_on' | 'contradicts' | 'revives_killed' | 'shared_theme';
      rationale: string;
    };
    if (!fromIdeaId || !toIdeaId) return 'ERROR: `fromIdeaId` and `toIdeaId` are required.';
    if (fromIdeaId === toIdeaId) return 'ERROR: `draw_connection` requires two different idea ids.';
    if (!rationale || !rationale.trim()) return 'ERROR: `rationale` must be a non-empty string.';

    const [fromIdea, toIdea] = await Promise.all([getIdea(fromIdeaId), getIdea(toIdeaId)]);
    if (!fromIdea) return `ERROR: no idea with id ${fromIdeaId}.`;
    if (!toIdea) return `ERROR: no idea with id ${toIdeaId}.`;

    const detail = await dispatchAndWaitForDetail<{ ok?: boolean; error?: string; connectionId?: string }>(
      'brainstorm:drawConnection',
      {
        fromIdeaId,
        toIdeaId,
        kind,
        rationale: rationale.trim(),
      },
    );
    if (detail.error) return `ERROR: ${detail.error}`;

    return `Connection drawn between "${fromIdeaId}" and "${toIdeaId}" as "${kind}".`;
  },
};

const critiqueIdeaTool: ModelContextTool = {
  name: 'critique_idea',
  description:
    'Runs the devil’s-advocate over one visible idea and creates one anchored critique card beside that idea on the canvas. ' +
    'Use this to stress-test a specific idea without advancing the main phase state machine.',
  inputSchema: {
    type: 'object',
    properties: {
      ideaId: { type: 'string', minLength: 1, description: 'The visible canvas idea to critique.' },
    },
    required: ['ideaId'],
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { ideaId } = input as { ideaId: string };
    if (!ideaId) return 'ERROR: `ideaId` is required.';
    const idea = await getIdea(ideaId);
    if (!idea) return `ERROR: no idea with id ${ideaId}.`;

    const detail = await dispatchAndWaitForDetail<{ ok?: boolean; error?: string; critiqueId?: string }>(
      'brainstorm:critiqueIdea',
      { ideaId },
      90_000,
    );
    if (detail.error) return `ERROR: ${detail.error}`;

    return detail.critiqueId
      ? `Critique ${detail.critiqueId} created for "${ideaId}".`
      : `Critique created for "${ideaId}".`;
  },
};

const listCritiquesTool: ModelContextTool = {
  name: 'list_critiques',
  description:
    'Returns persisted critique cards, optionally filtered to one idea and/or one status. ' +
    'Active critiques are the cards currently shown on the canvas; dismissed critiques remain in storage for history.',
  inputSchema: {
    type: 'object',
    properties: {
      ideaId: {
        type: 'string',
        minLength: 1,
        description: 'Optional: filter to one idea id.',
      },
      status: {
        type: 'string',
        enum: ['active', 'dismissed', 'all'],
        description: 'Optional status filter. Defaults to active.',
      },
    },
  },
  annotations: { readOnlyHint: true },
  execute: async (input) => {
    const { ideaId, status = 'active' } = (input ?? {}) as {
      ideaId?: string;
      status?: 'active' | 'dismissed' | 'all';
    };
    const critiques = ideaId
      ? await listCritiquesForIdea(ideaId, status === 'all' ? undefined : status)
      : await listCritiques();
    const filtered = critiques.filter(critique => (
      (!ideaId || critique.ideaId === ideaId) &&
      (status === 'all' || critique.status === status)
    ));

    return {
      count: filtered.length,
      critiques: filtered.map(critique => ({
        id: critique.id,
        ideaId: critique.ideaId,
        critique: critique.critique,
        evidenceAsk: critique.evidenceAsk,
        status: critique.status,
        createdAt: critique.createdAt,
        updatedAt: critique.updatedAt,
      })),
    };
  },
};

const dismissCritiqueTool: ModelContextTool = {
  name: 'dismiss_critique',
  description:
    'Dismisses an active critique card so it leaves the canvas while staying in durable history.',
  inputSchema: {
    type: 'object',
    properties: {
      critiqueId: { type: 'string', minLength: 1, description: 'The critique id to dismiss.' },
    },
    required: ['critiqueId'],
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { critiqueId } = input as { critiqueId: string };
    if (!critiqueId) return 'ERROR: `critiqueId` is required.';
    const critique = await getCritique(critiqueId);
    if (!critique) return `ERROR: no critique with id ${critiqueId}.`;
    if (critique.status === 'dismissed') return `Critique "${critiqueId}" is already dismissed.`;

    const detail = await dispatchAndWaitForDetail<{ ok?: boolean; error?: string }>(
      'brainstorm:dismissCritique',
      { critiqueId },
    );
    if (detail.error) return `ERROR: ${detail.error}`;

    return `Critique "${critiqueId}" dismissed.`;
  },
};

const listDiscardedIdeasTool: ModelContextTool = {
  name: 'list_discarded_ideas',
  description:
    'Returns every idea in the discard pile, newest-discarded first. Use this to find prior candidates that ' +
    'might be worth reviving, or to feed discarded context into connection-finding.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: async () => {
    const discarded = await listDiscardedIdeas();
    return {
      count: discarded.length,
      ideas: discarded.map(i => ({
        id: i.id,
        rawText: i.rawText.slice(0, 200),
        tags: i.tags,
        phase: i.phase,
        readiness: i.readiness,
        discardedAt: i.updatedAt,
      })),
    };
  },
};

// ---------------------------------------------------------------------------
// Supporting-doc tools — agent-accessible version of the DocsModal paste flow
// ---------------------------------------------------------------------------

function docSummary(doc: SupportingDoc): {
  id: string;
  ideaId: string;
  title: string;
  status: SupportingDoc['status'];
  summary?: string;
  facts: string[];
  error?: string;
  createdAt: number;
  updatedAt: number;
} {
  return {
    id: doc.id,
    ideaId: doc.ideaId,
    title: doc.title,
    status: doc.status,
    summary: doc.summary,
    facts: doc.facts,
    error: doc.error,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

type SupportingDocToolCompletion = SupportingDocToolResult;

const attachSupportingDocTool: ModelContextTool = {
  name: 'attach_supporting_doc',
  description:
    'Attaches a supporting document (reference material, NOT a new idea) to an existing idea. ' +
    'The text is refined synchronously via the docFactExtractor LLM role — the tool returns only once ' +
    'the doc is either `ready` (summary + facts) or `failed`. The extracted facts are automatically ' +
    'injected into future phase prompts for this idea. Use this when an agent has context (PRD, wiki, ' +
    'notes) that should inform reasoning without becoming its own brainstorm target.',
  inputSchema: {
    type: 'object',
    properties: {
      ideaId: {
        type: 'string',
        minLength: 1,
        description: 'UUID of the idea this doc belongs to.',
      },
      title: {
        type: 'string',
        description: 'Optional short title. If omitted, derived from the first non-empty line of rawText.',
      },
      rawText: {
        type: 'string',
        minLength: 1,
        description:
          'The document body. Capped at ~8000 chars by the extractor; anything beyond is truncated.',
      },
    },
    required: ['ideaId', 'rawText'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      docId: { type: 'string' },
      status: { type: 'string', description: '`ready` or `failed`.' },
      summary: { type: 'string' },
      facts: { type: 'array', items: { type: 'string' } },
      error: { type: 'string' },
    },
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { ideaId, title, rawText } = input as {
      ideaId: string;
      title?: string;
      rawText: string;
    };
    if (!ideaId) return 'ERROR: `ideaId` is required.';
    if (!rawText || rawText.trim().length === 0) return 'ERROR: `rawText` must be non-empty.';
    const idea = await getIdea(ideaId);
    if (!idea) return `ERROR: no idea with id ${ideaId}.`;
    const refined = await dispatchAndWaitForResult<SupportingDocToolCompletion>('brainstorm:attachSupportingDoc', {
      ideaId,
      title: title ?? '',
      rawText,
    });
    return {
      docId: refined.docId,
      status: refined.status,
      summary: refined.summary,
      facts: refined.facts,
      error: refined.error,
    };
  },
};

const listSupportingDocsTool: ModelContextTool = {
  name: 'list_supporting_docs',
  description:
    'Returns all supporting docs attached to an idea, sorted newest-first. ' +
    'Each doc reports its title, status (processing / ready / failed), summary, and extracted facts.',
  inputSchema: {
    type: 'object',
    properties: {
      ideaId: { type: 'string', minLength: 1 },
    },
    required: ['ideaId'],
  },
  annotations: { readOnlyHint: true },
  execute: async (input) => {
    const { ideaId } = input as { ideaId: string };
    if (!ideaId) return 'ERROR: `ideaId` is required.';
    const docs = await listDocsForIdea(ideaId);
    return { ideaId, count: docs.length, docs: docs.map(docSummary) };
  },
};

const getSupportingDocTool: ModelContextTool = {
  name: 'get_supporting_doc',
  description:
    'Returns a single supporting doc including its full rawText (subject to the 8k-char cap at creation time).',
  inputSchema: {
    type: 'object',
    properties: {
      docId: { type: 'string', minLength: 1 },
    },
    required: ['docId'],
  },
  annotations: { readOnlyHint: true },
  execute: async (input) => {
    const { docId } = input as { docId: string };
    if (!docId) return 'ERROR: `docId` is required.';
    const doc = await getDoc(docId);
    if (!doc) return `ERROR: no doc with id ${docId}.`;
    return {
      ...docSummary(doc),
      rawText: doc.rawText,
    };
  },
};

const deleteSupportingDocTool: ModelContextTool = {
  name: 'delete_supporting_doc',
  description:
    'Deletes a supporting doc. Its facts will no longer be injected into phase prompts for the owning idea.',
  inputSchema: {
    type: 'object',
    properties: {
      docId: { type: 'string', minLength: 1 },
    },
    required: ['docId'],
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { docId } = input as { docId: string };
    if (!docId) return 'ERROR: `docId` is required.';
    const doc = await getDoc(docId);
    if (!doc) return `ERROR: no doc with id ${docId}.`;
    await dispatchAndWait('brainstorm:deleteSupportingDoc', { docId }, 'Deleted supporting doc');
    return `Deleted doc "${doc.title}" (${docId}).`;
  },
};

const retryDocExtractionTool: ModelContextTool = {
  name: 'retry_doc_extraction',
  description:
    'Re-runs the docFactExtractor on an existing doc. Useful when the first attempt failed or the ' +
    'underlying model/provider has changed. Returns the new status.',
  inputSchema: {
    type: 'object',
    properties: {
      docId: { type: 'string', minLength: 1 },
    },
    required: ['docId'],
  },
  annotations: { readOnlyHint: false },
  execute: async (input) => {
    const { docId } = input as { docId: string };
    if (!docId) return 'ERROR: `docId` is required.';
    const doc = await getDoc(docId);
    if (!doc) return `ERROR: no doc with id ${docId}.`;
    const refined = await dispatchAndWaitForResult<SupportingDocToolCompletion>('brainstorm:retrySupportingDoc', { docId });
    return {
      docId: refined.docId,
      status: refined.status,
      summary: refined.summary,
      facts: refined.facts,
      error: refined.error,
    };
  },
};

const attachLocalDocCandidateTool = createAttachLocalDocCandidateTool(async (ideaId, title, rawText) => {
  const refined = await dispatchAndWaitForResult<SupportingDocToolCompletion>('brainstorm:attachSupportingDoc', {
    ideaId,
    title,
    rawText,
  });
  return refined;
});

// ---------------------------------------------------------------------------
// Lifecycle tools — phase-contextual
// ---------------------------------------------------------------------------

function makeAdvancePhaseTool(selectedIdea: LegacyToolIdea, specLabel: string, skippable: boolean): ModelContextTool {
  return {
    name: 'advance_phase',
    description:
      `Runs the current sub-phase for the selected idea (currently at step ${selectedIdea.phase}/8 — "${specLabel}") and advances to the next sub-phase. ` +
      'Sub-phases include micro steps (decimal numbers like 0.5, 2.5, 4.5) that surface lenses, challenges, and stress-tests. ' +
      'For phases that require user input (approach synthesis, rules extraction), provide `userInput`. ' +
      'Set `skip=true` only for skippable micro steps if the user wants to bypass the AI call.',
    inputSchema: {
      type: 'object',
      properties: {
        userInput: {
          type: 'string',
          description:
            'User response to open questions. Required for phases that expect input; leave empty otherwise.',
        },
        skip: {
          type: 'boolean',
          description: `If true, skip this step without running the AI. Only valid when the step is skippable (currently ${skippable ? 'skippable' : 'NOT skippable'}).`,
        },
      },
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { userInput, skip } = input as { userInput?: string; skip?: boolean };
      if (selectedIdea.phase >= 8) {
        return `Idea is already at step 8 (complete). Use export_handoff to download the artifact.`;
      }
      if (skip && !skippable) {
        return `ERROR: step ${selectedIdea.phase} ("${specLabel}") is not skippable.`;
      }
      await dispatchAndWait(
        'brainstorm:advancePhase',
        { ideaId: selectedIdea.id, userInput: userInput ?? '', skip: !!skip },
        skip
          ? `Step ${selectedIdea.phase} ("${specLabel}") skipped.`
          : `Step ${selectedIdea.phase} ("${specLabel}") completed.`,
        30000,
      );
      return `Step ${selectedIdea.phase} ("${specLabel}") ${skip ? 'skipped' : 'completed'} for idea "${selectedIdea.rawText.slice(0, 60)}". Check get_idea for updated state.`;
    },
  };
}

function makeSubmitClarificationsTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  const questions = selectedIdea.clarifications.map((q, i) => `${i + 1}. ${q.question}`).join('\n');
  return {
    name: 'submit_clarifications',
    description:
      `Submits answers to the clarification questions for the selected idea (currently at step ${selectedIdea.phase} — approach synthesis). ` +
      `The open questions are:\n${questions || '(none yet — advance to step 2 first)'}`,
    inputSchema: {
      type: 'object',
      properties: {
        answers: {
          type: 'string',
          description: 'Your answers to the clarification questions above, written in plain prose.',
          minLength: 1,
        },
      },
      required: ['answers'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { answers } = input as { answers: string };
      if (!answers || typeof answers !== 'string' || answers.trim().length === 0) {
        return 'ERROR: `answers` must be a non-empty string.';
      }
      if (selectedIdea.phase !== 2) {
        return `ERROR: submit_clarifications is only valid at step 2 (approach synthesis). Current step is ${selectedIdea.phase}.`;
      }
      await dispatchAndWait(
        'brainstorm:advancePhase',
        { ideaId: selectedIdea.id, userInput: answers },
        'Clarifications submitted. Advancing past approach synthesis.',
        30000,
      );
      return `Clarifications submitted for "${selectedIdea.rawText.slice(0, 60)}". Approach synthesis will now run.`;
    },
  };
}

function makeSelectApproachTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  const approaches = selectedIdea.briefState.approaches
    .map((a, i) => `${i + 1}. [${a.id}] ${a.label}: ${a.summary}`)
    .join('\n');
  return {
    name: 'select_approach',
    description:
      `Selects a preferred approach for the idea and advances past rules extraction. ` +
      `Available approaches:\n${approaches || '(none yet — advance further first)'}`,
    inputSchema: {
      type: 'object',
      properties: {
        approachId: {
          type: 'string',
          description: 'The ID of the chosen approach from the list above.',
          minLength: 1,
        },
        rationale: {
          type: 'string',
          description: 'Why this approach was chosen (brief explanation).',
        },
      },
      required: ['approachId'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { approachId, rationale } = input as { approachId: string; rationale?: string };
      if (!approachId) {
        return 'ERROR: `approachId` is required.';
      }
      if (selectedIdea.phase !== 3) {
        return `ERROR: select_approach is only valid at step 3 (rules extraction). Current step is ${selectedIdea.phase}.`;
      }
      const userInput = rationale
        ? `I prefer approach ${approachId}. Rationale: ${rationale}`
        : `I prefer approach ${approachId}.`;
      await dispatchAndWait(
        'brainstorm:advancePhase',
        { ideaId: selectedIdea.id, userInput },
        `Approach ${approachId} selected. Running rules extraction.`,
        30000,
      );
      return `Approach "${approachId}" selected. Rules extraction will now run.`;
    },
  };
}

// ---------------------------------------------------------------------------
// Micro-step tools — per-entry patches for lens (0.5), challenge (2.5), stress (4.5)
// ---------------------------------------------------------------------------

function makePinLensTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  const lenses = selectedIdea.briefState.lenses
    .map((l, i) => `${i + 1}. [${l.id}] (${l.kind}) ${l.frame} — ${l.insight.slice(0, 80)}`)
    .join('\n');
  return {
    name: 'pin_lens',
    description:
      `Pins a lens the user wants to keep (elevates its weight downstream). Available lenses:\n${lenses || '(none)'}`,
    inputSchema: {
      type: 'object',
      properties: {
        lensId: { type: 'string', description: 'ID of the lens to pin.', minLength: 1 },
      },
      required: ['lensId'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { lensId } = input as { lensId: string };
      if (!selectedIdea.briefState.lenses.some(l => l.id === lensId)) {
        return `ERROR: no lens with id "${lensId}" on this idea.`;
      }
      await dispatchAndWait(
        'brainstorm:patchLens',
        { ideaId: selectedIdea.id, lensId, verdict: 'pinned' },
        `Pinned lens ${lensId}.`,
      );
      return `Lens "${lensId}" pinned.`;
    },
  };
}

function makeDismissLensTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  return {
    name: 'dismiss_lens',
    description: 'Dismisses a lens the user finds irrelevant. It stays visible but de-emphasized.',
    inputSchema: {
      type: 'object',
      properties: {
        lensId: { type: 'string', description: 'ID of the lens to dismiss.', minLength: 1 },
      },
      required: ['lensId'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { lensId } = input as { lensId: string };
      if (!selectedIdea.briefState.lenses.some(l => l.id === lensId)) {
        return `ERROR: no lens with id "${lensId}" on this idea.`;
      }
      await dispatchAndWait(
        'brainstorm:patchLens',
        { ideaId: selectedIdea.id, lensId, verdict: 'dismissed' },
        `Dismissed lens ${lensId}.`,
      );
      return `Lens "${lensId}" dismissed.`;
    },
  };
}

function makeNoteLensTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  return {
    name: 'note_lens',
    description: 'Attaches the user\'s reaction/note to a lens entry.',
    inputSchema: {
      type: 'object',
      properties: {
        lensId: { type: 'string', description: 'ID of the lens.', minLength: 1 },
        note: { type: 'string', description: 'The user\'s reaction to this lens.', minLength: 1 },
      },
      required: ['lensId', 'note'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { lensId, note } = input as { lensId: string; note: string };
      if (!note || !note.trim()) {
        return 'ERROR: `note` must be a non-empty string.';
      }
      await dispatchAndWait(
        'brainstorm:patchLens',
        { ideaId: selectedIdea.id, lensId, userNote: note.trim() },
        `Saved note on lens ${lensId}.`,
      );
      return `Note saved for lens "${lensId}".`;
    },
  };
}

function makeRespondChallengeTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  const challenges = selectedIdea.briefState.challenges
    .map((c, i) => `${i + 1}. [${c.id}] ${c.critique.slice(0, 100)}`)
    .join('\n');
  return {
    name: 'respond_to_challenge',
    description:
      `Takes a stance on a devil's-advocate critique. Stances: "accept" (valid concern), "defer" (address later), "rebut" (disagree — provide rebuttal). Available challenges:\n${challenges || '(none)'}`,
    inputSchema: {
      type: 'object',
      properties: {
        challengeId: { type: 'string', description: 'ID of the challenge.', minLength: 1 },
        stance: {
          type: 'string',
          enum: ['accept', 'defer', 'rebut'],
          description: 'Your stance on this challenge.',
        },
        rebuttal: {
          type: 'string',
          description: 'Required when stance is "rebut" — why the critique is wrong.',
        },
      },
      required: ['challengeId', 'stance'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { challengeId, stance, rebuttal } = input as {
        challengeId: string;
        stance: 'accept' | 'defer' | 'rebut';
        rebuttal?: string;
      };
      if (!selectedIdea.briefState.challenges.some(c => c.id === challengeId)) {
        return `ERROR: no challenge with id "${challengeId}" on this idea.`;
      }
      if (stance === 'rebut' && (!rebuttal || !rebuttal.trim())) {
        return 'ERROR: `rebuttal` is required when stance is "rebut".';
      }
      await dispatchAndWait(
        'brainstorm:patchChallenge',
        {
          ideaId: selectedIdea.id,
          challengeId,
          stance,
          ...(rebuttal ? { userRebuttal: rebuttal.trim() } : {}),
        },
        `Challenge ${challengeId} marked as ${stance}.`,
      );
      return `Challenge "${challengeId}" marked as "${stance}"${rebuttal ? ' with rebuttal' : ''}.`;
    },
  };
}

function makeMarkStressHandledTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  const stresses = selectedIdea.briefState.stressResults
    .map((s, i) => `${i + 1}. [${s.id}] rule ${s.ruleIndex + 1}: ${s.edgeCase.slice(0, 80)}`)
    .join('\n');
  return {
    name: 'mark_stress_handled',
    description:
      `Marks a stress-test edge case as handled (or unhandled) and optionally records how the design addresses it. Available stress tests:\n${stresses || '(none)'}`,
    inputSchema: {
      type: 'object',
      properties: {
        stressId: { type: 'string', description: 'ID of the stress-test result.', minLength: 1 },
        handled: {
          type: 'boolean',
          description: 'Set true to mark as handled, false to mark as unhandled.',
        },
        response: {
          type: 'string',
          description: 'Optional: how the design handles this edge case.',
        },
      },
      required: ['stressId', 'handled'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { stressId, handled, response } = input as {
        stressId: string;
        handled: boolean;
        response?: string;
      };
      if (!selectedIdea.briefState.stressResults.some(s => s.id === stressId)) {
        return `ERROR: no stress test with id "${stressId}" on this idea.`;
      }
      await dispatchAndWait(
        'brainstorm:patchStress',
        {
          ideaId: selectedIdea.id,
          stressId,
          handled,
          ...(response ? { userResponse: response.trim() } : {}),
        },
        `Stress ${stressId} marked as ${handled ? 'handled' : 'unhandled'}.`,
      );
      return `Stress test "${stressId}" marked as ${handled ? 'handled' : 'unhandled'}${response ? ' with response' : ''}.`;
    },
  };
}

function makeChooseNextStepTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  return {
    name: 'choose_next_step',
    description:
      `Sets the recommended next action after the brainstorming session for idea at phase ${selectedIdea.phase}. ` +
      'Valid options: planning, prototyping, research, stakeholder_review, defer. ' +
      'Use this when the idea has reached phase 8 to record what happens next.',
    inputSchema: {
      type: 'object',
      properties: {
        nextStep: {
          type: 'string',
          enum: ['planning', 'prototyping', 'research', 'stakeholder_review', 'defer'],
          description: 'The recommended next action after the brainstorming session.',
        },
      },
      required: ['nextStep'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { nextStep } = input as { nextStep: string };
      const valid = ['planning', 'prototyping', 'research', 'stakeholder_review', 'defer'];
      if (!valid.includes(nextStep)) {
        return `ERROR: nextStep must be one of: ${valid.join(', ')}`;
      }
      await dispatchAndWait(
        'brainstorm:chooseNextStep',
        { ideaId: selectedIdea.id, nextStep },
        `Next step set to "${nextStep}".`,
      );
      return `Next step for "${selectedIdea.rawText.slice(0, 60)}" set to "${nextStep}".`;
    },
  };
}

function makeAddRuleTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  const existingRules = selectedIdea.briefState.mustStayTrueRules
    .map((rule, index) => `${index + 1}. ${rule}`)
    .join('\n');
  return {
    name: 'add_rule',
    description:
      `Adds a must-stay-true rule for the selected idea. Existing rules:\n${existingRules || '(none yet)'}`,
    inputSchema: {
      type: 'object',
      properties: {
        rule: {
          type: 'string',
          minLength: 1,
          description: 'The new must-stay-true rule to add.',
        },
      },
      required: ['rule'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { rule } = input as { rule: string };
      if (!rule || !rule.trim()) {
        return 'ERROR: `rule` must be a non-empty string.';
      }
      const normalizedRule = rule.trim();
      if (selectedIdea.briefState.mustStayTrueRules.includes(normalizedRule)) {
        return `ERROR: rule "${normalizedRule}" already exists on this idea.`;
      }

      const detail = await dispatchAndWaitForResult<{ rule: string }>('brainstorm:add_rule', {
        ideaId: selectedIdea.id,
        rule: normalizedRule,
      });
      return {
        ideaId: selectedIdea.id,
        rule: detail.rule,
      };
    },
  };
}

function makeRemoveRuleTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  const existingRules = selectedIdea.briefState.mustStayTrueRules
    .map((rule, index) => `${index}. ${rule}`)
    .join('\n');
  return {
    name: 'remove_rule',
    description:
      `Removes a must-stay-true rule from the selected idea by index. Current rules:\n${existingRules || '(none yet)'}`,
    inputSchema: {
      type: 'object',
      properties: {
        ruleIndex: {
          type: 'number',
          minimum: 0,
          description: 'Zero-based index of the rule to remove.',
        },
      },
      required: ['ruleIndex'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { ruleIndex } = input as { ruleIndex: number };
      if (!Number.isInteger(ruleIndex)) {
        return 'ERROR: `ruleIndex` must be an integer.';
      }
      if (ruleIndex < 0 || ruleIndex >= selectedIdea.briefState.mustStayTrueRules.length) {
        return `ERROR: ruleIndex must be between 0 and ${Math.max(0, selectedIdea.briefState.mustStayTrueRules.length - 1)}.`;
      }

      const detail = await dispatchAndWaitForResult<{ ruleIndex?: number; rule?: string | null }>('brainstorm:remove_rule', {
        ideaId: selectedIdea.id,
        ruleIndex,
      });
      return {
        ideaId: selectedIdea.id,
        ruleIndex: detail.ruleIndex ?? ruleIndex,
        rule: detail.rule ?? selectedIdea.briefState.mustStayTrueRules[ruleIndex] ?? null,
      };
    },
  };
}

function makeListRisksTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  return {
    name: 'list_risks',
    description:
      'Returns the explicit risk register for the selected idea, plus current rules and stress-test state used in premortem and stress beads.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const detail = await dispatchAndWaitForResult<{
        risks: LegacyToolIdea['briefState']['risks'];
        count: number;
        stressResults: LegacyToolIdea['briefState']['stressResults'];
        rules: LegacyToolIdea['briefState']['mustStayTrueRules'];
      }>('brainstorm:list_risks', {
        ideaId: selectedIdea.id,
      });
      return {
        ideaId: selectedIdea.id,
        count: detail.count,
        risks: detail.risks,
        stressResults: detail.stressResults,
        rules: detail.rules,
      };
    },
  };
}

function makePatchRiskTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  const existingRisks = selectedIdea.briefState.risks
    .map((risk, index) => `${index + 1}. [${risk.id}] (${risk.likelihood}/${risk.impact}) ${risk.description}`)
    .join('\n');
  return {
    name: 'patch_risk',
    description:
      `Edits a risk in the selected idea's risk register. Current risks:\n${existingRisks || '(none yet)'}`,
    inputSchema: {
      type: 'object',
      properties: {
        riskId: {
          type: 'string',
          minLength: 1,
          description: 'ID of the risk to edit.',
        },
        description: {
          type: 'string',
          description: 'Optional replacement description.',
        },
        likelihood: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Optional replacement likelihood.',
        },
        impact: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Optional replacement impact.',
        },
        userNote: {
          type: 'string',
          description: 'Optional follow-up note, mitigation note, or owner note.',
        },
      },
      required: ['riskId'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { riskId, description, likelihood, impact, userNote } = input as {
        riskId: string;
        description?: string;
        likelihood?: LegacyToolIdea['briefState']['risks'][number]['likelihood'];
        impact?: LegacyToolIdea['briefState']['risks'][number]['impact'];
        userNote?: string;
      };
      if (!riskId) return 'ERROR: `riskId` is required.';
      if (!selectedIdea.briefState.risks.some(risk => risk.id === riskId)) {
        return `ERROR: no risk with id "${riskId}" on this idea.`;
      }
      if (description !== undefined && !description.trim()) {
        return 'ERROR: `description` must be non-empty when provided.';
      }

      const detail = await dispatchAndWaitForResult<{
        riskId: string;
        description?: string;
        likelihood?: LegacyToolIdea['briefState']['risks'][number]['likelihood'];
        impact?: LegacyToolIdea['briefState']['risks'][number]['impact'];
        userNote?: string;
      }>('brainstorm:patch_risk', {
        ideaId: selectedIdea.id,
        riskId,
        ...(description !== undefined ? { description: description.trim() } : {}),
        ...(likelihood ? { likelihood } : {}),
        ...(impact ? { impact } : {}),
        ...(userNote !== undefined ? { userNote } : {}),
      });
      return {
        ideaId: selectedIdea.id,
        riskId: detail.riskId,
        description: detail.description ?? null,
        likelihood: detail.likelihood ?? null,
        impact: detail.impact ?? null,
        userNote: detail.userNote ?? null,
      };
    },
  };
}

function makeListAmbiguitiesTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  return {
    name: 'list_ambiguities',
    description:
      'Returns the explicit ambiguity state for the selected idea, including severity, resolution mode, current resolution status, and linked clarification questions.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'resolved', 'deferred', 'dismissed', 'all'],
          description: 'Optional resolution-state filter. Defaults to all ambiguities.',
        },
      },
    },
    annotations: { readOnlyHint: true },
    execute: async (input) => {
      const { status = 'all' } = (input ?? {}) as { status?: AmbiguityResolutionStatus | 'all' };
      const ambiguities = selectedIdea.ambiguities
        .filter(ambiguity => status === 'all' || (ambiguity.resolution?.status ?? 'open') === status)
        .map(ambiguity => ({
          ...ambiguity,
          resolution: {
            status: ambiguity.resolution?.status ?? 'open',
            note: ambiguity.resolution?.note,
            resolvedBy: ambiguity.resolution?.resolvedBy,
            resolvedAt: ambiguity.resolution?.resolvedAt,
          },
          clarifications: selectedIdea.clarifications
            .filter(question => question.ambiguityId === ambiguity.id)
            .map(question => ({
              id: question.id,
              question: question.question,
              answer: question.answer,
            })),
        }));

      return {
        ideaId: selectedIdea.id,
        count: ambiguities.length,
        ambiguities,
      };
    },
  };
}

function makeResolveAmbiguityTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  return {
    name: 'resolve_ambiguity',
    description:
      'Records how a specific ambiguity was resolved, deferred, dismissed, or reopened for the selected idea using the lifecycle write handshake.',
    inputSchema: {
      type: 'object',
      properties: {
        ambiguityId: {
          type: 'string',
          minLength: 1,
          description: 'ID of the ambiguity to update.',
        },
        status: {
          type: 'string',
          enum: ['open', 'resolved', 'deferred', 'dismissed'],
          description: 'Next resolution state for this ambiguity.',
        },
        resolution: {
          type: 'string',
          description: 'Optional note describing how or why the ambiguity was resolved.',
        },
      },
      required: ['ambiguityId', 'status'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { ambiguityId, status, resolution } = input as {
        ambiguityId: string;
        status: AmbiguityResolutionStatus;
        resolution?: string;
      };
      if (!ambiguityId) return 'ERROR: `ambiguityId` is required.';
      if (!selectedIdea.ambiguities.some(ambiguity => ambiguity.id === ambiguityId)) {
        return `ERROR: no ambiguity with id "${ambiguityId}" on this idea.`;
      }

      const detail = await dispatchAndWaitForResult<{
        ambiguityId: string;
        status: AmbiguityResolutionStatus;
        note?: string;
      }>('brainstorm:resolve_ambiguity', {
        ideaId: selectedIdea.id,
        ambiguityId,
        status,
        ...(resolution?.trim() ? { resolution: resolution.trim() } : {}),
      });

      return {
        ideaId: selectedIdea.id,
        ambiguityId: detail.ambiguityId,
        status: detail.status,
        note: detail.note ?? null,
      };
    },
  };
}

function makeGetPhaseHistoryTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  return {
    name: 'get_phase_history',
    description:
      'Returns the selected idea\'s derived workflow-memory history: phase transitions plus lifecycle mutations like ambiguity resolution, rule changes, risk edits, stress handling, and next-step capture.',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: {
          type: 'string',
          description: 'Optional pagination cursor from a previous get_phase_history response.',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Optional page size. Defaults to 20, maximum 100.',
        },
      },
    },
    annotations: { readOnlyHint: true },
    execute: async (input) => {
      const { cursor, limit } = (input ?? {}) as { cursor?: string; limit?: number };
      return getIdeaPhaseHistory({
        ideaId: selectedIdea.id,
        cursor,
        limit,
      });
    },
  };
}

function makeGetBeadStateTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  return {
    name: 'get_bead_state',
    description:
      'Returns the derived 12-bead runtime state for the selected idea: active bead, completed beads, soft nudges, and durable review flags. This is derived from the idea phase plus bead coordination metadata, not a second workflow store.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => deriveIdeaBeadState(selectedIdea),
  };
}

function makeSuggestNextBeadTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  const availableTargets = SUB_PHASES.filter(spec => spec.number > selectedIdea.phase);
  const targetSummary = availableTargets.map(spec => `${spec.number}: ${spec.label}`).join('\n');
  return {
    name: 'suggest_next_bead',
    description:
      `Adds a soft facilitator nudge toward a future bead without changing phase. Available future beads:\n${targetSummary || '(none)'}`,
    inputSchema: {
      type: 'object',
      properties: {
        phaseNumber: {
          type: 'number',
          enum: availableTargets.map(spec => spec.number),
          description: 'Future bead phase number to softly nudge.',
        },
        reason: {
          type: 'string',
          minLength: 1,
          description: 'Why this bead is the likely next focus.',
        },
      },
      required: ['phaseNumber', 'reason'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { phaseNumber, reason } = input as { phaseNumber: number; reason: string };
      if (!isKnownBeadPhase(phaseNumber)) return 'ERROR: `phaseNumber` must match a known bead.';
      if (phaseNumber <= selectedIdea.phase) {
        return `ERROR: suggest_next_bead only accepts future beads. Current phase is ${selectedIdea.phase}.`;
      }
      if (!reason?.trim()) return 'ERROR: `reason` must be a non-empty string.';

      const detail = await dispatchAndWaitForResult<{ phaseNumber: number; reason: string }>('brainstorm:suggest_next_bead', {
        ideaId: selectedIdea.id,
        phaseNumber,
        reason: reason.trim(),
      });
      return {
        ideaId: selectedIdea.id,
        phaseNumber: detail.phaseNumber,
        reason: detail.reason,
      };
    },
  };
}

function makeFlagBeadForReviewTool(selectedIdea: LegacyToolIdea): ModelContextTool {
  const completedBeads = SUB_PHASES.filter(spec => spec.number < selectedIdea.phase);
  const completedSummary = completedBeads.map(spec => `${spec.number}: ${spec.label}`).join('\n');
  return {
    name: 'flag_bead_for_review',
    description:
      `Marks a completed bead for revisit because new evidence undermined it. Completed beads:\n${completedSummary || '(none yet)'}`,
    inputSchema: {
      type: 'object',
      properties: {
        phaseNumber: {
          type: 'number',
          enum: completedBeads.map(spec => spec.number),
          description: 'Completed bead phase number to mark for revisit.',
        },
        reason: {
          type: 'string',
          minLength: 1,
          description: 'Why the earlier bead now needs attention.',
        },
      },
      required: ['phaseNumber', 'reason'],
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { phaseNumber, reason } = input as { phaseNumber: number; reason: string };
      if (!isKnownBeadPhase(phaseNumber)) return 'ERROR: `phaseNumber` must match a known bead.';
      if (phaseNumber >= selectedIdea.phase) {
        return `ERROR: flag_bead_for_review only accepts completed beads. Current phase is ${selectedIdea.phase}.`;
      }
      if (!reason?.trim()) return 'ERROR: `reason` must be a non-empty string.';

      const detail = await dispatchAndWaitForResult<{ phaseNumber: number; reason: string }>('brainstorm:flag_bead_for_review', {
        ideaId: selectedIdea.id,
        phaseNumber,
        reason: reason.trim(),
      });
      return {
        ideaId: selectedIdea.id,
        phaseNumber: detail.phaseNumber,
        reason: detail.reason,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// useBrainstormingTools — React hook
// ---------------------------------------------------------------------------

const GLOBAL_BOARD_TOOLS: ModelContextTool[] = [
  listIdeasTool,
  getIdeaTool,
  getTurnLogTool,
  captureIdeaTool,
  exportHandoffTool,
  getCanvasTool,
  getBoardTool,
  movePanelTool,
  groupIdeasTool,
  ungroupIdeaTool,
  mergeIdeasTool,
  attachSupportingDocTool,
  searchLocalDocsTool,
  attachLocalDocCandidateTool,
  listSupportingDocsTool,
  getSupportingDocTool,
  deleteSupportingDocTool,
  retryDocExtractionTool,
  discardIdeaTool,
  restoreIdeaTool,
  listDiscardedIdeasTool,
  findConnectionsTool,
  drawConnectionTool,
  critiqueIdeaTool,
  listCritiquesTool,
  dismissCritiqueTool,
  scoutIdeasTool,
  crossPollinateTool,
  runBeatTool,
  listSuggestionsTool,
  admitSuggestionTool,
  elaborateSuggestionTool,
  dismissSuggestionTool,
];

const FACILITATOR_CONTROL_TOOLS: ModelContextTool[] = [
  listPeersTool,
  getAiAutonomyStateTool,
  claimAiHostTool,
  releaseAiHostTool,
  setAiAutonomyModeTool,
  setAiPausedTool,
];

function buildLifecycleToolSet(selectedIdea: LegacyToolIdea): ModelContextTool[] {
  const spec = findSubPhase(selectedIdea.phase);
  if (!spec) return [];

  const tools: ModelContextTool[] = [];
  const mainPhase = Math.floor(selectedIdea.phase);
  if (selectedIdea.phase === 2) {
    tools.push(makeSubmitClarificationsTool(selectedIdea));
  } else if (selectedIdea.phase === 3) {
    tools.push(makeSelectApproachTool(selectedIdea));
  } else if (selectedIdea.phase >= 8) {
    tools.push(makeChooseNextStepTool(selectedIdea));
  } else {
    tools.push(makeAdvancePhaseTool(selectedIdea, spec.label, spec.skippable));
  }

  if (selectedIdea.phase === 0.5) {
    tools.push(
      makePinLensTool(selectedIdea),
      makeDismissLensTool(selectedIdea),
      makeNoteLensTool(selectedIdea),
    );
  }
  if (selectedIdea.phase === 2.5) {
    tools.push(makeRespondChallengeTool(selectedIdea));
  }
  if (selectedIdea.phase === 4.5) {
    tools.push(makeMarkStressHandledTool(selectedIdea));
  }

  if (mainPhase <= 1) {
    tools.push(
      makeListAmbiguitiesTool(selectedIdea),
      makeResolveAmbiguityTool(selectedIdea),
    );
  }

  if (mainPhase >= 3 || selectedIdea.briefState.mustStayTrueRules.length > 0) {
    tools.push(makeAddRuleTool(selectedIdea));
    if (selectedIdea.briefState.mustStayTrueRules.length > 0) {
      tools.push(makeRemoveRuleTool(selectedIdea));
    }
  }

  if (mainPhase >= 4 || selectedIdea.briefState.risks.length > 0) {
    tools.push(makeListRisksTool(selectedIdea));
    if (selectedIdea.briefState.risks.length > 0) {
      tools.push(makePatchRiskTool(selectedIdea));
    }
  }

  tools.push(makeGetBeadStateTool(selectedIdea));
  if (selectedIdea.phase < 8) {
    tools.push(makeSuggestNextBeadTool(selectedIdea));
  }
  if (selectedIdea.phase > 0) {
    tools.push(makeFlagBeadForReviewTool(selectedIdea));
  }
  tools.push(makeGetPhaseHistoryTool(selectedIdea));

  return tools;
}

function registerToolScope(
  mc: ModelContext,
  controllerRef: MutableRefObject<AbortController | null>,
  tools: ModelContextTool[],
  scopeLabel: string,
): void {
  if (controllerRef.current || tools.length === 0) return;
  controllerRef.current = new AbortController();
  const opts = { signal: controllerRef.current.signal };
  tools.forEach(tool => safeRegisterTool(mc, tool, opts));
  console.info(`[webmcp-tools] ${scopeLabel} tools registered: ${tools.map(tool => tool.name).join(', ')}`);
}

function abortToolScope(controllerRef: MutableRefObject<AbortController | null>): void {
  if (!controllerRef.current) return;
  controllerRef.current.abort();
  controllerRef.current = null;
}

/**
 * Registers the brainstorming WebMCP surface under three explicit scopes:
 * global board tools, facilitator control-plane tools, and selected-idea
 * lifecycle tools keyed to the current idea id + phase.
 */
export function useBrainstormingTools(selectedIdea: LegacyToolIdea | null): void {
  const globalAcRef = useRef<AbortController | null>(null);
  const facilitatorAcRef = useRef<AbortController | null>(null);
  const lifecycleAcRef = useRef<AbortController | null>(null);
  const lifecycleScopeKey = selectedIdea ? JSON.stringify(selectedIdea) : null;

  useEffect(() => {
    const mc = window.navigator.modelContext;
    if (!mc) {
      console.info('[webmcp-tools] navigator.modelContext not available — WebMCP tools not registered.');
      return;
    }
    registerToolScope(mc, globalAcRef, GLOBAL_BOARD_TOOLS, 'Global board');
    return () => abortToolScope(globalAcRef);
  }, []);

  useEffect(() => {
    const mc = window.navigator.modelContext;
    if (!mc) return;
    registerToolScope(mc, facilitatorAcRef, FACILITATOR_CONTROL_TOOLS, 'Facilitator control-plane');
    return () => abortToolScope(facilitatorAcRef);
  }, []);

  useEffect(() => {
    const mc = window.navigator.modelContext;
    if (!mc) return;
    if (!selectedIdea) {
      console.info('[webmcp-tools] No selected idea — lifecycle-scoped tools remain unmounted.');
      return () => abortToolScope(lifecycleAcRef);
    }

    const lifecycleTools = buildLifecycleToolSet(selectedIdea);
    registerToolScope(
      mc,
      lifecycleAcRef,
      lifecycleTools,
      `Lifecycle ${selectedIdea.id}@${selectedIdea.phase}`,
    );
    return () => abortToolScope(lifecycleAcRef);
  }, [lifecycleScopeKey]);
}

export {
  listIdeasTool,
  getIdeaTool,
  captureIdeaTool,
  exportHandoffTool,
  dispatchAndWait,
};
