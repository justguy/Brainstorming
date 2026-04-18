/**
 * Per-phase WebMCP tool registrations for the Brainstorming side panel.
 *
 * Mount a phase's tools when the user enters that phase; unmount when
 * they leave (or when the idea changes). Each call returns an unregister
 * function that aborts the associated AbortController.
 *
 * Phases with user-gated input expose a single input tool.
 * Phases that advance automatically expose `advance_phase`.
 *
 * If WebMCP is not supported, a no-op is returned and a warning is
 * logged — no exception is thrown.
 */

import { detectWebMcpSupport } from './detectSupport';
import { advance } from '../orchestrator/stateMachine';
import { DEFAULT_BOARD_ID, type ChangeActor } from '../board/types';
import { createBoardController } from '../storage/boardController';
import { getIdea } from '../storage/ideas';
import type { Phase } from '../types';

const WEBMCP_CHANGE_ACTOR: ChangeActor = {
  type: 'tool',
  source: 'webmcp',
  label: 'WebMCP phase tool',
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns a concise summary of the idea's artifactMd (first 200 chars). */
function artifactSummary(md: string | undefined): string {
  if (!md) return '(artifact not yet generated)';
  return md.length <= 200 ? md : md.slice(0, 199) + '…';
}

/** Safe wrapper: loads idea, calls advance, journals the new state, returns summary. */
async function advanceAndPersist(
  ideaId: string,
  userInput: string,
  skip = false,
): Promise<{ newPhase: Phase; artifactSummary: string; error?: string }> {
  const idea = await getIdea(ideaId);
  if (!idea) {
    return {
      newPhase: 0 as Phase,
      artifactSummary: '',
      error: `No idea found with id "${ideaId}".`,
    };
  }

  const updated = await advance(idea, userInput, skip);
  const boardController = createBoardController(idea.boardId ?? DEFAULT_BOARD_ID);
  const committedAt = updated.updatedAt ?? Date.now();
  await boardController.updateIdea({
    ideaId: updated.id,
    patch: { ...updated, updatedAt: committedAt },
    actor: WEBMCP_CHANGE_ACTOR,
    summary: `Advanced idea ${updated.id} to phase ${updated.phase}`,
  });

  return {
    newPhase: updated.phase,
    artifactSummary: artifactSummary(updated.artifactMd),
  };
}

// ---------------------------------------------------------------------------
// Phase-specific tool builders
// ---------------------------------------------------------------------------

/**
 * Phases 2 — submit_clarifications
 * User answers the clarification questions generated in Phase 1.
 */
function buildPhase2Tool(ideaId: string): ModelContextTool {
  return {
    name: 'submit_clarifications',
    description:
      'Submits the user\'s answers to the Phase-2 clarification questions. ' +
      'Each answer is paired with its question id. ' +
      'Advancing this phase runs the approachSynthesizer and moves to Phase 3.',
    inputSchema: {
      type: 'object',
      properties: {
        answers: {
          type: 'array',
          description: 'List of question-answer pairs.',
          items: {
            type: 'object',
            properties: {
              questionId: { type: 'string', description: 'The ClarificationQuestion id.' },
              answer:     { type: 'string', description: 'The user\'s answer to this question.' },
            },
            required: ['questionId', 'answer'],
          },
          minItems: 1,
        },
      },
      required: ['answers'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        newPhase:        { type: 'number', description: 'Phase after advancing (should be 3).' },
        artifactSummary: { type: 'string', description: 'First 200 characters of the updated artifact.' },
        error:           { type: 'string', description: 'Error message if advancing failed.' },
      },
    },
    annotations: { readOnlyHint: false },
    execute: async (input, _client) => {
      const { answers } = input as { answers?: Array<{ questionId: string; answer: string }> };
      if (!Array.isArray(answers) || answers.length === 0) {
        return { newPhase: 2, artifactSummary: '', error: 'answers must be a non-empty array.' };
      }
      return advanceAndPersist(ideaId, JSON.stringify({ answers }));
    },
  };
}

/**
 * Phase 3 — select_approach
 * User picks one of the synthesised approaches (optionally with hybrid notes).
 */
function buildPhase3Tool(ideaId: string): ModelContextTool {
  return {
    name: 'select_approach',
    description:
      'Selects one of the approaches synthesised during Phase 3. ' +
      'Optionally provide hybrid notes to combine elements from multiple approaches. ' +
      'Advancing runs the rulesExtractor and moves to Phase 4.',
    inputSchema: {
      type: 'object',
      properties: {
        approachId: {
          type: 'string',
          description: 'The Approach id to select (from the briefState.approaches array).',
        },
        hybridNotes: {
          type: 'string',
          description: 'Optional notes describing how to blend multiple approaches.',
        },
      },
      required: ['approachId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        newPhase:        { type: 'number', description: 'Phase after advancing (should be 4).' },
        artifactSummary: { type: 'string', description: 'First 200 characters of the updated artifact.' },
        error:           { type: 'string', description: 'Error message if advancing failed.' },
      },
    },
    annotations: { readOnlyHint: false },
    execute: async (input, _client) => {
      const { approachId, hybridNotes } = input as {
        approachId?: string;
        hybridNotes?: string;
      };
      if (!approachId || typeof approachId !== 'string') {
        return { newPhase: 3, artifactSummary: '', error: 'approachId must be a non-empty string.' };
      }
      return advanceAndPersist(ideaId, JSON.stringify({ approachId, hybridNotes }));
    },
  };
}

/**
 * Phase 4 — confirm_rules
 * User accepts (or modifies) the must-stay-true rules before the red-team runs.
 */
function buildPhase4Tool(ideaId: string): ModelContextTool {
  return {
    name: 'confirm_rules',
    description:
      'Confirms or modifies the must-stay-true rules extracted in Phase 4 before ' +
      'the premortem red-team phase runs. ' +
      'Set accepted=true to proceed, or supply modifications to override specific rules. ' +
      'Advancing moves to Phase 5 (briefComposer).',
    inputSchema: {
      type: 'object',
      properties: {
        accepted: {
          type: 'boolean',
          description: 'true = accept the extracted rules as-is; false = supply modifications.',
        },
        modifications: {
          type: 'array',
          description:
            'Optional list of replacement rule strings. ' +
            'Supply when accepted=false to override the auto-extracted rules.',
          items: { type: 'string' },
        },
      },
      required: ['accepted'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        newPhase:        { type: 'number', description: 'Phase after advancing (should be 5).' },
        artifactSummary: { type: 'string', description: 'First 200 characters of the updated artifact.' },
        error:           { type: 'string', description: 'Error message if advancing failed.' },
      },
    },
    annotations: { readOnlyHint: false },
    execute: async (input, _client) => {
      const { accepted, modifications } = input as {
        accepted?: boolean;
        modifications?: string[];
      };
      if (typeof accepted !== 'boolean') {
        return { newPhase: 4, artifactSummary: '', error: 'accepted must be a boolean.' };
      }
      return advanceAndPersist(ideaId, JSON.stringify({ accepted, modifications }));
    },
  };
}

/**
 * Phase 7 — choose_next_step
 * User selects what happens after Phase 8 handoff.
 */
function buildPhase7Tool(ideaId: string): ModelContextTool {
  return {
    name: 'choose_next_step',
    description:
      'Selects the recommended next step after the brainstorming pipeline completes ' +
      '(Phase 7 — readiness judgement). ' +
      'Advancing sets briefState.nextStep and moves to Phase 8 (ready for handoff).',
    inputSchema: {
      type: 'object',
      properties: {
        nextStep: {
          type: 'string',
          enum: ['planning', 'prototyping', 'research', 'stakeholder_review', 'defer'],
          description:
            'The chosen next step. ' +
            '"planning" → formal project plan; ' +
            '"prototyping" → quick proof-of-concept; ' +
            '"research" → additional discovery needed; ' +
            '"stakeholder_review" → present to decision-makers; ' +
            '"defer" → put on hold.',
        },
        notes: {
          type: 'string',
          description: 'Optional notes explaining the choice.',
        },
      },
      required: ['nextStep'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        newPhase:        { type: 'number', description: 'Phase after advancing (should be 8).' },
        artifactSummary: { type: 'string', description: 'First 200 characters of the updated artifact.' },
        error:           { type: 'string', description: 'Error message if advancing failed.' },
      },
    },
    annotations: { readOnlyHint: false },
    execute: async (input, _client) => {
      const { nextStep, notes } = input as {
        nextStep?: string;
        notes?: string;
      };
      const validSteps = ['planning', 'prototyping', 'research', 'stakeholder_review', 'defer'];
      if (!nextStep || !validSteps.includes(nextStep)) {
        return {
          newPhase: 7,
          artifactSummary: '',
          error: `nextStep must be one of: ${validSteps.join(', ')}.`,
        };
      }
      return advanceAndPersist(ideaId, JSON.stringify({ nextStep, notes }));
    },
  };
}

/**
 * Phases 0, 1, 5, 6, 8 — advance_phase
 * Generic progression tool for phases that don't require structured user input.
 */
function buildAdvancePhaseTool(phase: Phase, ideaId: string): ModelContextTool {
  const phaseDescriptions: Partial<Record<Phase, string>> = {
    0: 'Triggers ambiguity extraction (Phase 0 → 1). The LLM identifies terminological, scope, and goal ambiguities.',
    1: 'Triggers clarification question generation (Phase 1 → 2). The LLM authors up to 3 targeted questions.',
    5: 'Triggers brief composition (Phase 5 → 6). The LLM assembles the full BriefState and generates artifactMd.',
    6: 'Triggers self-review / red-team (Phase 6 → 7). The LLM checks for contradictions, gaps, and blockers.',
    8: 'Phase 8 is the terminal state. The idea is ready for handoff. No further progression is possible.',
  };

  return {
    name: 'advance_phase',
    description:
      `Advances Phase ${phase} of the brainstorming pipeline for the given idea. ` +
      (phaseDescriptions[phase] ?? 'Moves the idea to the next pipeline phase.') +
      ' Optionally supply userInput to guide the LLM for this step.',
    inputSchema: {
      type: 'object',
      properties: {
        userInput: {
          type: 'string',
          description: 'Optional free-text context to pass to the LLM for this phase.',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        newPhase:        { type: 'number', description: 'Phase number after advancing.' },
        artifactSummary: { type: 'string', description: 'First 200 characters of the updated artifact.' },
        error:           { type: 'string', description: 'Error message if advancing failed.' },
      },
    },
    annotations: { readOnlyHint: false },
    execute: async (input, _client) => {
      const { userInput } = input as { userInput?: string };
      if (phase === 8) {
        const idea = await getIdea(ideaId);
        return {
          newPhase: 8 as Phase,
          artifactSummary: artifactSummary(idea?.artifactMd),
          error: 'Phase 8 is terminal. Export the handoff via the export_handoff tool.',
        };
      }
      return advanceAndPersist(ideaId, userInput ?? '');
    },
  };
}

// ---------------------------------------------------------------------------
// Phases that use structured input vs. advance_phase
// ---------------------------------------------------------------------------

const STRUCTURED_INPUT_PHASES = new Set<Phase>([2, 3, 4, 7]);

function buildToolForPhase(phase: Phase, ideaId: string): ModelContextTool {
  switch (phase) {
    case 2: return buildPhase2Tool(ideaId);
    case 3: return buildPhase3Tool(ideaId);
    case 4: return buildPhase4Tool(ideaId);
    case 7: return buildPhase7Tool(ideaId);
    default: return buildAdvancePhaseTool(phase, ideaId);
  }
}

// ---------------------------------------------------------------------------
// Public registration API
// ---------------------------------------------------------------------------

/**
 * Registers the phase-specific WebMCP tool for the given phase and idea.
 *
 * Returns an unregister function. Call it when the user leaves the phase
 * or when the active idea changes.
 *
 * If WebMCP is not supported in this context, logs a warning and returns
 * a no-op — does NOT throw.
 *
 * @param phase   - The current pipeline phase (0–8).
 * @param ideaId  - The id of the idea being worked on.
 */
export function registerPhaseTools(phase: Phase, ideaId: string): () => void {
  const status = detectWebMcpSupport();

  if (!status.supported) {
    console.warn(
      `[WEBMCP] registerPhaseTools(phase=${phase}): WebMCP not supported (reason=${status.reason}). ` +
      'Phase tools will not be registered.',
    );
    return () => { /* no-op */ };
  }

  const mc = navigator.modelContext!;
  const ac = new AbortController();

  const tool = buildToolForPhase(phase, ideaId);
  mc.registerTool(tool, { signal: ac.signal });

  const label = STRUCTURED_INPUT_PHASES.has(phase) ? tool.name : `advance_phase (phase ${phase})`;
  console.info(`[WEBMCP] registerPhaseTools: registered "${label}" for idea "${ideaId}"`);

  return () => {
    ac.abort();
    console.info(`[WEBMCP] registerPhaseTools: unregistered "${label}" (AbortController aborted).`);
  };
}
