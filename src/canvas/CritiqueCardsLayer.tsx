import React from 'react';
import type { Idea, IdeaCritique } from '../types';

const CARD_WIDTH = 236;
const CARD_ESTIMATED_HEIGHT = 212;
const STACK_STEP = 24;
const SIDE_GAP = 18;
const EDGE_MARGIN = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function critiqueConfidence(text: string): 'early' | 'medium' | 'strong' {
  const cleanLength = text.trim().length;
  if (cleanLength >= 170) return 'strong';
  if (cleanLength >= 90) return 'medium';
  return 'early';
}

function critiqueConfidenceClass(level: 'early' | 'medium' | 'strong'): { label: string; classes: string } {
  if (level === 'strong') {
    return { label: 'High-confidence', classes: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  }
  if (level === 'medium') {
    return { label: 'Medium-confidence', classes: 'bg-amber-100 text-amber-800 border-amber-200' };
  }
  return { label: 'Early signal', classes: 'bg-rose-100 text-rose-800 border-rose-200' };
}

function intersectionArea(a: Rect, b: Rect): number {
  const overlapWidth = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const overlapHeight = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  return overlapWidth * overlapHeight;
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
  const ideaRects = ideas
    .map(idea => {
      const panel = idea.panel;
      if (!panel) return null;
      return {
        ideaId: idea.id,
        left: panel.x,
        top: panel.y,
        width: panel.width,
        height: panel.height,
      };
    })
    .filter((rect): rect is Rect & { ideaId: string } => !!rect);
  const placedRects: Rect[] = [];
  const viewportWidth =
    typeof window === 'undefined'
      ? Math.max(...ideaRects.map(rect => rect.left + rect.width), CARD_WIDTH + EDGE_MARGIN * 2) + CARD_WIDTH + EDGE_MARGIN
      : window.innerWidth;
  const viewportHeight =
    typeof window === 'undefined'
      ? Math.max(...ideaRects.map(rect => rect.top + rect.height), CARD_ESTIMATED_HEIGHT + EDGE_MARGIN * 2) + CARD_ESTIMATED_HEIGHT + EDGE_MARGIN
      : window.innerHeight;

  return (
    <>
      {[...critiquesByIdeaId.entries()].map(([ideaId, ideaCritiques]) => {
        const idea = ideaById.get(ideaId);
        if (!idea) return null;
        const panel = idea.panel;
        if (!panel) return null;

        return ideaCritiques.map((critique, index) => {
          const anchorRect: Rect = {
            left: panel.x,
            top: panel.y,
            width: panel.width,
            height: panel.height,
          };
          const candidateRects: Rect[] = [
            {
              left: panel.x + panel.width + SIDE_GAP,
              top: panel.y + index * STACK_STEP,
              width: CARD_WIDTH,
              height: CARD_ESTIMATED_HEIGHT,
            },
            {
              left: panel.x - CARD_WIDTH - SIDE_GAP,
              top: panel.y + index * STACK_STEP,
              width: CARD_WIDTH,
              height: CARD_ESTIMATED_HEIGHT,
            },
            {
              left: panel.x + panel.width - CARD_WIDTH,
              top: panel.y - CARD_ESTIMATED_HEIGHT - SIDE_GAP - index * STACK_STEP,
              width: CARD_WIDTH,
              height: CARD_ESTIMATED_HEIGHT,
            },
            {
              left: panel.x + panel.width - CARD_WIDTH,
              top: panel.y + panel.height + SIDE_GAP + index * STACK_STEP,
              width: CARD_WIDTH,
              height: CARD_ESTIMATED_HEIGHT,
            },
          ].map(candidate => ({
            ...candidate,
            left: clamp(candidate.left, EDGE_MARGIN, Math.max(EDGE_MARGIN, viewportWidth - CARD_WIDTH - EDGE_MARGIN)),
            top: clamp(candidate.top, EDGE_MARGIN, Math.max(EDGE_MARGIN, viewportHeight - CARD_ESTIMATED_HEIGHT - EDGE_MARGIN)),
          }));

          const chosenRect = candidateRects.reduce((best, candidate) => {
            const overlapWithAnchor = intersectionArea(candidate, anchorRect);
            const overlapWithIdeas = ideaRects
              .filter(rect => rect.ideaId !== ideaId)
              .reduce((sum, rect) => sum + intersectionArea(candidate, rect), 0);
            const overlapWithCritiques = placedRects.reduce((sum, rect) => sum + intersectionArea(candidate, rect), 0);
            const distanceFromAnchor =
              Math.abs(candidate.left - anchorRect.left) +
              Math.abs(candidate.top - anchorRect.top);
            const score =
              overlapWithAnchor * 100 +
              overlapWithIdeas * 4 +
              overlapWithCritiques * 6 +
              distanceFromAnchor * 0.2;

            if (!best || score < best.score) {
              return { rect: candidate, score };
            }
            return best;
          }, null as { rect: Rect; score: number } | null)?.rect ?? candidateRects[0];

          placedRects.push(chosenRect);

          const left = chosenRect.left;
          const top = chosenRect.top;
          const isFocused = focusedIdeaId === ideaId;
          const isMuted = !!focusedIdeaId && !isFocused;
          const isReconsidering = editingIdeaId === ideaId;
          const animateIn = animatedIdSet.has(critique.id) && !suppressAnimations;
          const confidence = critiqueConfidence(critique.critique);
          const confidenceMeta = critiqueConfidenceClass(confidence);

          return (
            <section
              key={critique.id}
              style={{
                position: 'absolute',
                left,
                top,
                width: CARD_WIDTH,
                zIndex: (isFocused ? 30 : 18) + index,
                transform: `translate3d(0, ${isReconsidering ? 6 : 0}px, 0)`,
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
                  <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${confidenceMeta.classes}`}>
                    {confidenceMeta.label}
                  </span>
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
