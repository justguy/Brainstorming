import React from 'react';
import type { BeatName, BeatRunState } from '../../src/beats/types';
import type { BeatReviewItemRecord, BeatReviewSessionRecord } from '../../src/board/types';
import type {
  FacilitatorAiActionOutcomeRecord,
  FacilitatorAutonomyState,
  FacilitatorStagedInsight,
} from '../../src/storage/facilitatorSync';
import type { Connection, Idea, ScoutSuggestion } from '../../src/types';
import { CollaborativeSessionCard } from './CollaborativeSessionCard';
import { DevCompanionCard } from './DevCompanionCard';
import { RobotNotesSummary, type RobotNotesItem } from './RobotNotesSummary';
import type { CompanionSessionInput } from './companionSessionSummary';
import { SoftModeHint } from './SoftModeHint';
import type { ActivityKind, SoftModeAssessment } from './softMode';

export interface AppCompanionRailRecentAiAction {
  kind: BeatName;
  createdAt: number;
  ideaId?: string;
}

export interface AppCompanionRailProps {
  hasApiKey: boolean | null;
  facilitatorPaused: boolean;
  activeBeatRun: BeatRunState | null;
  softModeAssessment: SoftModeAssessment;
  interactionSuppressed: boolean;
  idleMs: number;
  autoIdleMs: number;
  lastAiAction?: AppCompanionRailRecentAiAction;
  lastScoutRunAt: number | null;
  lastConnectionsRunAt: number | null;
  companionActionLabel?: string;
  undoRobotLabel?: string;
  softModeBusy: boolean;
  lastMeaningfulActivity: { kind: ActivityKind | null; at: number };
  pendingBoardChange: boolean;
  autoRunReady: boolean;
  autoRunCountdownMs: number;
  showSoftModeHint: boolean;
  ideas: Idea[];
  connections: Connection[];
  findingConnections: boolean;
  scouting: boolean;
  suggestions: ScoutSuggestion[];
  handleSoftModeAction: () => void | Promise<void>;
  toggleFacilitatorPause: () => void;
  runConnectionFinder: () => void;
  runScout: () => void | Promise<void>;
  dismissHint: () => void;
  onUndoRobot?: () => void;
  onOpenTurnLog?: () => void;
  turnLogCount?: number;
  boardBeatReviewSession: BeatReviewSessionRecord | null;
  boardBeatReviewItems: BeatReviewItemRecord[];
  onOpenBoardBeatReview?: () => void;
  onRunClusterBeat: () => void | Promise<void>;
  onRunSummariseBeat: () => void | Promise<void>;
  autonomy?: {
    sharedPause: boolean;
    autonomyState: FacilitatorAutonomyState;
    recentAiActionOutcomes?: FacilitatorAiActionOutcomeRecord[];
    stagedInsightCount?: number;
  };
  robotNotes?: {
    title?: string;
    items?: FacilitatorStagedInsight[];
    maxVisibleItems?: number;
    onApply?: (insightId: string) => void;
    onDismiss?: (insightId: string) => void;
  };
  session: Omit<CompanionSessionInput, 'pendingBoardChange' | 'autoRunReady' | 'suggestionCount'>;
}

