import { openDB as idbOpenDB, type IDBPDatabase, type DBSchema } from 'idb';
import type {
  Brief,
  Connection,
  Idea,
  IdeaCritique,
  IdeaGroup,
  Persona,
  Project,
  SupportingDoc,
  ScoutSuggestion,
} from '../types';
import type {
  BeatReviewItemRecord,
  BeatReviewSessionRecord,
  BeatRunRecord,
  BoardRecord,
  BoardTweaksRecord,
  ChangeSetRecord,
  IdeaTurnRecord,
  SettingsRecord,
} from '../board/types';

export interface Schema extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: {
      byUpdatedAt: number;
    };
  };
  personas: {
    key: string;
    value: Persona;
    indexes: {
      byUpdatedAt: number;
      byScope: string;
    };
  };
  briefs: {
    key: string;
    value: Brief;
    indexes: {
      byBoardId: string;
      byIdeaId: string;
      byUpdatedAt: number;
    };
  };
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
  beatReviewSessions: {
    key: string;
    value: BeatReviewSessionRecord;
    indexes: {
      byBoardId: string;
      byBeatRunId: string;
      byStatus: string;
      byUpdatedAt: number;
    };
  };
  beatReviewItems: {
    key: string;
    value: BeatReviewItemRecord;
    indexes: {
      byBoardId: string;
      bySessionId: string;
      byBeatRunId: string;
      byStatus: string;
      byUpdatedAt: number;
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
const DB_VERSION = 11;

// M0 / bo-102: project layer back-fill defaults. These constants are
// duplicated (intentionally) from src/storage/projects.ts so the upgrade
// callback can run without importing IDB-using code (avoids cycles during
// upgrade transactions).
const DEFAULT_PROJECT_ID = 'local-project';
const DEFAULT_PROJECT_TITLE = 'My workspace';
const DEFAULT_AUTONOMY_DIAL = 'active';

let _dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

/** Test-only: drop the cached DB promise so a follow-up `getDb()` reopens. */
export function __resetDbForTests(): void {
  _dbPromise = null;
}

export function getDb(): Promise<IDBPDatabase<Schema>> {
  if (!_dbPromise) {
    _dbPromise = idbOpenDB<Schema>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
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
        if (oldVersion < 10) {
          if (!db.objectStoreNames.contains('beatReviewSessions')) {
            const store = db.createObjectStore('beatReviewSessions', { keyPath: 'id' });
            store.createIndex('byBoardId', 'boardId');
            store.createIndex('byBeatRunId', 'beatRunId');
            store.createIndex('byStatus', 'status');
            store.createIndex('byUpdatedAt', 'updatedAt');
          }
          if (!db.objectStoreNames.contains('beatReviewItems')) {
            const store = db.createObjectStore('beatReviewItems', { keyPath: 'id' });
            store.createIndex('byBoardId', 'boardId');
            store.createIndex('bySessionId', 'sessionId');
            store.createIndex('byBeatRunId', 'beatRunId');
            store.createIndex('byStatus', 'status');
            store.createIndex('byUpdatedAt', 'updatedAt');
          }
        }
        if (oldVersion < 11) {
          // M0 / bo-102: introduce Project layer + Persona + Brief stores.
          if (!db.objectStoreNames.contains('projects')) {
            const store = db.createObjectStore('projects', { keyPath: 'id' });
            store.createIndex('byUpdatedAt', 'updatedAt');
          }
          if (!db.objectStoreNames.contains('personas')) {
            const store = db.createObjectStore('personas', { keyPath: 'id' });
            store.createIndex('byUpdatedAt', 'updatedAt');
            store.createIndex('byScope', 'scope');
          }
          if (!db.objectStoreNames.contains('briefs')) {
            const store = db.createObjectStore('briefs', { keyPath: 'id' });
            store.createIndex('byBoardId', 'boardId');
            store.createIndex('byIdeaId', 'ideaId');
            store.createIndex('byUpdatedAt', 'updatedAt');
          }

          // Seed the default project + back-fill `projectId` on existing boards.
          // Done inside the upgrade transaction so it's atomic with the schema
          // change. No back-fill of briefs (per IMPLEMENTATION_PLAN §2). Persona
          // seeding is deferred to bo-120's seedBuiltInPersonas at app boot.
          const now = Date.now();
          const projectsStore = transaction.objectStore('projects');
          const existingDefault = await projectsStore.get(DEFAULT_PROJECT_ID);
          if (!existingDefault) {
            await projectsStore.put({
              id: DEFAULT_PROJECT_ID,
              title: DEFAULT_PROJECT_TITLE,
              autonomyDial: DEFAULT_AUTONOMY_DIAL,
              createdAt: now,
              updatedAt: now,
            } as Project);
          }

          if (db.objectStoreNames.contains('boards')) {
            const boardsStore = transaction.objectStore('boards');
            const allBoards = await boardsStore.getAll();
            for (const board of allBoards) {
              if (!board.projectId) {
                await boardsStore.put({ ...board, projectId: DEFAULT_PROJECT_ID });
              }
            }
          }
        }
      },
    });
  }
  return _dbPromise;
}
