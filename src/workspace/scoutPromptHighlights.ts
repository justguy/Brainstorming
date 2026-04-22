import type { Idea, ScoutSuggestion } from '../types';

export interface ScoutPromptHighlight {
  label: string;
  value: string;
}

const LENS_ASK = 'Generate 3-5 outside-in lenses that force a re-check of hidden assumptions.';
const LENS_BAR = 'Keep only vivid reframes with a concrete provocation. No soft rewordings.';
const SUGGESTION_BAR = 'Real additions only: a new mechanism, constraint, or target. No gentle extensions.';

export function buildIdeaScoutPromptHighlights(idea: Idea): ScoutPromptHighlight[] {
  return [
    { label: 'Focus note', value: idea.rawText },
    { label: 'Ask', value: LENS_ASK },
    { label: 'Keep only', value: LENS_BAR },
  ];
}

export function buildSuggestionPromptHighlights(args: {
  suggestion: ScoutSuggestion;
  ideas: Idea[];
}): ScoutPromptHighlight[] {
  const relatedIdeas = args.ideas
    .filter(idea => args.suggestion.relatedIdeaIds?.includes(idea.id))
    .slice(0, 3)
    .map(idea => trimIdea(idea.rawText));

  return [
    {
      label: 'Move',
      value: args.suggestion.source || 'Scout suggestion',
    },
    {
      label: 'Bar',
      value: SUGGESTION_BAR,
    },
    {
      label: 'In dialogue with',
      value: relatedIdeas.length > 0 ? relatedIdeas.join(' · ') : 'Board context only.',
    },
  ];
}

function trimIdea(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= 56 ? trimmed : `${trimmed.slice(0, 55)}…`;
}
