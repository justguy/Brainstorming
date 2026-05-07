/**
 * Seed walkthrough that loads when the user has no boards yet.
 *
 * Mimics a real brainstorming session about *how the AI facilitator should
 * collaborate with humans*. The questions are open-ended and exploratory, not
 * implementation tickets. Each idea is a high-level theme that a real team
 * would actually argue about for an hour, with adjacent thinking surfaced by
 * the AI's four roles:
 *
 *   1. Capture       — humans drop raw ideas on the canvas.
 *   2. Critique      — devil's advocate cards push back on assumptions.
 *   3. Scout         — adjacent themes the AI proposes from outside knowledge.
 *   4. Connect       — the AI draws builds_on, contradicts, and shared_theme
 *                       lines between related ideas.
 *
 * Reading the board top-to-bottom, the user can see what each role looks like
 * before invoking the live LLM, so the empty state doubles as a tutorial.
 */

import { createCapturedIdea } from '../../src/board/ideaFactory';
import { DEFAULT_BOARD_ID } from '../../src/board/types';
import type { Connection, Idea, IdeaCritique, ScoutSuggestion } from '../../src/types';

const DEMO_CREATED_AT = Date.UTC(2026, 4, 7, 9, 0, 0);

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
    tags: ['demo-fallback', 'welcome', ...input.tags],
    createdAt: DEMO_CREATED_AT,
    panel: {
      x: input.x,
      y: input.y,
      width: input.width ?? 268,
      height: input.height ?? 208,
    },
  });
}

export const DEMO_FALLBACK_IDEAS: Idea[] = [
  // Tour entry point — sits at the top, slightly larger, frames the brainstorm.
  createDemoIdea({
    id: 'demo-idea-tour',
    rawText:
      "What's our edge?\n\n" +
      'A live brainstorm about how this app should collaborate with humans. ' +
      "Drag cards, follow the connections, and use \"open issue\" on any card to send a thought to GitHub. " +
      'Reset anytime from Options.',
    tags: ['theme:framing', 'paper-yellow', 'tour'],
    x: 540,
    y: 40,
    width: 320,
    height: 224,
  }),

  // The seed question — the brainstorm topic itself.
  createDemoIdea({
    id: 'demo-idea-seed',
    rawText:
      'What does an AI teammate add that a smart sidebar cannot?\n\n' +
      "If the answer is just 'better prompts', we built the wrong thing. " +
      "What's the move only a workspace-native collaborator can make?",
    tags: ['theme:framing', 'paper-yellow'],
    x: 540,
    y: 308,
    width: 312,
    height: 224,
  }),

  // Three angles branching from the seed (think:lens).
  createDemoIdea({
    id: 'demo-idea-tension',
    rawText:
      'Productive tension over polite agreement\n\n' +
      "Brainstorms die when everyone nods. The AI's job is to disagree on purpose, " +
      'cite the missing constraint, and force a sharper second draft.',
    tags: ['theme:tension', 'paper-pink'],
    x: 160,
    y: 588,
  }),
  createDemoIdea({
    id: 'demo-idea-cluster',
    rawText:
      'Group ideas by the tool that solves them\n\n' +
      "Don't sort by topic — sort by 'what would actually move this forward.' " +
      'A board grouped by tool surfaces capability gaps in the team itself.',
    tags: ['theme:structure', 'paper-blue'],
    x: 540,
    y: 588,
  }),
  createDemoIdea({
    id: 'demo-idea-revive',
    rawText:
      'Discarded ideas have a half-life\n\n' +
      'Most rejected ideas get rejected for one reason that later becomes obsolete. ' +
      'The AI watches for the moment a discarded idea becomes correct again.',
    tags: ['theme:memory', 'paper-peach'],
    x: 920,
    y: 588,
  }),

  // Stress / risks pulled from the angles.
  createDemoIdea({
    id: 'demo-idea-confidence',
    rawText:
      "Calibrate the AI's confidence in public\n\n" +
      "When the AI proposes, it should say how sure it is and why. Quiet confidence is a bug — " +
      'the human needs to know when to push back.',
    tags: ['theme:trust', 'paper-lavender'],
    x: 160,
    y: 888,
  }),
  createDemoIdea({
    id: 'demo-idea-pace',
    rawText:
      'A great facilitator knows when to shut up\n\n' +
      'Talking too much is more dangerous than talking too little. ' +
      'Read the room: idle gates, accepted/rejected ratio, and silence as a feature.',
    tags: ['theme:presence', 'paper-green'],
    x: 540,
    y: 888,
  }),
  createDemoIdea({
    id: 'demo-idea-evidence',
    rawText:
      'Evidence beats taste\n\n' +
      "Don't ship 'the AI thinks this is interesting.' Ship 'here's the citation, here's the contradiction, " +
      "here's what changes if you accept it.' Tasteful suggestions are a regression.",
    tags: ['theme:rigor', 'paper-blue'],
    x: 920,
    y: 888,
    height: 220,
  }),

  // Discarded — to demo the restore flow.
  createDemoIdea({
    id: 'demo-idea-rejected-chat',
    rawText:
      'Drop a chat sidebar next to the canvas\n\n' +
      'Let the user prompt the AI like ChatGPT, alongside the board.',
    tags: ['theme:rejected', 'paper-grey', 'discarded'],
    x: 920,
    y: 308,
    height: 192,
  }),
];

