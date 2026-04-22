import { createCapturedIdea } from '../board/ideaFactory';
import type { BoardId, Idea, IdeaCritique, ScoutSuggestion } from '../types';

export function nextBoardRecord(board: { updatedAt: number; changeCursor: number; nextChangeSeq: number }, now: number) {
  return {
    ...board,
    updatedAt: now,
    changeCursor: board.nextChangeSeq,
    nextChangeSeq: board.nextChangeSeq + 1,
  };
}

export function createIdeaFromSuggestion(boardId: BoardId, suggestion: ScoutSuggestion, createdAt: number): Idea {
  const bodyParts = [suggestion.rawText];
  if (suggestion.elaboration) bodyParts.push('', '## Scout elaboration', suggestion.elaboration);
  if (suggestion.rationale) bodyParts.push('', `_Scout rationale:_ ${suggestion.rationale}`);
  return createCapturedIdea({
    boardId,
    rawText: bodyParts.join('\n'),
    tags: ['from-scout', suggestion.source.split(':')[0]?.trim() || 'scout'],
    panel: suggestion.panel ? { ...suggestion.panel } : undefined,
    createdAt,
  });
}

export function findDuplicateAiCritique(
  critiques: IdeaCritique[],
  input: { critiqueText: string; automationKey?: string },
): IdeaCritique | null {
  if (input.automationKey) {
    return critiques.find(critique => critique.status === 'active' && critique.automationKey === input.automationKey) ?? null;
  }
  const normalizedCritique = normalizeDedupText(input.critiqueText);
  return critiques.find(critique => (
    critique.status === 'active' &&
    normalizeDedupText(critique.critique) === normalizedCritique
  )) ?? null;
}

export function findDuplicateAiSuggestion(
  suggestions: ScoutSuggestion[],
  input: { rawText: string; automationKey?: string },
): ScoutSuggestion | null {
  if (input.automationKey) {
    return suggestions.find(suggestion => (
      (suggestion.status === 'pending' || suggestion.status === 'admitted') &&
      suggestion.automationKey === input.automationKey
    )) ?? null;
  }
  const normalizedSuggestion = normalizeDedupText(input.rawText);
  return suggestions.find(suggestion => (
    (suggestion.status === 'pending' || suggestion.status === 'admitted') &&
    normalizeDedupText(suggestion.rawText) === normalizedSuggestion
  )) ?? null;
}

function normalizeDedupText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}
