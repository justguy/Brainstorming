import React from 'react';
import type { Idea, IdeaCritique } from '../types';

const CARD_WIDTH = 248;
const CARD_OFFSET_X = 16;
const CARD_STACK_GAP = 12;
const CARD_VERTICAL_OFFSET = 10;

export interface CritiqueCardsLayerProps {
  ideas: Idea[];
  critiques: IdeaCritique[];
  busyIdeaIds?: string[];
  onDismiss?: (critiqueId: string) => void;
}

export function CritiqueCardsLayer({
  ideas,
  critiques,
  busyIdeaIds,
  onDismiss,
}: CritiqueCardsLayerProps): React.ReactElement | null {
  const busy = new Set(busyIdeaIds ?? []);
  const activeCritiques = critiques.filter(critique => critique.status === 'active');
  if (activeCritiques.length === 0) return null;

  const ideaById = new Map(ideas.map(idea => [idea.id, idea] as const));
  const critiquesByIdeaId = new Map<string, IdeaCritique[]>();

  for (const critique of activeCritiques) {
    const existing = critiquesByIdeaId.get(critique.ideaId) ?? [];
    existing.push(critique);
    critiquesByIdeaId.set(critique.ideaId, existing);
  }

  return (
    <>
      {[...critiquesByIdeaId.entries()].map(([ideaId, ideaCritiques]) => {
        const idea = ideaById.get(ideaId);
        if (!idea?.panel) return null;

        return ideaCritiques.map((critique, index) => {
          const top = idea.panel!.y + CARD_VERTICAL_OFFSET + index * (112 + CARD_STACK_GAP);
          const left = idea.panel!.x + idea.panel!.width + CARD_OFFSET_X;
          return (
            <section
              key={critique.id}
              style={{
                position: 'absolute',
                left,
                top,
                width: CARD_WIDTH,
                zIndex: 12,
              }}
              className="pointer-events-auto rounded-xl border border-rose-300 bg-gradient-to-br from-rose-50 via-orange-50 to-white shadow-lg transition-transform duration-300 hover:-translate-y-0.5"
              aria-label={`Critique for ${idea.rawText}`}
            >
              <div className="flex items-start justify-between gap-3 px-3 py-2 border-b border-rose-200 bg-white/60 rounded-t-xl">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-700">
                    Critique
                  </p>
                  <p className="text-[11px] text-rose-900/80">
                    Devil&apos;s advocate{busy.has(ideaId) ? ' · thinking…' : ''}
                  </p>
                </div>
                {onDismiss && (
                  <button
                    type="button"
                    onPointerDown={event => event.stopPropagation()}
                    onClick={event => {
                      event.stopPropagation();
                      onDismiss(critique.id);
                    }}
                    className="rounded px-1.5 py-0.5 text-xs text-rose-700 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-400"
                    aria-label="Dismiss critique"
                    title="Dismiss critique"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="px-3 py-2 space-y-2">
                <p className="text-sm font-medium leading-snug text-gray-900">
                  {critique.critique}
                </p>
                <p className="text-xs leading-snug text-gray-700">
                  <span className="font-semibold text-gray-900">What would settle this: </span>
                  {critique.evidenceAsk}
                </p>
              </div>
            </section>
          );
        });
      })}
    </>
  );
}
