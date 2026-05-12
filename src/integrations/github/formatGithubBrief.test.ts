/**
 * bo-165 · formatGithubBrief unit coverage.
 *
 * Locks the deterministic shape of the GitHub issue payload — title derivation
 * (heading > problemStatement > fallback), markdown projection of BriefState
 * when no artifact md is present, and the provenance footer.
 */
import { describe, expect, it } from 'vitest';
import { formatGithubBrief } from './formatGithubBrief';
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

describe('formatGithubBrief', () => {
  it('uses the latest version artifact markdown heading as the title and emits the body', () => {
    const brief = makeBrief({
      versions: [
        makeVersion({
          artifactMd: '# Reduce signup drop-off\n\n## Problem\n\nUsers bounce at step 3.',
        }),
      ],
    });

    const payload = formatGithubBrief(brief);

    expect(payload.title).toBe('Reduce signup drop-off');
    expect(payload.body).toContain('# Reduce signup drop-off');
    expect(payload.body).toContain('Users bounce at step 3.');
    // Provenance footer is appended.
    expect(payload.body).toContain('Brief `brief-1`');
    expect(payload.body).toContain('v1');
    expect(payload.body).toContain('ship status: `ready`');
    expect(payload.labels).toEqual(['brainstorming-brief']);
  });

  it('falls back to the BriefState projection + problemStatement title when no artifact md exists', () => {
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

    const payload = formatGithubBrief(brief);

    expect(payload.title).toBe('Users abandon checkout when shipping costs appear too late.');
    expect(payload.body).toContain('## Problem');
    expect(payload.body).toContain('Users abandon checkout when shipping costs appear too late.');
    expect(payload.body).toContain('## Audience');
    expect(payload.body).toContain('First-time buyers');
    expect(payload.body).toContain('## Must stay true');
    expect(payload.body).toContain('- Cart total never changes after payment screen.');
    expect(payload.body).toContain('## Success criteria');
    expect(payload.body).toContain('- Drop-off below 10%');
  });
});
