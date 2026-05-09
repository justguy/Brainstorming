import React from 'react';
import type { Idea, IdeaCritique } from '../types';
import { collectIdeaAttentionItems, type IdeaAttentionItem } from '../workspace/ideaAttentionItems';

interface IdeaAttentionLayerProps {
  ideas: Idea[];
  critiques: IdeaCritique[];
  onActivate: (input: { ideaId: string; attentionId: string }) => void;
}

const POSITION_CLASS = [
  'bo-idea-attention bo-idea-attention--top-left',
  'bo-idea-attention bo-idea-attention--top-right',
  'bo-idea-attention bo-idea-attention--bottom-right',
] as const;

export function IdeaAttentionLayer({
  ideas,
  critiques,
  onActivate,
}: IdeaAttentionLayerProps): React.ReactElement {
  return (
    <>
      {ideas.map(idea => {
        if (!idea.panel) return null;
        const item = collectIdeaAttentionItems({ idea, critiques })
          .find(candidate => candidate.kind !== 'critique');
        if (!item) return null;
        const slotIndex = positionSlotIndex(idea.id);
        const position = annotationPosition(idea, item, slotIndex);
        return (
          <button
            key={`${idea.id}:${item.id}`}
            type="button"
            className={`${POSITION_CLASS[slotIndex]} bo-idea-attention--${item.accent}`}
            style={{ left: position.left, top: position.top, width: position.width }}
            onClick={() => onActivate({ ideaId: idea.id, attentionId: item.id })}
            title={item.body}
          >
            <span className="bo-idea-attention__label">{item.label}</span>
            <span className="bo-idea-attention__body">{trimBody(item.body)}</span>
            <span className="bo-idea-attention__arrow" aria-hidden="true" />
          </button>
        );
      })}
    </>
  );
}

function annotationPosition(
  idea: Idea,
  item: IdeaAttentionItem,
  index: number,
): { left: number; top: number; width: number } {
  const panel = idea.panel ?? { x: 0, y: 0, width: 260, height: 180 };
  const width = Math.min(182, Math.max(128, item.body.length * 2.2));

  if (index === 0) {
    return {
      left: Math.max(12, panel.x - width * 0.78),
      top: Math.max(12, panel.y - 62),
      width,
    };
  }

  if (index === 1) {
    return {
      left: Math.max(12, panel.x + panel.width - width * 0.2),
      top: Math.max(12, panel.y - 48),
      width,
    };
  }

  return {
    left: Math.max(12, panel.x + panel.width - width * 0.22),
    top: panel.y + panel.height + 14,
    width,
  };
}

function trimBody(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 72 ? `${normalized.slice(0, 72)}…` : normalized;
}

function positionSlotIndex(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % POSITION_CLASS.length;
}
