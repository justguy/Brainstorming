import React from 'react';
import type { BeatRunState } from '../../src/beats/types';
import {
  activityLabel,
  beatLabel,
  companionMode,
  companionRoleModel,
  formatSince,
  type CompanionCardModelInput,
} from './devCompanionCardModel';

interface DevCompanionCardProps extends CompanionCardModelInput {
  idleMs: number;
  activeBeatRun: BeatRunState | null;
  focusIdeaText?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionInProgress?: boolean;
  undoRobotLabel?: string;
  onUndoRobot?: () => void;
  onTogglePause: () => void;
  onOpenTurnLog?: () => void;
  turnLogCount?: number;
  turnLogPendingCount?: number;
}

interface RobotBadgeIconProps {
  className?: string;
}

export function DevCompanionCard(props: DevCompanionCardProps): React.ReactElement {
  const mode = companionMode(props);
  const roleModel = companionRoleModel(props);
  const rawRoleTag = roleModel.roleTag?.trim() || 'Bot';
  const roleLabel = rawRoleTag.toLowerCase();
  const nudgeLabel = props.actionInProgress ? 'drafting…' : 'nudge me';
  const statusInline = props.facilitatorPaused
    ? 'paused'
    : props.actionInProgress || props.activeBeatRun
    ? 'thinking…'
    : null;
  const helperLine = props.hasApiKey === false
    ? 'Provider key missing.'
    : props.lastAiAction?.kind
    ? `${beatLabel(props.lastAiAction.kind)} last`
    : roleModel.stateLabel;
  const turnLogTitle = props.turnLogPendingCount
    ? `${props.turnLogPendingCount} pending`
    : props.turnLogCount
      ? `${props.turnLogCount} entries`
      : 'Open turn log';
  const canNudge = Boolean(props.actionLabel && props.onAction && props.hasApiKey !== false);
  const shouldPulse = Boolean((props.actionInProgress || props.activeBeatRun) && !props.facilitatorPaused);

  return (
    <section
      className="bo-persona-dock"
      aria-label="Dev companion"
      style={{ color: 'var(--ink)' }}
    >
      <div
        className={`bo-persona-avatar${shouldPulse ? ' is-pulsing' : ''}`}
        style={{
          background: 'var(--sticky-peach)',
          border: '2px solid var(--ink)',
          boxShadow: '2px 2px 0 var(--ink)',
        }}
      >
        <RobotBadgeIcon className="h-[3.1rem] w-[3.1rem]" />
      </div>

      <div
        className="bo-persona-bubble min-w-0"
        aria-live="polite"
        aria-atomic="true"
        style={{
          background: 'var(--paper)',
          border: '2px solid var(--ink)',
          boxShadow: '3px 3px 0 var(--ink)',
          borderRadius: 14,
          fontFamily: 'var(--f-hand-body)',
        }}
      >
        <p
          className="bo-persona-who"
          style={{
            fontFamily: 'var(--f-mono)',
            color: 'var(--ink-faint)',
            letterSpacing: '0.16em',
          }}
        >
          Dev · {roleLabel}
          {statusInline ? (
            <span
              className="bo-persona-status-inline"
              style={{ color: 'var(--accent-ghost)' }}
            >
              {' '}· {statusInline}
            </span>
          ) : null}
        </p>

        <p
          className="bo-persona-what"
          style={{
            fontFamily: 'var(--f-hand-body)',
            color: 'var(--ink)',
            fontSize: '1rem',
            fontWeight: 600,
          }}
        >
          {buildDockPrompt(props, mode.headline, roleLabel)}
        </p>

        <p
          className="bo-persona-meta"
          style={{
            fontFamily: 'var(--f-mono)',
            color: 'var(--ink-soft)',
            letterSpacing: '0.12em',
          }}
        >
          {helperLine}
        </p>

        <div className="bo-persona-actions">
          <button
            type="button"
            onClick={props.onTogglePause}
            className="btn sm primary"
          >
            {props.facilitatorPaused ? 'resume' : 'pause'}
          </button>

          {props.actionLabel && props.onAction && (
            <button
              type="button"
              onClick={props.onAction}
              disabled={!canNudge}
              className="btn sm"
              title={props.hasApiKey === false ? 'Add a provider key in Options first.' : undefined}
            >
              {nudgeLabel}
            </button>
          )}

          <button
            type="button"
            onClick={props.onOpenTurnLog}
            disabled={!props.onOpenTurnLog}
            className="btn sm ghost"
            title={turnLogTitle}
          >
            turn log
          </button>
        </div>

        {props.undoRobotLabel && props.onUndoRobot && (
          <div className="bo-persona-undo">
            <button
              type="button"
              onClick={props.onUndoRobot}
              className="btn sm ghost"
              title={props.undoRobotLabel}
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 11,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--accent-ghost)',
                borderColor: 'var(--accent-ghost)',
              }}
            >
              undo robot
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function buildDockPrompt(
  props: DevCompanionCardProps,
  modeHeadline: string,
  roleLabel: string,
): string {
  if (props.hasApiKey === false) {
    return 'no provider key. add one in options and i will start scouting.';
  }
  if (props.facilitatorPaused) {
    return 'paused. ping me when you want another pass.';
  }
  if (props.activeBeatRun) {
    return `${roleLabel.toLowerCase()} is running. staging the result on the board.`;
  }
  if (props.focusIdeaText) {
    return `pressing on '${props.focusIdeaText}'. listening for weak spots.`;
  }
  if (props.pendingBoardChange || props.interactionSuppressed) {
    return 'watching this thread. ready when you are.';
  }
  if (modeHeadline.toLowerCase().includes('ready')) {
    return 'board is settled. next move?';
  }
  return 'reading the board. standing by.';
}

function RobotBadgeIcon({ className = 'h-8 w-8' }: RobotBadgeIconProps): React.ReactElement {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
      <circle cx="32" cy="34" r="18" fill="#DFF4FF" stroke="#113B56" strokeWidth="3" />
      <path d="M32 10v8M25 10h14" stroke="#113B56" strokeWidth="3" strokeLinecap="round" />
      <circle cx="25" cy="32" r="3.2" fill="#113B56" />
      <circle cx="39" cy="32" r="3.2" fill="#113B56" />
      <path d="M24 42c2.4 2 5.1 3 8 3s5.6-1 8-3" stroke="#113B56" strokeWidth="3" strokeLinecap="round" />
      <rect x="14" y="25" width="6" height="12" rx="3" fill="#DFF4FF" stroke="#113B56" strokeWidth="3" />
      <rect x="44" y="25" width="6" height="12" rx="3" fill="#DFF4FF" stroke="#113B56" strokeWidth="3" />
    </svg>
  );
}
