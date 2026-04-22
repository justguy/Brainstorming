import { DEFAULT_BOARD_ID, type ChangeActor } from '../../src/board/types';
import { createBoardController } from '../../src/storage/boardController';
import type { Connection, Idea, Panel } from '../../src/types';
import type { StandaloneBoardSnapshot } from './boardRepository';

const DEMO_SEED_TAG = 'demo-seed-v2';
const DEMO_SEED_ACTOR: ChangeActor = {
  type: 'system',
  source: 'system',
  label: 'demo-board-seed',
};

type DemoBoardController = Pick<
  ReturnType<typeof createBoardController>,
  'captureIdea' | 'createCritique' | 'createSuggestion' | 'replaceConnections'
>;

interface DemoIdeaDraft {
  rawText: string;
  tags: string[];
  panel: Panel;
}

const DEMO_IDEAS: DemoIdeaDraft[] = [
  {
    rawText:
      'Use past decisions as training data\n\nMine the last 12 months of Notion + calendar notes.',
    tags: [DEMO_SEED_TAG, 'idea', 'history', 'paper-blue'],
    panel: { x: 388, y: 44, width: 250, height: 164 },
  },
  {
    rawText:
      'AI that helps teams make better decisions\n\nUse AI to surface blind spots before a decision is committed.',
    tags: [DEMO_SEED_TAG, 'idea', 'core', 'paper-yellow'],
    panel: { x: 422, y: 276, width: 286, height: 204 },
  },
  {
    rawText:
      'Integrate with Slack\n\nSlash command `/decide` reframes the thread.',
    tags: [DEMO_SEED_TAG, 'idea', 'integration', 'paper-pink'],
    panel: { x: 914, y: 256, width: 254, height: 164 },
  },
  {
    rawText:
      'Decision journal, not a dashboard\n\nWrite the bet down. Review it in 60 days.',
    tags: [DEMO_SEED_TAG, 'idea', 'artifact', 'paper-peach'],
    panel: { x: 220, y: 548, width: 252, height: 160 },
  },
  {
    rawText:
      'Pre-mortem as a first-class artifact\n\nBefore kickoff, imagine the failure. Save it.',
    tags: [DEMO_SEED_TAG, 'idea', 'risk', 'paper-lavender'],
    panel: { x: 548, y: 714, width: 250, height: 168 },
  },
  {
    rawText:
      'Score decisions before execution\n\nConfidence × reversibility × blast radius.',
    tags: [DEMO_SEED_TAG, 'idea', 'scoring', 'paper-green'],
    panel: { x: 1032, y: 494, width: 262, height: 160 },
  },
];

export function shouldSeedDemoBoard(snapshot: StandaloneBoardSnapshot): boolean {
  if (snapshot.board.id !== DEFAULT_BOARD_ID) {
    return false;
  }
  if (snapshot.ideas.some(idea => idea.tags.includes(DEMO_SEED_TAG))) {
    return false;
  }
  if (
    snapshot.ideas.length > 0 ||
    snapshot.groups.length > 0 ||
    snapshot.docs.length > 0 ||
    snapshot.connections.length > 0 ||
    snapshot.suggestions.length > 0 ||
    snapshot.critiques.length > 0
  ) {
    return false;
  }
  return true;
}

export async function seedDemoBoard(boardController: DemoBoardController): Promise<string | null> {
  const seededIdeas: Idea[] = [];
  for (const idea of DEMO_IDEAS) {
    const result = await boardController.captureIdea({
      rawText: idea.rawText,
      tags: idea.tags,
      actor: DEMO_SEED_ACTOR,
      panel: idea.panel,
    });
    seededIdeas.push(result.idea);
  }

  if (seededIdeas.length < 5) {
    return seededIdeas[0]?.id ?? null;
  }

  await boardController.createCritique({
    ideaId: seededIdeas[2].id,
    critique:
      'This fails the moment the team stops trusting the source thread. Slack is social theater.',
    evidenceAsk: 'What exact artifact links the original thread to the decision that gets committed?',
    actor: DEMO_SEED_ACTOR,
  });

  await boardController.createSuggestion({
    rawText:
      'Decision half-life\n\nWhich decisions expired? Which compounded?',
    rationale: 'Surface a scout prompt that reframes the board around expiry rather than only capture.',
    source: 'Scout',
    relatedIdeaIds: [seededIdeas[1].id],
    panel: { x: 18, y: 218, width: 244, height: 182 },
    actor: DEMO_SEED_ACTOR,
  });

  await boardController.createSuggestion({
    rawText:
      'Red team mode\n\nA toggle that forces opposite reasoning for 10 minutes.',
    rationale: 'Keep a lightweight provocation card near the main cluster so the team can keep or dismiss it in place.',
    source: 'Scout',
    relatedIdeaIds: [seededIdeas[4].id, seededIdeas[5].id],
    panel: { x: 912, y: 680, width: 238, height: 148 },
    actor: DEMO_SEED_ACTOR,
  });

  const connections: Connection[] = [
    {
      id: crypto.randomUUID(),
      boardId: DEFAULT_BOARD_ID,
      kind: 'builds_on',
      ideaIds: [seededIdeas[0].id, seededIdeas[1].id],
      rationale: 'Historical decisions become source material for the core decision assistant.',
      strength: 'strong',
      createdAt: Date.now(),
    },
    {
      id: crypto.randomUUID(),
      boardId: DEFAULT_BOARD_ID,
      kind: 'builds_on',
      ideaIds: [seededIdeas[1].id, seededIdeas[2].id],
      rationale: 'Slack is an operational surface for the board idea.',
      strength: 'strong',
      createdAt: Date.now(),
    },
    {
      id: crypto.randomUUID(),
      boardId: DEFAULT_BOARD_ID,
      kind: 'builds_on',
      ideaIds: [seededIdeas[1].id, seededIdeas[5].id],
      rationale: 'Decision scoring turns the broad idea into a usable execution gate.',
      strength: 'medium',
      createdAt: Date.now(),
    },
    {
      id: crypto.randomUUID(),
      boardId: DEFAULT_BOARD_ID,
      kind: 'shared_theme',
      ideaIds: [seededIdeas[3].id, seededIdeas[4].id],
      rationale: 'Both notes turn facilitation into a durable artifact rather than a chat exchange.',
      strength: 'weak',
      createdAt: Date.now(),
    },
  ];

  await boardController.replaceConnections({
    connections,
    actor: DEMO_SEED_ACTOR,
    summary: 'Seeded demo board connections',
  });

  return seededIdeas[0]?.id ?? null;
}
