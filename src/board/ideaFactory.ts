import type { BeadCoordinationState, BriefState, BoardId, Idea, Panel } from '../types';
import { DEFAULT_BOARD_ID } from './types';

export const DEFAULT_IDEA_PANEL_WIDTH = 260;
export const DEFAULT_IDEA_PANEL_HEIGHT = 180;

export function defaultBriefState(): BriefState {
  return {
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
}

export function defaultBeadCoordination(): BeadCoordinationState {
  return {
    reviewFlags: [],
  };
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function defaultPanelForIdea(idea: Pick<Idea, 'id'>): Panel {
  const hash = hashString(idea.id);
  const col = hash % 6;
  const row = Math.floor(hash / 6) % 5;
  const xJitter = hash % 48;
  const yJitter = Math.floor(hash / 13) % 36;
  return {
    x: 72 + col * 288 + xJitter,
    y: 72 + row * 216 + yJitter,
    width: DEFAULT_IDEA_PANEL_WIDTH,
    height: DEFAULT_IDEA_PANEL_HEIGHT,
  };
}

export function createCapturedIdea(input: {
  rawText: string;
  tags: string[];
  panel?: Panel;
  boardId?: BoardId;
  createdAt?: number;
  id?: string;
  insights?: Idea['insights'];
}): Idea {
  const createdAt = input.createdAt ?? Date.now();
  const idea: Idea = {
    id: input.id ?? crypto.randomUUID(),
    boardId: input.boardId ?? DEFAULT_BOARD_ID,
    rawText: input.rawText,
    tags: input.tags,
    createdAt,
    updatedAt: createdAt,
    status: 'captured',
    phase: 0,
    briefState: defaultBriefState(),
    ambiguities: [],
    clarifications: [],
    turnLog: [],
    readiness: 'red',
    insights: input.insights ?? [],
    beadCoordination: defaultBeadCoordination(),
  };

  idea.panel = input.panel ?? defaultPanelForIdea(idea);
  return idea;
}
