import React from 'react';
import type { Idea, IdeaCritique } from '../types';

const CARD_WIDTH = 236;
const CARD_VERTICAL_STEP = 18;
const CARD_HORIZONTAL_STEP = 10;
const CARD_TOP_OVERLAP = 18;
const CARD_ANCHOR_OVERLAP = 96;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface CritiqueCardsLayerProps {
  ideas: Idea[];
  critiques: IdeaCritique[];
  busyIdeaIds?: string[];
  activeIdeaId?: string | null;
  hoveredIdeaId?: string | null;
  editingIdeaId?: string | null;
  animatedCritiqueIds?: string[];
  suppressAnimations?: boolean;
  onDismiss?: (critiqueId: string) => void;
}

export function CritiqueCardsLayer({
  ideas,
  critiques,
  busyIdeaIds,
  activeIdeaId = null,
  hoveredIdeaId = null,
  editingIdeaId = null,
  animatedCritiqueIds = [],
  suppressAnimations = false,
  onDismiss,
}: CritiqueCardsLayerProps): React.ReactElement | null {
  const busy = new Set(busyIdeaIds ?? []);
  const animatedIdSet = new Set(animatedCritiqueIds);
  const activeCritiques = critiques.filter(critique => critique.status === 'active');
  if (activeCritiques.length === 0) return null;

  const ideaById = new Map(ideas.map(idea => [idea.id, idea] as const));
  const critiquesByIdeaId = new Map<string, IdeaCritique[]>();

  for (const critique of activeCritiques) {
    const existing = critiquesByIdeaId.get(critique.ideaId) ?? [];
    existing.push(critique);
    critiquesByIdeaId.set(critique.ideaId, existing);
  }

  const focusedIdeaId = hoveredIdeaId ?? activeIdeaId;

  return (
    <>
      {[...critiquesByIdeaId.entries()].map(([ideaId, ideaCritiques]) => {
        const idea = ideaById.get(ideaId);
        if (!idea) return null;
        const panel = idea.panel;
        if (!panel) return null;

        return ideaCritiques.map((critique, index) => {
          const viewportWidth =
            typeof window === 'undefined' ? panel.x + panel.width + CARD_WIDTH + 48 : window.innerWidth;
          const preferredRight = panel.x + panel.width - CARD_ANCHOR_OVERLAP + index * CARD_HORIZONTAL_STEP;
          const preferredLeft = panel.x - CARD_WIDTH + CARD_ANCHOR_OVERLAP - index * CARD_HORIZONTAL_STEP;
          const useLeftSide = preferredRight + CARD_WIDTH + 12 > viewportWidth;
          const left = clamp(
            useLeftSide ? preferredLeft : preferredRight,
            12,
            Math.max(12, viewportWidth - CARD_WIDTH - 12),
          );
          const top = Math.max(12, panel.y - CARD_TOP_OVERLAP + index * CARD_VERTICAL_STEP);
          const rotation = index % 2 === 0 ? -1.5 : 1.25;
          const isFocused = focusedIdeaId === ideaId;
          const isMuted = !!focusedIdeaId && !isFocused;
          const isReconsidering = editingIdeaId === ideaId;
          const animateIn = animatedIdSet.has(critique.id) && !suppressAnimations;

          return (
            <section
              key={critique.id}
              style={{
                position: 'absolute',
                left,
                top,
                width: CARD_WIDTH,
                zIndex: (isFocused ? 30 : 18) + index,
                transform: `rotate(${rotation}deg) translate3d(0, ${isReconsidering ? 6 : 0}px, 0)`,
                transformOrigin: useLeftSide ? 'top right' : 'top left',
                opacity: isMuted ? 0.52 : isReconsidering ? 0.68 : 1,
              }}
              className={`pointer-events-none rounded-2xl border bg-gradient-to-br from-rose-50 via-orange-50 to-white ring-1 ring-white/80 transition-[opacity,transform,box-shadow,border-color] duration-300 ${
                isFocused
                  ? 'border-rose-400 shadow-[0_24px_44px_-24px_rgba(159,18,57,0.72)]'
                  : 'border-rose-300/90 shadow-[0_18px_38px_-24px_rgba(159,18,57,0.65)]'
              } ${animateIn ? 'bo-critique-enter' : ''}`}
              aria-live={animateIn ? 'polite' : undefined}
              aria-label={`Critique for ${idea.rawText}`}
            >
              <div className="flex items-start justify-between gap-3 rounded-t-2xl border-b border-rose-200/80 bg-white/75 px-3 py-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-700">
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
                    className="pointer-events-auto rounded-md px-1.5 py-0.5 text-xs text-rose-700 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-400"
                    aria-label="Dismiss critique"
                    title="Dismiss critique"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="space-y-2 px-3 py-2.5">
                <p className="text-sm font-semibold leading-snug text-gray-900">
                  {critique.critique}
                </p>
                <div className="rounded-xl bg-white/80 px-2.5 py-2 ring-1 ring-rose-100/90">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-700">
                    Evidence To Clear
                  </p>
                  <p className="mt-1 text-xs leading-snug text-gray-700">
                    {critique.evidenceAsk}
                  </p>
                </div>
              </div>
            </section>
          );
        });
      })}
    </>
  );
}
