/**
 * DiscardPile — collapsible drawer pinned to the canvas bottom-left.
 *
 * Shows every idea with status='discarded'. Each row previews the idea text and
 * offers a "Restore" action that flips status back to 'captured'. Discarded
 * ideas remain in IDB so the connection finder and scout can still see them.
 */

import React, { useState } from 'react';
import type { Idea } from '../types';

export interface DiscardPileProps {
  ideas: Idea[];
  onRestore: (ideaId: string) => void;
  /** Optional: preview (open the workspace for) a discarded idea without restoring it. */
  onPreview?: (ideaId: string) => void;
  className?: string;
}

export default function DiscardPile({
  ideas,
  onRestore,
  onPreview,
  className,
}: DiscardPileProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const count = ideas.length;
  const hasItems = count > 0;

  return (
    <div className={className ?? ''}>
      {open && (
        <div
          className="mb-2 w-[328px] max-h-[60vh] overflow-hidden rounded-lg border border-slate-200/80 bg-white/85 shadow-sm flex flex-col"
          role="region"
          aria-label="Discarded ideas"
        >
          <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200/70">
            <p className="text-[11px] font-medium uppercase tracking-[0.11em] text-slate-500">
              Discarded ({count})
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded text-slate-400 hover:text-slate-700 text-sm leading-none focus:outline-none focus:ring-2 focus:ring-sky-300"
              aria-label="Collapse discard pile"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {count === 0 && (
              <p className="px-3 py-4 text-xs text-slate-500 italic">
                Nothing discarded yet. Right-click an idea on the canvas and choose
                <span className="font-semibold"> Discard </span>
                or use
                the <code>discard_idea</code> tool.
              </p>
            )}
            <ul className="divide-y divide-slate-100/80">
              {ideas.map(idea => (
                <li
                  key={idea.id}
                  className="px-3 py-2 group last:border-b-0 hover:bg-slate-50/70"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-900 leading-snug line-clamp-2">{idea.rawText}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">
                          Step {idea.phase}/8
                        </span>
                        {idea.tags.length > 0 && (
                          <span className="text-[10px] text-slate-400 truncate">
                            {idea.tags.slice(0, 3).join(' · ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0 text-right opacity-70 group-hover:opacity-100">
                      {onPreview && (
                        <button
                          type="button"
                          onClick={() => onPreview(idea.id)}
                          className="text-[10px] text-slate-600 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-300"
                        >
                          Preview
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onRestore(idea.id)}
                        className="text-[10px] font-semibold text-slate-700 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-300"
                        aria-label={`Restore ${idea.rawText.slice(0, 40)}`}
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="group flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-3 py-1.5 text-sm text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-300"
        aria-label={open ? 'Close discard pile' : `Open discard pile (${count} items)`}
      >
        <span className="grid h-5 w-5 place-items-center rounded-full border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
          {open ? '◁' : '⟂'}
        </span>
        <span className="font-semibold text-slate-700">Discard pile</span>
        <span className={`rounded-full px-1.5 py-0.5 text-xs ${hasItems ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-400'}`}>
          {count}
        </span>
      </button>
    </div>
  );
}
