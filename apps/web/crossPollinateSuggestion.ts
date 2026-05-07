import type { BoardDocument } from '../../src/board/types';
import { runAdhocRole } from '../../src/orchestrator/adhocRole';
import { reportLlmFallback } from '../../src/orchestrator/retryAndFallback';
import {
  buildCrossPollinateTask,
  crossPollinate,
  type CrossPollinateOutput,
} from '../../src/orchestrator/roles/crossPollinate';
import type { BoardHistoryState } from '../../src/storage/boardControllerTypes';
import type { Idea, ScoutSuggestion } from '../../src/types';
import { normalizeSuggestionText } from './suggestionDedup';
import {
  ghostPanelFor,
  suggestionActorFor,
  type SuggestionMutationSource,
} from './suggestionActionHelpers';

export async function runCrossPollinateSuggestion(args: {
  ideas: Idea[];
  currentSuggestions: ScoutSuggestion[];
  existingSuggestions: ScoutSuggestion[];
  createSuggestion: (input: {
    rawText: string;
    rationale: string;
    source: string;
    relatedIdeaIds?: string[];
    sourceIdeaIds?: string[];
    panel?: ScoutSuggestion['panel'];
    actor: ReturnType<typeof suggestionActorFor>;
  }) => Promise<{
    suggestion: ScoutSuggestion;
    document: BoardDocument;
    history: BoardHistoryState;
  }>;
  applyCommittedBoard: (document: BoardDocument, history: BoardHistoryState) => void;
  source?: SuggestionMutationSource;
}): Promise<ScoutSuggestion | null> {
  const liveIdeas = args.ideas.filter(idea => idea.status !== 'archived' && idea.status !== 'discarded');
  if (liveIdeas.length < 2) return null;

  const { result, providerId, model } = await runAdhocRole<CrossPollinateOutput>(
    crossPollinate,
    buildCrossPollinateTask({ liveIdeas, existingSuggestions: args.existingSuggestions }),
  );
  // Distinguish three outcomes: model gave us a usable proposal, model declined
  // explicitly with a reason (skipReason), or the call failed / returned null
  // entirely. Only the first is silent — the user invoked the action and
  // deserves to know if nothing came back.
  if (!result) {
    reportLlmFallback({
      providerId,
      model,
      message: 'Cross-pollinate could not produce a proposal. The model returned no usable result.',
    });
    return null;
  }
  const proposal = result.proposal;
  if (!proposal) {
    const reason = result.skipReason?.trim();
    reportLlmFallback({
      providerId,
      model,
      message: reason
        ? `Cross-pollinate skipped this round: ${reason}`
        : 'Cross-pollinate did not find a strong enough pair on the board to merge right now.',
    });
    return null;
  }

  const [ideaIdA, ideaIdB] = proposal.sourceIdeaIds;
  if (!ideaIdA || !ideaIdB || ideaIdA === ideaIdB) return null;

  const liveIdeasById = new Map(liveIdeas.map(idea => [idea.id, idea]));
  const sourceIdeas = [liveIdeasById.get(ideaIdA), liveIdeasById.get(ideaIdB)];
  if (sourceIdeas.some(idea => !idea)) return null;

  const normalizedRawText = normalizeSuggestionText(proposal.rawText);
  const existingRawTexts = new Set(args.existingSuggestions.map(suggestion => normalizeSuggestionText(suggestion.rawText)));
  if (existingRawTexts.has(normalizedRawText)) {
    return null;
  }

  const sourceLabel = proposal.sourceLabel?.trim() || sourceIdeas
    .map(idea => truncateIdeaLabel(idea!.rawText))
    .join(' × ');

  const committed = await args.createSuggestion({
    rawText: proposal.rawText,
    rationale: proposal.rationale,
    source: `cross-pollinate: ${sourceLabel}`,
    relatedIdeaIds: [ideaIdA, ideaIdB],
    sourceIdeaIds: [ideaIdA, ideaIdB],
    panel: ghostPanelFor(args.currentSuggestions.length),
    actor: suggestionActorFor({ source: args.source, label: 'crossPollinate' }),
  });
  args.applyCommittedBoard(committed.document, committed.history);
  return committed.suggestion;
}

function truncateIdeaLabel(rawText: string): string {
  const trimmed = rawText.trim();
  if (trimmed.length <= 32) return trimmed;
  return `${trimmed.slice(0, 31).trimEnd()}…`;
}