export const DEMO_FALLBACK_CONNECTIONS: Connection[] = [
  // The seed question grounds all three angles.
  {
    id: 'demo-conn-seed-to-tension',
    boardId: DEFAULT_BOARD_ID,
    kind: 'builds_on',
    ideaIds: ['demo-idea-seed', 'demo-idea-tension'],
    rationale: '"Workspace-native" only matters if the AI is willing to disagree, not just paraphrase.',
    strength: 'strong',
    createdAt: DEMO_CREATED_AT + 1,
  },
  {
    id: 'demo-conn-seed-to-cluster',
    boardId: DEFAULT_BOARD_ID,
    kind: 'builds_on',
    ideaIds: ['demo-idea-seed', 'demo-idea-cluster'],
    rationale: 'Grouping by tooling is a structural move only a workspace-native AI can make at scale.',
    strength: 'medium',
    createdAt: DEMO_CREATED_AT + 2,
  },
  {
    id: 'demo-conn-seed-to-revive',
    boardId: DEFAULT_BOARD_ID,
    kind: 'builds_on',
    ideaIds: ['demo-idea-seed', 'demo-idea-revive'],
    rationale: 'Persistent memory of rejected ideas is something a sidebar fundamentally cannot provide.',
    strength: 'medium',
    createdAt: DEMO_CREATED_AT + 3,
  },

  // Risks build on the angles.
  {
    id: 'demo-conn-tension-to-confidence',
    boardId: DEFAULT_BOARD_ID,
    kind: 'builds_on',
    ideaIds: ['demo-idea-tension', 'demo-idea-confidence'],
    rationale: 'Disagreement without calibrated confidence is just noise.',
    strength: 'strong',
    createdAt: DEMO_CREATED_AT + 4,
  },
  {
    id: 'demo-conn-tension-to-pace',
    boardId: DEFAULT_BOARD_ID,
    kind: 'builds_on',
    ideaIds: ['demo-idea-tension', 'demo-idea-pace'],
    rationale: 'Productive tension requires picking the right *moment* to push, not pushing constantly.',
    strength: 'strong',
    createdAt: DEMO_CREATED_AT + 5,
  },
  {
    id: 'demo-conn-cluster-to-evidence',
    boardId: DEFAULT_BOARD_ID,
    kind: 'builds_on',
    ideaIds: ['demo-idea-cluster', 'demo-idea-evidence'],
    rationale: 'Tool-based grouping is only useful if the assignment is grounded in evidence, not vibes.',
    strength: 'medium',
    createdAt: DEMO_CREATED_AT + 6,
  },

  // Devil's-advocate contradiction.
  {
    id: 'demo-conn-rejected-to-tension',
    boardId: DEFAULT_BOARD_ID,
    kind: 'contradicts',
    ideaIds: ['demo-idea-rejected-chat', 'demo-idea-tension'],
    rationale: 'A chat sidebar pulls work *off* the canvas — you cannot have productive tension over an artifact you have to leave to argue about.',
    strength: 'medium',
    createdAt: DEMO_CREATED_AT + 7,
  },

  // Weak shared-theme link to demo the dotted style.
  {
    id: 'demo-conn-confidence-to-pace',
    boardId: DEFAULT_BOARD_ID,
    kind: 'shared_theme',
    ideaIds: ['demo-idea-confidence', 'demo-idea-pace'],
    rationale: 'Both are about earning trust through visible restraint.',
    strength: 'weak',
    createdAt: DEMO_CREATED_AT + 8,
  },
];

