import type {
  BeatConnectionSnapshot,
  BeatContextMap,
  BeatCritiqueChallenge,
  BeatIdeaSnapshot,
  BeatName,
  BeatProposalMap,
  BeatSourceRef,
  BeatSummaryProposal,
  BeatSupportingDocSnapshot,
  BeatCritiqueSnapshot,
} from '../beats/types';
import type { BriefState, Idea, IdeaCritique, SupportingDoc } from '../types';
import type { RoleSpec } from './ctmcp';
import { connectionFinder, buildConnectionFinderTask, type ConnectionFinderOutput } from './roles/connectionFinder';
import { buildStandaloneCritiqueTask, devilsAdvocate, type DevilsAdvocateOutput } from './roles/devilsAdvocate';
import { groupThemer, buildGroupThemerTask, type GroupThemerOutput } from './roles/groupThemer';
import { outsideKnowledgeScout, buildScoutTask, type OutsideKnowledgeScoutOutput } from './roles/outsideKnowledgeScout';
import { boardSummariser, buildBoardSummariserTask, type BoardSummariserOutput } from './roles/boardSummariser';

type BeatRegistryEntry<T extends BeatName> = {
  role: RoleSpec;
  buildTask(context: BeatContextMap[T]): string | null;
  mapProposal(context: BeatContextMap[T], result: unknown): BeatProposalMap[T];
};

const EMPTY_BRIEF_STATE: BriefState = {
  mustStayTrueRules: [],
  approaches: [],
  rejectedApproaches: [],
  risks: [],
  successCriteria: [],
  outOfScope: [],
  openQuestions: [],
  lenses: [],
  challenges: [],
  stressResults: [],
};

function toIdeaStub(snapshot: BeatIdeaSnapshot): Idea {
  return {
    id: snapshot.id,
    rawText: snapshot.rawText,
    tags: snapshot.tags,
    createdAt: 0,
    updatedAt: 0,
    status: snapshot.killed ? 'discarded' : 'captured',
    phase: 0,
    briefState: { ...EMPTY_BRIEF_STATE },
    ambiguities: [],
    clarifications: [],
    turnLog: [],
    readiness: 'yellow',
    panel: snapshot.groupId
      ? { x: 0, y: 0, width: 260, height: 180, groupId: snapshot.groupId }
      : undefined,
  };
}

function toDocStub(snapshot: BeatSupportingDocSnapshot): SupportingDoc {
  return {
    id: snapshot.id,
    ideaId: snapshot.ideaId,
    title: snapshot.title,
    rawText: snapshot.summary ?? snapshot.facts.join('\n'),
    summary: snapshot.summary,
    facts: snapshot.facts,
    status: 'ready',
    createdAt: 0,
    updatedAt: 0,
  };
}

function toCritiqueStub(snapshot: BeatCritiqueSnapshot): IdeaCritique {
  return {
    id: snapshot.id,
    ideaId: snapshot.ideaId,
    critique: snapshot.critique,
    evidenceAsk: snapshot.evidenceAsk,
    status: snapshot.status,
    source: 'devils_advocate',
    createdAt: 0,
    updatedAt: 0,
  };
}

function confidenceFromStrength(strength: BeatConnectionSnapshot['strength']) {
  if (strength === 'strong') return 'high';
  if (strength === 'medium') return 'medium';
  return 'low';
}

function ideaSources(ids: string[]): BeatSourceRef[] {
  return ids.map(id => ({ kind: 'idea', id }));
}

function docSources(ids: string[] | undefined): BeatSourceRef[] {
  return (ids ?? []).map(id => ({ kind: 'doc', id }));
}

function pickClusterIdeaIds(context: BeatContextMap['cluster']): string[] {
  const sharedTheme = context.connections.filter(connection => connection.kind === 'shared_theme');
  const graph = new Map<string, Set<string>>();
  for (const connection of sharedTheme) {
    for (const ideaId of connection.ideaIds) {
      const bucket = graph.get(ideaId) ?? new Set<string>();
      for (const related of connection.ideaIds) {
        if (related !== ideaId) bucket.add(related);
      }
      graph.set(ideaId, bucket);
    }
  }

  const visited = new Set<string>();
  let best: string[] = [];
  for (const idea of context.liveIdeas) {
    if (visited.has(idea.id) || !graph.has(idea.id)) continue;
    const stack = [idea.id];
    const component: string[] = [];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      for (const next of graph.get(current) ?? []) {
        if (!visited.has(next)) stack.push(next);
      }
    }
    if (component.length > best.length) best = component;
  }

  if (best.length < 5 || sharedTheme.length < 3) return [];
  return best;
}

