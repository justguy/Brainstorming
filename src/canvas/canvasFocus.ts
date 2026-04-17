import type { Connection } from '../types';

export type IdeaTone = 'idle' | 'active' | 'related' | 'muted';

export interface CanvasFocusState {
  activeIdeaId: string | null;
  activePathIdeaIds: Set<string>;
  toneByIdeaId: Map<string, IdeaTone>;
}

export function deriveCanvasFocus(
  ideaIds: string[],
  connections: Connection[],
  activeIdeaId: string | null,
  highlightedIdeaIds: string[],
): CanvasFocusState {
  const activePathIdeaIds = new Set(highlightedIdeaIds);

  if (activeIdeaId) {
    activePathIdeaIds.add(activeIdeaId);
    for (const connection of connections) {
      if (!connection.ideaIds.includes(activeIdeaId)) continue;
      for (const ideaId of connection.ideaIds) activePathIdeaIds.add(ideaId);
    }
  }

  const toneByIdeaId = new Map<string, IdeaTone>();
  const hasActivePath = activePathIdeaIds.size > 0;

  for (const ideaId of ideaIds) {
    let tone: IdeaTone = 'idle';
    if (hasActivePath) {
      tone = ideaId === activeIdeaId ? 'active' : activePathIdeaIds.has(ideaId) ? 'related' : 'muted';
    }
    toneByIdeaId.set(ideaId, tone);
  }

  return { activeIdeaId, activePathIdeaIds, toneByIdeaId };
}
