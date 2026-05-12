/**
 * FocusMode — deep-work takeover surface (Design/Focus & Bloom Modes.html · A).
 *
 * A fixed-inset paper card with three columns: phase journey (left),
 * conversation (center) and neighbors + quick actions (right). The board is
 * minimised to a thumbnail in the top-right corner that can restore the
 * board view with a single click.
 *
 * State is hoisted in BoardScreen so transitioning between Bloom and Focus
 * preserves the selected idea, docs/turn-log/inspector toggles, etc.
 *
 * The board thumbnail is a v1 placeholder — a paper card with the board
 * title and a "Restore board" button. Accurate mini-sticky rendering is
 * deferred to a follow-up patch.
 */

import React from 'react';
import type { CSSProperties } from 'react';
import type { Connection, Idea, ScoutSuggestion } from '../../src/types';
import { IdeaConversation } from './IdeaConversation';
import { useIdeaConversationView } from './useIdeaConversationView';
import { useIdeaPhaseActions } from './useIdeaPhaseActions';
import type { NeighborIdea, PhaseStep } from './ideaConversationTypes';

export interface FocusModeActionHandlers {
  onOpenDocs?: (ideaId: string) => void;
  onToggleTurnLog?: () => void;
  onOpenInspector?: () => void;
  onOpenBrief?: (ideaId: string) => void;
  onOpenPinDialog?: (ideaId: string) => void;
  /** Closes Focus entirely — returns to the board. */
  onClose: () => void;
  /** Demotes Focus to Bloom (preserves the selected idea). */
  onDemoteToBloom: () => void;
  isTurnLogOpen?: boolean;
}

export interface FocusModeProps extends FocusModeActionHandlers {
  idea: Idea;
  boardIdeas: Idea[];
  boardConnections: Connection[];
  boardSuggestions: ScoutSuggestion[];
  boardTitle: string;
  onUpdate: (idea: Idea) => void;
  docCount: number;
  onJumpToIdea?: (ideaId: string) => void;
}

function phaseRowStyle(phase: PhaseStep): CSSProperties {
  const base: CSSProperties = {
    position: 'relative',
    padding: '6px 8px 6px 22px',
    borderRadius: 3,
    marginBottom: 1,
    fontFamily: 'var(--f-sans, Inter)',
    fontSize: 12,
    lineHeight: 1.3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    color: 'var(--ink-soft)',
    cursor: phase.status === 'done' || phase.status === 'active' ? 'pointer' : 'default',
  };
  if (phase.status === 'active') {
    base.background = 'rgba(46,134,199,0.1)';
    base.color = '#2e86c7';
    base.fontWeight = 700;
  } else if (phase.status === 'locked') {
    base.color = 'var(--ink-faint)';
  }
  return base;
}

function PhaseDotMark({ phase }: { phase: PhaseStep }): React.ReactElement {
  const size = phase.optional ? 10 : 12;
  const style: CSSProperties = {
    position: 'absolute',
    left: 2,
    top: '50%',
    transform: 'translateY(-50%)',
    width: size,
    height: size,
    borderRadius: '50%',
    border: `1.5px ${phase.optional ? 'dashed' : 'solid'} var(--ink)`,
    background: '#fffdf5',
  };
  if (phase.status === 'done') style.background = 'var(--ink)';
  else if (phase.status === 'active') {
    style.background = '#2e86c7';
    style.boxShadow = '0 0 0 3px rgba(46,134,199,0.18)';
  }
  return <span aria-hidden="true" style={style} />;
}

function NeighborCard({
  neighbor,
  onJump,
}: {
  neighbor: NeighborIdea;
  onJump?: (ideaId: string) => void;
}): React.ReactElement {
  const SWATCH_TONE: Record<NeighborIdea['swatchTone'], string> = {
    peach: 'var(--sticky-peach)',
    blue: 'var(--sticky-blue)',
    pink: 'var(--sticky-pink)',
    green: 'var(--sticky-green)',
    lilac: 'var(--sticky-lilac)',
    yellow: 'var(--sticky-yellow)',
  };
  return (
    <button
      type="button"
      onClick={onJump ? () => onJump(neighbor.ideaId) : undefined}
      disabled={!onJump}
      style={{
        position: 'relative',
        background: '#fffdf5',
        border: '1.4px solid var(--ink)',
        borderRadius: 6,
        padding: '10px 12px',
        marginBottom: 8,
        boxShadow: '2px 2px 0 var(--ink)',
        textAlign: 'left',
        display: 'block',
        width: '100%',
        cursor: onJump ? 'pointer' : 'default',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: -3,
          top: 8,
          bottom: 8,
          width: 4,
          borderRadius: 2,
          background: SWATCH_TONE[neighbor.swatchTone],
        }}
      />
      <div
        style={{
          fontFamily: 'var(--f-mono)',
          fontSize: 8.5,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--accent-ghost)',
          fontWeight: 700,
          marginBottom: 3,
        }}
      >
        {neighbor.relationshipLabel}
      </div>
      <div
        style={{
          fontFamily: 'var(--f-hand-body)',
          fontSize: 13.5,
          fontWeight: 700,
          lineHeight: 1.2,
        }}
      >
        {neighbor.title}
      </div>
      <div
        style={{
          fontFamily: 'var(--f-sans, Inter)',
          fontSize: 10.5,
          color: 'var(--ink-soft)',
          marginTop: 4,
          lineHeight: 1.4,
        }}
      >
        {neighbor.why}
      </div>
    </button>
  );
}

