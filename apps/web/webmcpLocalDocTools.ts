import {
  getLocalDocSearchState,
  searchLocalDocs,
  type LocalDocSearchHit,
} from '../../src/docs/localDocSearch';

const localDocCandidates = new Map<string, LocalDocSearchHit>();

function rememberCandidates(hits: LocalDocSearchHit[]): void {
  localDocCandidates.clear();
  for (const hit of hits) {
    localDocCandidates.set(hit.id, hit);
  }
}

function authMessage(state: ReturnType<typeof getLocalDocSearchState>): string {
  if (!state.supported) {
    return 'Local doc search needs the File System Access API, which is unavailable in this browser context.';
  }
  if (state.requiresReauthorize) {
    return `Previous folder "${state.folderName ?? 'selected folder'}" needs re-authorization for this session. Open supporting docs for an idea and re-authorize the folder, then run search_local_docs again.`;
  }
  return 'No local docs folder is authorized for this session. Open supporting docs for an idea and choose a folder first.';
}

export interface SupportingDocToolResult {
  docId: string;
  status: string;
  summary?: string;
  facts: string[];
  error?: string;
}

export const searchLocalDocsTool: ModelContextTool = {
  name: 'search_local_docs',
  description:
    'Searches a user-authorized local docs folder for relevant PRDs, specs, notes, or references. ' +
    'This never hides the File System Access permission boundary: if the folder is not currently ' +
    'authorized for this session, the tool returns a re-authorize instruction instead of silently failing. ' +
    'Results are surfaced as explicit supporting-doc candidates, not auto-attached background context.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        minLength: 1,
        description: 'Search phrase, API name, project name, or spec wording to match against local docs.',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 8,
        description: 'Optional max candidate count. Defaults to 5.',
      },
    },
    required: ['query'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: '`ready`, `requires_authorization`, or `unsupported`.',
      },
      folderName: { type: 'string' },
      message: { type: 'string' },
      query: { type: 'string' },
      count: { type: 'number' },
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            candidateId: { type: 'string' },
            title: { type: 'string' },
            path: { type: 'string' },
            snippet: { type: 'string' },
          },
        },
      },
    },
  },
  annotations: { readOnlyHint: true },
  execute: async (input) => {
    const { query, limit } = input as { query: string; limit?: number };
    const trimmedQuery = query?.trim();
    if (!trimmedQuery) {
      return 'ERROR: `query` must be a non-empty string.';
    }

    const state = getLocalDocSearchState();
    if (!state.supported) {
      return {
        status: 'unsupported',
        folderName: state.folderName,
        message: authMessage(state),
        query: trimmedQuery,
        count: 0,
        candidates: [],
      };
    }

    if (!state.authorized) {
      return {
        status: 'requires_authorization',
        folderName: state.folderName,
        message: authMessage(state),
        query: trimmedQuery,
        count: 0,
        candidates: [],
      };
    }

    try {
      const hits = await searchLocalDocs(trimmedQuery, { limit: Math.max(1, Math.min(8, limit ?? 5)) });
      rememberCandidates(hits);
      return {
        status: 'ready',
        folderName: state.folderName,
        message:
          hits.length > 0
            ? 'Local doc candidates ready. Use attach_local_doc_candidate to attach one to an idea, or attach_supporting_doc if you want to curate text manually.'
            : 'No matching local docs found for that query.',
        query: trimmedQuery,
        count: hits.length,
        candidates: hits.map(hit => ({
          candidateId: hit.id,
          title: hit.title,
          path: hit.path,
          snippet: hit.snippet,
        })),
      };
    } catch (err) {
      const nextState = getLocalDocSearchState();
      return {
        status: nextState.authorized ? 'error' : 'requires_authorization',
        folderName: nextState.folderName,
        message: err instanceof Error ? err.message : authMessage(nextState),
        query: trimmedQuery,
        count: 0,
        candidates: [],
      };
    }
  },
};

export function createAttachLocalDocCandidateTool(
  attachDoc: (ideaId: string, title: string, rawText: string) => Promise<SupportingDocToolResult>,
): ModelContextTool {
  return {
    name: 'attach_local_doc_candidate',
    description:
      'Attaches one candidate returned by search_local_docs to an idea as a supporting doc, then runs the normal refinement flow. ' +
      'Use this to turn an explicit local-doc search hit into durable idea context.',
    inputSchema: {
      type: 'object',
      properties: {
        ideaId: {
          type: 'string',
          minLength: 1,
          description: 'UUID of the idea that should receive this supporting doc.',
        },
        candidateId: {
          type: 'string',
          minLength: 1,
          description: 'candidateId returned by search_local_docs.',
        },
      },
      required: ['ideaId', 'candidateId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        docId: { type: 'string' },
        status: { type: 'string' },
        summary: { type: 'string' },
        facts: { type: 'array', items: { type: 'string' } },
        error: { type: 'string' },
        sourcePath: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: false },
    execute: async (input) => {
      const { ideaId, candidateId } = input as { ideaId: string; candidateId: string };
      if (!ideaId) return 'ERROR: `ideaId` is required.';
      if (!candidateId) return 'ERROR: `candidateId` is required.';

      const candidate = localDocCandidates.get(candidateId);
      if (!candidate) {
        return 'ERROR: unknown candidateId. Run search_local_docs again and use one of the returned candidates.';
      }

      const doc = await attachDoc(ideaId, candidate.title, candidate.rawText);
      return {
        ...doc,
        sourcePath: candidate.path,
      };
    },
  };
}
