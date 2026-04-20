import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface CaptureIdeaPopoverProps {
  open: boolean;
  creating: boolean;
  feedback: {
    tone: 'success' | 'error';
    message: string;
  } | null;
  text: string;
  tags: string;
  onToggle?: () => void;
  anchorSelector?: string;
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
  anchorSelector = '[data-capture-anchor=\"bo-capture-portal-anchor\"]',
  onTextChange,
  onTagsChange,
  onClose,
  onSubmit,
}: CaptureIdeaPopoverProps): React.ReactElement | null {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    right: 16,
    top: 96,
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
    const gap = 10;

    const reposition = () => {
      const panel = panelRef.current;
      if (!panel) return;

      const panelRect = panel.getBoundingClientRect();
      const anchor = typeof document === 'undefined'
        ? null
        : (document.querySelector(anchorSelector) as HTMLElement | null);
      const anchorRect = anchor?.getBoundingClientRect() ?? null;

      const panelWidth = Math.min(360, window.innerWidth - margin * 2);
      const estimatedHeight = Math.max(panelRect.height || 360, 260);
      const panelHeight = Math.min(estimatedHeight, window.innerHeight - margin * 2);

      let left = window.innerWidth - margin - panelWidth;
      let top = 96;

      if (anchorRect) {
        left = anchorRect.right - panelWidth;
        top = anchorRect.bottom + gap;
        if (top + panelHeight > window.innerHeight - margin) {
          top = anchorRect.top - panelHeight - gap;
        }
      }

      left = Math.max(margin, Math.min(left, window.innerWidth - margin - panelWidth));
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
  }, [open, anchorSelector]);

  if (typeof document === 'undefined' || !open) return null;

  async function handleSubmit(): Promise<void> {
    const committed = await onSubmit();
    if (committed !== false) {
      onClose();
    }
  }

  return createPortal(
    <div
      ref={panelRef}
      style={panelStyle}
      className="bo-capture-surface z-[110]"
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      role="dialog"
      aria-label="Add note to canvas"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold leading-tight">Add note to canvas</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-black/20 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-black/20"
          aria-label="Close note dialog"
        >
          Close
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {feedback && (
          <div
            className={`rounded-md border px-3 py-2 text-xs ${
              feedback.tone === 'success'
                ? 'border-emerald-300 bg-emerald-50/60 text-emerald-800'
                : 'border-rose-300 bg-rose-50/65 text-rose-800'
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
          placeholder="Describe your idea..."
          rows={4}
          className="bo-capture-input"
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
          placeholder="Tags, comma-separated"
          className="bo-capture-input"
          aria-label="Tags"
        />

        <button
          type="button"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={creating || !text.trim()}
          className="bo-topbar-primary-action w-full"
        >
          {creating ? 'Adding note...' : 'Add note'}
        </button>

        <p className="text-[11px] leading-5 text-black/60">
          New notes appear near the current viewport and center into view.
        </p>
      </div>
    </div>,
    document.body,
  );
}
