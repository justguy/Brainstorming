/**
 * ChallengesList — devil's-advocate critiques with Accept / Defer / Rebut stances.
 *
 * Interaction: each challenge is a single row. The user picks a stance
 * (Accept = valid concern, Defer = address later, Rebut = here's why we disagree)
 * and, if rebutting, types their counter-argument.
 */

import React, { useState } from 'react';
import type { Idea, ChallengeEntry, ChallengeStance } from '../types';
import Button from '../ui/Button';

interface ChallengesListProps {
  idea: Idea;
  onUpdate: (updated: Idea) => void;
}

const STANCE_TONE: Record<ChallengeStance, string> = {
  pending: 'bg-gray-50 border-gray-200',
  accept: 'bg-amber-50 border-amber-300',
  defer: 'bg-sky-50 border-sky-300',
  rebut: 'bg-emerald-50 border-emerald-300',
};

export default function ChallengesList({ idea, onUpdate }: ChallengesListProps): React.ReactElement {
  const challenges = idea.briefState.challenges;

  function patchChallenge(id: string, patch: Partial<ChallengeEntry>): void {
    const next = challenges.map(c => (c.id === id ? { ...c, ...patch } : c));
    onUpdate({ ...idea, briefState: { ...idea.briefState, challenges: next } });
  }

  if (challenges.length === 0) {
    return (
      <p className="text-xs text-gray-500 italic">
        No challenges yet. Run this step to hear what the devil's advocate has to say.
      </p>
    );
  }

  const pending = challenges.filter(c => c.stance === 'pending').length;

  return (
    <div className="space-y-2">
      {pending > 0 && (
        <div className="text-xs text-gray-600 bg-gray-100 rounded px-2 py-1">
          {pending} challenge{pending !== 1 ? 's' : ''} awaiting your stance.
        </div>
      )}
      <ul className="space-y-2">
        {challenges.map(challenge => (
          <ChallengeRow
            key={challenge.id}
            challenge={challenge}
            onStance={s => patchChallenge(challenge.id, { stance: s })}
            onRebuttal={r => patchChallenge(challenge.id, { userRebuttal: r })}
          />
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single row
// ---------------------------------------------------------------------------

interface ChallengeRowProps {
  challenge: ChallengeEntry;
  onStance: (s: ChallengeStance) => void;
  onRebuttal: (r: string) => void;
}

function ChallengeRow({ challenge, onStance, onRebuttal }: ChallengeRowProps): React.ReactElement {
  const [rebutOpen, setRebutOpen] = useState(challenge.stance === 'rebut' && !challenge.userRebuttal);
  const [rebutDraft, setRebutDraft] = useState(challenge.userRebuttal ?? '');

  return (
    <li className={`rounded-lg border-2 ${STANCE_TONE[challenge.stance]} p-3 space-y-2`}>
      <p className="text-sm font-medium text-gray-900 leading-snug">
        <span className="inline-block text-[10px] font-bold text-rose-700 bg-rose-100 rounded px-1.5 py-0.5 mr-2 align-middle uppercase tracking-wide">
          Critique
        </span>
        {challenge.critique}
      </p>

      <p className="text-xs text-gray-600">
        <span className="font-semibold text-gray-700">What would settle this: </span>
        {challenge.evidenceAsk}
      </p>

      {challenge.stance === 'rebut' && challenge.userRebuttal && !rebutOpen && (
        <p className="text-xs italic text-emerald-800 bg-white/70 rounded px-2 py-1">
          <span className="font-semibold">Your rebuttal: </span>
          {challenge.userRebuttal}
        </p>
      )}

      {rebutOpen && (
        <div className="space-y-1 pt-1 border-t border-current/20">
          <textarea
            value={rebutDraft}
            onChange={e => setRebutDraft(e.target.value)}
            rows={3}
            placeholder="Why is this critique wrong or misplaced?"
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Your rebuttal"
          />
          <div className="flex gap-1">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                onRebuttal(rebutDraft.trim());
                onStance('rebut');
                setRebutOpen(false);
              }}
              disabled={!rebutDraft.trim()}
            >
              Save rebuttal
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRebutOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!rebutOpen && (
        <div className="flex gap-1 flex-wrap pt-1">
          <Button
            variant={challenge.stance === 'accept' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => onStance(challenge.stance === 'accept' ? 'pending' : 'accept')}
          >
            Accept
          </Button>
          <Button
            variant={challenge.stance === 'defer' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => onStance(challenge.stance === 'defer' ? 'pending' : 'defer')}
          >
            Defer
          </Button>
          <Button
            variant={challenge.stance === 'rebut' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setRebutOpen(true)}
          >
            {challenge.stance === 'rebut' ? 'Edit rebuttal' : 'Rebut'}
          </Button>
        </div>
      )}
    </li>
  );
}
