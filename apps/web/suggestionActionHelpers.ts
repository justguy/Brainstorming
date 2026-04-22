import type { ScoutSuggestion } from '../../src/types';

export type RevealOrigin = 'manual' | 'ai';
export type SuggestionMutationSource = 'canvas' | 'webmcp' | 'beat';

export function ghostPanelFor(index: number): ScoutSuggestion['panel'] {
  return {
    x: 520 + (index % 2) * 40,
    y: 60 + index * 220,
    width: 280,
    height: 200,
  };
}

export function suggestionActorFor(options: {
  origin?: RevealOrigin;
  source?: SuggestionMutationSource;
  label?: string;
}) {
  if (options.origin === 'ai') {
    return {
      type: 'ai' as const,
      source: 'beat' as const,
      beat: 'scout' as const,
      label: options.label ?? 'outsideKnowledgeScout',
    };
  }
  if (options.source === 'webmcp') {
    return { type: 'tool' as const, source: 'webmcp' as const };
  }
  return { type: 'user' as const, source: 'canvas' as const };
}
