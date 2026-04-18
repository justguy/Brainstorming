/**
 * DocsModal — paste-and-refine workflow for attaching supporting documentation
 * to an idea.
 *
 * Flow:
 *   1. User pastes a title + body.
 *   2. Doc is saved with status 'processing'.
 *   3. The docFactExtractor role runs ad-hoc; result populates summary + facts.
 *   4. Status flips to 'ready' (or 'failed' with an error message).
 *   5. Ready facts are injected into every future phase prompt for this idea via
 *      ctmcp.payloadToMessages.
 *
 * Intentionally text-paste only for now (no file parsing). Keep it simple and
 * let it evolve.
 */

import React, { useEffect, useState } from 'react';
import type { ChangeActor } from '../board/types';
import type { BoardId, SupportingDoc } from '../types';
import {
  listDocsForIdea,
} from '../storage/docs';
import { runAdhocRole } from '../orchestrator/adhocRole';
import {
  docFactExtractor,
  buildDocFactExtractorTask,
  type DocFactExtractorOutput,
} from '../orchestrator/roles/docFactExtractor';
import Button from '../ui/Button';

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

export interface DocsModalProps {
  boardId: BoardId;
  ideaId: string;
  ideaTitle: string;
  open: boolean;
  onClose: () => void;
  /** Called whenever the doc count changes so the caller can refresh its badge. */
  onDocsChanged?: (ideaId: string, count: number) => void;
  docMutations: SupportingDocMutations;
}

