import { useEffect } from 'react';
import type { BoardId, Idea, SupportingDoc } from '../../src/types';
import { getDoc } from '../../src/storage/docs';

interface SupportingDocMutations {
  createDoc(input: {
    ideaId: string;
    title: string;
    rawText: string;
    actor: { type: 'tool'; source: 'webmcp' };
  }): Promise<SupportingDoc>;
  updateDoc(input: {
    docId: string;
    patch: Partial<SupportingDoc>;
    actor: { type: 'tool'; source: 'webmcp' };
    summary?: string;
  }): Promise<SupportingDoc>;
  deleteDoc(input: {
    docId: string;
    actor: { type: 'tool'; source: 'webmcp' };
  }): Promise<void>;
}

interface UseBrainstormSupportingDocEventsArgs {
  boardId: BoardId;
  ideas: Idea[];
  loadDocCounts: (ideaIds: string[]) => Promise<void>;
  markActivity: (kind: 'edit' | 'group' | 'doc') => void;
  supportingDocMutations: SupportingDocMutations;
  refineSupportingDoc: (
    doc: SupportingDoc,
    actor: { type: 'tool'; source: 'webmcp' },
  ) => Promise<SupportingDoc>;
}

export function useBrainstormSupportingDocEvents({
  boardId,
  ideas,
  loadDocCounts,
  markActivity,
  supportingDocMutations,
  refineSupportingDoc,
}: UseBrainstormSupportingDocEventsArgs): void {
  useEffect(() => {
    function emitToolCompletion(requestId?: string, detail?: Record<string, unknown>): void {
      if (!requestId) return;
      window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, { detail }));
    }

    function refreshDocCounts(ideaId?: string): void {
      markActivity('doc');
      if (ideaId) {
        void loadDocCounts([ideaId]);
        return;
      }
      void loadDocCounts(ideas.filter(idea => idea.status !== 'archived').map(idea => idea.id));
    }

    const handleDocsChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ ideaId?: string }>;
      refreshDocCounts(customEvent.detail?.ideaId);
    };

    const handleAttachSupportingDocEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ ideaId: string; title?: string; rawText: string; requestId?: string }>;
      const { ideaId, title, rawText, requestId } = customEvent.detail;
      let error: string | undefined;
      let doc: SupportingDoc | undefined;

      try {
        if (!ideaId) throw new Error('ideaId is required');
        if (!rawText || rawText.trim().length === 0) throw new Error('rawText must be non-empty');
        doc = await supportingDocMutations.createDoc({
          ideaId,
          title: title ?? '',
          rawText,
          actor: { type: 'tool', source: 'webmcp' },
        });
        window.dispatchEvent(new CustomEvent('brainstorm:docsChanged', { detail: { ideaId } }));
        doc = await refineSupportingDoc(doc, { type: 'tool', source: 'webmcp' });
        window.dispatchEvent(new CustomEvent('brainstorm:docsChanged', { detail: { ideaId } }));
      } catch (err) {
        error = err instanceof Error ? err.message : 'attach failed';
      }

      emitToolCompletion(
        requestId,
        doc
          ? {
              ok: !error,
              error,
              docId: doc.id,
              status: doc.status,
              summary: doc.summary,
              facts: doc.facts,
            }
          : { ok: !error, error },
      );
    };

    const handleDeleteSupportingDocEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ docId: string; requestId?: string }>;
      const { docId, requestId } = customEvent.detail;
      let error: string | undefined;

      try {
        const doc = await getDoc(docId);
        if (!doc) throw new Error(`no doc with id ${docId}`);
        await supportingDocMutations.deleteDoc({
          docId,
          actor: { type: 'tool', source: 'webmcp' },
        });
        window.dispatchEvent(new CustomEvent('brainstorm:docsChanged', { detail: { ideaId: doc.ideaId } }));
      } catch (err) {
        error = err instanceof Error ? err.message : 'delete failed';
      }

      emitToolCompletion(requestId, { ok: !error, error });
    };

    const handleRetrySupportingDocEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<{ docId: string; requestId?: string }>;
      const { docId, requestId } = customEvent.detail;
      let error: string | undefined;
      let doc: SupportingDoc | undefined;

      try {
        const current = await getDoc(docId);
        if (!current) throw new Error(`no doc with id ${docId}`);
        doc = await supportingDocMutations.updateDoc({
          docId,
          patch: { status: 'processing', error: undefined },
          actor: { type: 'tool', source: 'webmcp' },
          summary: `Retried extraction for ${current.title}`,
        });
        window.dispatchEvent(new CustomEvent('brainstorm:docsChanged', { detail: { ideaId: current.ideaId } }));
        doc = await refineSupportingDoc(doc, { type: 'tool', source: 'webmcp' });
        window.dispatchEvent(new CustomEvent('brainstorm:docsChanged', { detail: { ideaId: current.ideaId } }));
      } catch (err) {
        error = err instanceof Error ? err.message : 'retry failed';
      }

      emitToolCompletion(
        requestId,
        doc
          ? {
              ok: !error,
              error,
              docId: doc.id,
              status: doc.status,
              summary: doc.summary,
              facts: doc.facts,
            }
          : { ok: !error, error },
      );
    };

    const listeners: Array<[string, EventListener]> = [
      ['brainstorm:docsChanged', handleDocsChanged as EventListener],
      ['brainstorm:attachSupportingDoc', handleAttachSupportingDocEvent as EventListener],
      ['brainstorm:deleteSupportingDoc', handleDeleteSupportingDocEvent as EventListener],
      ['brainstorm:retrySupportingDoc', handleRetrySupportingDocEvent as EventListener],
    ];

    listeners.forEach(([name, listener]) => window.addEventListener(name, listener));
    return () => {
      listeners.forEach(([name, listener]) => window.removeEventListener(name, listener));
    };
  }, [boardId, ideas, loadDocCounts, markActivity, supportingDocMutations, refineSupportingDoc]);
}
