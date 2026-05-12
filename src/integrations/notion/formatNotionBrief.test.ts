/**
 * bo-166 · formatNotionBrief unit coverage.
 *
 * Locks the deterministic page payload — Name + Status properties, the
 * artifact-md → block conversion (h1/h2/paragraph/bullet) for the happy path,
 * and the BriefState fallback when no artifact md exists.
 */
import { describe, expect, it } from 'vitest';
import { formatNotionBrief } from './formatNotionBrief';
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

describe('formatNotionBrief', () => {
  it('converts artifact markdown into Notion blocks and sets page properties', () => {
    const brief = makeBrief({
      versions: [
        makeVersion({
          artifactMd: '# Reduce signup drop-off\n\n## Problem\n\nUsers bounce at step 3.\n\n- High-value users skip onboarding.\n- Mobile worse than desktop.',
        }),
      ],
    });

    const payload = formatNotionBrief(brief);

    expect(payload.title).toBe('Reduce signup drop-off');
    expect(payload.properties.Name.title[0].text.content).toBe('Reduce signup drop-off');
    expect(payload.properties.Status.select.name).toBe('ready');

    // First block is the H1; sequence carries through the rest.
    expect(payload.blocks[0]).toEqual({
      type: 'heading_1',
      heading_1: { rich_text: [{ type: 'text', text: { content: 'Reduce signup drop-off' } }] },
    });
    expect(payload.blocks.some((b) => b.type === 'heading_2' && b.heading_2.rich_text[0].text.content === 'Problem')).toBe(true);
    expect(payload.blocks.some((b) => b.type === 'paragraph' && b.paragraph.rich_text[0].text.content === 'Users bounce at step 3.')).toBe(true);
    expect(payload.blocks.some((b) => b.type === 'bulleted_list_item' && b.bulleted_list_item.rich_text[0].text.content === 'High-value users skip onboarding.')).toBe(true);

    // Provenance footer paragraph appended last.
    const last = payload.blocks[payload.blocks.length - 1];
    expect(last.type).toBe('paragraph');
    if (last.type === 'paragraph') {
      expect(last.paragraph.rich_text[0].text.content).toContain('Brief brief-1');
      expect(last.paragraph.rich_text[0].text.content).toContain('v1');
      expect(last.paragraph.rich_text[0].text.content).toContain('ship status: ready');
    }
  });

  it('falls back to BriefState block projection when no artifact md exists', () => {
    const brief = makeBrief({
      versions: [
        makeVersion({
          briefState: makeBriefState({
            problemStatement: 'Users abandon checkout when shipping costs appear too late.',
            audience: 'First-time buyers',
            mustStayTrueRules: ['Cart total never changes after payment screen.'],
            successCriteria: ['Drop-off below 10%'],
          }),
        }),
      ],
    });

    const payload = formatNotionBrief(brief);

    expect(payload.title).toBe('Users abandon checkout when shipping costs appear too late.');
    const headings = payload.blocks
      .filter((b) => b.type === 'heading_2')
      .map((b) => (b.type === 'heading_2' ? b.heading_2.rich_text[0].text.content : ''));
    expect(headings).toEqual(
      expect.arrayContaining(['Problem', 'Audience', 'Must stay true', 'Success criteria']),
    );
    expect(
      payload.blocks.some(
        (b) => b.type === 'bulleted_list_item' && b.bulleted_list_item.rich_text[0].text.content === 'Cart total never changes after payment screen.',
      ),
    ).toBe(true);
  });
});
