import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '../../src/ui/Button';

export interface CaptureIdeaPopoverProps {
  open: boolean;
  creating: boolean;
  feedback: {
    tone: 'success' | 'error';
    message: string;
  } | null;
  text: string;
  tags: string;
  onToggle: () => void;
  onTextChange: (value: string) => void;
  onTagsChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void | boolean | Promise<void | boolean>;
}

export function CaptureIdeaPopover({
  open,
  creating,
  feedback,
  text,
  tags,
  onToggle,
  onTextChange,
  onTagsChange,
  onClose,
  onSubmit,
}: CaptureIdeaPopoverProps): React.ReactElement | null {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    right: 20,
    top: 80,
    width: 320,
    maxHeight: 'calc(100vh - 32px)',
    overflowY: 'auto',
  });

  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    const margin = 16;
    const gap = 12;

    const reposition = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;

      const triggerRect = trigger.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const panelWidth = Math.min(320, window.innerWidth - margin * 2);
      const panelHeight = Math.min(panelRect.height || 240, window.innerHeight - margin * 2);

      let left = triggerRect.right - panelWidth;
      left = Math.min(window.innerWidth - margin - panelWidth, Math.max(margin, left));

      let top = triggerRect.top - panelHeight - gap;
      if (top < margin) {
        top = triggerRect.bottom + gap;
      }
      top = Math.min(window.innerHeight - margin - panelHeight, Math.max(margin, top));

      setPanelStyle({
        position: 'fixed',
        left: Math.round(left),
        top: Math.round(top),
        width: panelWidth,
        maxHeight: `calc(100vh - ${margin * 2}px)`,
        overflowY: 'auto',
      });
    };

    const raf = window.requestAnimationFrame(reposition);
    const viewport = window.visualViewport;
    window.addEventListener('resize', reposition);
    viewport?.addEventListener('resize', reposition);
    viewport?.addEventListener('scroll', reposition);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && panelRef.current) {
      observer = new ResizeObserver(() => reposition());
      observer.observe(panelRef.current);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', reposition);
      viewport?.removeEventListener('resize', reposition);
      viewport?.removeEventListener('scroll', reposition);
      observer?.disconnect();
    };
  }, [open]);

  if (typeof document === 'undefined') return null;

  async function handleSubmit(): Promise<void> {
    const committed = await onSubmit();
    if (committed !== false) {
      onClose();
    }
  }

  return createPortal(
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Capture new idea"
        aria-expanded={open}
        onClick={onToggle}
        className={`fixed bottom-[4.75rem] left-5 z-[100] inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-lg focus:outline-none focus:ring-4 focus:ring-violet-300 lg:bottom-5 ${
          open
            ? 'bg-violet-700 hover:bg-violet-800'
            : 'bg-violet-600 hover:bg-violet-700'
        }`}
      >
        <span aria-hidden="true" className="text-lg leading-none">+</span>
        <span>{open ? 'Close note' : 'New note'}</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          style={panelStyle}
          className="z-[110] rounded-lg border border-gray-200 bg-white p-4 shadow-xl"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-start justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              Add a note
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-sm leading-none text-gray-400 hover:text-gray-600"
              aria-label="Close capture"
            >
              ✕
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {feedback && (
              <div
                className={`rounded-md border px-3 py-2 text-xs ${
                  feedback.tone === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
                role="status"
              >
                {feedback.message}
              </div>
            )}
            <textarea
              ref={textareaRef}
              autoFocus
              value={text}
              onChange={event => onTextChange(event.target.value)}
              placeholder="Describe your idea…"
              rows={3}
              className="w-full resize-none rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              aria-label="New idea description"
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  onClose();
                  return;
                }
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
            />
            <input
              type="text"
              value={tags}
              onChange={event => onTagsChange(event.target.value)}
              placeholder="Tags (comma-separated, optional)"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              aria-label="Tags"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                void handleSubmit();
              }}
              disabled={creating || !text.trim()}
              className="w-full"
            >
              {creating ? 'Adding note…' : 'Add note to canvas'}
            </Button>
            <p className="text-[11px] leading-5 text-gray-500">
              New notes are placed near the current viewport and centered into view so they are
              legible on the board immediately.
            </p>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
