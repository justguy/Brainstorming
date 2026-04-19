import React from 'react';
import type { BeatName, BeatRunState } from '../../src/beats/types';
import type { BeatReviewItemRecord, BeatReviewSessionRecord } from '../../src/board/types';
import type { Connection, ScoutSuggestion } from '../../src/types';
import ConnectionsPanel from '../../src/canvas/ConnectionsPanel';
import { BoardBeatsCard } from './BoardBeatsCard';
import { DevCompanionCard } from './DevCompanionCard';
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
  connections: Connection[];
  findingConnections: boolean;
  scouting: boolean;
  suggestions: ScoutSuggestion[];
  handleSoftModeAction: () => void | Promise<void>;
  toggleFacilitatorPause: () => void;
  runConnectionFinder: () => void;
  handleHighlight: (ideaIds: string[]) => void;
  runScout: () => void | Promise<void>;
  dismissHint: () => void;
  boardBeatReviewSession: BeatReviewSessionRecord | null;
  boardBeatReviewItems: BeatReviewItemRecord[];
  onOpenBoardBeatReview?: () => void;
  onRunClusterBeat: () => void | Promise<void>;
  onRunSummariseBeat: () => void | Promise<void>;
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
  connections,
  findingConnections,
  scouting,
  suggestions,
  handleSoftModeAction,
  toggleFacilitatorPause,
  runConnectionFinder,
  handleHighlight,
  runScout,
  dismissHint,
  boardBeatReviewSession,
  boardBeatReviewItems,
  onOpenBoardBeatReview,
  onRunClusterBeat,
  onRunSummariseBeat,
}: AppCompanionRailProps): React.ReactElement {
  const companionAction = companionActionLabel
    ? () => {
        void handleSoftModeAction();
      }
    : undefined;

  return (
    <div className="shrink-0 px-5 py-3">
      <div className="ml-auto flex w-full max-w-[360px] flex-col items-end gap-3">
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

        <ConnectionsPanel
          connections={connections}
          busy={findingConnections}
          lastRunAt={lastConnectionsRunAt}
          onRun={runConnectionFinder}
          onHighlight={handleHighlight}
        />

        <button
          type="button"
          onClick={() => {
            void runScout();
          }}
          disabled={scouting}
          className="bo-card-surface flex w-full items-center justify-between gap-3 rounded-[24px] px-4 py-3 text-left focus:outline-none focus:ring-4 focus:ring-teal-200 disabled:opacity-60"
          aria-label={scouting ? 'Scout running' : 'Ask the scout to suggest ideas'}
          title={
            lastScoutRunAt
              ? `Last scout run ${formatSince(lastScoutRunAt)}. Click to refresh.`
              : 'Ask the scout to propose ideas adjacent to the board.'
          }
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
              Scout beat
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {scouting ? 'Surfacing adjacent ideas…' : suggestions.length > 0 ? `Review ${suggestions.length} ghost suggestion${suggestions.length === 1 ? '' : 's'}` : 'Ask for a fresh nudge'}
            </p>
          </div>
          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
            {lastScoutRunAt ? formatSince(lastScoutRunAt) : 'manual'}
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

        {showSoftModeHint && (
          <SoftModeHint
            assessment={softModeAssessment}
            actionLabel={companionActionLabel}
            busy={softModeBusy}
            onAction={companionAction}
            onDismiss={dismissHint}
          />
        )}
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