export function AppCompanionRail({
  hasApiKey,
  facilitatorPaused,
  activeBeatRun,
  softModeAssessment,
  interactionSuppressed,
  idleMs,
  autoIdleMs,
  lastAiAction,
  lastScoutRunAt,
  lastConnectionsRunAt,
  companionActionLabel,
  undoRobotLabel,
  softModeBusy,
  lastMeaningfulActivity,
  pendingBoardChange,
  autoRunReady,
  autoRunCountdownMs,
  showSoftModeHint,
  ideas,
  connections,
  findingConnections,
  scouting,
  suggestions,
  handleSoftModeAction,
  toggleFacilitatorPause,
  runScout,
  dismissHint,
  onUndoRobot,
  onOpenTurnLog,
  turnLogCount,
  boardBeatReviewSession,
  boardBeatReviewItems,
  onOpenBoardBeatReview,
  onRunClusterBeat,
  onRunSummariseBeat,
  autonomy,
  robotNotes,
  session,
}: AppCompanionRailProps): React.ReactElement {
  const companionAction = companionActionLabel
    ? () => {
        void handleSoftModeAction();
      }
    : undefined;
  const nudgeLabel = companionActionLabel?.trim() || 'Nudge me';
  const nudgeAction = () => {
    void runScout();
  };
  const reviewItemCount = boardBeatReviewItems.length;
  const turnLogPendingCount = boardBeatReviewItems.filter(item => item.status === 'pending').length;
  const turnLogKeptCount = boardBeatReviewItems.filter(item => item.status === 'kept').length;
  const turnLogScratchedCount = boardBeatReviewItems.filter(item => item.status === 'scratched').length;
  const reviewItemPreview = boardBeatReviewItems.slice(0, 2);
  const showReviewPanel = Boolean(onOpenBoardBeatReview || boardBeatReviewItems.length > 0 || boardBeatReviewSession);
  const pendingSuggestionInsights = suggestions.filter(suggestion => suggestion.status === 'pending');
  const fallbackRobotNoteItems: RobotNotesItem[] = pendingSuggestionInsights.map((suggestion, index) => ({
    id: suggestion.id,
    intent: index === 0 && suggestion.source.includes('scout')
      ? 'Scout Draft'
      : 'Scout Suggestion',
    title: compactText(suggestion.rawText, 84),
    detail: compactText(suggestion.rationale, 120),
  }));
  const stagedRobotNoteItems: RobotNotesItem[] = (robotNotes?.items ?? []).map(item => ({
    id: item.id,
    intent: stagedInsightIntent(item.kind),
    title: compactText(item.summary, 84),
    detail: item.source ? compactText(item.source, 120) : undefined,
    primaryLabel: stagedInsightPrimaryLabel(item.kind),
  }));
  const robotNoteItems = stagedRobotNoteItems.length > 0 ? stagedRobotNoteItems : fallbackRobotNoteItems;
  const robotNoteCount = autonomy?.stagedInsightCount ?? robotNoteItems.length;
  const robotNoteTitle = robotNotes?.title ?? 'Robot\'s Notes';
  const robotNotePreviewLimit = Math.max(1, robotNotes?.maxVisibleItems ?? 2);
  const showRobotNotes = robotNoteCount > 0 && robotNoteItems.length > 0;
  const showSessionCard = session.peers.length > 1 || (session.recentSessionEvents?.length ?? 0) > 0;
  const focusIdeaText = ideas[2]?.rawText.split('\n')[0] ?? ideas[0]?.rawText.split('\n')[0] ?? '';

  return (
    <div
      className="bo-companion-rail h-full max-h-[48vh] overflow-y-auto overscroll-y-contain px-3 py-3 lg:max-h-none lg:px-4"
      aria-label="AI role dock"
    >
      <div className="mx-auto flex w-full max-w-[340px] flex-col gap-2 bo-compact-stack">
        <div className="bo-companion-primary-stack flex flex-col gap-2">
          <DevCompanionCard
            hasApiKey={hasApiKey}
            facilitatorPaused={facilitatorPaused}
            activeBeatRun={activeBeatRun}
            softModeAssessment={softModeAssessment}
            interactionSuppressed={interactionSuppressed}
            idleMs={idleMs}
            autoIdleMs={autoIdleMs}
            lastAiAction={lastAiAction}
            lastScoutRunAt={lastScoutRunAt}
            lastConnectionsRunAt={lastConnectionsRunAt}
            softModeBusy={softModeBusy}
            lastMeaningfulActivity={lastMeaningfulActivity}
            pendingBoardChange={pendingBoardChange}
            autoRunReady={autoRunReady}
            autoRunCountdownMs={autoRunCountdownMs}
            actionLabel={nudgeLabel}
            onAction={nudgeAction}
            undoRobotLabel={undoRobotLabel}
            onUndoRobot={onUndoRobot}
            focusIdeaText={compactText(focusIdeaText, 44)}
            onTogglePause={toggleFacilitatorPause}
            actionInProgress={scouting}
            onOpenTurnLog={onOpenTurnLog ?? onOpenBoardBeatReview}
            turnLogCount={turnLogCount ?? reviewItemCount}
            turnLogPendingCount={turnLogPendingCount}
            autonomy={autonomy}
          />

          {showRobotNotes && (
            <RobotNotesSummary
              title={robotNoteTitle}
              stagedCount={robotNoteCount}
              items={robotNoteItems}
              maxVisibleItems={robotNotePreviewLimit}
              onPrimaryAction={robotNotes?.onApply}
              onDismiss={robotNotes?.onDismiss}
            />
          )}

          {showReviewPanel && (
            <section className="bo-card-surface space-y-2.5 rounded-[18px] border border-slate-200/80 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Review and actions
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {boardBeatReviewSession?.title ?? 'Facilitator review items'}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {turnLogPendingCount > 0 ? `${turnLogPendingCount} pending` : 'No pending'} · {turnLogKeptCount} kept · {turnLogScratchedCount} scratched
                  </p>
                </div>
              </div>

              {reviewItemPreview.length > 0 ? (
                <div className="space-y-1.5">
                  {reviewItemPreview.map(item => (
                    <article key={item.id} className="rounded-xl border border-slate-200 bg-white/90 p-2 text-xs text-slate-600">
                      <div className="mb-0.5 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {item.beat}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${reviewStatusTone(item.status)}`}>
                          {item.status}
                        </span>
                      </div>
                      <p className="leading-5">{compactText(reviewItemLine(item), 72)}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                  No review items staged.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void onRunClusterBeat();
                  }}
                  disabled={activeBeatRun !== null}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-60"
                >
                  Run cluster role
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void onRunSummariseBeat();
                  }}
                  disabled={activeBeatRun !== null}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-60"
                >
                  Run synthesis
                </button>
              </div>
            </section>
          )}
        </div>

        {showSoftModeHint && (
          <SoftModeHint
            assessment={softModeAssessment}
            actionLabel={companionActionLabel}
            busy={softModeBusy}
            onAction={companionAction}
            onDismiss={dismissHint}
          />
        )}

        {showSessionCard && (
          <CollaborativeSessionCard session={{
            ...session,
            pendingBoardChange,
            autoRunReady,
            suggestionCount: suggestions.length,
          }} />
        )}
      </div>
    </div>
  );
}

function compactText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trim()}…`;
}

function stagedInsightIntent(kind: FacilitatorStagedInsight['kind']): string {
  switch (kind) {
    case 'connection':
      return 'Connection Draft';
    case 'critique':
      return 'Critique Draft';
    case 'scout':
      return 'Scout Draft';
    case 'tool_suggestion':
      return 'Tool Suggestion';
    case 'generic':
    default:
      return 'Robot Note';
  }
}

function stagedInsightPrimaryLabel(kind: FacilitatorStagedInsight['kind']): string {
  switch (kind) {
    case 'scout':
      return 'Admit';
    case 'critique':
    case 'connection':
      return 'Apply';
    case 'tool_suggestion':
      return 'Attach';
    case 'generic':
    default:
      return 'Keep';
  }
}

function reviewItemLine(item: BeatReviewItemRecord): string {
  if (item.candidate.kind === 'idea_spawn') {
    return compactText(item.candidate.summary, 74);
  }

  if (item.candidate.kind === 'idea_insight') {
    return compactText(item.candidate.summary, 74);
  }

  if (item.candidate.kind === 'cluster_hint') {
    return compactText(`${item.candidate.label}: ${item.candidate.summary}`, 74);
  }

  return 'Review candidate item';
}

function reviewStatusTone(status: BeatReviewItemRecord['status']): string {
  switch (status) {
    case 'pending':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'kept':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'scratched':
      return 'border-slate-200 bg-slate-100 text-slate-600';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-600';
  }
}
