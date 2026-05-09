import React, { useEffect, useState } from 'react';
import type { BoardThemeMode, Idea, IdeaCritique } from '../types';

const CARD_WIDTH = 236;
const CARD_ESTIMATED_HEIGHT = 212;
const STACK_STEP = 24;
const SIDE_GAP = 18;
const EDGE_MARGIN = 12;
const COLLAPSED_TAB_HEIGHT = 28;
const COLLAPSED_STACK_STEP = 10;
const COLLAPSED_X_STEP = 6;
function hashSeed(value: string): number {
  let hash = 2246822519;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 3266489917);
  }
  return hash >>> 0;
}

function critiqueRotationDeg(id: string): number {
  return ((hashSeed(id) % 20) - 10) / 8;
}

function critiqueSurfaceTone(confidence: 'early' | 'medium' | 'strong', boardTheme: BoardThemeMode): {
  borderColor: string;
  ringColor: string;
  shadow: string;
  paper: string;
} {
  if (boardTheme === 'whiteboard') {
    if (confidence === 'strong') {
      return {
        borderColor: 'rgba(198, 110, 116, 0.52)',
        ringColor: 'rgba(198, 110, 116, 0.42)',
        shadow: '0 18px 38px -30px rgba(160, 86, 95, 0.22)',
        paper: 'linear-gradient(150deg, rgba(255, 255, 255, 0.98), rgba(255, 248, 248, 0.98) 56%, rgba(252, 241, 241, 0.98) 100%)',
      };
    }

    if (confidence === 'medium') {
      return {
        borderColor: 'rgba(101, 139, 186, 0.5)',
        ringColor: 'rgba(101, 139, 186, 0.38)',
        shadow: '0 18px 36px -30px rgba(77, 110, 154, 0.18)',
        paper: 'linear-gradient(142deg, rgba(255, 255, 255, 0.98), rgba(248, 252, 255, 0.98) 56%, rgba(240, 246, 252, 0.98) 100%)',
      };
    }

    return {
      borderColor: 'rgba(116, 147, 180, 0.44)',
      ringColor: 'rgba(116, 147, 180, 0.34)',
      shadow: '0 16px 34px -28px rgba(77, 110, 154, 0.16)',
      paper: 'linear-gradient(140deg, rgba(255, 255, 255, 0.99), rgba(249, 252, 255, 0.99) 56%, rgba(242, 247, 252, 0.99) 100%)',
    };
  }

  if (confidence === 'strong') {
    return {
      borderColor: 'rgba(170, 84, 89, 0.44)',
      ringColor: 'rgba(170, 84, 89, 0.38)',
      shadow: '0 20px 42px -30px rgba(120, 49, 56, 0.32)',
      paper: 'linear-gradient(150deg, rgba(255, 254, 254, 0.94), rgba(255, 246, 246, 0.96) 56%, rgba(250, 236, 236, 0.95) 100%)',
    };
  }

  if (confidence === 'medium') {
    return {
      borderColor: 'rgba(87, 125, 168, 0.38)',
      ringColor: 'rgba(87, 125, 168, 0.34)',
      shadow: '0 18px 36px -30px rgba(54, 87, 123, 0.24)',
      paper: 'linear-gradient(142deg, rgba(250, 253, 255, 0.94), rgba(242, 248, 253, 0.95) 56%, rgba(231, 239, 247, 0.94) 100%)',
    };
  }

  return {
    borderColor: 'rgba(102, 133, 162, 0.34)',
    ringColor: 'rgba(102, 133, 162, 0.28)',
    shadow: '0 16px 34px -28px rgba(54, 87, 123, 0.2)',
    paper: 'linear-gradient(140deg, rgba(253, 254, 255, 0.94), rgba(244, 249, 253, 0.95) 56%, rgba(233, 240, 247, 0.95) 100%)',
  };
}

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
    return { label: 'Medium-confidence', classes: 'bg-sky-100 text-sky-800 border-sky-200' };
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
  onAccept?: (critiqueId: string) => Promise<void> | void;
  onDismiss?: (critiqueId: string) => Promise<void> | void;
  boardTheme: BoardThemeMode;
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
  onAccept,
  onDismiss,
  boardTheme,
}: CritiqueCardsLayerProps): React.ReactElement | null {
  const busy = new Set(busyIdeaIds ?? []);
  const animatedIdSet = new Set(animatedCritiqueIds);
  const activeCritiques = critiques.filter(critique => critique.status === 'active');
  const [expandedCritiqueId, setExpandedCritiqueId] = useState<string | null>(null);

  useEffect(() => {
    if (!expandedCritiqueId) return;
    if (activeCritiques.some(critique => critique.id === expandedCritiqueId)) return;
    setExpandedCritiqueId(null);
  }, [activeCritiques, expandedCritiqueId]);

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
          const isExpanded = expandedCritiqueId === critique.id;
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

          if (isExpanded) {
            placedRects.push(chosenRect);
          }

          const collapsedWidth = clamp(
            Math.min(CARD_WIDTH - 56, Math.max(136, panel.width - 116)),
            136,
            176,
          );
          const collapsedHeight = COLLAPSED_TAB_HEIGHT;
          const collapsedRect: Rect = {
            left: clamp(
              panel.x + panel.width - collapsedWidth - 12 + index * COLLAPSED_X_STEP,
              EDGE_MARGIN,
              Math.max(EDGE_MARGIN, viewportWidth - collapsedWidth - EDGE_MARGIN),
            ),
            top: clamp(
              panel.y - collapsedHeight - 8 - index * COLLAPSED_STACK_STEP,
              EDGE_MARGIN,
              Math.max(EDGE_MARGIN, viewportHeight - collapsedHeight - EDGE_MARGIN),
            ),
            width: collapsedWidth,
            height: collapsedHeight,
          };
          const displayRect = isExpanded ? chosenRect : collapsedRect;

          const left = displayRect.left;
          const top = displayRect.top;
          const isFocused = isExpanded || focusedIdeaId === ideaId;
          const isMuted = !isExpanded && !!focusedIdeaId && !isFocused;
          const isReconsidering = editingIdeaId === ideaId;
          const animateIn = animatedIdSet.has(critique.id) && !suppressAnimations;
          const confidence = critiqueConfidence(critique.critique);
          const confidenceMeta = critiqueConfidenceClass(confidence);
          const tone = critiqueSurfaceTone(confidence, boardTheme);
          const critiqueSeed = `${critique.id}:${ideaId}:${index}`;
          const rotateDeg = critiqueRotationDeg(critiqueSeed);
          const zIndex = isExpanded ? 36 + index : 4 + index;
          const opacity = isExpanded
            ? (isReconsidering ? 0.76 : 1)
            : (isMuted ? 0.66 : 0.95);
          const transform = isExpanded
            ? `translate3d(0, ${isReconsidering ? 6 : 0}px, 0) rotate(${rotateDeg}deg)`
            : `translate3d(0, 0, 0) rotate(${rotateDeg * 0.3}deg)`;

          return (
            <section
              key={critique.id}
              data-artifact-surface="critique-note"
              data-critique-confidence={confidence}
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              style={{
                position: 'absolute',
                left,
                top,
                width: displayRect.width,
                height: displayRect.height,
                zIndex,
                transform,
                opacity,
                borderColor: tone.borderColor,
                boxShadow: tone.shadow,
                backgroundImage: tone.paper,
              }}
              onPointerDownCapture={event => event.stopPropagation()}
              onPointerDown={event => event.stopPropagation()}
              onMouseDownCapture={event => event.stopPropagation()}
              onTouchStartCapture={event => event.stopPropagation()}
              onClick={event => {
                event.stopPropagation();
                setExpandedCritiqueId(current => (current === critique.id ? null : critique.id));
              }}
              onKeyDown={event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                setExpandedCritiqueId(current => (current === critique.id ? null : critique.id));
              }}
              className={`bo-critique-artifact nodrag nopan nowheel pointer-events-auto relative overflow-hidden rounded-[19px_16px_14px_15px] border cursor-pointer select-none transition-[opacity,transform,box-shadow,border-color,left,top,width,height] duration-300 ${animateIn ? 'bo-critique-enter' : ''}`}
              aria-live={animateIn ? 'polite' : undefined}
              aria-label={`${isExpanded ? 'Expanded' : 'Collapsed'} critique for ${idea.rawText}`}
            >
              <div className="pointer-events-none absolute right-5 top-1 h-4 w-12 rounded-sm bg-[linear-gradient(90deg,rgba(248,251,255,0.9),rgba(226,236,245,0.78),rgba(248,251,255,0.58))] opacity-80 shadow-[inset_0_-1px_0_rgba(106,134,163,0.18)]" />
              <div
                className={`flex justify-between gap-3 border-b ${isExpanded ? 'items-start px-3 py-2' : 'items-center px-2.5 py-1.5'}`}
                style={{ borderColor: tone.ringColor }}
              >
                <div>
                  <p className={`font-bold uppercase tracking-[0.2em] text-[#6a5469] ${isExpanded ? 'text-[10px]' : 'text-[9px]'}`}>
                    Critique
                  </p>
                  {isExpanded ? (
                    <>
                      <p className="text-[11px] text-[#5c6673]">
                        Devil&apos;s advocate{busy.has(ideaId) ? ' · thinking…' : ''}
                      </p>
                      <span className={`bo-critique-confidence mt-1 inline-flex rounded-full border bg-white/75 px-2 py-0.5 text-[10px] font-semibold ${confidenceMeta.classes}`}>
                        {confidenceMeta.label}
                      </span>
                    </>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5">
                  {isExpanded ? (
                    <>
                      <button
                        type="button"
                        onPointerDown={event => event.stopPropagation()}
                        onClick={event => {
                          event.stopPropagation();
                          const acceptResult = onAccept?.(critique.id);
                          void Promise.resolve(acceptResult).then(() => {
                            setExpandedCritiqueId(current => (current === critique.id ? null : current));
                          }).catch(() => {});
                        }}
                        disabled={busy.has(ideaId)}
                        className="pointer-events-auto rounded-md border border-emerald-200 bg-emerald-50/90 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:cursor-wait disabled:opacity-60"
                        aria-label="Accept critique"
                        title="Accept critique"
                      >
                        {busy.has(ideaId) ? 'Applying…' : 'Accept'}
                      </button>
                      {onDismiss && (
                        <button
                          type="button"
                          onPointerDown={event => event.stopPropagation()}
                          onClick={event => {
                            event.stopPropagation();
                            void onDismiss(critique.id);
                          }}
                          disabled={busy.has(ideaId)}
                          className="pointer-events-auto rounded-md border border-slate-200 bg-white/80 px-2 py-1 text-[11px] font-semibold text-[#5f7387] hover:bg-[#edf5fb] focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-wait disabled:opacity-60"
                          aria-label="Dismiss critique"
                          title="Dismiss critique"
                        >
                          Dismiss
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#59718b]">
                      Open
                    </span>
                  )}
                </div>
              </div>

              {isExpanded ? (
                <div className="space-y-2 px-3 py-2.5">
                  <p className="text-sm font-semibold leading-snug text-[#334355]">
                    {critique.critique}
                  </p>
                  <div className="rounded-xl bg-white/75 px-2.5 py-2 ring-1" style={{ borderColor: tone.ringColor }}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#59718b]">
                      Evidence To Clear
                    </p>
                    <p className="mt-1 text-xs leading-snug text-[#506274]">
                      {critique.evidenceAsk}
                    </p>
                  </div>
                </div>
              ) : null}
            </section>
          );
        });
      })}
    </>
  );
}
