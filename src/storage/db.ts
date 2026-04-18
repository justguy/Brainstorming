import { openDB as idbOpenDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { Connection, Idea, IdeaCritique, IdeaGroup, SupportingDoc, ScoutSuggestion } from '../types';
import type {
  BeatRunRecord,
  BoardRecord,
  BoardTweaksRecord,
  ChangeSetRecord,
  IdeaTurnRecord,
  SettingsRecord,
} from '../board/types';

export interface Schema extends DBSchema {
  boards: {
    key: string;
    value: BoardRecord;
    indexes: {
      byUpdatedAt: number;
    };
  };
  ideas: {
    key: string;
    value: Idea;
    indexes: {
      byBoardId: string;
      byStatus: string;
      byUpdatedAt: number;
    };
  };
  groups: {
    key: string;
    value: IdeaGroup;
    indexes: {
      byBoardId: string;
      byUpdatedAt: number;
    };
  };
  docs: {
    key: string;
    value: SupportingDoc;
    indexes: {
      byBoardId: string;
      byIdeaId: string;
      byUpdatedAt: number;
    };
  };
  suggestions: {
    key: string;
    value: ScoutSuggestion;
    indexes: {
      byBoardId: string;
      byStatus: string;
      byUpdatedAt: number;
    };
  };
  critiques: {
    key: string;
    value: IdeaCritique;
    indexes: {
      byBoardId: string;
      byIdeaId: string;
      byStatus: string;
      byUpdatedAt: number;
    };
  };
  connections: {
    key: string;
    value: Connection;
    indexes: {
      byBoardId: string;
      byCreatedAt: number;
    };
  };
  turns: {
    key: string;
    value: IdeaTurnRecord;
    indexes: {
      byBoardId: string;
      byIdeaId: string;
      byCreatedAt: number;
    };
  };
  tweaks: {
    key: string;
    value: BoardTweaksRecord;
    indexes: {
      byBoardId: string;
      byUpdatedAt: number;
    };
  };
  beatRuns: {
    key: string;
    value: BeatRunRecord;
    indexes: {
      byBoardId: string;
      byFinishedAt: number;
      byFocusIdeaId: string;
    };
  };
  settings: {
    key: string;
    value: SettingsRecord;
    indexes: {
      byUpdatedAt: number;
    };
  };
  changeSets: {
    key: string;
    value: ChangeSetRecord;
    indexes: {
      byBoardId: string;
      byBoardSeq: [string, number];
      byBoardStatus: [string, string];
      byCommittedAt: number;
    };
  };
}

const DB_NAME = 'brainstorming-orchestrator';
const DB_VERSION = 9;

let _dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

export function getDb(): Promise<IDBPDatabase<Schema>> {
  if (!_dbPromise) {
    _dbPromise = idbOpenDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('ideas', { keyPath: 'id' });
          store.createIndex('byStatus', 'status');
          store.createIndex('byUpdatedAt', 'updatedAt');
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('groups')) {
            const store = db.createObjectStore('groups', { keyPath: 'id' });
            store.createIndex('byUpdatedAt', 'updatedAt');
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('docs')) {
            const store = db.createObjectStore('docs', { keyPath: 'id' });
            store.createIndex('byIdeaId', 'ideaId');
            store.createIndex('byUpdatedAt', 'updatedAt');
          }
        }
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains('suggestions')) {
            const store = db.createObjectStore('suggestions', { keyPath: 'id' });
            store.createIndex('byStatus', 'status');
            store.createIndex('byUpdatedAt', 'updatedAt');
          }
        }
        if (oldVersion < 5) {
          if (!db.objectStoreNames.contains('critiques')) {
            const store = db.createObjectStore('critiques', { keyPath: 'id' });
            store.createIndex('byIdeaId', 'ideaId');
            store.createIndex('byStatus', 'status');
            store.createIndex('byUpdatedAt', 'updatedAt');
          }
        }
        if (oldVersion < 6) {
          if (!db.objectStoreNames.contains('connections')) {
            const store = db.createObjectStore('connections', { keyPath: 'id' });
            store.createIndex('byCreatedAt', 'createdAt');
          }
        }
        if (oldVersion < 7) {
          if (!db.objectStoreNames.contains('boards')) {
            const store = db.createObjectStore('boards', { keyPath: 'id' });
            store.createIndex('byUpdatedAt', 'updatedAt');
          }
          if (!db.objectStoreNames.contains('turns')) {
            const store = db.createObjectStore('turns', { keyPath: 'id' });
            store.createIndex('byBoardId', 'boardId');
            store.createIndex('byIdeaId', 'ideaId');
            store.createIndex('byCreatedAt', 'createdAt');
          }
          if (!db.objectStoreNames.contains('tweaks')) {
            const store = db.createObjectStore('tweaks', { keyPath: 'id' });
            store.createIndex('byBoardId', 'boardId');
            store.createIndex('byUpdatedAt', 'updatedAt');
          }

          const ideas = transaction.objectStore('ideas');
          if (!ideas.indexNames.contains('byBoardId')) {
            ideas.createIndex('byBoardId', 'boardId');
          }

          const groups = transaction.objectStore('groups');
          if (!groups.indexNames.contains('byBoardId')) {
            groups.createIndex('byBoardId', 'boardId');
          }

          const docs = transaction.objectStore('docs');
          if (!docs.indexNames.contains('byBoardId')) {
            docs.createIndex('byBoardId', 'boardId');
          }

          const suggestions = transaction.objectStore('suggestions');
          if (!suggestions.indexNames.contains('byBoardId')) {
            suggestions.createIndex('byBoardId', 'boardId');
          }

          const critiques = transaction.objectStore('critiques');
          if (!critiques.indexNames.contains('byBoardId')) {
            critiques.createIndex('byBoardId', 'boardId');
          }

          const connections = transaction.objectStore('connections');
          if (!connections.indexNames.contains('byBoardId')) {
            connections.createIndex('byBoardId', 'boardId');
          }
        }
        if (oldVersion < 8) {
          if (!db.objectStoreNames.contains('changeSets')) {
            const store = db.createObjectStore('changeSets', { keyPath: 'id' });
            store.createIndex('byBoardId', 'boardId');
            store.createIndex('byBoardSeq', ['boardId', 'seq']);
            store.createIndex('byBoardStatus', ['boardId', 'status']);
            store.createIndex('byCommittedAt', 'committedAt');
          }
        }
        if (oldVersion < 9) {
          if (!db.objectStoreNames.contains('beatRuns')) {
            const store = db.createObjectStore('beatRuns', { keyPath: 'id' });
            store.createIndex('byBoardId', 'boardId');
            store.createIndex('byFinishedAt', 'finishedAt');
            store.createIndex('byFocusIdeaId', 'focusIdeaId');
          }
          if (!db.objectStoreNames.contains('settings')) {
            const store = db.createObjectStore('settings', { keyPath: 'id' });
            store.createIndex('byUpdatedAt', 'updatedAt');
          }
        }
      },
    });
  }
  return _dbPromise;
}