interface ActionButtonProps {
  label: string;
  title?: string;
  primary?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

function ActionButton({ label, title, primary, disabled, onClick }: ActionButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className={`btn sm${primary ? ' primary' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
    >
      {label}
    </button>
  );
}

export function FocusMode({
  idea,
  boardIdeas,
  boardConnections,
  boardSuggestions,
  boardTitle,
  onUpdate,
  docCount,
  onOpenDocs,
  onToggleTurnLog,
  onOpenInspector,
  onOpenBrief,
  onOpenPinDialog,
  onClose,
  onDemoteToBloom,
  onJumpToIdea,
  isTurnLogOpen = false,
}: FocusModeProps): React.ReactElement {
  const view = useIdeaConversationView({
    idea,
    boardIdeas,
    boardConnections,
    boardSuggestions,
    conversationLimit: 16,
  });
  const actions = useIdeaPhaseActions({ idea, onUpdate });

  const title = (idea.rawText || 'Untitled idea').trim();
  const activePhase = view.phases.find(p => p.status === 'active');
  const doneCount = view.phases.filter(p => p.status === 'done').length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Focused idea: ${title}`}
      style={{
        position: 'fixed',
        inset: 24,
        background: '#fffdf5',
        border: '2px solid var(--ink)',
        borderRadius: 8,
        boxShadow: '4px 4px 0 var(--ink), 0 18px 30px rgba(26,24,20,0.18)',
        zIndex: 40,
        display: 'grid',
        gridTemplateColumns: '220px 1fr 280px',
        gridTemplateRows: 'auto 1fr',
        gridTemplateAreas: '"head head head" "phases conv neigh"',
        overflow: 'hidden',
      }}
    >
      {/* Header strip */}
      <div
        style={{
          gridArea: 'head',
          padding: '18px 24px 14px',
          borderBottom: '1.4px solid var(--ink)',
          background: 'var(--paper)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: 'var(--f-mono)',
              fontSize: 9.5,
              letterSpacing: '0.11em',
              textTransform: 'uppercase',
              color: 'var(--ink-faint)',
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              marginBottom: 5,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#2e86c7',
              }}
            />
            You · in the room with this idea
          </div>
          <h3
            style={{
              fontFamily: 'var(--f-hand)',
              fontWeight: 700,
              fontSize: 32,
              lineHeight: 1,
              margin: '0 0 4px',
              letterSpacing: '-0.4px',
              color: 'var(--ink)',
            }}
          >
            {title.slice(0, 120)}
            {title.length > 120 ? '…' : ''}
          </h3>
          <div
            style={{
              fontFamily: 'var(--f-mono)',
              fontSize: 10,
              color: 'var(--ink-soft)',
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span>phase {String(idea.phase)}</span>
            {idea.providerUsed ? (
              <>
                <span>·</span>
                <span
                  style={{
                    background: 'var(--ink)',
                    color: '#fffdf5',
                    padding: '1px 5px',
                    borderRadius: 2,
                  }}
                >
                  {idea.providerUsed}
                </span>
              </>
            ) : null}
            <span>·</span>
            <span>{docCount} doc{docCount === 1 ? '' : 's'}</span>
          </div>
        </div>
        <button
          type="button"
          className="btn sm"
          onClick={onDemoteToBloom}
          title="Switch to bloom — keep the board visible while you work this idea"
        >
          ↙ to bloom
        </button>
        <button
          type="button"
          className="btn sm"
          onClick={onClose}
          title="Close the focus overlay and return to the board"
        >
          × exit
        </button>
      </div>

      {/* Board thumbnail (top-right) — v1 paper card placeholder. */}
      <button
        type="button"
        onClick={onClose}
        title="Click to restore the full board"
        aria-label="Restore board"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          width: 220,
          height: 150,
          background: 'var(--paper)',
          border: '1.6px solid var(--ink)',
          borderRadius: 6,
          boxShadow: '0 3px 0 var(--ink)',
          zIndex: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: 12,
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: -10,
            left: 8,
            background: '#2e86c7',
            color: 'white',
            fontFamily: 'var(--f-mono)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.12em',
            padding: '2px 7px',
            borderRadius: 3,
            border: '1.4px solid var(--ink)',
            textTransform: 'uppercase',
          }}
        >
          Board · click to restore
        </span>
        <span
          style={{
            fontFamily: 'var(--f-hand)',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--ink)',
            textAlign: 'center',
          }}
        >
          {boardTitle || 'Board'}
        </span>
        <span
          style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 9,
            color: 'var(--ink-faint)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          {boardIdeas.length} idea{boardIdeas.length === 1 ? '' : 's'}
        </span>
        <span
          style={{
            fontFamily: 'var(--f-sans, Inter)',
            fontSize: 10,
            fontWeight: 600,
            background: '#fffdf5',
            border: '1px solid var(--ink)',
            padding: '2px 8px',
            borderRadius: 3,
            color: 'var(--ink)',
          }}
        >
          restore board
        </span>
      </button>

