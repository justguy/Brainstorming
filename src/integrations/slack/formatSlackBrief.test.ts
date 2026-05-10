/**
 * bo-168 · formatSlackBrief unit coverage.
 *
 * Locks the deterministic Block Kit payload — header text, summary section
 * blocks (Problem/Audience/Desired outcome), bullet lists, the divider +
 * context footer, and the plain-text fallback used for push notifications.
 */
import { describe, expect, it } from 'vitest';
import { formatSlackBrief } from './formatSlackBrief';
import type { Brief, BriefState, BriefVersion } from '../../types';

function makeBriefState(overrides: Partial<BriefState> = {}): BriefState {
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
    ...overrides,
  };
}

function makeVersion(overrides: Partial<BriefVersion> = {}): BriefVersion {
  return {
    id: 'v1',
    briefId: 'brief-1',
    seq: 1,
    briefState: makeBriefState(),
    createdAt: 1_000,
    ...overrides,
  };
}

function makeBrief(overrides: Partial<Brief> = {}): Brief {
  return {
    id: 'brief-1',
    boardId: 'board-1',
    ideaId: 'idea-1',
    shipStatus: 'ready',
    versions: [makeVersion()],
    marginNotes: [],
    createdAt: 1_000,
    updatedAt: 2_000,
    ...overrides,
  };
}

describe('formatSlackBrief', () => {
  it('emits header + summary sections + context footer derived from BriefState', () => {
    const brief = makeBrief({
      versions: [
        makeVersion({
          artifactMd: '# Reduce signup drop-off\n\n## Problem\n\nUsers bounce.',
          briefState: makeBriefState({
            problemStatement: 'Users abandon checkout when shipping costs appear too late.',
            audience: 'First-time buyers',
            desiredOutcome: 'Drop-off below 10%',
            successCriteria: ['Cart-to-purchase ≥ 90% on mobile', 'No regressions on desktop'],
            mustStayTrueRules: ['Cart total never changes after payment screen.'],
            risks: [
              {
                id: 'r1',
                description: 'Payment-provider migration',
                likelihood: 'medium',
                impact: 'high',
              },
            ],
          }),
        }),
      ],
    });

    const payload = formatSlackBrief(brief);

    // text fallback uses the title.
    expect(payload.text).toBe('Reduce signup drop-off');

    // First block is the header.
    expect(payload.blocks[0]).toEqual({
      type: 'header',
      text: { type: 'plain_text', text: 'Reduce signup drop-off', emoji: true },
    });

    const sections = payload.blocks.filter((b) => b.type === 'section');
    const sectionTexts = sections.map((s) => (s.type === 'section' ? s.text.text : ''));
    expect(sectionTexts.some((t) => t.includes('*Problem:* Users abandon checkout when shipping costs appear too late.'))).toBe(true);
    expect(sectionTexts.some((t) => t.includes('*Audience:* First-time buyers'))).toBe(true);
    expect(sectionTexts.some((t) => t.includes('*Desired outcome:* Drop-off below 10%'))).toBe(true);
    expect(sectionTexts.some((t) => t.includes('*Success criteria*') && t.includes('• Cart-to-purchase ≥ 90% on mobile'))).toBe(true);
    expect(sectionTexts.some((t) => t.includes('*Must stay true*') && t.includes('• Cart total never changes after payment screen.'))).toBe(true);
    expect(sectionTexts.some((t) => t.includes('*Risks*') && t.includes('Payment-provider migration') && t.includes('(medium/high)'))).toBe(true);

    // Divider + context footer at the tail.
    const tail = payload.blocks[payload.blocks.length - 2];
    const footer = payload.blocks[payload.blocks.length - 1];
    expect(tail.type).toBe('divider');
    expect(footer.type).toBe('context');
    if (footer.type === 'context') {
      expect(footer.elements[0].text).toContain('Brief `brief-1`');
      expect(footer.elements[0].text).toContain('v1');
      expect(footer.elements[0].text).toContain('ship status: `ready`');
    }
  });

  it('falls back to artifact md as a single section when BriefState is empty', () => {
    const brief = makeBrief({
      versions: [
        makeVersion({
          artifactMd: '# Just a title\n\nSome free-form prose with `code`.',
        }),
      ],
    });

    const payload = formatSlackBrief(brief);

    expect(payload.text).toBe('Just a title');
    expect(payload.blocks[0].type).toBe('header');
    expect(payload.blocks[1].type).toBe('section');
    if (payload.blocks[1].type === 'section') {
      expect(payload.blocks[1].text.text).toContain('Some free-form prose with `code`.');
    }
  });
});
