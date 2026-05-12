/**
 * bo-119 — projectLogEvents unit coverage.
 *
 * Goal: lock the changeSet-kind → LogEvent-kind mapping, the beatRun fallout,
 * and the timeline ordering. We do not exercise IDB here — projectLogEvents is
 * a pure function and the test reflects that.
 */
import { describe, expect, it } from 'vitest';
import { projectLogEvents } from './logEvents';
import type { ChangeSetRecord, ChangeSetKind, BeatRunRecord } from '../types';

const BOARD_ID = 'board-1';

function changeSet(
  partial: Partial<ChangeSetRecord> & { id: string; seq: number; kind: ChangeSetKind },
): ChangeSetRecord {
  return {
    boardId: BOARD_ID,
    baseSeq: partial.seq - 1,
    actor: { type: 'user', source: 'canvas' },
    summary: partial.summary ?? `change ${partial.id}`,
    affected: partial.affected ?? [],
    forward: partial.forward ?? [],
    inverse: partial.inverse ?? [],
    committedAt: partial.committedAt ?? 1_000 + partial.seq,
    status: partial.status ?? 'committed',
    ...partial,
  };
}

function beatRun(partial: Partial<BeatRunRecord> & { id: string; finishedAt: number }): BeatRunRecord {
  return {
    boardId: BOARD_ID,
    beat: 'scout',
    roleId: 'scout',
    usedFallback: false,
    startedAt: partial.finishedAt - 100,
    trigger: 'manual',
    size: 'small',
    ok: true,
    proposal: {},
    ...partial,
  };
}

