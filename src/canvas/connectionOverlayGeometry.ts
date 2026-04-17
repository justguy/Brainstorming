import type { Connection, Idea, Panel } from '../types';

export const MAX_VISIBLE_CONNECTIONS = 10;
const HIGH_SIGNAL_STRENGTHS = new Set<Connection['strength']>(['medium', 'strong']);

export interface LiveDragState {
  id: string;
  x: number;
  y: number;
}

export interface ConnectionSegment {
  id: string;
  connectionId: string;
  kind: Connection['kind'];
  strength: Connection['strength'];
  rationale: string;
  ideaIds: string[];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Point {
  x: number;
  y: number;
}

function resolvePanel(idea: Idea, liveDrag: LiveDragState | null): Panel | null {
  if (!idea.panel) return null;
  if (!liveDrag || liveDrag.id !== idea.id) return idea.panel;
  return {
    ...idea.panel,
    x: liveDrag.x,
    y: liveDrag.y,
  };
}

function getCenter(panel: Panel): Point {
  return {
    x: panel.x + panel.width / 2,
    y: panel.y + panel.height / 2,
  };
}

function getAnchor(panel: Panel, target: Point): Point {
  const center = getCenter(panel);
  const dx = target.x - center.x;
  const dy = target.y - center.y;

  if (dx === 0 && dy === 0) return center;

  const scale = 1 / Math.max(Math.abs(dx) / (panel.width / 2), Math.abs(dy) / (panel.height / 2));
  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
  };
}

export function getOverlayBounds(ideas: Idea[], liveDrag: LiveDragState | null): { width: number; height: number } {
  let maxRight = 0;
  let maxBottom = 0;

  for (const idea of ideas) {
    const panel = resolvePanel(idea, liveDrag);
    if (!panel) continue;
    maxRight = Math.max(maxRight, panel.x + panel.width + 96);
    maxBottom = Math.max(maxBottom, panel.y + panel.height + 96);
  }

  return {
    width: Math.max(0, maxRight),
    height: Math.max(0, maxBottom),
  };
}

export function buildConnectionSegments(
  ideas: Idea[],
  connections: Connection[],
  liveDrag: LiveDragState | null,
): ConnectionSegment[] {
  const panelByIdeaId = new Map<string, Panel>();
  for (const idea of ideas) {
    const panel = resolvePanel(idea, liveDrag);
    if (panel) panelByIdeaId.set(idea.id, panel);
  }

  const segments: ConnectionSegment[] = [];

  for (const connection of connections) {
    if (!HIGH_SIGNAL_STRENGTHS.has(connection.strength)) continue;

    const uniqueIdeaIds = [...new Set(connection.ideaIds)].filter(id => panelByIdeaId.has(id));
    if (uniqueIdeaIds.length < 2) continue;

    const primaryId = uniqueIdeaIds[0];
    const primaryPanel = panelByIdeaId.get(primaryId);
    if (!primaryPanel) continue;

    for (const targetId of uniqueIdeaIds.slice(1)) {
      const targetPanel = panelByIdeaId.get(targetId);
      if (!targetPanel) continue;

      const primaryCenter = getCenter(primaryPanel);
      const targetCenter = getCenter(targetPanel);
      const start = getAnchor(primaryPanel, targetCenter);
      const end = getAnchor(targetPanel, primaryCenter);

      segments.push({
        id: `${connection.id}:${primaryId}:${targetId}`,
        connectionId: connection.id,
        kind: connection.kind,
        strength: connection.strength,
        rationale: connection.rationale,
        ideaIds: [primaryId, targetId],
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
      });
    }
  }

  return segments.slice(0, MAX_VISIBLE_CONNECTIONS);
}
