import { describe, expect, it } from 'vitest';
import { formatRoute, parseRoute, type RouteState } from './parseRoute';

describe('parseRoute', () => {
  describe('home', () => {
    it('treats the empty hash as home with no project', () => {
      expect(parseRoute('')).toEqual({ kind: 'home', projectId: null });
    });

    it('treats a bare # as home with no project', () => {
      expect(parseRoute('#')).toEqual({ kind: 'home', projectId: null });
    });

    it('treats #/ as home with no project', () => {
      expect(parseRoute('#/')).toEqual({ kind: 'home', projectId: null });
    });

    it('parses #/p/:projectId as home with a project', () => {
      expect(parseRoute('#/p/local-project')).toEqual({
        kind: 'home',
        projectId: 'local-project',
      });
    });

    it('decodes percent-encoded project ids', () => {
      expect(parseRoute('#/p/my%20proj')).toEqual({
        kind: 'home',
        projectId: 'my proj',
      });
    });
  });

  describe('board', () => {
    it('parses #/b/:boardId without an idea param', () => {
      expect(parseRoute('#/b/local-board')).toEqual({
        kind: 'board',
        boardId: 'local-board',
        ideaId: null,
      });
    });

    it('parses #/b/:boardId?idea=:ideaId', () => {
      expect(parseRoute('#/b/local-board?idea=abc-123')).toEqual({
        kind: 'board',
        boardId: 'local-board',
        ideaId: 'abc-123',
      });
    });

    it('returns a null ideaId when the query has no idea param', () => {
      expect(parseRoute('#/b/local-board?other=1')).toEqual({
        kind: 'board',
        boardId: 'local-board',
        ideaId: null,
      });
    });
  });

  describe('map', () => {
    it('parses #/b/:boardId/map', () => {
      expect(parseRoute('#/b/local-board/map')).toEqual({
        kind: 'map',
        boardId: 'local-board',
      });
    });
  });

  describe('brief', () => {
    it('parses #/b/:boardId/brief/:ideaId', () => {
      expect(parseRoute('#/b/local-board/brief/idea-7')).toEqual({
        kind: 'brief',
        boardId: 'local-board',
        ideaId: 'idea-7',
      });
    });
  });

  describe('log', () => {
    it('parses #/b/:boardId/log', () => {
      expect(parseRoute('#/b/local-board/log')).toEqual({
        kind: 'log',
        boardId: 'local-board',
      });
    });
  });

  describe('handoff', () => {
    it('parses #/b/:boardId/handoff/:briefId', () => {
      expect(parseRoute('#/b/local-board/handoff/brief-9')).toEqual({
        kind: 'handoff',
        boardId: 'local-board',
        briefId: 'brief-9',
      });
    });
  });

  describe('options', () => {
    it('parses #/options', () => {
      expect(parseRoute('#/options')).toEqual({ kind: 'options' });
    });
  });

  describe('unknown', () => {
    it('returns unknown for arbitrary garbage', () => {
      expect(parseRoute('#/wat/is/this')).toEqual({
        kind: 'unknown',
        raw: '#/wat/is/this',
      });
    });

    it('returns unknown for a path that almost matches but is malformed', () => {
      // Trailing path component the table does not define.
      expect(parseRoute('#/b/local-board/handoff/')).toEqual({
        kind: 'unknown',
        raw: '#/b/local-board/handoff/',
      });
    });

    it('returns unknown for #/p/ with empty project id', () => {
      expect(parseRoute('#/p/')).toEqual({
        kind: 'unknown',
        raw: '#/p/',
      });
    });

    it('coerces a non-string input to unknown', () => {
      // Defensive: window.location.hash is always a string in practice, but
      // parseRoute should fall through to unknown for truly malformed input.
      // @ts-expect-error -- intentional: exercise the runtime guard.
      expect(parseRoute(null)).toEqual({ kind: 'unknown', raw: 'null' });
    });
  });
});

describe('formatRoute (round-trip)', () => {
  const cases: Array<{ name: string; route: RouteState; hash: string }> = [
    {
      name: 'home (no project)',
      route: { kind: 'home', projectId: null },
      hash: '',
    },
    {
      name: 'home (project)',
      route: { kind: 'home', projectId: 'local-project' },
      hash: '#/p/local-project',
    },
    {
      name: 'board (no idea)',
      route: { kind: 'board', boardId: 'local-board', ideaId: null },
      hash: '#/b/local-board',
    },
    {
      name: 'board (with idea)',
      route: { kind: 'board', boardId: 'local-board', ideaId: 'abc-123' },
      hash: '#/b/local-board?idea=abc-123',
    },
    {
      name: 'brief',
      route: { kind: 'brief', boardId: 'local-board', ideaId: 'idea-7' },
      hash: '#/b/local-board/brief/idea-7',
    },
    {
      name: 'handoff',
      route: { kind: 'handoff', boardId: 'local-board', briefId: 'brief-9' },
      hash: '#/b/local-board/handoff/brief-9',
    },
    {
      name: 'log',
      route: { kind: 'log', boardId: 'local-board' },
      hash: '#/b/local-board/log',
    },
    {
      name: 'map',
      route: { kind: 'map', boardId: 'local-board' },
      hash: '#/b/local-board/map',
    },
    {
      name: 'options',
      route: { kind: 'options' },
      hash: '#/options',
    },
  ];

  for (const { name, route, hash } of cases) {
    it(`round-trips ${name}`, () => {
      expect(formatRoute(route)).toBe(hash);
      expect(parseRoute(hash)).toEqual(route);
    });
  }
});
