import { useEffect } from 'react';
import type {
  BeatName,
  BeatResult,
  ClusterBeatContext,
  ConnectBeatContext,
  CritiqueBeatContext,
  SummariseBeatContext,
} from '../../src/beats/types';
import { getSuggestion } from '../../src/storage/suggestions';
import type { Connection, Idea, IdeaCritique, IdeaGroup, ScoutSuggestion } from '../../src/types';
import { buildClusterBeatContext, buildSummariseBeatContext } from './beatContext';

type RunBoardBeat = {
  (context: ConnectBeatContext): Promise<BeatResult<'connect'>>;
  (context: CritiqueBeatContext): Promise<BeatResult<'critique'>>;
  (context: ClusterBeatContext): Promise<BeatResult<'cluster'>>;
  (context: SummariseBeatContext): Promise<BeatResult<'summarise'>>;
};

interface UseBrainstormSuggestionEventsArgs {
  boardId: string;
  boardTitle: string;
  ideas: Idea[];
  groups: IdeaGroup[];
  connections: Connection[];
  suggestions: ScoutSuggestion[];
  runConnectionFinder: (options?: {
    origin?: 'manual' | 'ai';
    limitGenerated?: number;
    source?: 'canvas' | 'webmcp' | 'beat';
  }) => Promise<Connection[]>;
  runCritiqueIdea: (
    ideaId: string,
    options?: { origin?: 'manual' | 'ai'; source?: 'canvas' | 'webmcp' | 'beat' },
  ) => Promise<IdeaCritique | null>;
  runScout: (options?: {
    origin?: 'manual' | 'ai';
    limitNew?: number;
    source?: 'canvas' | 'webmcp' | 'beat';
  }) => Promise<ScoutSuggestion[]>;
  runBoardBeat: RunBoardBeat;
  presentBeatReview: (
    result: BeatResult<'cluster'> | BeatResult<'summarise'>,
    source?: 'canvas' | 'webmcp' | 'beat',
  ) => Promise<{ sessionId: string; itemCount: number } | null>;
  handleAdmitSuggestion: (id: string, source?: 'canvas' | 'webmcp') => Promise<void>;
  handleElaborateSuggestion: (id: string, source?: 'canvas' | 'webmcp') => Promise<void>;
  handleDismissSuggestion: (id: string, source?: 'canvas' | 'webmcp') => Promise<void>;
}

