/**
 * bo-167 · formatLinearBrief unit coverage.
 *
 * Locks the deterministic Linear issue payload — title, body sections
 * (Context / Acceptance criteria / Invariants), label list, and the priority
 * mapping derived from BriefShipStatus.
 */
import { describe, expect, it } from 'vitest';
import { formatLinearBrief } from './formatLinearBrief';
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

describe('formatLinearBrief', () => {
  it('uses the latest version artifact markdown heading as the title and emits Linear-style description', () => {
    const brief = makeBrief({
      shipStatus: 'ready',
      versions: [
        makeVersion({
          artifactMd: '# Reduce signup drop-off\n\nUsers bounce at step 3 of onboarding.',
        }),
      ],
    });

    const payload = formatLinearBrief(brief);

    expect(payload.title).toBe('Reduce signup drop-off');
    expect(payload.description).toContain('# Reduce signup drop-off');
    expect(payload.description).toContain('Users bounce at step 3 of onboarding.');
    // Provenance footer is appended.
    expect(payload.description).toContain('Brief `brief-1`');
    expect(payload.description).toContain('v1');
    expect(payload.description).toContain('ship status: `ready`');
    expect(payload.labels).toEqual(['brainstorming-brief']);
    // ready → Medium priority (2).
    expect(payload.priority).toBe(2);
  });

  it('falls back to BriefState projection (Context / Acceptance / Invariants) when no artifact md exists; priority follows ship status', () => {
    const brief = makeBrief({
      shipStatus: 'draft',
      versions: [
        makeVersion({
          briefState: makeBriefState({
            problemStatement: 'Users abandon checkout when shipping costs appear too late.',
            audience: 'First-time buyers',
            desiredOutcome: 'Drop-off below 10%',
            successCriteria: ['Cart-to-purchase conversion ≥ 90% on mobile.'],
            mustStayTrueRules: ['Cart total never changes after payment screen.'],
            outOfScope: ['B2B accounts'],
          }),
        }),
      ],
    });

    const payload = formatLinearBrief(brief);

    expect(payload.title).toBe('Users abandon checkout when shipping costs appear too late.');
    expect(payload.description).toContain('## Context');
    expect(payload.description).toContain('**Problem:** Users abandon checkout when shipping costs appear too late.');
    expect(payload.description).toContain('**Audience:** First-time buyers');
    expect(payload.description).toContain('**Desired outcome:** Drop-off below 10%');
    expect(payload.description).toContain('## Acceptance criteria');
    expect(payload.description).toContain('- Cart-to-purchase conversion ≥ 90% on mobile.');
    expect(payload.description).toContain('## Invariants');
    expect(payload.description).toContain('- Cart total never changes after payment screen.');
    expect(payload.description).toContain('## Out of scope');
    // draft → No priority (0).
    expect(payload.priority).toBe(0);
  });
});
