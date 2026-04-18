import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { DEFAULT_BOARD_ID } from '../board/types';
import type { BoardId, Idea } from '../types';
import { getDb } from './db';

const REMOTE_SYNC_ORIGIN = 'brainstorm-yjs-remote';

interface IdeaSyncController {
  boardId: BoardId;
  doc: Y.Doc;
  ideasMap: Y.Map<Idea>;
  channel: BroadcastChannel;
  persistence: IndexeddbPersistence;
  readyPromise: Promise<void>;
  initialized: boolean;
  syncQueue: Promise<void>;
}

const controllers = new Map<BoardId, IdeaSyncController>();

export function startIdeaSync(boardId: BoardId = DEFAULT_BOARD_ID): void {
  getIdeaSyncController(boardId);
}

export async function publishIdeaRow(idea: Idea): Promise<void> {
  await publishIdeaRows([idea], idea.boardId ?? DEFAULT_BOARD_ID);
}

export async function publishIdeaRows(
  ideas: Idea[],
  boardId: BoardId = DEFAULT_BOARD_ID,
): Promise<void> {
  if (ideas.length === 0) return;
  const controller = getIdeaSyncController(boardId);
  if (!controller) return;
  await controller.readyPromise;
  controller.doc.transact(() => {
    for (const idea of ideas) {
      controller.ideasMap.set(idea.id, idea);
    }
  }, 'brainstorm-yjs-local');
}

export async function deleteIdeaRow(boardId: BoardId = DEFAULT_BOARD_ID, ideaId: string): Promise<void> {
  const controller = getIdeaSyncController(boardId);
  if (!controller) return;
  await controller.readyPromise;
  controller.doc.transact(() => {
    controller.ideasMap.delete(ideaId);
  }, 'brainstorm-yjs-local');
}

function getIdeaSyncController(boardId: BoardId): IdeaSyncController | null {
  if (!supportsIdeaSync()) return null;
  const existing = controllers.get(boardId);
  if (existing) return existing;

  const doc = new Y.Doc();
  const ideasMap = doc.getMap<Idea>('ideas');
  const channel = new BroadcastChannel(`brainstorm-sync:${boardId}`);
  const persistence = new IndexeddbPersistence(`brainstorming-orchestrator:yjs:${boardId}`, doc);
  const controller: IdeaSyncController = {
    boardId,
    doc,
    ideasMap,
    channel,
    persistence,
    readyPromise: Promise.resolve(),
    initialized: false,
    syncQueue: Promise.resolve(),
  };

  channel.onmessage = event => {
    const update = normalizeUpdate(event.data);
    if (!update) return;
    Y.applyUpdate(doc, update, REMOTE_SYNC_ORIGIN);
  };

  doc.on('update', (update, origin) => {
    if (origin === REMOTE_SYNC_ORIGIN) return;
    channel.postMessage(update);
  });

  ideasMap.observe(() => {
    if (!controller.initialized) return;
    queueSync(controller, { removeMissing: true });
  });

  controller.readyPromise = new Promise<void>((resolve) => {
    persistence.on('synced', () => {
      void reconcileInitialState(controller).finally(() => {
        controller.initialized = true;
        resolve();
      });
    });
  });

  controllers.set(boardId, controller);
  return controller;
}

function queueSync(
  controller: IdeaSyncController,
  options: { removeMissing: boolean },
): void {
  controller.syncQueue = controller.syncQueue
    .then(() => syncIdeasFromDoc(controller, options))
    .catch((err) => {
      console.error('[ideaSync] failed to sync ideas from Yjs:', err);
    });
}

async function reconcileInitialState(controller: IdeaSyncController): Promise<void> {
  const db = await getDb();
  const localIdeas = await db.getAllFromIndex('ideas', 'byBoardId', controller.boardId);
  const remoteIdeas = readIdeasFromMap(controller.ideasMap);
  const localById = new Map(localIdeas.map(idea => [idea.id, idea]));
  let wroteLocal = false;
  let needsRemoteSeed = false;

  for (const [id, remoteIdea] of remoteIdeas) {
    const localIdea = localById.get(id);
    if (!localIdea || remoteIdea.updatedAt > localIdea.updatedAt) {
      await db.put('ideas', remoteIdea);
      wroteLocal = true;
    } else if (localIdea.updatedAt > remoteIdea.updatedAt) {
      needsRemoteSeed = true;
    }
    localById.delete(id);
  }

  if (localById.size > 0) {
    needsRemoteSeed = true;
  }

  if (needsRemoteSeed) {
    controller.doc.transact(() => {
      for (const idea of localIdeas) {
        const remoteIdea = remoteIdeas.get(idea.id);
        if (!remoteIdea || idea.updatedAt >= remoteIdea.updatedAt) {
          controller.ideasMap.set(idea.id, idea);
        }
      }
    }, 'brainstorm-yjs-bootstrap');
  }

  if (wroteLocal) {
    dispatchIdeasChanged(controller.boardId);
  }
}

async function syncIdeasFromDoc(
  controller: IdeaSyncController,
  options: { removeMissing: boolean },
): Promise<void> {
  const db = await getDb();
  const remoteIdeas = readIdeasFromMap(controller.ideasMap);
  const localIdeas = await db.getAllFromIndex('ideas', 'byBoardId', controller.boardId);
  const localById = new Map(localIdeas.map(idea => [idea.id, idea]));
  let changed = false;

  for (const [id, remoteIdea] of remoteIdeas) {
    const localIdea = localById.get(id);
    if (!localIdea || remoteIdea.updatedAt > localIdea.updatedAt) {
      await db.put('ideas', remoteIdea);
      changed = true;
    }
    localById.delete(id);
  }

  if (options.removeMissing) {
    for (const [id, localIdea] of localById) {
      await db.delete('ideas', id);
      changed = true;
      if (localIdea.id === id) {
        // no-op guard for readability; deletion is already applied above
      }
    }
  }

  if (changed) {
    dispatchIdeasChanged(controller.boardId);
  }
}

function readIdeasFromMap(ideasMap: Y.Map<Idea>): Map<string, Idea> {
  const ideas = new Map<string, Idea>();
  ideasMap.forEach((value, key) => {
    ideas.set(key, value);
  });
  return ideas;
}

function dispatchIdeasChanged(boardId: BoardId): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('brainstorm:ideasChanged', { detail: { boardId } }));
}

function normalizeUpdate(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value);
  return null;
}

function supportsIdeaSync(): boolean {
  return typeof BroadcastChannel !== 'undefined' && typeof indexedDB !== 'undefined';
}
