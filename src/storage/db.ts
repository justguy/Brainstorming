import { openDB as idbOpenDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { Idea, IdeaCritique, IdeaGroup, SupportingDoc, ScoutSuggestion } from '../types';

export interface Schema extends DBSchema {
  ideas: {
    key: string;
    value: Idea;
    indexes: {
      byStatus: string;
      byUpdatedAt: number;
    };
  };
  groups: {
    key: string;
    value: IdeaGroup;
    indexes: {
      byUpdatedAt: number;
    };
  };
  docs: {
    key: string;
    value: SupportingDoc;
    indexes: {
      byIdeaId: string;
      byUpdatedAt: number;
    };
  };
  suggestions: {
    key: string;
    value: ScoutSuggestion;
    indexes: {
      byStatus: string;
      byUpdatedAt: number;
    };
  };
  critiques: {
    key: string;
    value: IdeaCritique;
    indexes: {
      byIdeaId: string;
      byStatus: string;
      byUpdatedAt: number;
    };
  };
}

const DB_NAME = 'brainstorming-orchestrator';
const DB_VERSION = 5;

let _dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

export function getDb(): Promise<IDBPDatabase<Schema>> {
  if (!_dbPromise) {
    _dbPromise = idbOpenDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
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
      },
    });
  }
  return _dbPromise;
}
