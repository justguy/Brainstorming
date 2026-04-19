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
import { outsideKnowledgeScout, buildScoutTask, type OutsideKnowledgeScoutOutput } from './roles/outsideKnowledgeScout';
import { boardSummariser, buildBoardSummariserTask, type BoardSummariserOutput } from './roles/boardSummariser';
import { boardClusterer, buildBoardClustererTask, type BoardClustererOutput } from './roles/boardClusterer';

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

function truncateLabel(value: string, limit = 72): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function ideaSources(ids: string[], ideas: BeatIdeaSnapshot[]): BeatSourceRef[] {
  return ids.map(id => {
    const idea = ideas.find(candidate => candidate.id === id);
    return {
      kind: 'idea' as const,
      id,
      label: idea ? truncateLabel(idea.rawText) : undefined,
    };
  });
}

function docSources(ids: string[] | undefined, docs: BeatSupportingDocSnapshot[] = []): BeatSourceRef[] {
  return (ids ?? []).map(id => {
    const doc = docs.find(candidate => candidate.id === id);
    return {
      kind: 'doc' as const,
      id,
      label: doc?.title,
    };
  });
}

function groupSources(ids: string[], groups: BeatContextMap['summarise']['groups']): BeatSourceRef[] {
  return ids.map(id => {
    const group = groups.find(candidate => candidate.id === id);
    return {
      kind: 'group' as const,
      id,
      label: group?.theme || group?.sharedQuestion || group?.id,
    };
  });
}

function pickClusterCandidates(context: BeatContextMap['cluster']): string[][] {
  const sharedTheme = context.connections.filter(connection => connection.kind === 'shared_theme');
  if (sharedTheme.length < 3) return [];

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
  const components: string[][] = [];
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
    if (component.length >= 2) {
      components.push(component);
    }
  }

  const distinctIdeaCount = new Set(components.flat()).size;
  if (distinctIdeaCount < 5) return [];
  return components
    .sort((left, right) => right.length - left.length)
    .slice(0, 4);
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
          sources: ideaSources(suggestion.relatedIdeaIds ?? [], context.liveIdeas),
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
    mapProposal(context, raw) {
      const result = raw as ConnectionFinderOutput;
      return {
        connections: result.connections.map(connection => ({
          ...connection,
          confidence: confidenceFromStrength(connection.strength),
          sources: [
            ...ideaSources(connection.ideaIds, context.liveIdeas),
            ...docSources(connection.supportingDocIds, context.supportingDocs),
          ],
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
        sources: ideaSources([context.focusIdeaId], context.liveIdeas),
      }));
      return { challenges };
    },
  },
  cluster: {
    role: boardClusterer,
    buildTask(context) {
      const clusters = pickClusterCandidates(context);
      if (clusters.length === 0) return null;
      const clusterIdeas = clusters.map(cluster => cluster
        .map(id => context.liveIdeas.find(idea => idea.id === id))
        .filter((idea): idea is NonNullable<typeof idea> => !!idea)
        .map(toIdeaStub));
      return buildBoardClustererTask(clusterIdeas);
    },
    mapProposal(context, raw) {
      const result = raw as BoardClustererOutput;
      const clusters = pickClusterCandidates(context);
      const seen = new Set<number>();
      return {
        hints: result.hints.flatMap(hint => {
          if (seen.has(hint.clusterIndex)) return [];
          seen.add(hint.clusterIndex);
          const ideaIds = clusters[hint.clusterIndex - 1];
          if (!ideaIds || ideaIds.length < 2) return [];
          return [{
            ideaIds,
            theme: hint.theme,
            sharedQuestion: hint.sharedQuestion,
            confidence: ideaIds.length >= 4 ? 'high' : 'medium',
            sources: ideaSources(ideaIds, context.liveIdeas),
          }];
        }),
      };
    },
  },
  summarise: {
    role: boardSummariser,
    buildTask(context) {
      return buildBoardSummariserTask({
        boardTitle: context.boardTitle,
        ideas: context.liveIdeas.map(idea => ({
          id: idea.id,
          rawText: idea.rawText,
        })),
        groups: context.groups.map(group => ({
          id: group.id,
          theme: group.theme,
          sharedQuestion: group.sharedQuestion,
          ideaIds: group.ideaIds,
        })),
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
      const relatedGroupIds = result.relatedGroupIds?.filter(id => context.groups.some(group => group.id === id)) ?? [];
      const summary: BeatSummaryProposal = {
        summary: result.summary,
        relatedIdeaIds,
        relatedGroupIds,
        confidence: relatedIdeaIds.length >= 2 || relatedGroupIds.length > 0 ? 'high' : 'medium',
        sources: [
          ...ideaSources(relatedIdeaIds, context.liveIdeas),
          ...groupSources(relatedGroupIds, context.groups),
        ],
      };
      return { summaries: [summary] };
    },
  },
};