describe('projectLogEvents', () => {
  it('maps a capture_idea changeSet to an idea-created LogEvent', () => {
    const events = projectLogEvents(
      [
        changeSet({
          id: 'cs-1',
          seq: 1,
          kind: 'capture_idea',
          summary: 'Captured idea X',
          affected: [{ store: 'ideas', id: 'idea-1' }],
        }),
      ],
      [],
    );

    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.kind).toBe('idea-created');
    expect(event.boardId).toBe(BOARD_ID);
    expect(event.reversed).toBe(false);
    if (event.kind !== 'idea-created') throw new Error('narrow');
    expect(event.payload.affectedIdeaIds).toEqual(['idea-1']);
    expect(event.source.kind).toBe('changeSet');
    expect(event.authorRef.kind).toBe('user');
  });

  it('maps every idea-edit kind to idea-edited with the right operation tag', () => {
    const editKinds: Array<{ kind: ChangeSetKind; expected: string }> = [
      { kind: 'move_idea', expected: 'move' },
      { kind: 'update_idea', expected: 'update' },
      { kind: 'discard_idea', expected: 'discard' },
      { kind: 'restore_idea', expected: 'restore' },
      { kind: 'merge_ideas', expected: 'merge' },
    ];

    for (let i = 0; i < editKinds.length; i += 1) {
      const { kind, expected } = editKinds[i];
      const [event] = projectLogEvents(
        [
          changeSet({
            id: `cs-${i}`,
            seq: i + 1,
            kind,
            affected: [{ store: 'ideas', id: 'idea-x' }],
          }),
        ],
        [],
      );
      expect(event.kind).toBe('idea-edited');
      if (event.kind !== 'idea-edited') throw new Error('narrow');
      expect(event.payload.operation).toBe(expected);
    }
  });

  it('flags reversed=true when the changeSet was undone', () => {
    const [event] = projectLogEvents(
      [
        changeSet({
          id: 'cs-undo',
          seq: 7,
          kind: 'capture_idea',
          status: 'undone',
          affected: [{ store: 'ideas', id: 'idea-7' }],
        }),
      ],
      [],
    );

    expect(event.reversed).toBe(true);
    expect(event.source.kind === 'changeSet' && event.source.status).toBe('undone');
  });

  it('maps connection / cluster changeSets', () => {
    const events = projectLogEvents(
      [
        changeSet({
          id: 'cs-conn',
          seq: 1,
          kind: 'replace_connections',
          affected: [{ store: 'connections', id: 'conn-1' }],
        }),
        changeSet({
          id: 'cs-group',
          seq: 2,
          kind: 'group_ideas',
          affected: [
            { store: 'groups', id: 'group-1' },
            { store: 'ideas', id: 'idea-a' },
          ],
        }),
        changeSet({
          id: 'cs-theme',
          seq: 3,
          kind: 'set_group_theme',
          affected: [{ store: 'groups', id: 'group-1' }],
        }),
      ],
      [],
    );

    expect(events.map(e => e.kind)).toEqual([
      'connection-drawn',
      'cluster-proposed',
      'cluster-proposed',
    ]);

    const cluster = events[1];
    if (cluster.kind !== 'cluster-proposed') throw new Error('narrow');
    expect(cluster.payload.operation).toBe('group');
    expect(cluster.payload.affectedGroupIds).toEqual(['group-1']);
    expect(cluster.payload.affectedIdeaIds).toEqual(['idea-a']);

    const theme = events[2];
    if (theme.kind !== 'cluster-proposed') throw new Error('narrow');
    expect(theme.payload.operation).toBe('theme');
  });

  it('maps AI suggestion / critique / review-session creates to ai-nudge', () => {
    const events = projectLogEvents(
      [
        changeSet({
          id: 'cs-sug',
          seq: 1,
          kind: 'create_suggestion',
          actor: { type: 'ai', source: 'beat', beat: 'scout' },
          affected: [{ store: 'suggestions', id: 'sug-1' }],
        }),
        changeSet({
          id: 'cs-crit',
          seq: 2,
          kind: 'create_critique',
          actor: { type: 'ai', source: 'beat', beat: 'critique' },
          affected: [{ store: 'critiques', id: 'crit-1' }],
        }),
        changeSet({
          id: 'cs-rev',
          seq: 3,
          kind: 'create_beat_review_session',
          actor: { type: 'ai', source: 'beat', beat: 'scout' },
          affected: [{ store: 'beatReviewSessions', id: 'rev-1' }],
        }),
      ],
      [],
    );

    expect(events.map(e => e.kind)).toEqual(['ai-nudge', 'ai-nudge', 'ai-nudge']);
    const surfaces = events.map(e => (e.kind === 'ai-nudge' ? e.payload.surface : null));
    expect(surfaces).toEqual(['suggestion', 'critique', 'review-session']);
    expect(events.every(e => e.authorRef.kind === 'ai')).toBe(true);
  });

  it('maps nudge resolutions (admit / dismiss / scratch / keep / elaborate)', () => {
    const events = projectLogEvents(
      [
        changeSet({
          id: 'cs-admit',
          seq: 1,
          kind: 'admit_suggestion',
          affected: [{ store: 'suggestions', id: 'sug-1' }],
        }),
        changeSet({
          id: 'cs-dis-sug',
          seq: 2,
          kind: 'dismiss_suggestion',
          affected: [{ store: 'suggestions', id: 'sug-2' }],
        }),
        changeSet({
          id: 'cs-elab',
          seq: 3,
          kind: 'elaborate_suggestion',
          affected: [{ store: 'suggestions', id: 'sug-3' }],
        }),
        changeSet({
          id: 'cs-keep',
          seq: 4,
          kind: 'keep_beat_review_item',
          affected: [{ store: 'beatReviewItems', id: 'item-1' }],
        }),
        changeSet({
          id: 'cs-scratch',
          seq: 5,
          kind: 'scratch_beat_review_item',
          affected: [{ store: 'beatReviewItems', id: 'item-2' }],
        }),
      ],
      [],
    );

    expect(events.map(e => e.kind)).toEqual([
      'nudge-resolved',
      'nudge-resolved',
      'nudge-resolved',
      'nudge-resolved',
      'nudge-resolved',
    ]);
    const resolutions = events.map(e =>
      e.kind === 'nudge-resolved' ? e.payload.resolution : null,
    );
    expect(resolutions).toEqual(['accept', 'dismiss', 'edit', 'accept', 'dismiss']);
  });

  it('maps doc / tweak / ai_undo to board-meta with the right surface tag', () => {
    const events = projectLogEvents(
      [
        changeSet({
          id: 'cs-doc',
          seq: 1,
          kind: 'create_doc',
          affected: [{ store: 'docs', id: 'doc-1' }],
        }),
        changeSet({ id: 'cs-tw', seq: 2, kind: 'update_tweaks' }),
        changeSet({
          id: 'cs-undo',
          seq: 3,
          kind: 'ai_undo',
          affected: [{ store: 'ideas', id: 'idea-z' }],
        }),
      ],
      [],
    );

    const surfaces = events.map(e => (e.kind === 'board-meta' ? e.payload.surface : null));
    expect(surfaces).toEqual(['doc', 'tweaks', 'ai-undo']);
  });

  it('emits a role-run LogEvent for each beatRun, regardless of ok/fallback', () => {
    const events = projectLogEvents(
      [],
      [
        beatRun({ id: 'run-1', finishedAt: 5_000, beat: 'scout', roleId: 'scout' }),
        beatRun({
          id: 'run-2',
          finishedAt: 6_000,
          beat: 'critique',
          roleId: 'critique',
          ok: false,
          reason: 'no focus idea',
          usedFallback: true,
        }),
      ],
    );

    expect(events).toHaveLength(2);
    expect(events.every(e => e.kind === 'role-run')).toBe(true);

    const failed = events[1];
    if (failed.kind !== 'role-run') throw new Error('narrow');
    expect(failed.payload.ok).toBe(false);
    expect(failed.payload.reason).toBe('no focus idea');
    expect(failed.payload.usedFallback).toBe(true);
    expect(failed.authorRef.kind).toBe('ai');
    expect(failed.authorRef.beat).toBe('critique');
  });

  it('interleaves changeSets and beatRuns by timestamp ascending', () => {
    const events = projectLogEvents(
      [
        changeSet({ id: 'cs-late', seq: 9, kind: 'capture_idea', committedAt: 3_000 }),
        changeSet({ id: 'cs-early', seq: 1, kind: 'capture_idea', committedAt: 1_000 }),
      ],
      [
        beatRun({ id: 'run-mid', finishedAt: 2_000 }),
      ],
    );

    expect(events.map(e => e.ts)).toEqual([1_000, 2_000, 3_000]);
    expect(events.map(e => e.id)).toEqual(['cs:cs-early', 'br:run-mid', 'cs:cs-late']);
  });

  it('returns an empty array for empty inputs and does not mutate them', () => {
    const changeSets: ChangeSetRecord[] = [];
    const beatRuns: BeatRunRecord[] = [];
    const events = projectLogEvents(changeSets, beatRuns);
    expect(events).toEqual([]);
    expect(changeSets).toHaveLength(0);
    expect(beatRuns).toHaveLength(0);
  });

  it('falls back to forward-patch scanning when affected[] is missing', () => {
    const events = projectLogEvents(
      [
        changeSet({
          id: 'cs-fb',
          seq: 1,
          kind: 'capture_idea',
          affected: [],
          forward: [
            { op: 'add', path: '/stores/ideas/idea-fb', value: { id: 'idea-fb' } },
          ],
        }),
      ],
      [],
    );

    const [event] = events;
    if (event.kind !== 'idea-created') throw new Error('narrow');
    expect(event.payload.affectedIdeaIds).toEqual(['idea-fb']);
  });
});