export const DEMO_FALLBACK_CRITIQUES: IdeaCritique[] = [
  {
    id: 'demo-critique-tension',
    boardId: DEFAULT_BOARD_ID,
    ideaId: 'demo-idea-tension',
    critique:
      'An AI that "disagrees on purpose" without ground truth becomes a contrarian generator. ' +
      'Disagreement that is not anchored in evidence is more corrosive than polite agreement, not less.',
    evidenceAsk:
      'What signal tells the AI a disagreement is *useful*, vs. just opposite-by-default?',
    status: 'active',
    source: 'devils_advocate',
    createdAt: DEMO_CREATED_AT + 10,
    updatedAt: DEMO_CREATED_AT + 10,
  },
  {
    id: 'demo-critique-cluster',
    boardId: DEFAULT_BOARD_ID,
    ideaId: 'demo-idea-cluster',
    critique:
      'Grouping by "tool that solves it" assumes the team already knows the solution shape. ' +
      'For early ideation that is exactly when grouping by tool flattens divergent thinking back into the familiar.',
    evidenceAsk:
      'When does this grouping help vs. hurt? Is there a phase gate that decides?',
    status: 'active',
    source: 'devils_advocate',
    createdAt: DEMO_CREATED_AT + 11,
    updatedAt: DEMO_CREATED_AT + 11,
  },
  {
    id: 'demo-critique-revive',
    boardId: DEFAULT_BOARD_ID,
    ideaId: 'demo-idea-revive',
    critique:
      'Reviving discarded ideas surfaces the AI as a relentless suggester. ' +
      'There is a real risk this comes across as second-guessing every prior decision.',
    evidenceAsk:
      'What is the cooldown? How often can the same discarded idea be re-suggested before it becomes annoying?',
    status: 'active',
    source: 'devils_advocate',
    createdAt: DEMO_CREATED_AT + 12,
    updatedAt: DEMO_CREATED_AT + 12,
  },
];

export const DEMO_FALLBACK_SUGGESTIONS: ScoutSuggestion[] = [
  {
    id: 'demo-suggestion-brainwriting',
    boardId: DEFAULT_BOARD_ID,
    rawText:
      'Brainwriting before brainstorming\n\n' +
      'A 60-second silent ideation window before the AI says anything, so the loudest voice does not anchor the room.',
    rationale:
      'Used in real workshops to surface dissenting ideas. The AI explicitly stays silent — silence is a facilitator move.',
    source: 'Scout',
    status: 'pending',
    relatedIdeaIds: ['demo-idea-pace', 'demo-idea-tension'],
    createdAt: DEMO_CREATED_AT + 20,
    updatedAt: DEMO_CREATED_AT + 20,
    panel: { x: 24, y: 320, width: 248, height: 200 },
  },
  {
    id: 'demo-suggestion-second-best',
    boardId: DEFAULT_BOARD_ID,
    rawText:
      'Force a second-best argument\n\n' +
      "After every accepted idea, the AI must propose the strongest case *against* it before the team moves on.",
    rationale:
      'Pre-mortem-as-a-habit. Inverts the normal flow where critique happens late and superficially.',
    source: 'Scout',
    status: 'pending',
    relatedIdeaIds: ['demo-idea-tension', 'demo-idea-evidence'],
    createdAt: DEMO_CREATED_AT + 21,
    updatedAt: DEMO_CREATED_AT + 21,
    panel: { x: 1208, y: 320, width: 248, height: 196 },
  },
  {
    id: 'demo-suggestion-recap',
    boardId: DEFAULT_BOARD_ID,
    rawText:
      'Live recap card\n\n' +
      'A pinned summary the AI maintains during the session: top ideas, open questions, parking lot, and what got rejected and why.',
    rationale:
      "Mirrors the closing recap of a real workshop, but lives on the board so it is visible while you're still thinking.",
    source: 'Scout',
    status: 'pending',
    relatedIdeaIds: ['demo-idea-cluster', 'demo-idea-revive'],
    createdAt: DEMO_CREATED_AT + 22,
    updatedAt: DEMO_CREATED_AT + 22,
    panel: { x: 1208, y: 880, width: 248, height: 212 },
  },
];