export const beatRegistry: { [K in BeatName]: BeatRegistryEntry<K> } = {
  scout: {
    role: outsideKnowledgeScout,
    buildTask(context) {
      return buildScoutTask({
        boardIdeas: context.liveIdeas.map(toIdeaStub),
        discardedIdeas: context.discardedIdeas.map(toIdeaStub),
        supportingDocs: context.supportingDocs.map(toDocStub),
        alreadyProposedRawTexts: context.priorSuggestionTexts.active,
        dismissedRawTexts: context.priorSuggestionTexts.dismissed,
      });
    },
    mapProposal(context, raw) {
      const result = raw as OutsideKnowledgeScoutOutput;
      return {
        suggestions: result.suggestions.map(suggestion => ({
          ...suggestion,
          confidence: suggestion.relatedIdeaIds?.length ? 'high' : 'medium',
          sources: ideaSources(suggestion.relatedIdeaIds ?? []),
        })),
      };
    },
  },
  connect: {
    role: connectionFinder,
    buildTask(context) {
      return buildConnectionFinderTask({
        boardIdeas: context.liveIdeas.map(toIdeaStub),
        discardedIdeas: context.discardedIdeas.map(toIdeaStub),
        supportingDocs: context.supportingDocs.map(toDocStub),
      });
    },
    mapProposal(_context, raw) {
      const result = raw as ConnectionFinderOutput;
      return {
        connections: result.connections.map(connection => ({
          ...connection,
          confidence: confidenceFromStrength(connection.strength),
          sources: [...ideaSources(connection.ideaIds), ...docSources(connection.supportingDocIds)],
        })),
      };
    },
  },
  critique: {
    role: devilsAdvocate,
    buildTask(context) {
      const focusIdea = context.liveIdeas.find(idea => idea.id === context.focusIdeaId);
      if (!focusIdea) return null;
      return buildStandaloneCritiqueTask({
        idea: toIdeaStub(focusIdea),
        boardIdeas: context.liveIdeas.map(toIdeaStub),
        supportingDocs: context.supportingDocs.map(toDocStub).filter(doc => doc.ideaId === context.focusIdeaId),
        existingCritiques: context.existingCritiques.map(toCritiqueStub),
      });
    },
    mapProposal(context, raw) {
      const result = raw as DevilsAdvocateOutput;
      const challenges: BeatCritiqueChallenge[] = result.challenges.map(challenge => ({
        ...challenge,
        confidence: context.supportingDocs.length > 0 ? 'high' : 'medium',
        sources: [{ kind: 'idea', id: context.focusIdeaId }],
      }));
      return { challenges };
    },
  },
  cluster: {
    role: groupThemer,
    buildTask(context) {
      const ideaIds = pickClusterIdeaIds(context);
      if (ideaIds.length === 0) return null;
      const ideas = ideaIds
        .map(id => context.liveIdeas.find(idea => idea.id === id))
        .filter((idea): idea is NonNullable<typeof idea> => !!idea)
        .map(toIdeaStub);
      return buildGroupThemerTask(ideas);
    },
    mapProposal(context, raw) {
      const result = raw as GroupThemerOutput;
      const ideaIds = pickClusterIdeaIds(context);
      return {
        hints: ideaIds.length === 0
          ? []
          : [{
              ideaIds,
              theme: result.theme,
              sharedQuestion: result.sharedQuestion,
              confidence: ideaIds.length >= 6 ? 'high' : 'medium',
              sources: ideaSources(ideaIds),
            }],
      };
    },
  },
  summarise: {
    role: boardSummariser,
    buildTask(context) {
      return buildBoardSummariserTask({
        boardTitle: context.boardTitle,
        ideas: context.liveIdeas.map(idea => ({ id: idea.id, rawText: idea.rawText })),
        connections: context.connections.map(connection => ({
          kind: connection.kind,
          ideaIds: connection.ideaIds,
          rationale: connection.rationale,
        })),
      });
    },
    mapProposal(context, raw) {
      const result = raw as BoardSummariserOutput;
      const relatedIdeaIds = result.relatedIdeaIds?.filter(id => context.liveIdeas.some(idea => idea.id === id)) ?? [];
      const summary: BeatSummaryProposal = {
        summary: result.summary,
        relatedIdeaIds,
        confidence: relatedIdeaIds.length >= 2 ? 'high' : 'medium',
        sources: ideaSources(relatedIdeaIds),
      };
      return { summaries: [summary] };
    },
  },
};
