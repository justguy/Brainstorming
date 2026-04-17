import type { OutsideKnowledgeScoutOutput } from '../../src/orchestrator/roles/outsideKnowledgeScout';

export const MAX_VISIBLE_SUGGESTIONS = 6;

export function normalizeSuggestionText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function pickVisibleSuggestions(args: {
  currentVisibleCount: number;
  alreadyProposedRawTexts: string[];
  dismissedRawTexts: string[];
  suggestions: OutsideKnowledgeScoutOutput['suggestions'];
}): OutsideKnowledgeScoutOutput['suggestions'] {
  const availableSlots = Math.max(0, MAX_VISIBLE_SUGGESTIONS - args.currentVisibleCount);
  if (availableSlots === 0) return [];

  const seen = new Set(
    [...args.alreadyProposedRawTexts, ...args.dismissedRawTexts].map(normalizeSuggestionText),
  );
  const picked: OutsideKnowledgeScoutOutput['suggestions'] = [];

  for (const suggestion of args.suggestions) {
    const normalized = normalizeSuggestionText(suggestion.rawText);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    picked.push(suggestion);
    if (picked.length >= availableSlots) break;
  }

  return picked;
}