      {/* Phase rail (left) */}
      <div
        style={{
          gridArea: 'phases',
          borderRight: '1.4px dashed rgba(26,24,20,0.3)',
          padding: '18px 14px 18px 22px',
          background: 'var(--paper)',
          overflowY: 'auto',
        }}
      >
        <h4
          style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 9.5,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            margin: '0 0 12px',
          }}
        >
          Lifecycle · {doneCount} of {view.phases.length}
        </h4>
        <div style={{ position: 'relative' }}>
          {view.phases.map(p => {
            const isClickable = p.status === 'done' || p.status === 'active';
            const onClick = isClickable
              ? () => actions.jumpToPhase(p.number)
              : undefined;
            return (
              <div
                key={`phase-${String(p.number)}-${p.shortLabel}`}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={onClick}
                onKeyDown={isClickable ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    actions.jumpToPhase(p.number);
                  }
                } : undefined}
                title={p.longLabel}
                style={phaseRowStyle(p)}
              >
                <PhaseDotMark phase={p} />
                <span>
                  <span
                    style={{
                      fontFamily: 'var(--f-mono)',
                      fontSize: 9.5,
                      color: p.status === 'active' ? '#2e86c7' : 'var(--ink-faint)',
                      marginRight: 4,
                    }}
                  >
                    {String(p.number)}
                  </span>
                  {p.shortLabel}
                </span>
                {p.meta ? (
                  <span
                    style={{
                      fontFamily: 'var(--f-mono)',
                      fontSize: 9,
                      color: 'var(--ink-faint)',
                    }}
                  >
                    {p.meta}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Conversation (center) */}
      <div
        style={{
          gridArea: 'conv',
          padding: '18px 22px 24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: 'var(--f-mono)',
            fontSize: 9.5,
            letterSpacing: '0.11em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
          }}
        >
          <span>{activePhase ? `${String(activePhase.number)} · ${activePhase.shortLabel} · the conversation` : 'the conversation'}</span>
          <span style={{ color: '#2e86c7', fontWeight: 700 }}>listening</span>
        </div>

        <IdeaConversation
          turns={view.conversation}
          onPickOption={key => {
            const option = view.conversation
              .flatMap(turn => turn.options ?? [])
              .find(opt => opt.key === key);
            if (option) void actions.pickOption(option);
          }}
        />

        <div
          style={{
            marginTop: 4,
            padding: '12px 14px',
            background: '#fffdf5',
            border: '1.6px solid #2e86c7',
            borderRadius: 6,
            boxShadow: '3px 3px 0 rgba(46,134,199,0.22)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: '#2e86c7',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ▸
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--f-hand)',
                fontSize: 19,
                fontWeight: 700,
                lineHeight: 1.1,
                marginBottom: 2,
              }}
            >
              Done with this phase? Move on?
            </span>
            <small
              style={{
                fontFamily: 'var(--f-sans, Inter)',
                fontSize: 11.5,
                color: 'var(--ink-soft)',
              }}
            >
              <b>No auto-advance.</b> The phase only closes when you (or the agent) explicitly say so. Always reversible.
            </small>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn sm primary"
              onClick={() => { void actions.confirmAdvance(); }}
              disabled={actions.busy}
            >
              ✓ confirm · advance
            </button>
            <button
              type="button"
              className="btn sm"
              onClick={actions.stay}
              disabled={actions.busy}
            >
              stay
            </button>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => { void actions.skip(); }}
              disabled={actions.busy}
            >
              skip
            </button>
          </div>
        </div>
        {actions.lastError ? (
          <div
            style={{
              fontFamily: 'var(--f-mono)',
              fontSize: 10,
              color: 'var(--accent-contradicts, #c94a3a)',
            }}
          >
            {actions.lastError}
          </div>
        ) : null}

        {/* Action button row (the six host actions) */}
        <div
          style={{
            marginTop: 4,
            paddingTop: 12,
            borderTop: '1px dashed rgba(26,24,20,0.25)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          <ActionButton
            label="Docs"
            title={onOpenDocs ? 'Open supporting docs panel' : 'Docs unavailable for this idea'}
            disabled={!onOpenDocs}
            onClick={onOpenDocs ? () => onOpenDocs(idea.id) : undefined}
          />
          <ActionButton
            label={isTurnLogOpen ? 'Hide log' : 'Turn log'}
            primary={isTurnLogOpen}
            title={onToggleTurnLog ? 'Toggle the turn log panel' : 'Turn log unavailable for this idea'}
            disabled={!onToggleTurnLog}
            onClick={onToggleTurnLog}
          />
          <ActionButton
            label="Open inspector"
            title={onOpenInspector ? 'Open the inspector drawer' : 'Inspector unavailable for this idea'}
            disabled={!onOpenInspector}
            onClick={onOpenInspector}
          />
          <ActionButton
            label="↗ Brief"
            title={onOpenBrief ? 'Open the Brief for this idea' : 'Brief unavailable for demo seeds'}
            disabled={!onOpenBrief}
            onClick={onOpenBrief ? () => onOpenBrief(idea.id) : undefined}
          />
          <ActionButton
            label="Pin to boards…"
            title={onOpenPinDialog ? 'Mirror this idea onto other boards' : 'Pinning unavailable for demo seeds'}
            disabled={!onOpenPinDialog}
            onClick={onOpenPinDialog ? () => onOpenPinDialog(idea.id) : undefined}
          />
          <button
            type="button"
            className="btn sm ghost"
            onClick={onClose}
            title="Close the focus overlay and return to the board"
          >
            Back to board
          </button>
        </div>
      </div>

      {/* Neighbors + quick actions (right) */}
      <div
        style={{
          gridArea: 'neigh',
          borderLeft: '1.4px dashed rgba(26,24,20,0.3)',
          padding: 18,
          background: 'var(--paper)',
          overflowY: 'auto',
        }}
      >
        <h4
          style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 9.5,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            margin: '0 0 10px',
          }}
        >
          Close ideas on the board
        </h4>
        {view.neighbors.length === 0 ? (
          <p
            style={{
              fontFamily: 'var(--f-sans, Inter)',
              fontSize: 12,
              color: 'var(--ink-faint)',
              margin: 0,
            }}
          >
            No close neighbors yet.
          </p>
        ) : (
          view.neighbors.map(neighbor => (
            <NeighborCard
              key={`neigh-${neighbor.ideaId}`}
              neighbor={neighbor}
              onJump={onJumpToIdea}
            />
          ))
        )}
        <hr
          style={{
            border: 'none',
            borderTop: '1px dashed rgba(26,24,20,0.25)',
            margin: '14px 0 10px',
          }}
        />
        <h4
          style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 9.5,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            margin: '0 0 10px',
          }}
        >
          Quick context
        </h4>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--f-mono)',
              fontSize: 10.5,
              color: 'var(--ink-soft)',
              padding: '7px 9px',
              border: '1.2px solid var(--ink)',
              borderRadius: 5,
              background: '#fffdf5',
            }}
          >
            {docCount} doc{docCount === 1 ? '' : 's'} attached
          </div>
          {idea.tags.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {idea.tags.slice(0, 6).map(tag => (
                <span
                  key={tag}
                  style={{
                    fontFamily: 'var(--f-mono)',
                    fontSize: 9,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    padding: '2px 6px',
                    border: '1.2px solid var(--ink)',
                    borderRadius: 4,
                    color: 'var(--ink-soft)',
                    background: '#fffdf5',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default FocusMode;
