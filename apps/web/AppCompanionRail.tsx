import React from 'react';
import type { BeatName, BeatRunState } from '../../src/beats/types';
import type { BeatReviewItemRecord, BeatReviewSessionRecord } from '../../src/board/types';
import type { Connection, Idea, ScoutSuggestion } from '../../src/types';
import ConnectionsPanel from '../../src/canvas/ConnectionsPanel';
import { BoardBeatsCard } from './BoardBeatsCard';
import { CollaborativeSessionCard } from './CollaborativeSessionCard';
import { DevCompanionCard } from './DevCompanionCard';
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
  handleHighlight: (ideaIds: string[]) => void;
  onCreateConnection: (input: {
    fromIdeaId: string;
    toIdeaId: string;
    kind: Connection['kind'];
    rationale: string;
  }) => Promise<Connection>;
  runScout: () => void | Promise<void>;
  dismissHint: () => void;
  boardBeatReviewSession: BeatReviewSessionRecord | null;
  boardBeatReviewItems: BeatReviewItemRecord[];
  onOpenBoardBeatReview?: () => void;
  onRunClusterBeat: () => void | Promise<void>;
  onRunSummariseBeat: () => void | Promise<void>;
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
  runConnectionFinder,
  handleHighlight,
  onCreateConnection,
  runScout,
  dismissHint,
  boardBeatReviewSession,
  boardBeatReviewItems,
  onOpenBoardBeatReview,
  onRunClusterBeat,
  onRunSummariseBeat,
  session,
}: AppCompanionRailProps): React.ReactElement {
  const companionAction = companionActionLabel
    ? () => {
        void handleSoftModeAction();
      }
    : undefined;
  const scoutHeading = scouting
    ? 'Facilitator is widening the thread now'
    : suggestions.length > 0
      ? `Review ${suggestions.length} staged scout suggestion${suggestions.length === 1 ? '' : 's'}`
      : 'Ask Scout to widen the current thread';
  const scoutDetail = suggestions.length > 0
    ? 'The facilitator already placed nearby options on the canvas. Clear those first, then open a fresh pass.'
    : 'Scout reads the current canvas and stages nearby directions inline instead of opening a separate AI thread.';
  const scoutBadge = scouting
    ? 'running'
    : suggestions.length > 0
      ? `${suggestions.length} waiting`
      : lastScoutRunAt
        ? formatSince(lastScoutRunAt)
        : 'manual';
  const scoutStatus = suggestions.length > 0
    ? `${suggestions.length} staged`
    : scouting
      ? 'Thinking inline'
      : 'Stages ideas on the board';

  return (
    <div
      className="bo-companion-rail h-full max-h-[48vh] overflow-y-auto overscroll-y-contain px-4 py-4 lg:max-h-none lg:px-5"
      aria-label="AI facilitator rail"
    >
      <div className="mx-auto flex w-full max-w-[360px] flex-col gap-2.5 bo-compact-stack">
        <div className="bo-companion-primary-stack flex flex-col gap-2.5 bo-compact-stack">
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
            onTogglePause={toggleFacilitatorPause}
          />

          <button
            type="button"
            onClick={() => {
              void runScout();
            }}
            disabled={scouting}
            className="bo-card-surface bo-compact-card flex w-full items-start justify-between gap-3 rounded-[28px] bg-[linear-gradient(180deg,rgba(240,253,250,0.96),rgba(255,255,255,0.98))] px-4 py-3 text-left focus:outline-none focus:ring-4 focus:ring-teal-200 disabled:opacity-60"
            aria-label={scouting ? 'Scout running' : 'Ask the scout to suggest ideas'}
            title={
              lastScoutRunAt
                ? `Last scout run ${formatSince(lastScoutRunAt)}. Click to refresh.`
                : 'Ask the scout to propose ideas adjacent to the board.'
            }
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${scouting ? 'bg-teal-500 bo-status-pulse' : 'bg-teal-400'}`} aria-hidden="true" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
                  Scout beat
                </p>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {scoutHeading}
              </p>
              <p className="bo-compact-copy mt-1 text-xs leading-5 text-slate-600">
                {scoutDetail}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span className="rounded-full bg-teal-50 px-2 py-0.5 font-medium text-teal-700">
                  {scoutStatus}
                </span>
                <span>Canvas-first</span>
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

        <ConnectionsPanel
          ideas={ideas}
          connections={connections}
          busy={findingConnections}
          lastRunAt={lastConnectionsRunAt}
          onRun={runConnectionFinder}
          onHighlight={handleHighlight}
          onCreateConnection={onCreateConnection}
        />

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

function formatSince(timestamp: number | null): string {
  if (!timestamp) return 'not yet';
  const delta = Math.max(0, Date.now() - timestamp);
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return `${Math.round(delta / 3_600_000)}h ago`;
}
