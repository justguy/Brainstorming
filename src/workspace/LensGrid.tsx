/**
 * LensGrid — displays Outside-In lenses as 3-column cards.
 *
 * Interaction: each card lets the user PIN (keep), DISMISS (hide), or write
 * a NOTE capturing their reaction. Verdicts and notes persist to the idea.
 */

import React, { useState } from 'react';
import type { Idea, LensEntry, UserVerdict } from '../types';
import Button from '../ui/Button';

interface LensGridProps {
  idea: Idea;
  onUpdate: (updated: Idea) => void;
}

const KIND_COLOR: Record<LensEntry['kind'], string> = {
  outside_in: 'bg-amber-50 border-amber-300 text-amber-900',
  analogy: 'bg-sky-50 border-sky-300 text-sky-900',
  contrarian: 'bg-rose-50 border-rose-300 text-rose-900',
  user_voice: 'bg-emerald-50 border-emerald-300 text-emerald-900',
};

const KIND_LABEL: Record<LensEntry['kind'], string> = {
  outside_in: 'Outside-in',
  analogy: 'Analogy',
  contrarian: 'Contrarian',
  user_voice: 'User voice',
};

export default function LensGrid({ idea, onUpdate }: LensGridProps): React.ReactElement {
  const lenses = idea.briefState.lenses;

  function patchLens(lensId: string, patch: Partial<LensEntry>): void {
    const next = lenses.map(l => (l.id === lensId ? { ...l, ...patch } : l));
    onUpdate({
      ...idea,
      briefState: { ...idea.briefState, lenses: next },
    });
  }

  if (lenses.length === 0) {
    return (
      <p className="text-xs text-gray-500 italic">
        No lenses surfaced yet. Run this step to see unexpected angles on your idea.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {lenses.map(lens => (
        <LensCard
          key={lens.id}
          lens={lens}
          onVerdict={v => patchLens(lens.id, { verdict: v })}
          onNote={note => patchLens(lens.id, { userNote: note })}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single card
// ---------------------------------------------------------------------------

interface LensCardProps {
  lens: LensEntry;
  onVerdict: (v: UserVerdict) => void;
  onNote: (note: string) => void;
}

function LensCard({ lens, onVerdict, onNote }: LensCardProps): React.ReactElement {
  const [noteOpen, setNoteOpen] = useState(false);
  const [draftNote, setDraftNote] = useState(lens.userNote ?? '');

  const dimmed = lens.verdict === 'dismissed';
  const pinned = lens.verdict === 'pinned';

  return (
    <div
      className={`rounded-lg border-2 ${KIND_COLOR[lens.kind]} ${dimmed ? 'opacity-50' : ''} ${pinned ? 'ring-2 ring-offset-1 ring-violet-400' : ''} p-3 flex flex-col gap-2 transition`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide">
          {KIND_LABEL[lens.kind]}
        </span>
        {pinned && <span className="text-[10px] font-bold text-violet-700">★ pinned</span>}
      </div>

      <p className="text-sm font-semibold leading-snug">{lens.frame}</p>
      <p className="text-xs leading-relaxed text-gray-700">{lens.insight}</p>

      <div className="border-t border-current/20 pt-2 mt-1">
        <p className="text-xs italic font-medium">{lens.provocation}</p>
      </div>

      {lens.userNote && !noteOpen && (
        <p className="text-xs text-gray-600 bg-white/60 rounded px-2 py-1 italic">
          Your note: {lens.userNote}
        </p>
      )}

      {noteOpen && (
        <div className="space-y-1">
          <textarea
            value={draftNote}
            onChange={e => setDraftNote(e.target.value)}
            placeholder="Your reaction…"
            rows={2}
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Your reaction to this lens"
          />
          <div className="flex gap-1">
            <Button
              variant="primary"
              size="sm"
              onClick={() => { onNote(draftNote.trim()); setNoteOpen(false); }}
            >
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!noteOpen && (
        <div className="flex gap-1 flex-wrap pt-1">
          <Button
            variant={pinned ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => onVerdict(pinned ? 'pending' : 'pinned')}
          >
            {pinned ? 'Unpin' : 'Pin'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onVerdict(dimmed ? 'pending' : 'dismissed')}
          >
            {dimmed ? 'Unhide' : 'Dismiss'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setNoteOpen(true)}>
            {lens.userNote ? 'Edit note' : 'Note'}
          </Button>
        </div>
      )}
    </div>
  );
}