export function useBrainstormSuggestionEvents({
  boardId,
  boardTitle,
  ideas,
  groups,
  connections,
  suggestions,
  runConnectionFinder,
  runCritiqueIdea,
  runScout,
  runBoardBeat,
  presentBeatReview,
  handleAdmitSuggestion,
  handleElaborateSuggestion,
  handleDismissSuggestion,
}: UseBrainstormSuggestionEventsArgs): void {
  useEffect(() => {
    function emitToolCompletion(requestId?: string, detail?: Record<string, unknown>): void {
      if (!requestId) return;
      window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail }));
    }

    const handleScoutEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ requestId?: string }>;
      const { requestId } = customEvent.detail ?? {};
      let count = 0;
      try {
        const created = await runScout({ source: 'webmcp' });
        count = created.length;
      } catch (err) {
        console.error('[App] scout_ideas failed:', err);
      }
      emitToolCompletion(requestId, { count });
    };

    const handleRunBeatEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ beat: BeatName; focusIdeaId?: string; requestId?: string }>;
      const { beat, focusIdeaId, requestId } = customEvent.detail;
      let detail: Record<string, unknown>;

      try {
        switch (beat) {
          case 'scout': {
            const created = await runScout({ source: 'webmcp' });
            detail = {
              ok: true,
              beat,
              mode: 'committed',
              count: created.length,
              suggestions: created.map(suggestion => ({
                id: suggestion.id,
                rawText: suggestion.rawText,
                rationale: suggestion.rationale,
                source: suggestion.source,
                relatedIdeaIds: suggestion.relatedIdeaIds ?? [],
                status: suggestion.status,
              })),
            };
            break;
          }
          case 'connect': {
            const found = await runConnectionFinder({ source: 'webmcp' });
            detail = { ok: true, beat, mode: 'committed', count: found.length, connections: found };
            break;
          }
          case 'critique': {
            if (!focusIdeaId) throw new Error('run_beat critique requires focusIdeaId.');
            const critique = await runCritiqueIdea(focusIdeaId, { source: 'webmcp' });
            detail = { ok: !!critique, beat, mode: 'committed', critiqueId: critique?.id, critique };
            break;
          }
          case 'cluster': {
            const result = await runBoardBeat(buildClusterBeatContext({
              boardId,
              boardTitle,
              ideas,
              connections,
              trigger: 'manual',
              size: 'big',
              aggressiveness: 'balanced',
            }));
            detail = {
              ok: result.ok,
              beat,
              mode: 'review',
              meta: result.meta,
              ...(result.ok ? await presentBeatReview(result, 'webmcp') ?? {} : {}),
              hints: result.ok ? result.proposal.hints : [],
              reason: result.ok ? undefined : result.reason,
            };
            break;
          }
          case 'summarise': {
            const result = await runBoardBeat(buildSummariseBeatContext({
              boardId,
              boardTitle,
              ideas,
              groups,
              connections,
              trigger: 'manual',
              size: 'big',
              aggressiveness: 'balanced',
            }));
            detail = {
              ok: result.ok,
              beat,
              mode: 'review',
              meta: result.meta,
              ...(result.ok ? await presentBeatReview(result, 'webmcp') ?? {} : {}),
              summaries: result.ok ? result.proposal.summaries : [],
              reason: result.ok ? undefined : result.reason,
            };
            break;
          }
          default:
            detail = { ok: false, beat, error: `Unsupported beat: ${beat}` };
        }
      } catch (err) {
        detail = { ok: false, beat, error: err instanceof Error ? err.message : `${beat} failed` };
      }

      emitToolCompletion(requestId, detail);
    };

    const handleAdmitSuggestionEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ suggestionId: string; requestId?: string }>;
      const { suggestionId, requestId } = customEvent.detail;
      let admittedIdeaId: string | undefined;
      let error: string | undefined;
      try {
        await handleAdmitSuggestion(suggestionId, 'webmcp');
        const updated = await getSuggestion(suggestionId);
        admittedIdeaId = updated?.admittedIdeaId;
      } catch (err) {
        error = err instanceof Error ? err.message : 'admit failed';
      }
      emitToolCompletion(requestId, { admittedIdeaId, error });
    };

    const handleElaborateSuggestionEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ suggestionId: string; requestId?: string }>;
      const { suggestionId, requestId } = customEvent.detail;
      let error: string | undefined;
      try {
        await handleElaborateSuggestion(suggestionId, 'webmcp');
      } catch (err) {
        error = err instanceof Error ? err.message : 'elaborate failed';
      }
      emitToolCompletion(requestId, { ok: !error, error });
    };

    const handleDismissSuggestionEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ suggestionId: string; requestId?: string }>;
      const { suggestionId, requestId } = customEvent.detail;
      let error: string | undefined;
      try {
        await handleDismissSuggestion(suggestionId, 'webmcp');
      } catch (err) {
        error = err instanceof Error ? err.message : 'dismiss failed';
      }
      emitToolCompletion(requestId, { ok: !error, error });
    };

    const listeners: Array<[string, EventListener]> = [
      ['brainstorm:scout', handleScoutEvent as EventListener],
      ['brainstorm:runBeat', handleRunBeatEvent as EventListener],
      ['brainstorm:admitSuggestion', handleAdmitSuggestionEvent as EventListener],
      ['brainstorm:elaborateSuggestion', handleElaborateSuggestionEvent as EventListener],
      ['brainstorm:dismissSuggestion', handleDismissSuggestionEvent as EventListener],
    ];

    listeners.forEach(([name, listener]) => window.addEventListener(name, listener));
    return () => {
      listeners.forEach(([name, listener]) => window.removeEventListener(name, listener));
    };
  }, [boardId, boardTitle, ideas, groups, connections, suggestions]);
}
