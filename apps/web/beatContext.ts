import type {
  BeatAggressiveness,
  BeatConnectionSnapshot,
  BeatContextMap,
  BeatCritiqueSnapshot,
  BeatGroupSnapshot,
  BeatIdeaSnapshot,
  BeatSupportingDocSnapshot,
  BeatTrigger,
  BeatSize,
} from '../../src/beats/types';
import type {
  BoardId,
  Connection,
  Idea,
  IdeaCritique,
  IdeaGroup,
  ScoutSuggestion,
  SupportingDoc,
} from '../../src/types';

type CommonArgs = {
  boardId: BoardId;
  boardTitle?: string;
  ideas: Idea[];
  trigger: BeatTrigger;
  size: BeatSize;
  aggressiveness: BeatAggressiveness;
  turnsUsed?: number;
};

function toIdeaSnapshot(idea: Idea): BeatIdeaSnapshot {
  return {
    id: idea.id,
    rawText: idea.rawText,
    tags: idea.tags,
    killed: idea.status === 'discarded',
    groupId: idea.panel?.groupId,
  };
}

function toDocSnapshot(doc: SupportingDoc): BeatSupportingDocSnapshot {
  return {
    id: doc.id,
    ideaId: doc.ideaId,
    title: doc.title,
    summary: doc.summary,
    facts: doc.facts,
  };
}

function toCritiqueSnapshot(critique: IdeaCritique): BeatCritiqueSnapshot {
  return {
    id: critique.id,
    ideaId: critique.ideaId,
    critique: critique.critique,
    evidenceAsk: critique.evidenceAsk,
    status: critique.status,
  };
}

function toConnectionSnapshot(connection: Connection): BeatConnectionSnapshot {
  return {
    id: connection.id,
    kind: connection.kind,
    ideaIds: connection.ideaIds,
    supportingDocIds: connection.supportingDocIds,
    rationale: connection.rationale,
    strength: connection.strength,
  };
}

function toGroupSnapshot(group: IdeaGroup): BeatGroupSnapshot {
  return {
    id: group.id,
    theme: group.theme,
    sharedQuestion: group.sharedQuestion,
    ideaIds: group.ideaIds,
  };
}

function baseContext(args: CommonArgs) {
  return {
    boardId: args.boardId,
    boardTitle: args.boardTitle,
    aggressiveness: args.aggressiveness,
    turnsUsed: args.turnsUsed ?? 0,
    trigger: args.trigger,
    size: args.size,
  };
}

export function buildScoutBeatContext(args: CommonArgs & {
  supportingDocs: SupportingDoc[];
  existingSuggestions: ScoutSuggestion[];
}): BeatContextMap['scout'] {
  return {
    beat: 'scout',
    ...baseContext(args),
    liveIdeas: args.ideas.filter(idea => idea.status !== 'archived' && idea.status !== 'discarded').map(toIdeaSnapshot),
    discardedIdeas: args.ideas.filter(idea => idea.status === 'discarded').map(toIdeaSnapshot),
    supportingDocs: args.supportingDocs.filter(doc => doc.status === 'ready').map(toDocSnapshot),
    priorSuggestionTexts: {
      active: args.existingSuggestions
        .filter(suggestion => suggestion.status === 'pending' || suggestion.status === 'admitted')
        .map(suggestion => suggestion.rawText),
      dismissed: args.existingSuggestions
        .filter(suggestion => suggestion.status === 'dismissed')
        .map(suggestion => suggestion.rawText),
    },
  };
}

export function buildConnectBeatContext(args: CommonArgs & {
  supportingDocs: SupportingDoc[];
}): BeatContextMap['connect'] {
  return {
    beat: 'connect',
    ...baseContext(args),
    liveIdeas: args.ideas.filter(idea => idea.status !== 'archived' && idea.status !== 'discarded').map(toIdeaSnapshot),
    discardedIdeas: args.ideas.filter(idea => idea.status === 'discarded').map(toIdeaSnapshot),
    supportingDocs: args.supportingDocs.filter(doc => doc.status === 'ready').map(toDocSnapshot),
  };
}

export function buildCritiqueBeatContext(args: CommonArgs & {
  focusIdeaId: string;
  supportingDocs: SupportingDoc[];
  existingCritiques: IdeaCritique[];
}): BeatContextMap['critique'] {
  return {
    beat: 'critique',
    ...baseContext(args),
    focusIdeaId: args.focusIdeaId,
    liveIdeas: args.ideas.filter(idea => idea.status !== 'archived' && idea.status !== 'discarded').map(toIdeaSnapshot),
    supportingDocs: args.supportingDocs.filter(doc => doc.status === 'ready').map(toDocSnapshot),
    existingCritiques: args.existingCritiques.map(toCritiqueSnapshot),
  };
}

export function buildClusterBeatContext(args: CommonArgs & {
  connections: Connection[];
}): BeatContextMap['cluster'] {
  return {
    beat: 'cluster',
    ...baseContext(args),
    liveIdeas: args.ideas.filter(idea => idea.status !== 'archived' && idea.status !== 'discarded').map(toIdeaSnapshot),
    connections: args.connections.map(toConnectionSnapshot),
  };
}

export function buildSummariseBeatContext(args: CommonArgs & {
  groups: IdeaGroup[];
  connections: Connection[];
}): BeatContextMap['summarise'] {
  return {
    beat: 'summarise',
    ...baseContext(args),
    liveIdeas: args.ideas.filter(idea => idea.status !== 'archived' && idea.status !== 'discarded').map(toIdeaSnapshot),
    groups: args.groups.filter(group => group.ideaIds.length > 0).map(toGroupSnapshot),
    connections: args.connections.map(toConnectionSnapshot),
  };
}
