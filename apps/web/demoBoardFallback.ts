import { createCapturedIdea } from '../../src/board/ideaFactory';
import { DEFAULT_BOARD_ID } from '../../src/board/types';
import type { Connection, Idea, IdeaCritique, ScoutSuggestion } from '../../src/types';

const DEMO_CREATED_AT = Date.UTC(2026, 3, 20, 7, 30, 0);

function createDemoIdea(input: {
  id: string;
  rawText: string;
  tags: string[];
  x: number;
  y: number;
  width?: number;
  height?: number;
}): Idea {
  return createCapturedIdea({
    id: input.id,
    boardId: DEFAULT_BOARD_ID,
    rawText: input.rawText,
    tags: ['demo-fallback', ...input.tags],
    createdAt: DEMO_CREATED_AT,
    panel: {
      x: input.x,
      y: input.y,
      width: input.width ?? 264,
      height: input.height ?? 186,
    },
  });
}

export const DEMO_FALLBACK_IDEAS: Idea[] = [
  createDemoIdea({
    id: 'demo-idea-training-data',
    rawText: 'Use past decisions as training data\n\nMine the last 12 months of Notion + calendar notes.',
    tags: ['idea', 'history', 'paper-blue'],
    x: 390,
    y: 44,
  }),
  createDemoIdea({
    id: 'demo-idea-ai-decisions',
    rawText: 'AI that helps teams make better decisions\n\nUse AI to surface blind spots before a decision is committed.',
    tags: ['idea', 'core', 'paper-yellow'],
    x: 422,
    y: 278,
  }),
  createDemoIdea({
    id: 'demo-idea-slack',
    rawText: 'Integrate with Slack\n\nSlash command `/decide` reframes the thread.',
    tags: ['idea', 'integration', 'paper-pink'],
    x: 915,
    y: 258,
  }),
  createDemoIdea({
    id: 'demo-idea-journal',
    rawText: 'Decision journal, not a dashboard\n\nWrite the bet down. Review it in 60 days.',
    tags: ['idea', 'artifact', 'paper-peach'],
    x: 220,
    y: 552,
  }),
  createDemoIdea({
    id: 'demo-idea-premortem',
    rawText: 'Pre-mortem as a first-class artifact\n\nBefore kickoff, imagine the failure. Save it.',
    tags: ['idea', 'risk', 'paper-lavender'],
    x: 548,
    y: 716,
  }),
  createDemoIdea({
    id: 'demo-idea-score',
    rawText: 'Score decisions before execution\n\nConfidence × reversibility × blast radius.',
    tags: ['idea', 'scoring', 'paper-green'],
    x: 1032,
    y: 494,
  }),
];

export const DEMO_FALLBACK_CONNECTIONS: Connection[] = [
  {
    id: 'demo-connection-training-to-core',
    boardId: DEFAULT_BOARD_ID,
    kind: 'builds_on',
    ideaIds: ['demo-idea-training-data', 'demo-idea-ai-decisions'],
    rationale: 'Historical decisions become the source material for the core decision assistant.',
    strength: 'strong',
    createdAt: DEMO_CREATED_AT,
  },
  {
    id: 'demo-connection-core-to-slack',
    boardId: DEFAULT_BOARD_ID,
    kind: 'builds_on',
    ideaIds: ['demo-idea-ai-decisions', 'demo-idea-slack'],
    rationale: 'Slack is the operational surface for the board idea.',
    strength: 'strong',
    createdAt: DEMO_CREATED_AT + 1,
  },
  {
    id: 'demo-connection-core-to-score',
    boardId: DEFAULT_BOARD_ID,
    kind: 'builds_on',
    ideaIds: ['demo-idea-ai-decisions', 'demo-idea-score'],
    rationale: 'Decision scoring turns the broad idea into a usable execution gate.',
    strength: 'medium',
    createdAt: DEMO_CREATED_AT + 2,
  },
  {
    id: 'demo-connection-journal-to-premortem',
    boardId: DEFAULT_BOARD_ID,
    kind: 'shared_theme',
    ideaIds: ['demo-idea-journal', 'demo-idea-premortem'],
    rationale: 'Both notes turn facilitation into a durable artifact rather than a chat exchange.',
    strength: 'weak',
    createdAt: DEMO_CREATED_AT + 3,
  },
];

export const DEMO_FALLBACK_CRITIQUES: IdeaCritique[] = [
  {
    id: 'demo-critique-slack',
    boardId: DEFAULT_BOARD_ID,
    ideaId: 'demo-idea-slack',
    critique: 'This fails the moment the team stops trusting the source thread. Slack is social theater.',
    evidenceAsk: 'What exactly keeps the original thread linked to the resulting decision artifact?',
    status: 'active',
    source: 'devils_advocate',
    createdAt: DEMO_CREATED_AT + 10,
    updatedAt: DEMO_CREATED_AT + 10,
  },
];

export const DEMO_FALLBACK_SUGGESTIONS: ScoutSuggestion[] = [
  {
    id: 'demo-suggestion-half-life',
    boardId: DEFAULT_BOARD_ID,
    rawText: 'Decision half-life\n\nWhich decisions expired? Which compounded?',
    rationale: 'Surface a small adjacent note that forces the board to think about expiry rather than only capture.',
    source: 'Scout',
    status: 'pending',
    relatedIdeaIds: ['demo-idea-ai-decisions'],
    createdAt: DEMO_CREATED_AT + 20,
    updatedAt: DEMO_CREATED_AT + 20,
    panel: { x: 18, y: 220, width: 244, height: 182 },
  },
  {
    id: 'demo-suggestion-red-team',
    boardId: DEFAULT_BOARD_ID,
    rawText: 'Red team mode\n\nA toggle that forces opposite reasoning for 10 minutes.',
    rationale: 'Keep a lightweight provocation card near the cluster so the user can keep or dismiss it in place.',
    source: 'Scout',
    status: 'pending',
    relatedIdeaIds: ['demo-idea-score', 'demo-idea-premortem'],
    createdAt: DEMO_CREATED_AT + 21,
    updatedAt: DEMO_CREATED_AT + 21,
    panel: { x: 912, y: 682, width: 238, height: 148 },
  },
];
