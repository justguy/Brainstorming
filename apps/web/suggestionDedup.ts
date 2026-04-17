import type { OutsideKnowledgeScoutOutput } from '../../src/orchestrator/roles/outsideKnowledgeScout';

export const MAX_VISIBLE_SUGGESTIONS = 6;

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'if',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'the',
  'this',
  'to',
  'via',
  'with',
]);

type Suggestion = OutsideKnowledgeScoutOutput['suggestions'][number];

export function normalizeSuggestionText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function tokenSet(text: string): Set<string> {
  return new Set(
    normalizeSuggestionText(text)
      .split(/[^a-z0-9]+/i)
      .filter(token => token.length > 2 && !STOP_WORDS.has(token)),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function sourceFamily(source: string): string {
  const [family] = source.split(':');
  return normalizeSuggestionText(family ?? source);
}

function suggestionScore(suggestion: Suggestion): number {
  const relatedCount = suggestion.relatedIdeaIds?.length ?? 0;
  const uniqueTerms = tokenSet(suggestion.rawText).size;
  const conciseBonus = Math.max(0, 180 - suggestion.rawText.length) / 180;
  const sourceBonus = normalizeSuggestionText(suggestion.source) === sourceFamily(suggestion.source) ? 0 : 0.2;
  return relatedCount * 2 + uniqueTerms * 0.12 + conciseBonus + sourceBonus;
}

function isNearDuplicate(
  candidateTokens: Set<string>,
  candidateSourceFamily: string,
  seenEntries: Array<{ tokens: Set<string>; sourceFamily: string }>,
): boolean {
  return seenEntries.some(seen => {
    const similarity = jaccardSimilarity(candidateTokens, seen.tokens);
    if (similarity >= 0.82) return true;
    return similarity >= 0.67 && candidateSourceFamily === seen.sourceFamily;
  });
}

export function pickVisibleSuggestions(args: {
  currentVisibleCount: number;
  alreadyProposedRawTexts: string[];
  dismissedRawTexts: string[];
  suggestions: OutsideKnowledgeScoutOutput['suggestions'];
}): OutsideKnowledgeScoutOutput['suggestions'] {
  const availableSlots = Math.max(0, MAX_VISIBLE_SUGGESTIONS - args.currentVisibleCount);
  if (availableSlots === 0) return [];

  const seenTexts = new Set(
    [...args.alreadyProposedRawTexts, ...args.dismissedRawTexts].map(normalizeSuggestionText),
  );
  const seenEntries = [...args.alreadyProposedRawTexts, ...args.dismissedRawTexts]
    .map(text => ({
      tokens: tokenSet(text),
      sourceFamily: '',
    }))
    .filter(entry => entry.tokens.size > 0);

  const ranked = args.suggestions
    .map((suggestion, index) => ({
      suggestion,
      index,
      normalized: normalizeSuggestionText(suggestion.rawText),
      tokens: tokenSet(suggestion.rawText),
      sourceFamily: sourceFamily(suggestion.source),
      score: suggestionScore(suggestion),
    }))
    .filter(candidate => !!candidate.normalized && !seenTexts.has(candidate.normalized))
    .sort((a, b) => b.score - a.score || a.suggestion.rawText.length - b.suggestion.rawText.length || a.index - b.index);

  const picked: OutsideKnowledgeScoutOutput['suggestions'] = [];

  for (const candidate of ranked) {
    if (candidate.tokens.size > 0 && isNearDuplicate(candidate.tokens, candidate.sourceFamily, seenEntries)) {
      continue;
    }

    seenTexts.add(candidate.normalized);
    seenEntries.push({
      tokens: candidate.tokens,
      sourceFamily: candidate.sourceFamily,
    });
    picked.push(candidate.suggestion);
    if (picked.length >= availableSlots) break;
  }

  return picked;
}
