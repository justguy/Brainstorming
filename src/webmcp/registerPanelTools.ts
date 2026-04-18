/**
 * Global WebMCP tool registrations for the Brainstorming side panel.
 *
 * These tools are available whenever the side panel is open.
 * Call `registerPanelTools()` once on panel mount; call the returned
 * unregister function on unmount (or when the panel closes).
 *
 * All registrations share a single AbortController so a single
 * `ac.abort()` deregisters every tool atomically.
 *
 * If WebMCP is not supported, a no-op is returned and a warning is
 * logged — no exception is thrown.
 */

import { detectWebMcpSupport } from './detectSupport';
import { DEFAULT_BOARD_ID } from '../board/types';
import { createBoardController } from '../storage/boardController';
import { listIdeas, getIdea } from '../storage/ideas';
import type { Idea } from '../types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Truncate a string to `maxLen` chars, appending "…" if truncated. */
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

/**
 * Build a readiness blocker summary for `export_handoff` error responses.
 * Only called when readiness !== 'green'.
 */
function readinessBlockers(idea: Idea): string {
  const issues: string[] = [];

  if (idea.readiness === 'red') {
    issues.push('Idea has not completed the brainstorming pipeline (readiness: red).');
  } else if (idea.readiness === 'yellow') {
    issues.push('One or more phases used a fallback or have open blockers (readiness: yellow).');
  }

  const openQs = idea.briefState.openQuestions.filter(q =>
    q.startsWith('[BLOCKER]') || q.startsWith('[CONTRADICTION]'),
  );
  if (openQs.length > 0) {
    issues.push(`Open blockers: ${openQs.join(' | ')}`);
  }

  return issues.join(' ');
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/**
 * list_ideas
 * Read-only. Returns a summary of all stored ideas.
 */
const listIdeasTool: ModelContextTool = {
  name: 'list_ideas',
  description:
    'Returns a summary list of all brainstorming ideas currently stored in the extension. ' +
    'Each entry includes the idea id, a preview of the raw text (first 80 characters), ' +
    'the current pipeline phase (0–8), and the readiness signal (red | yellow | green).',
  inputSchema: {},
  outputSchema: {
    type: 'object',
    properties: {
      ideas: {
        type: 'array',
        description: 'Summary entries for each stored idea.',
        items: {
          type: 'object',
          properties: {
            id:        { type: 'string',  description: 'Unique idea identifier.' },
            preview:   { type: 'string',  description: 'First 80 characters of the raw idea text.' },
            phase:     { type: 'number',  description: 'Current pipeline phase (0–8).' },
            readiness: { type: 'string',  enum: ['red', 'yellow', 'green'], description: 'Readiness signal.' },
          },
          required: ['id', 'preview', 'phase', 'readiness'],
        },
      },
    },
    required: ['ideas'],
  },
  annotations: { readOnlyHint: true },
  execute: async (_input, _client) => {
    const ideas = await listIdeas();
    return {
      ideas: ideas.map(idea => ({
        id:        idea.id,
        preview:   truncate(idea.rawText, 80),
        phase:     idea.phase,
        readiness: idea.readiness,
      })),
    };
  },
};

/**
 * get_idea
 * Read-only. Returns the full JSON of a single idea by id.
 */
const getIdeaTool: ModelContextTool = {
  name: 'get_idea',
  description:
    'Returns the complete stored state of a single brainstorming idea, identified by its id. ' +
    'Includes rawText, tags, phase, readiness, briefState, ambiguities, clarifications, ' +
    'and the full turn log.',
  inputSchema: {
    type: 'object',
    properties: {
      ideaId: {
        type: 'string',
        description: 'The unique identifier of the idea to retrieve.',
      },
    },
    required: ['ideaId'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      idea: {
        type: 'object',
        description: 'Full idea JSON if found.',
      },
      error: {
        type: 'string',
        description: 'Error message if the idea was not found.',
      },
    },
  },
  annotations: { readOnlyHint: true },
  execute: async (input, _client) => {
    const { ideaId } = input as { ideaId: string };
    if (!ideaId || typeof ideaId !== 'string') {
      return { error: 'ideaId must be a non-empty string.' };
    }
    const idea = await getIdea(ideaId);
    if (!idea) {
      return { error: `No idea found with id "${ideaId}".` };
    }
    return { idea };
  },
};

/**
 * capture_idea
 * Mutating. Creates a new idea and returns its id.
 */
const captureIdeaTool: ModelContextTool = {
  name: 'capture_idea',
  description:
    'Creates a new brainstorming idea from raw text and optional tags, then returns the new idea id. ' +
    'The idea is stored in Phase 0 with readiness "red" until the pipeline is advanced.',
  inputSchema: {
    type: 'object',
    properties: {
      rawText: {
        type: 'string',
        description: 'The raw idea text to capture. Should be a complete thought (1–3 sentences recommended).',
        minLength: 1,
      },
      tags: {
        type: 'array',
        description: 'Optional tags to categorise the idea.',
        items: { type: 'string' },
      },
    },
    required: ['rawText'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      ideaId:    { type: 'string', description: 'Unique id of the newly created idea.' },
      phase:     { type: 'number', description: 'Starting phase (always 0).' },
      readiness: { type: 'string', description: 'Starting readiness signal (always "red").' },
      error:     { type: 'string', description: 'Error message if creation failed.' },
    },
  },
  annotations: { readOnlyHint: false },
  execute: async (input, _client) => {
    const { rawText, tags } = input as { rawText?: string; tags?: string[] };
    if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
      return { error: 'rawText must be a non-empty string.' };
    }
    const boardController = createBoardController(DEFAULT_BOARD_ID);
    const committed = await boardController.captureIdea({
      rawText: rawText.trim(),
      tags: Array.isArray(tags) ? tags.filter(t => typeof t === 'string') : [],
      actor: { type: 'tool', source: 'webmcp', label: 'panel-capture' },
    });
    return {
      ideaId:    committed.idea.id,
      phase:     committed.idea.phase,
      readiness: committed.idea.readiness,
    };
  },
};

