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
}

export default function DiscardPile({ ideas, onRestore, onPreview }: DiscardPileProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const count = ideas.length;

  return (
    <div className="absolute bottom-5 left-5 z-20">
      {open && (
        <div
          className="mb-2 w-[320px] max-h-[60vh] overflow-hidden bg-white rounded-lg border border-gray-200 shadow-xl flex flex-col"
          role="region"
          aria-label="Discarded ideas"
        >
          <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              Discarded ({count})
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-700 text-sm leading-none focus:outline-none focus:ring-2 focus:ring-violet-400 rounded"
              aria-label="Collapse discard pile"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {count === 0 && (
              <p className="text-xs text-gray-500 italic px-3 py-4">
                Nothing discarded yet. Right-click an idea on the canvas and choose Discard, or use
                the <code>discard_idea</code> tool.
              </p>
            )}
            <ul>
              {ideas.map(idea => (
                <li
                  key={idea.id}
                  className="border-b border-gray-100 last:border-b-0 px-3 py-2 hover:bg-gray-50 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900 line-clamp-2">{idea.rawText}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-500">
                          Step {idea.phase}/8
                        </span>
                        {idea.tags.length > 0 && (
                          <span className="text-[10px] text-gray-400 truncate">
                            {idea.tags.slice(0, 3).join(' · ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0 opacity-70 group-hover:opacity-100">
                      {onPreview && (
                        <button
                          type="button"
                          onClick={() => onPreview(idea.id)}
                          className="text-[10px] text-gray-600 hover:text-gray-900 underline focus:outline-none focus:ring-2 focus:ring-violet-400 rounded"
                        >
                          Preview
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onRestore(idea.id)}
                        className="text-[10px] font-semibold text-violet-700 hover:text-violet-900 underline focus:outline-none focus:ring-2 focus:ring-violet-400 rounded"
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
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-full shadow hover:shadow-md focus:outline-none focus:ring-4 focus:ring-violet-300 text-sm"
        aria-label={open ? 'Close discard pile' : `Open discard pile (${count} items)`}
      >
        <span>🗑</span>
        <span className="font-semibold text-gray-700">Discard pile</span>
        <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-1.5 py-0.5">{count}</span>
      </button>
    </div>
  );
}
