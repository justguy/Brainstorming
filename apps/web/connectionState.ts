import type { Connection, Idea, SupportingDoc } from '../../src/types';
import type { ConnectionFinderOutput } from '../../src/orchestrator/roles/connectionFinder';

const MAX_CONNECTIONS = 10;

function normalizedIdeaIds(ideaIds: string[]): string[] {
  return [...new Set(ideaIds)].sort();
}

function connectionKey(connection: Pick<Connection, 'kind' | 'ideaIds'>): string {
  return `${connection.kind}:${normalizedIdeaIds(connection.ideaIds).join(':')}`;
}

export function materializeConnections(
  ideas: Idea[],
  supportingDocs: SupportingDoc[],
  result: ConnectionFinderOutput | null,
  createdAt = Date.now(),
): Connection[] {
  if (!result) return [];

  const allIdeaIds = new Set(ideas.map(idea => idea.id));
  const allDocIds = new Set(supportingDocs.map(doc => doc.id));

  return result.connections
    .filter(connection => connection.strength !== 'weak')
    .map((connection, index) => ({
      id: `${createdAt}-${index}`,
      kind: connection.kind,
      ideaIds: connection.ideaIds.filter(id => allIdeaIds.has(id)),
      supportingDocIds: connection.supportingDocIds?.filter(id => allDocIds.has(id)),
      rationale: connection.rationale,
      strength: connection.strength,
      createdAt,
    }))
    .filter(connection => connection.ideaIds.length >= 2)
    .slice(0, MAX_CONNECTIONS);
}

export function makeManualConnection(args: {
  fromIdeaId: string;
  toIdeaId: string;
  kind: Connection['kind'];
  rationale: string;
  createdAt?: number;
}): Connection {
  const createdAt = args.createdAt ?? Date.now();
  return {
    id: `manual-${createdAt}-${args.fromIdeaId}-${args.toIdeaId}-${args.kind}`,
    kind: args.kind,
    ideaIds: [args.fromIdeaId, args.toIdeaId],
    rationale: args.rationale,
    strength: 'strong',
    createdAt,
  };
}

export function upsertConnection(existing: Connection[], next: Connection): Connection[] {
  const nextKey = connectionKey(next);
  const kept = existing.filter(connection => connectionKey(connection) !== nextKey);
  return [...kept, next];
}

export function replaceGeneratedConnections(existing: Connection[], generated: Connection[]): Connection[] {
  const manual = existing.filter(connection => connection.id.startsWith('manual-'));
  return [...manual, ...generated];
}
