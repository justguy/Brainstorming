import React from 'react';
import type { BeatName, BeatRunState } from '../../src/beats/types';
import type { BeatReviewItemRecord, BeatReviewSessionRecord } from '../../src/board/types';
import type {
  FacilitatorAiActionOutcomeRecord,
  FacilitatorAutonomyState,
  FacilitatorStagedInsight,
} from '../../src/storage/facilitatorSync';
import type { Connection, Idea, ScoutSuggestion } from '../../src/types';
import { BoardBeatsCard } from './BoardBeatsCard';
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
  const scoutHeading = scouting
    ? 'Scout role running'
    : suggestions.length > 0
      ? `Review ${suggestions.length} staged scout prompt${suggestions.length === 1 ? '' : 's'}`
      : 'Ask Scout for new angles';
  const scoutDetail = suggestions.length > 0
    ? 'Role notes are already staged on canvas. Clear them first, then open a fresh pass.'
    : 'Scout reads the current canvas and stages adjacent ideas in place, so context stays on the board.';
  const scoutBadge = scouting
    ? 'running'
    : suggestions.length > 0
      ? `${suggestions.length} waiting`
      : lastScoutRunAt
        ? formatSince(lastScoutRunAt)
        : 'ready';
  const scoutStatus = suggestions.length > 0
    ? `${suggestions.length} staged`
    : scouting
      ? 'Running inline'
      : 'Ready for next pass';
  const scoutRoleStatus = activeRoleLabel(scouting);
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
  const robotNotePreviewLimit = robotNotes?.maxVisibleItems;

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
            actionLabel={companionActionLabel}
            onAction={companionAction}
            undoRobotLabel={undoRobotLabel}
            onUndoRobot={onUndoRobot}
            onTogglePause={toggleFacilitatorPause}
            autonomy={autonomy}
          />

          <RobotNotesSummary
            title={robotNoteTitle}
            stagedCount={robotNoteCount}
            items={robotNoteItems}
            maxVisibleItems={robotNotePreviewLimit}
            onPrimaryAction={robotNotes?.onApply}
            onDismiss={robotNotes?.onDismiss}
          />

          <button
            type="button"
            onClick={() => {
              void runScout();
            }}
            disabled={scouting}
            className="bo-card-surface bo-compact-card flex w-full items-start justify-between gap-3 rounded-[20px] border border-teal-200/70 bg-[linear-gradient(180deg,rgba(244,253,248,0.98),rgba(255,255,255,0.98))] px-3 py-2.5 text-left focus:outline-none focus:ring-4 focus:ring-teal-200 disabled:opacity-60"
            aria-label={scouting ? 'Scout running' : 'Ask the scout to suggest ideas'}
            title={
              lastScoutRunAt
                ? `Last scout pass ${formatSince(lastScoutRunAt)}. Click to refresh.`
                : 'Ask the Scout role to suggest adjacent moves.'
            }
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${scouting ? 'bg-teal-500 bo-status-pulse' : 'bg-teal-400'}`} aria-hidden="true" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
                  Scout role
                </p>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {scoutHeading}
              </p>
              <p className="bo-compact-copy mt-1 text-xs leading-5 text-slate-600">
                {scoutDetail}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span className="rounded-full bg-teal-50 px-2 py-0.5 font-medium text-teal-700">
                  {scoutStatus}
                </span>
                <span>{scoutRoleStatus}</span>
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-teal-200 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
              {scoutBadge}
            </span>
          </button>

          <BoardBeatsCard
            activeBeatRun={activeBeatRun}
            boardBeatReviewSession={boardBeatReviewSession}
            boardBeatReviewItems={boardBeatReviewItems}
            onOpenBoardBeatReview={onOpenBoardBeatReview}
            onRunClusterBeat={onRunClusterBeat}
            onRunSummariseBeat={onRunSummariseBeat}
          />
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

        <CollaborativeSessionCard session={{
          ...session,
          pendingBoardChange,
          autoRunReady,
          suggestionCount: suggestions.length,
        }} />
      </div>
    </div>
  );
}

function activeRoleLabel(isRunning: boolean): string {
  return isRunning ? 'Role in progress' : 'Role is queued';
}

function formatSince(timestamp: number | null): string {
  if (!timestamp) return 'not yet';
  const delta = Math.max(0, Date.now() - timestamp);
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return `${Math.round(delta / 3_600_000)}h ago`;
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
