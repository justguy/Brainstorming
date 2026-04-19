import type { BriefState, BoardId, Idea, Panel } from '../types';
import { DEFAULT_BOARD_ID } from './types';

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

export function defaultPanelForIdea(idea: Pick<Idea, 'createdAt'>): Panel {
  const seed = Math.floor((idea.createdAt ?? Date.now()) % 10000) / 10000;
  const col = Math.floor(seed * 6);
  const row = Math.floor(seed * 4);
  return {
    x: 40 + col * 60 + row * 20,
    y: 40 + row * 80 + col * 15,
    width: 260,
    height: 180,
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
  };

  idea.panel = input.panel ?? defaultPanelForIdea(idea);
  return idea;
}
