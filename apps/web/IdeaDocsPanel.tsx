import React, { useEffect, useRef, useState } from 'react';
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

/*
 * Supporting-docs overlay — paper/sketch restyle.
 *
 * - Root is a paper-backed aside on the right rail with 2px ink border +
 *   hand-shadow.
 * - Header gives a JetBrains-Mono eyebrow + a Caveat-styled idea title.
 * - Each attached doc is a paper-dark sub-card with 1px ink border.
 * - Inputs use cream paper + 1.5px ink border + hand shadow so they read as
 *   pinned slips on the board.
 * - Status note uses uppercase mono caps; failed docs show a contradicts
 *   accent badge.
 * - Buttons all use `.btn.sm.ghost` (per-doc actions) or `.btn.sm.primary`
 *   (save). Close uses `.icon-btn`.
 * - Error toast uses `--accent-contradicts` border on paper.
 */
const PANEL_STYLE: React.CSSProperties = {
  position: 'absolute',
  right: 24,
  top: 24,
  bottom: 24,
  zIndex: 22,
  width: 'min(420px, calc(100% - 3rem))',
  maxWidth: '100%',
  background: 'var(--paper)',
  border: '2px solid var(--ink)',
  borderRadius: 14,
  boxShadow: '3px 3px 0 var(--ink)',
  pointerEvents: 'auto',
  color: 'var(--ink)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const HEADER_STYLE: React.CSSProperties = {
  borderBottom: '1.5px solid var(--ink)',
  padding: '14px 16px',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
};

const EYEBROW_STYLE: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  color: 'var(--ink-faint)',
};

const TITLE_STYLE: React.CSSProperties = {
  margin: '4px 0 0',
  fontFamily: 'var(--f-hand)',
  fontSize: 22,
  lineHeight: 1.1,
  color: 'var(--ink)',
};

const BODY_STYLE: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
};

const SECTION_HEAD_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  marginBottom: 8,
};

const COUNT_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--ink-faint)',
};

const DOC_CARD_STYLE: React.CSSProperties = {
  background: 'var(--paper-dark)',
  border: '1px solid var(--ink)',
  borderRadius: 10,
  padding: '10px 12px',
  marginBottom: 8,
  color: 'var(--ink)',
};

const DOC_TITLE_STYLE: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--f-hand-body)',
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.3,
  color: 'var(--ink)',
};

const DOC_STATUS_BASE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  marginTop: 4,
  padding: '1px 7px',
  borderRadius: 4,
  border: '1px solid var(--ink)',
  background: 'var(--paper)',
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--ink)',
};

const DOC_STATUS_FAILED: React.CSSProperties = {
  ...DOC_STATUS_BASE,
  borderColor: 'var(--accent-contradicts)',
  color: 'var(--accent-contradicts)',
};

const DOC_SUMMARY_STYLE: React.CSSProperties = {
  margin: '8px 0 0',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 13.5,
  lineHeight: 1.5,
  color: 'var(--ink)',
};

const EMPTY_STYLE: React.CSSProperties = {
  padding: '14px 16px',
  borderRadius: 12,
  border: '1.5px dashed var(--ink)',
  background: 'var(--paper)',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 13,
  color: 'var(--ink-soft)',
};

const LOADING_STYLE: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--f-hand-body)',
  fontSize: 14,
  color: 'var(--ink-soft)',
};

const ERROR_STYLE: React.CSSProperties = {
  margin: 0,
  padding: '8px 12px',
  borderRadius: 10,
  border: '1.5px solid var(--accent-contradicts)',
  background: 'var(--paper)',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 13,
  color: 'var(--accent-contradicts)',
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1.5px solid var(--ink)',
  borderRadius: 8,
  background: 'var(--paper)',
  fontFamily: 'var(--f-hand-body)',
  fontSize: 14,
  color: 'var(--ink)',
  boxShadow: '1.5px 1.5px 0 var(--ink)',
};

const TEXTAREA_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  minHeight: 140,
  resize: 'vertical',
  lineHeight: 1.5,
};

const FORM_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  marginTop: 8,
};

const CHAR_COUNT_STYLE: React.CSSProperties = {
  fontFamily: 'var(--f-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--ink-faint)',
};

