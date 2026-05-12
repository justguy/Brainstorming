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
  backgroundAiError?: { source: 'scout' | 'connect' | 'critique'; message: string; at: number } | null;
  dismissBackgroundAiError?: () => void;
  robotNotes?: {
    title?: string;
    items?: FacilitatorStagedInsight[];
    maxVisibleItems?: number;
    onApply?: (insightId: string) => void;
    onDismiss?: (insightId: string) => void;
  };
  /**
   * bo-143 — slot for the Synthesizer cluster-proposal NudgeCard list.
   * Owned by `BoardScreen` so the apply / preview / dismiss handlers stay
   * close to the cluster-review state (`useBeatReviewActions`).
   */
  synthesizerProposals?: React.ReactNode;
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
  backgroundAiError,
  dismissBackgroundAiError,
  robotNotes,
  synthesizerProposals,
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
      style={{
        fontFamily: 'var(--f-hand-body)',
        color: 'var(--ink)',
      }}
    >
      <div className="mx-auto flex w-full max-w-[340px] flex-col gap-2 bo-compact-stack">
        {backgroundAiError && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-start justify-between gap-2"
            style={{
              borderRadius: 12,
              border: '2px solid var(--accent-contradicts)',
              background: 'var(--sticky-pink)',
              padding: '8px 10px',
              fontFamily: 'var(--f-hand-body)',
              fontSize: 13,
              color: 'var(--ink)',
              boxShadow: '3px 3px 0 var(--ink)',
            }}
          >
            <span style={{ lineHeight: 1.35 }}>
              <span
                style={{
                  fontFamily: 'var(--f-mono)',
                  fontSize: 10,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--accent-contradicts)',
                  fontWeight: 700,
                  marginRight: 6,
                }}
              >
                {backgroundAiError.source}
              </span>
              {backgroundAiError.message}
            </span>
            {dismissBackgroundAiError && (
              <button
                type="button"
                onClick={dismissBackgroundAiError}
                className="icon-btn"
                aria-label="Dismiss background AI error"
                style={{
                  width: 26,
                  height: 26,
                  fontSize: 14,
                  lineHeight: 1,
                  color: 'var(--accent-contradicts)',
                }}
              >
                ×
              </button>
            )}
          </div>
        )}
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

          {synthesizerProposals}

          {showReviewPanel && (
            <section
              className="bo-card-surface"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                borderRadius: 14,
                border: '2px solid var(--ink)',
                background: 'var(--paper)',
                padding: 12,
                boxShadow: '3px 3px 0 var(--ink)',
                fontFamily: 'var(--f-hand-body)',
                color: 'var(--ink)',
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p
                    style={{
                      margin: 0,
                      fontFamily: 'var(--f-mono)',
                      fontSize: 10,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--ink-faint)',
                      fontWeight: 700,
                    }}
                  >
                    Review and actions
                  </p>
                  <p
                    style={{
                      marginTop: 4,
                      marginBottom: 0,
                      fontFamily: 'var(--f-hand)',
                      fontSize: 20,
                      fontWeight: 700,
                      lineHeight: 1.15,
                      color: 'var(--ink)',
                    }}
                  >
                    {boardBeatReviewSession?.title ?? 'Facilitator review items'}
                  </p>
                  <p
                    style={{
                      marginTop: 4,
                      marginBottom: 0,
                      fontFamily: 'var(--f-mono)',
                      fontSize: 10.5,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--ink-soft)',
                    }}
                  >
                    {turnLogPendingCount > 0 ? `${turnLogPendingCount} pending` : 'No pending'} · {turnLogKeptCount} kept · {turnLogScratchedCount} scratched
                  </p>
                </div>
              </div>

              {reviewItemPreview.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {reviewItemPreview.map(item => (
                    <article
                      key={item.id}
                      style={{
                        borderRadius: 10,
                        border: '1.5px solid var(--hairline)',
                        background: 'var(--paper)',
                        padding: 8,
                        fontSize: 13,
                        color: 'var(--ink-soft)',
                        fontFamily: 'var(--f-hand-body)',
                      }}
                    >
                      <div className="mb-0.5 flex items-center justify-between gap-2">
                        <span
                          style={{
                            fontFamily: 'var(--f-mono)',
                            fontSize: 10,
                            letterSpacing: '0.16em',
                            textTransform: 'uppercase',
                            color: 'var(--ink-faint)',
                            fontWeight: 700,
                          }}
                        >
                          {item.beat}
                        </span>
                        <span
                          style={{
                            ...reviewStatusToneStyle(item.status),
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '1px 8px',
                            borderRadius: 999,
                            fontFamily: 'var(--f-mono)',
                            fontSize: 10,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                          }}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', lineHeight: 1.4 }}>
                        {compactText(reviewItemLine(item), 72)}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p
                  style={{
                    margin: 0,
                    borderRadius: 10,
                    border: '1.4px dashed var(--hairline)',
                    background: 'var(--paper-dark)',
                    padding: '8px 12px',
                    fontSize: 13,
                    lineHeight: 1.4,
                    color: 'var(--ink-soft)',
                    fontFamily: 'var(--f-hand-body)',
                  }}
                >
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
                  className="btn sm"
                >
                  Run cluster role
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void onRunSummariseBeat();
                  }}
                  disabled={activeBeatRun !== null}
                  className="btn sm"
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

function reviewStatusToneStyle(
  status: BeatReviewItemRecord['status'],
): React.CSSProperties {
  switch (status) {
    case 'pending':
      return {
        border: '1.5px solid var(--ink)',
        background: 'var(--sticky-yellow)',
        color: 'var(--ink)',
      };
    case 'kept':
      return {
        border: '1.5px solid var(--accent-revives)',
        background: 'var(--sticky-green)',
        color: 'var(--ink)',
      };
    case 'scratched':
      return {
        border: '1.5px dashed var(--ink-faint)',
        background: 'var(--paper-dark)',
        color: 'var(--ink-soft)',
      };
    default:
      return {
        border: '1.5px solid var(--hairline)',
        background: 'var(--paper-dark)',
        color: 'var(--ink-soft)',
      };
  }
}
