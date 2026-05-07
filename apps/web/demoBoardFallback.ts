/**
 * Seed walkthrough that loads when the user has no boards yet.
 *
 * The board mimics a real brainstorming session about *this app itself* and
 * exercises the four AI roles the facilitator will play in a live session:
 *
 *   1. Capture       — the user drops a raw idea on the canvas.
 *   2. Critique      — the devil's advocate attaches a red card to challenge it.
 *   3. Scout         — adjacent ideas the AI proposes from outside knowledge,
 *                       shown as draggable teal cards.
 *   4. Connect       — the AI draws lines between related ideas.
 *
 * Reading the board top-to-bottom, the user can see what each role looks like
 * before invoking the live LLM, so the empty state doubles as a tutorial.
 *
 * Each idea below is annotated with a `welcome` tag and a `phase:*` tag so the
 * filter/grouping demo also has something to bite on. The "tour" idea is the
 * intended entry point — it sits at the top-center and explains what to try.
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
      width: input.width ?? 264,
      height: input.height ?? 200,
    },
  });
}

export const DEMO_FALLBACK_IDEAS: Idea[] = [
  // Tour entry point — sits at the top, slightly larger, explains what to do.
  createDemoIdea({
    id: 'demo-idea-tour',
    rawText:
      'Start here — your guided brainstorm\n\n' +
      'This board is a live demo of how the app facilitates a real brainstorm. ' +
      'Drag cards, expand them, follow the connections, and use the buttons on each ' +
      'card to file an idea as a GitHub issue. Reset anytime from Options.',
    tags: ['phase:capture', 'core', 'paper-yellow', 'tour'],
    x: 540,
    y: 40,
    width: 320,
    height: 220,
  }),

  // The seed problem — the brainstorm topic itself.
  createDemoIdea({
    id: 'demo-idea-real-session',
    rawText:
      'Make brainstorming feel like a real session\n\n' +
      'A teammate would interrupt with "what if…", challenge your thinking, ' +
      'connect dots you missed, and remind you what got dropped. The app should too.',
    tags: ['phase:capture', 'core', 'paper-yellow'],
    x: 540,
    y: 304,
    width: 304,
    height: 216,
  }),

  // Three approaches that branch from the seed problem (phase:approaches).
  createDemoIdea({
    id: 'demo-idea-roles',
    rawText:
      'Give the AI explicit roles\n\n' +
      'Critic, scout, connector, summarizer. Each role has its own card style ' +
      'and its own moment in the flow.',
    tags: ['phase:approaches', 'role:critic', 'paper-blue'],
    x: 160,
    y: 580,
  }),
  createDemoIdea({
    id: 'demo-idea-rhythm',
    rawText:
      'Match the rhythm of a real meeting\n\n' +
      'Quiet ideation → noisy critique → silent voting → connect → recap. ' +
      'The AI ramps up and backs off in the same beats.',
    tags: ['phase:approaches', 'role:facilitator', 'paper-pink'],
    x: 540,
    y: 580,
  }),
  createDemoIdea({
    id: 'demo-idea-cards',
    rawText:
      'Make the artifacts physical\n\n' +
      'Sticky notes, red critique slips, teal scout cards, lines on the wall. ' +
      'When you can move it, you trust it.',
    tags: ['phase:approaches', 'role:designer', 'paper-peach'],
    x: 920,
    y: 580,
  }),

  // Phase: stress-tests / risks (one of these gets a critique card attached).
  createDemoIdea({
    id: 'demo-idea-undo',
    rawText:
      'Every AI move is reversible\n\n' +
      'AI-tagged history with one-click undo. Wrong critique? Pop it. ' +
      'Bad scout card? Dismiss. Trust falls apart without this.',
    tags: ['phase:risks', 'role:critic', 'paper-lavender'],
    x: 160,
    y: 880,
  }),
  createDemoIdea({
    id: 'demo-idea-pace',
    rawText:
      'AI must read the room\n\n' +
      'Talks too much → people tune out. Talks too little → useless. ' +
      'Idle-gated triggers + accept/reject signal control set the pace.',
    tags: ['phase:risks', 'role:facilitator', 'paper-green'],
    x: 540,
    y: 880,
  }),
  createDemoIdea({
    id: 'demo-idea-ship',
    rawText:
      'Convert ideas to action\n\n' +
      'A brainstorm that ends in nothing is a meeting. Each idea card has an ' +
      '"Open as issue" button that pre-fills a GitHub issue from the card text.',
    tags: ['phase:ship', 'role:builder', 'paper-blue'],
    x: 920,
    y: 880,
    height: 220,
  }),

  // Discarded — to demo the restore flow visually.
  createDemoIdea({
    id: 'demo-idea-chat',
    rawText:
      'Chat sidebar for the AI\n\n' +
      'Put the AI in a sidebar and let users prompt it like ChatGPT.',
    tags: ['phase:rejected', 'role:critic', 'paper-grey', 'discarded'],
    x: 920,
    y: 304,
    height: 184,
  }),
];

export const DEMO_FALLBACK_CONNECTIONS: Connection[] = [
  // The seed problem grounds all three approaches.
  {
    id: 'demo-conn-seed-to-roles',
    boardId: DEFAULT_BOARD_ID,
    kind: 'builds_on',
    ideaIds: ['demo-idea-real-session', 'demo-idea-roles'],
    rationale: 'Roles operationalize "feel like a real session" — each role is a teammate move.',
    strength: 'strong',
    createdAt: DEMO_CREATED_AT + 1,
  },
  {
    id: 'demo-conn-seed-to-rhythm',
    boardId: DEFAULT_BOARD_ID,
    kind: 'builds_on',
    ideaIds: ['demo-idea-real-session', 'demo-idea-rhythm'],
    rationale: 'Real sessions have rhythm. Without it, the roles fire at the wrong time.',
    strength: 'strong',
    createdAt: DEMO_CREATED_AT + 2,
  },
  {
    id: 'demo-conn-seed-to-cards',
    boardId: DEFAULT_BOARD_ID,
    kind: 'builds_on',
    ideaIds: ['demo-idea-real-session', 'demo-idea-cards'],
    rationale: 'Physical artifacts are how a real session externalizes thinking.',
    strength: 'medium',
    createdAt: DEMO_CREATED_AT + 3,
  },

  // Risks pull from the approaches.
  {
    id: 'demo-conn-roles-to-undo',
    boardId: DEFAULT_BOARD_ID,
    kind: 'builds_on',
    ideaIds: ['demo-idea-roles', 'demo-idea-undo'],
    rationale: 'Roles only work if the user can pop a bad call cleanly.',
    strength: 'strong',
    createdAt: DEMO_CREATED_AT + 4,
  },
  {
    id: 'demo-conn-rhythm-to-pace',
    boardId: DEFAULT_BOARD_ID,
    kind: 'builds_on',
    ideaIds: ['demo-idea-rhythm', 'demo-idea-pace'],
    rationale: 'Rhythm and pace are the same problem at two timescales.',
    strength: 'strong',
    createdAt: DEMO_CREATED_AT + 5,
  },
  {
    id: 'demo-conn-cards-to-ship',
    boardId: DEFAULT_BOARD_ID,
    kind: 'builds_on',
    ideaIds: ['demo-idea-cards', 'demo-idea-ship'],
    rationale: 'A physical card invites a physical handoff: card → GitHub issue.',
    strength: 'medium',
    createdAt: DEMO_CREATED_AT + 6,
  },

  // Devil's-advocate contradiction lives as a connection too.
  {
    id: 'demo-conn-rejected-to-cards',
    boardId: DEFAULT_BOARD_ID,
    kind: 'contradicts',
    ideaIds: ['demo-idea-chat', 'demo-idea-cards'],
    rationale: 'A chat sidebar pulls work *off* the canvas — directly opposite to the artifacts approach.',
    strength: 'medium',
    createdAt: DEMO_CREATED_AT + 7,
  },

  // A weak shared-theme link to demo the dotted style.
  {
    id: 'demo-conn-undo-to-pace',
    boardId: DEFAULT_BOARD_ID,
    kind: 'shared_theme',
    ideaIds: ['demo-idea-undo', 'demo-idea-pace'],
    rationale: 'Both are about earning the user\'s trust through restraint.',
    strength: 'weak',
    createdAt: DEMO_CREATED_AT + 8,
  },
];

export const DEMO_FALLBACK_CRITIQUES: IdeaCritique[] = [
  {
    id: 'demo-critique-roles',
    boardId: DEFAULT_BOARD_ID,
    ideaId: 'demo-idea-roles',
    critique:
      'Four AI roles will feel like four chatbots fighting for attention if they all fire on the same cue. ' +
      'Without strict ordering and idle-gating, the board turns into noise.',
    evidenceAsk:
      'What\'s the policy that decides which role speaks next? When does the AI stay silent?',
    status: 'active',
    source: 'devils_advocate',
    createdAt: DEMO_CREATED_AT + 10,
    updatedAt: DEMO_CREATED_AT + 10,
  },
  {
    id: 'demo-critique-cards',
    boardId: DEFAULT_BOARD_ID,
    ideaId: 'demo-idea-cards',
    critique:
      'Skeuomorphic sticky notes age fast and look toy-like to senior reviewers. ' +
      'The "physicality" might cost more credibility than it earns.',
    evidenceAsk:
      'Have you tested this with a senior engineer or PM who has not used the app before?',
    status: 'active',
    source: 'devils_advocate',
    createdAt: DEMO_CREATED_AT + 11,
    updatedAt: DEMO_CREATED_AT + 11,
  },
];

export const DEMO_FALLBACK_SUGGESTIONS: ScoutSuggestion[] = [
  {
    id: 'demo-suggestion-quiet-time',
    boardId: DEFAULT_BOARD_ID,
    rawText:
      'Quiet-time mode\n\n' +
      'A 60-second AI silence at the start so humans seed first, the way good facilitators do.',
    rationale:
      'Mirrors the "brainwriting" technique used in real workshops to prevent anchoring on the loudest voice.',
    source: 'Scout',
    status: 'pending',
    relatedIdeaIds: ['demo-idea-rhythm', 'demo-idea-pace'],
    createdAt: DEMO_CREATED_AT + 20,
    updatedAt: DEMO_CREATED_AT + 20,
    panel: { x: 24, y: 320, width: 240, height: 184 },
  },
  {
    id: 'demo-suggestion-vote',
    boardId: DEFAULT_BOARD_ID,
    rawText:
      'Dot-vote on ideas\n\n' +
      'Each peer drops 3 dots; the AI re-arranges the canvas around the cluster.',
    rationale:
      'Real workshops use dot voting to compress 30 ideas to 5 in two minutes. The AI can drive the layout afterwards.',
    source: 'Scout',
    status: 'pending',
    relatedIdeaIds: ['demo-idea-roles', 'demo-idea-ship'],
    createdAt: DEMO_CREATED_AT + 21,
    updatedAt: DEMO_CREATED_AT + 21,
    panel: { x: 1200, y: 320, width: 240, height: 184 },
  },
  {
    id: 'demo-suggestion-summary',
    boardId: DEFAULT_BOARD_ID,
    rawText:
      'Recap card at the end\n\n' +
      'A pinned summary card the AI keeps live: top ideas, open questions, parking lot.',
    rationale:
      'Mirrors the closing recap from a real workshop. Lives on the board so it follows the user back next session.',
    source: 'Scout',
    status: 'pending',
    relatedIdeaIds: ['demo-idea-rhythm', 'demo-idea-ship'],
    createdAt: DEMO_CREATED_AT + 22,
    updatedAt: DEMO_CREATED_AT + 22,
    panel: { x: 1200, y: 880, width: 240, height: 196 },
  },
];
