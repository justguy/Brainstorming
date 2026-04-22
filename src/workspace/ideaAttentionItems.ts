import type { Idea, IdeaCritique } from '../types';
import { normalizeBeadCoordination } from '../orchestrator/beadState';

export type IdeaAttentionKind = 'critique' | 'ambiguity' | 'review_flag' | 'suggested_next';

export interface IdeaAttentionItem {
  id: string;
  kind: IdeaAttentionKind;
  label: string;
  body: string;
  accent: 'red' | 'blue' | 'green';
}

interface CollectIdeaAttentionItemsArgs {
  idea: Idea;
  critiques: IdeaCritique[];
  maxItems?: number;
}

export function collectIdeaAttentionItems({
  idea,
  critiques,
  maxItems = 3,
}: CollectIdeaAttentionItemsArgs): IdeaAttentionItem[] {
  const coordination = normalizeBeadCoordination(idea.beadCoordination);
  const items: IdeaAttentionItem[] = [];

  for (const critique of critiques) {
    if (critique.ideaId !== idea.id || critique.status !== 'active') continue;
    items.push({
      id: `critique:${critique.id}`,
      kind: 'critique',
      label: 'Critique',
      body: critique.critique,
      accent: 'red',
    });
  }

  for (const ambiguity of idea.ambiguities) {
    const status = ambiguity.resolution?.status ?? 'open';
    if (status === 'resolved') continue;
    items.push({
      id: `ambiguity:${ambiguity.id}`,
      kind: 'ambiguity',
      label: status === 'deferred' ? 'Deferred question' : 'Open question',
      body: ambiguity.plainLanguage,
      accent: 'blue',
    });
  }

  for (const reviewFlag of coordination.reviewFlags) {
    items.push({
      id: `review:${reviewFlag.id}`,
      kind: 'review_flag',
      label: `Review marker · ${reviewFlag.phase}`,
      body: reviewFlag.reason,
      accent: 'green',
    });
  }

  if (coordination.suggestedNext) {
    items.push({
      id: `suggested:${coordination.suggestedNext.phase}`,
      kind: 'suggested_next',
      label: `Next nudge · ${coordination.suggestedNext.phase}`,
      body: coordination.suggestedNext.reason,
      accent: 'green',
    });
  }

  const palette: IdeaAttentionItem['accent'][] = ['red', 'blue', 'green'];
  return items.slice(0, maxItems).map((item, index) => ({
    ...item,
    accent: palette[index % palette.length],
  }));
}