/**
 * export_handoff
 * Read-only. Returns the Phase-8 handoff markdown for a green-readiness idea.
 */
const exportHandoffTool: ModelContextTool = {
  name: 'export_handoff',
  description:
    'Returns the Phase-8 handoff markdown artifact for a completed brainstorming idea. ' +
    'Only succeeds when the idea readiness is "green". ' +
    'If readiness is red or yellow, returns an error message listing the blocking conditions.',
  inputSchema: {
    type: 'object',
    properties: {
      ideaId: {
        type: 'string',
        description: 'The unique identifier of the idea to export.',
      },
    },
    required: ['ideaId'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      artifactMd: { type: 'string', description: 'Handoff markdown artifact.' },
      error:      { type: 'string', description: 'Error message when the idea is not ready for handoff.' },
    },
  },
  annotations: { readOnlyHint: true },
  execute: async (input, _client) => {
    const { ideaId } = input as { ideaId: string };
    if (!ideaId || typeof ideaId !== 'string') {
      return { error: 'ideaId must be a non-empty string.' };
    }

    const idea = await getIdea(ideaId);
    if (!idea) {
      return { error: `No idea found with id "${ideaId}".` };
    }

    if (idea.readiness !== 'green') {
      return {
        error:
          `Idea "${ideaId}" is not ready for handoff (readiness="${idea.readiness}"). ` +
          readinessBlockers(idea),
      };
    }

    if (!idea.artifactMd) {
      return {
        error:
          `Idea "${ideaId}" has readiness "green" but artifactMd is empty. ` +
          'Re-run Phase 5 (briefComposer) to regenerate.',
      };
    }

    return { artifactMd: idea.artifactMd };
  },
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

const PANEL_TOOLS: ModelContextTool[] = [
  listIdeasTool,
  getIdeaTool,
  captureIdeaTool,
  exportHandoffTool,
];

/**
 * Registers all global panel tools with `navigator.modelContext`.
 *
 * Returns an unregister function. Call it on panel unmount or when you
 * want to remove the tools from the model context.
 *
 * If WebMCP is not supported in this context, the function logs a warning
 * and returns a no-op unregister — it does NOT throw.
 */
export function registerPanelTools(): () => void {
  const status = detectWebMcpSupport();

  if (!status.supported) {
    console.warn(
      `[WEBMCP] registerPanelTools: WebMCP not supported (reason=${status.reason}). ` +
      'Panel tools will not be registered. See WEBMCP_SPIKE.md for the contingency plan.',
    );
    return () => { /* no-op */ };
  }

  const mc = navigator.modelContext!;
  const ac = new AbortController();
  const options = { signal: ac.signal };

  for (const tool of PANEL_TOOLS) {
    mc.registerTool(tool, options);
  }

  console.info(
    `[WEBMCP] registerPanelTools: registered ${PANEL_TOOLS.length} tools`,
    PANEL_TOOLS.map(t => t.name),
  );

  return () => {
    ac.abort();
    console.info('[WEBMCP] registerPanelTools: all panel tools unregistered (AbortController aborted).');
  };
}
