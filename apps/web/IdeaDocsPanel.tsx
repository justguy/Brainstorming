import React, { useEffect, useState } from 'react';
import type { ChangeActor } from '../../src/board/types';
import { listDocsForIdea } from '../../src/storage/docs';
import type { BoardId, Idea, SupportingDoc } from '../../src/types';

interface SupportingDocMutations {
  createDoc(input: { ideaId: string; title: string; rawText: string; actor: ChangeActor }): Promise<SupportingDoc>;
  updateDoc(input: {
    docId: string;
    patch: Partial<SupportingDoc>;
    actor: ChangeActor;
    summary?: string;
  }): Promise<SupportingDoc>;
  deleteDoc(input: { docId: string; actor: ChangeActor }): Promise<void>;
}

interface IdeaDocsPanelProps {
  boardId: BoardId;
  idea: Idea | null;
  open: boolean;
  onClose: () => void;
  onDocsChanged?: (ideaId: string, count: number) => void;
  docMutations: SupportingDocMutations;
  refineDoc: (doc: SupportingDoc, actor: ChangeActor) => Promise<SupportingDoc>;
}

export function IdeaDocsPanel({
  boardId,
  idea,
  open,
  onClose,
  onDocsChanged,
  docMutations,
  refineDoc,
}: IdeaDocsPanelProps): React.ReactElement | null {
  const [docs, setDocs] = useState<SupportingDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ideaId = idea?.id ?? null;

  useEffect(() => {
    const currentIdeaId = ideaId;
    if (!open || !currentIdeaId) return;
    const stableIdeaId: string = currentIdeaId;
    let active = true;

    async function reload(): Promise<void> {
      setLoading(true);
      try {
        const nextDocs = await listDocsForIdea(stableIdeaId, boardId);
        if (!active) return;
        setDocs(nextDocs);
        onDocsChanged?.(stableIdeaId, nextDocs.length);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load docs.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void reload();
    setTitle('');
    setBody('');
    setError(null);
    return () => {
      active = false;
    };
  }, [boardId, ideaId, onDocsChanged, open]);

  if (!open || !idea) return null;

  const currentIdea = idea;

  async function reloadDocs(): Promise<void> {
    const nextDocs = await listDocsForIdea(currentIdea.id, boardId);
    setDocs(nextDocs);
    onDocsChanged?.(currentIdea.id, nextDocs.length);
  }

  async function handleSave(): Promise<void> {
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const doc = await docMutations.createDoc({
        ideaId: currentIdea.id,
        title,
        rawText: body.trim(),
        actor: { type: 'user', source: 'canvas' },
      });
      await reloadDocs();
      setTitle('');
      setBody('');
      void refineDoc(doc, { type: 'user', source: 'canvas' }).then(() => {
        void reloadDocs();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save supporting doc.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRetry(doc: SupportingDoc): Promise<void> {
    setError(null);
    try {
      const updated = await docMutations.updateDoc({
        docId: doc.id,
        patch: { status: 'processing', error: undefined },
        actor: { type: 'user', source: 'canvas' },
        summary: `Retried extraction for ${doc.title}`,
      });
      await reloadDocs();
      void refineDoc(updated, { type: 'user', source: 'canvas' }).then(() => {
        void reloadDocs();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry doc extraction.');
    }
  }

  async function handleDelete(docId: string): Promise<void> {
    setError(null);
    try {
      await docMutations.deleteDoc({
        docId,
        actor: { type: 'user', source: 'canvas' },
      });
      await reloadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete supporting doc.');
    }
  }

  return (
    <aside className="bo-idea-docs-panel bo-elevated-panel" aria-label="Supporting docs">
      <div className="bo-turn-log-panel__header">
        <div className="min-w-0">
          <p className="bo-shell-eyebrow">Supporting docs</p>
          <h2 className="mt-1 text-sm font-semibold text-slate-900">
            {currentIdea.rawText.slice(0, 64)}{currentIdea.rawText.length > 64 ? '…' : ''}
          </h2>
        </div>
        <button type="button" onClick={onClose} className="bo-shell-action">
          Dismiss
        </button>
      </div>

      <div className="bo-turn-log-panel__body">
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="bo-shell-eyebrow">Attached</p>
            <span className="text-[11px] text-slate-500">{docs.length}</span>
          </div>
          {loading && <p className="text-sm text-slate-500">Loading docs…</p>}
          {!loading && docs.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white/75 px-4 py-4 text-sm text-slate-500">
              No supporting docs yet. Paste a spec slice, notes, or source text here to ground this idea.
            </p>
          )}
          {docs.map(doc => (
            <article key={doc.id} className="bo-turn-entry">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{doc.title}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {doc.status === 'processing' ? 'Refining' : doc.status === 'failed' ? 'Needs retry' : `${doc.facts.length} facts ready`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {doc.status === 'failed' && (
                    <button type="button" onClick={() => { void handleRetry(doc); }} className="bo-shell-action">
                      Retry
                    </button>
                  )}
                  <button type="button" onClick={() => { void handleDelete(doc.id); }} className="bo-shell-action">
                    Delete
                  </button>
                </div>
              </div>
              {doc.summary && (
                <p className="mt-2 text-sm leading-6 text-slate-700">{doc.summary}</p>
              )}
            </article>
          ))}
        </section>

        <section className="space-y-2">
          <p className="bo-shell-eyebrow">Add doc</p>
          <input
            type="text"
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="Optional title"
            className="bo-doc-input"
          />
          <textarea
            value={body}
            onChange={event => setBody(event.target.value)}
            placeholder="Paste research notes, PRD text, meeting notes, or source excerpts."
            rows={8}
            className="bo-doc-textarea"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500">{body.length.toLocaleString()} chars</span>
            <button type="button" onClick={() => { void handleSave(); }} disabled={saving || !body.trim()} className="bo-shell-action">
              {saving ? 'Saving…' : 'Save & refine'}
            </button>
          </div>
        </section>

        {error && (
          <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}