export default function DocsModal({
  boardId,
  ideaId,
  ideaTitle,
  open,
  onClose,
  onDocsChanged,
  docMutations,
}: DocsModalProps): React.ReactElement | null {
  const [docs, setDocs] = useState<SupportingDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formText, setFormText] = useState('');
  const [saving, setSaving] = useState(false);

  async function reload(): Promise<void> {
    if (!open) return;
    setLoading(true);
    try {
      const list = await listDocsForIdea(ideaId, boardId);
      setDocs(list);
      onDocsChanged?.(ideaId, list.length);
    } catch (err) {
      console.error('[DocsModal] reload failed:', err);
    } finally {
      setLoading(false);
    }
  }

  function broadcastChange(): void {
    window.dispatchEvent(new CustomEvent('brainstorm:docsChanged', { detail: { ideaId } }));
  }

  useEffect(() => {
    if (open) {
      reload();
      setFormTitle('');
      setFormText('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ideaId, boardId]);

  // If an agent (or another surface) mutates docs for this idea, refresh the list.
  useEffect(() => {
    if (!open) return;
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ ideaId?: string }>;
      if (!ev.detail?.ideaId || ev.detail.ideaId === ideaId) reload();
    };
    window.addEventListener('brainstorm:docsChanged', handler as EventListener);
    return () => window.removeEventListener('brainstorm:docsChanged', handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ideaId, boardId]);

  async function refineDoc(doc: SupportingDoc, actor: ChangeActor): Promise<void> {
    try {
      const task = buildDocFactExtractorTask(doc.title, doc.rawText);
      const { result } = await runAdhocRole<DocFactExtractorOutput>(docFactExtractor, task);
      if (!result) {
        await docMutations.updateDoc({
          docId: doc.id,
          patch: { status: 'failed', error: 'Extractor returned no result. Try editing the text and re-saving.' },
          actor,
        });
      } else {
        await docMutations.updateDoc({
          docId: doc.id,
          patch: { status: 'ready', summary: result.summary, facts: result.facts, error: undefined },
          actor,
        });
      }
    } catch (err) {
      console.error('[DocsModal] refineDoc failed:', err);
      await docMutations.updateDoc({
        docId: doc.id,
        patch: { status: 'failed', error: err instanceof Error ? err.message : 'Extraction failed.' },
        actor,
      });
    }
    await reload();
    broadcastChange();
  }

  async function handleSave(): Promise<void> {
    const text = formText.trim();
    if (!text) return;
    setSaving(true);
    try {
      const doc = await docMutations.createDoc({
        ideaId,
        title: formTitle,
        rawText: text,
        actor: { type: 'user', source: 'canvas' },
      });
      setFormTitle('');
      setFormText('');
      await reload();
      broadcastChange();
      // Kick off refinement (non-blocking from the modal's perspective — reload picks up status flip)
      void refineDoc(doc, { type: 'user', source: 'canvas' });
    } catch (err) {
      console.error('[DocsModal] save failed:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleRetry(doc: SupportingDoc): Promise<void> {
    try {
      const updated = await docMutations.updateDoc({
        docId: doc.id,
        patch: { status: 'processing', error: undefined },
        actor: { type: 'user', source: 'canvas' },
        summary: `Retried extraction for ${doc.title}`,
      });
      broadcastChange();
      void reload();
      void refineDoc(updated, { type: 'user', source: 'canvas' });
    } catch (err) {
      console.error('[DocsModal] retry failed:', err);
    }
  }

  async function handleDelete(doc: SupportingDoc): Promise<void> {
    if (!window.confirm(`Delete "${doc.title}"? Its facts will no longer be used in prompts.`)) return;
    try {
      await docMutations.deleteDoc({
        docId: doc.id,
        actor: { type: 'user', source: 'canvas' },
      });
      await reload();
      broadcastChange();
    } catch (err) {
      console.error('[DocsModal] delete failed:', err);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="docs-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] bg-white rounded-lg shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="shrink-0 flex items-start justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h2 id="docs-modal-title" className="text-sm font-semibold text-gray-900">
              Supporting docs
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-md">for “{ideaTitle}”</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none focus:outline-none focus:ring-2 focus:ring-violet-400 rounded"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Existing docs */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">
              Attached ({docs.length})
            </h3>
            {loading && <p className="text-xs text-gray-400">Loading…</p>}
            {!loading && docs.length === 0 && (
              <p className="text-xs text-gray-500 italic">
                No supporting docs yet. Paste wiki excerpts, PRD slices, meeting notes — anything
                that gives the orchestrator real context for this idea.
              </p>
            )}
            <ul className="space-y-2">
              {docs.map(doc => (
                <li
                  key={doc.id}
                  className="rounded-md border border-gray-200 bg-gray-50/50 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{doc.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <StatusBadge status={doc.status} />
                        {doc.status === 'ready' && (
                          <span className="text-[11px] text-gray-500">
                            {doc.facts.length} fact{doc.facts.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {doc.status === 'failed' && (
                        <button
                          type="button"
                          onClick={() => handleRetry(doc)}
                          className="text-xs text-violet-700 hover:underline focus:outline-none focus:ring-2 focus:ring-violet-400 rounded px-1"
                        >
                          Retry
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(doc)}
                        className="text-xs text-red-600 hover:underline focus:outline-none focus:ring-2 focus:ring-red-400 rounded px-1"
                        aria-label={`Delete ${doc.title}`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {doc.status === 'ready' && doc.summary && (
                    <p className="text-xs text-gray-700 mt-2">{doc.summary}</p>
                  )}
                  {doc.status === 'ready' && doc.facts.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {doc.facts.map((f, i) => (
                        <li key={i} className="text-xs text-gray-600 pl-3 relative">
                          <span className="absolute left-0 top-1.5 h-1 w-1 rounded-full bg-violet-400" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                  {doc.status === 'failed' && doc.error && (
                    <p className="text-xs text-red-700 mt-2">{doc.error}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* Paste form */}
          <section className="border-t border-gray-200 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">
              Add a doc
            </h3>
            <div className="space-y-2">
              <input
                type="text"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="Title (optional — we'll take the first line if blank)"
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                aria-label="Doc title"
              />
              <textarea
                value={formText}
                onChange={e => setFormText(e.target.value)}
                placeholder="Paste text here — PRD excerpts, meeting notes, research summaries, verbatim quotes. Capped at ~8k chars per doc."
                rows={10}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y font-mono"
                aria-label="Doc body"
              />
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-gray-400">
                  {formText.length.toLocaleString()} chars
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !formText.trim()}
                >
                  {saving ? 'Saving…' : 'Save & refine'}
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: SupportingDoc['status'] }): React.ReactElement {
  if (status === 'processing') {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">
        Refining…
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wide bg-red-100 text-red-800 rounded px-1.5 py-0.5">
        Failed
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-800 rounded px-1.5 py-0.5">
      Ready
    </span>
  );
}