const DOC_ACTIONS_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const DOC_HEAD_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 10,
};

function describeStatus(doc: SupportingDoc): { label: string; failed: boolean } {
  if (doc.status === 'processing') return { label: 'Refining', failed: false };
  if (doc.status === 'failed') return { label: 'Needs retry', failed: true };
  return { label: `${doc.facts.length} facts ready`, failed: false };
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
  const onDocsChangedRef = useRef(onDocsChanged);

  useEffect(() => {
    onDocsChangedRef.current = onDocsChanged;
  }, [onDocsChanged]);

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
        onDocsChangedRef.current?.(stableIdeaId, nextDocs.length);
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
  }, [boardId, ideaId, open]);

  if (!open || !idea) return null;

  const currentIdea = idea;

  async function reloadDocs(): Promise<void> {
    const nextDocs = await listDocsForIdea(currentIdea.id, boardId);
    setDocs(nextDocs);
    onDocsChangedRef.current?.(currentIdea.id, nextDocs.length);
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
    <aside className="bo-idea-docs-panel bo-elevated-panel" aria-label="Supporting docs" style={PANEL_STYLE}>
      <div style={HEADER_STYLE}>
        <div style={{ minWidth: 0 }}>
          <p style={EYEBROW_STYLE}>Supporting docs</p>
          <h2 style={TITLE_STYLE}>
            {currentIdea.rawText.slice(0, 64)}{currentIdea.rawText.length > 64 ? '…' : ''}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="icon-btn"
          aria-label="Dismiss supporting docs"
          style={{ flex: '0 0 auto', fontFamily: 'var(--f-mono)', fontSize: 16, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      <div style={BODY_STYLE}>
        <section>
          <div style={SECTION_HEAD_STYLE}>
            <p style={EYEBROW_STYLE}>Attached</p>
            <span style={COUNT_STYLE}>{docs.length}</span>
          </div>
          {loading && <p style={LOADING_STYLE}>Loading docs…</p>}
          {!loading && docs.length === 0 && (
            <p style={EMPTY_STYLE}>
              No supporting docs yet. Paste a spec slice, notes, or source text here to ground this idea.
            </p>
          )}
          {docs.map(doc => {
            const status = describeStatus(doc);
            return (
              <article key={doc.id} style={DOC_CARD_STYLE}>
                <div style={DOC_HEAD_STYLE}>
                  <div style={{ minWidth: 0 }}>
                    <p style={DOC_TITLE_STYLE}>{doc.title}</p>
                    <span style={status.failed ? DOC_STATUS_FAILED : DOC_STATUS_BASE}>
                      {status.label}
                    </span>
                  </div>
                  <div style={DOC_ACTIONS_STYLE}>
                    {doc.status === 'failed' && (
                      <button
                        type="button"
                        onClick={() => { void handleRetry(doc); }}
                        className="btn sm"
                      >
                        Retry
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { void handleDelete(doc.id); }}
                      className="btn sm ghost"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {doc.summary && (
                  <p style={DOC_SUMMARY_STYLE}>{doc.summary}</p>
                )}
              </article>
            );
          })}
        </section>

        <section>
          <div style={SECTION_HEAD_STYLE}>
            <p style={EYEBROW_STYLE}>Add doc</p>
          </div>
          <input
            type="text"
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="Optional title"
            style={INPUT_STYLE}
          />
          <textarea
            value={body}
            onChange={event => setBody(event.target.value)}
            placeholder="Paste research notes, PRD text, meeting notes, or source excerpts."
            rows={8}
            style={{ ...TEXTAREA_STYLE, marginTop: 8 }}
          />
          <div style={FORM_ROW_STYLE}>
            <span style={CHAR_COUNT_STYLE}>{body.length.toLocaleString()} chars</span>
            <button
              type="button"
              onClick={() => { void handleSave(); }}
              disabled={saving || !body.trim()}
              className="btn sm primary"
              style={{ opacity: saving || !body.trim() ? 0.55 : 1 }}
            >
              {saving ? 'Saving…' : 'Save & refine'}
            </button>
          </div>
        </section>

        {error && (
          <p style={ERROR_STYLE} role="alert">
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}
