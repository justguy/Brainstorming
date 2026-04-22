import React, { useEffect, useRef } from 'react';
import type { Idea, IdeaCritique } from '../types';
import { collectIdeaAttentionItems } from './ideaAttentionItems';

interface IdeaAttentionPanelProps {
  idea: Idea;
  critiques: IdeaCritique[];
  highlightedAttentionId?: string | null;
}

export function IdeaAttentionPanel({
  idea,
  critiques,
  highlightedAttentionId = null,
}: IdeaAttentionPanelProps): React.ReactElement | null {
  const items = collectIdeaAttentionItems({ idea, critiques });
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!highlightedAttentionId) return;
    itemRefs.current[highlightedAttentionId]?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [highlightedAttentionId]);

  if (items.length === 0) return null;

  return (
    <section className="bo-attention-panel" aria-label="Note attention items">
      <div className="bo-attention-panel__header">
        <p className="bo-attention-panel__eyebrow">Attention</p>
        <span className="bo-attention-panel__count">{items.length} item{items.length === 1 ? '' : 's'}</span>
      </div>
      <div className="bo-attention-panel__list">
        {items.map(item => (
          <div
            key={item.id}
            ref={node => {
              itemRefs.current[item.id] = node;
            }}
            className={`bo-attention-panel__item bo-attention-panel__item--${item.accent} ${highlightedAttentionId === item.id ? 'bo-attention-panel__item--highlighted' : ''}`}
          >
            <p className="bo-attention-panel__item-label">{item.label}</p>
            <p className="bo-attention-panel__item-body">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
