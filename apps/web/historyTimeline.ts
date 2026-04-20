import type {
  BeatReviewItemRecord,
  BeatReviewSessionRecord,
  ChangeSetRecord,
} from '../../src/board/types';
import type { BoardHistoryState } from '../../src/storage/boardControllerTypes';
import type {
  Connection,
  Idea,
  IdeaCritique,
  IdeaGroup,
  ScoutSuggestion,
  SupportingDoc,
} from '../../src/types';

interface HistoryEntity {
  id: string;
  label: string;
}

interface CreateBoardHistoryEntriesArgs {
  changeSets: ChangeSetRecord[];
  historyState: Pick<BoardHistoryState, 'cursor'>;
  ideas: Idea[];
  groups: IdeaGroup[];
  docs: SupportingDoc[];
  suggestions: ScoutSuggestion[];
  critiques: IdeaCritique[];
  connections: Connection[];
  beatReviewSessions: BeatReviewSessionRecord[];
  beatReviewItems: BeatReviewItemRecord[];
}

export interface BoardHistoryEntry {
  id: string;
  seq: number;
  status: ChangeSetRecord['status'];
  summary: string;
  actorLabel: string;
  actorTone: 'user' | 'ai' | 'tool' | 'system';
  beatLabel?: string;
  patchCount: number;
  committedAt: number;
  affected: Array<{ store: string; id: string; label: string }>;
  isCurrent: boolean;
}

export function createBoardHistoryEntries({
  changeSets,
  historyState,
  ideas,
  groups,
  docs,
  suggestions,
  critiques,
  connections,
  beatReviewSessions,
  beatReviewItems,
}: CreateBoardHistoryEntriesArgs): BoardHistoryEntry[] {
  const lookups = {
    ideas: new Map(ideas.map(entity => [entity.id, { id: entity.id, label: truncate(entity.rawText, 72) }])),
    groups: new Map(groups.map(entity => [entity.id, { id: entity.id, label: entity.theme || entity.sharedQuestion || entity.id }])),
    docs: new Map(docs.map(entity => [entity.id, { id: entity.id, label: entity.title }])),
    suggestions: new Map(suggestions.map(entity => [entity.id, { id: entity.id, label: truncate(entity.rawText, 72) }])),
    critiques: new Map(critiques.map(entity => [entity.id, { id: entity.id, label: truncate(entity.critique, 72) }])),
    connections: new Map(connections.map(entity => [entity.id, { id: entity.id, label: connectionLabel(entity) }])),
    tweaks: new Map<string, HistoryEntity>(),
    beatReviewSessions: new Map(beatReviewSessions.map(entity => [entity.id, { id: entity.id, label: entity.title }])),
    beatReviewItems: new Map(beatReviewItems.map(entity => [entity.id, {
      id: entity.id,
      label: entity.candidate.label || truncate(entity.candidate.summary, 72),
    }])),
    boards: new Map<string, HistoryEntity>(),
  } as const;

  return changeSets.map(changeSet => ({
    id: changeSet.id,
    seq: changeSet.seq,
    status: changeSet.status,
    summary: changeSet.summary,
    actorLabel: actorLabel(changeSet),
    actorTone: changeSet.actor.type,
    beatLabel: changeSet.actor.beat ? roleTitle(changeSet.actor.beat) : undefined,
    patchCount: changeSet.forward.length,
    committedAt: changeSet.committedAt,
    affected: changeSet.affected.map(target => ({
      store: target.store,
      id: target.id,
      label: resolveAffectedLabel(changeSet, target.store, target.id, lookups),
    }))
      .filter(target => target.store !== 'boards' || changeSet.affected.length === 1),
    isCurrent: changeSet.seq === historyState.cursor,
  }));
}

function resolveAffectedLabel(
  changeSet: ChangeSetRecord,
  store: ChangeSetRecord['affected'][number]['store'],
  id: string,
  lookups: Record<string, Map<string, HistoryEntity>>,
): string {
  const existing = lookups[store]?.get(id);
  if (existing) return existing.label;

  const patch = [...changeSet.forward, ...changeSet.inverse]
    .find(candidate => candidate.path === `/stores/${store}/${id}` && candidate.op !== 'remove');
  const patchValue = patch && patch.op !== 'remove'
    ? patch.value as Record<string, unknown>
    : undefined;
  if (patchValue) {
    if (typeof patchValue.rawText === 'string') return truncate(patchValue.rawText, 72);
    if (typeof patchValue.title === 'string') return patchValue.title;
    if (typeof patchValue.theme === 'string' && patchValue.theme) return patchValue.theme;
    if (typeof patchValue.summary === 'string' && patchValue.summary) return truncate(patchValue.summary, 72);
    if (typeof patchValue.critique === 'string') return truncate(patchValue.critique, 72);
    if (Array.isArray(patchValue.ideaIds)) return `${titleCase(store.slice(0, -1))} (${patchValue.ideaIds.length} ideas)`;
  }

  if (store === 'boards') return 'Board state';
  if (store === 'tweaks') return 'Board tweaks';
  return `${titleCase(store.replace(/([A-Z])/g, ' $1').replace(/s$/, ''))} ${id}`;
}

function actorLabel(changeSet: ChangeSetRecord): string {
  if (changeSet.actor.label) return changeSet.actor.label;
  if (changeSet.actor.type === 'user') return 'User';
  if (changeSet.actor.type === 'ai') return changeSet.actor.beat ? `${roleTitle(changeSet.actor.beat)} role` : 'AI';
  if (changeSet.actor.type === 'tool') return 'Tool';
  return 'System';
}

function roleTitle(value: string): string {
  switch (value) {
    case 'scout':
      return 'Scout';
    case 'connect':
      return 'Connector';
    case 'critique':
      return 'Challenger';
    case 'summarise':
      return 'Synthesiser';
    case 'cluster':
      return 'Cluster';
    default:
      return titleCase(value);
  }
}

function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function connectionLabel(connection: Connection): string {
  return `${titleCase(connection.kind)} (${connection.ideaIds.length})`;
}
