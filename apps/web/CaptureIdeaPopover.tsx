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

  const containerStyle: React.CSSProperties = {
    ...panelStyle,
    background: 'var(--paper)',
    border: '2px solid var(--ink)',
    borderRadius: 12,
    boxShadow: '3px 3px 0 var(--ink)',
    padding: 14,
    color: 'var(--ink)',
    fontFamily: 'var(--f-hand-body)',
  };

  const feedbackStyle: React.CSSProperties = feedback
    ? {
        padding: '8px 10px',
        borderRadius: 8,
        border: '2px solid var(--ink)',
        boxShadow: '2px 2px 0 var(--ink)',
        fontFamily: 'var(--f-hand-body)',
        fontSize: 13,
        color: 'var(--ink)',
        background:
          feedback.tone === 'success' ? 'var(--sticky-green)' : 'var(--sticky-pink)',
      }
    : {};

  return createPortal(
    <div
      ref={panelRef}
      style={containerStyle}
      className="bo-capture-surface z-[110]"
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      role="dialog"
      aria-label="Add note to canvas"
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--f-hand)',
            fontWeight: 700,
            fontSize: 22,
            letterSpacing: '0.2px',
            color: 'var(--ink)',
            lineHeight: 1.1,
          }}
        >
          Add note to canvas
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="btn sm"
          aria-label="Close note dialog"
        >
          Close
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 6,
          marginTop: 10,
          alignItems: 'center',
        }}
        aria-hidden="true"
      >
        <span
          style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            marginRight: 4,
          }}
        >
          sticky
        </span>
        <span
          style={{
            display: 'inline-block',
            width: 16,
            height: 16,
            borderRadius: 4,
            background: 'var(--sticky-yellow)',
            border: '1.5px solid var(--ink)',
          }}
        />
        <span
          style={{
            display: 'inline-block',
            width: 16,
            height: 16,
            borderRadius: 4,
            background: 'var(--sticky-pink)',
            border: '1.5px solid var(--ink)',
          }}
        />
        <span
          style={{
            display: 'inline-block',
            width: 16,
            height: 16,
            borderRadius: 4,
            background: 'var(--sticky-blue)',
            border: '1.5px solid var(--ink)',
          }}
        />
        <span
          style={{
            display: 'inline-block',
            width: 16,
            height: 16,
            borderRadius: 4,
            background: 'var(--sticky-green)',
            border: '1.5px solid var(--ink)',
          }}
        />
      </div>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {feedback && (
          <div style={feedbackStyle} role="status">
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
          style={{
            background: 'var(--paper)',
            border: '1.5px solid var(--ink)',
            borderRadius: 8,
            padding: '8px 10px',
            fontFamily: 'var(--f-hand-body)',
            fontSize: 14,
            color: 'var(--ink)',
            resize: 'vertical',
            width: '100%',
            boxSizing: 'border-box',
          }}
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
          style={{
            background: 'var(--paper)',
            border: '1.5px solid var(--ink)',
            borderRadius: 8,
            padding: '6px 10px',
            fontFamily: 'var(--f-mono)',
            fontSize: 12,
            color: 'var(--ink)',
            width: '100%',
            boxSizing: 'border-box',
          }}
        />

        <button
          type="button"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={creating || !text.trim()}
          className="btn sm primary"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {creating ? 'Adding note...' : 'Add note'}
        </button>

        <p
          style={{
            margin: 0,
            fontFamily: 'var(--f-mono)',
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            lineHeight: 1.5,
          }}
        >
          New notes appear near the current viewport and center into view.
        </p>
      </div>
    </div>,
    document.body,
  );
}
