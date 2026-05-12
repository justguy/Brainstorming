/**
 * BloomCard — light-work idea opener (Design/Focus & Bloom Modes.html).
 *
 * Bloom is a paper card that expands "in place" on top of the board. It keeps
 * the canvas touchable underneath while surfacing the conversation, phase
 * track, and the six host action buttons (Docs / Turn log / Open inspector /
 * Brief / Back to board / Pin to boards…).
 *
 * Positioning (v1): center-screen with a slight rotation. The design spec
 * allows for tether-anchoring near the clicked sticky, but anchoring depends
 * on screen coordinates that `BoardCanvasStage.onOpen` does not currently
 * expose. The host can later thread per-idea screen coords in via the
 * `anchor` prop; for now we render mid-viewport.
 */

import React from 'react';
import type { CSSProperties } from 'react';
import type { Connection, Idea, ScoutSuggestion } from '../../src/types';
import { IdeaConversation } from './IdeaConversation';
import { useIdeaConversationView } from './useIdeaConversationView';
import { useIdeaPhaseActions } from './useIdeaPhaseActions';
import type { PhaseStep } from './ideaConversationTypes';

export interface BloomCardActionHandlers {
  /** Docs / Turn log / Inspector / Brief / Pin handlers are forwarded by the host. */
  onOpenDocs?: (ideaId: string) => void;
  onToggleTurnLog?: () => void;
  onOpenInspector?: () => void;
  onOpenBrief?: (ideaId: string) => void;
  onOpenPinDialog?: (ideaId: string) => void;
  /** Closes Bloom entirely — returns to the board. */
  onClose: () => void;
  /** Promotes Bloom to Focus, preserving state. */
  onPromoteToFocus: () => void;
  /** Bookkeeping: whether the host has a turn log surface available right now. */
  isTurnLogOpen?: boolean;
}

export interface BloomCardProps extends BloomCardActionHandlers {
  idea: Idea;
  boardIdeas: Idea[];
  boardConnections: Connection[];
  boardSuggestions: ScoutSuggestion[];
  onUpdate: (idea: Idea) => void;
  docCount: number;
  /**
   * Optional viewport anchor in screen coordinates. When provided the card
   * positions near the clicked sticky; otherwise it falls back to a
   * center-screen render with the design's signature `-0.6deg` tilt.
   */
  anchor?: { x: number; y: number } | null;
  /** Optional pre-rendered body content (e.g. IdeaAttentionPanel from host). */
  extraBody?: React.ReactNode;
}

const CARD_WIDTH = 540;
const CARD_MAX_HEIGHT_VH = 80;

function PhaseDot({ phase }: { phase: PhaseStep }): React.ReactElement {
  const base: CSSProperties = {
    width: phase.optional ? 10 : 14,
    height: phase.optional ? 10 : 14,
    borderRadius: '50%',
    background: '#fffdf5',
    border: `1.6px ${phase.optional ? 'dashed' : 'solid'} var(--ink)`,
    position: 'relative',
    zIndex: 2,
    flexShrink: 0,
  };
  if (phase.status === 'done') {
    base.background = 'var(--ink)';
  } else if (phase.status === 'active') {
    base.background = 'var(--accent-ai, #2e86c7)';
    base.boxShadow = '0 0 0 3px rgba(46,134,199,0.2)';
  }
  return (
    <span
      role="img"
      aria-label={`Phase ${String(phase.number)} · ${phase.longLabel} · ${phase.status}`}
      title={`${String(phase.number)} · ${phase.longLabel}`}
      style={base}
    />
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

export function BloomCard({
  idea,
  boardIdeas,
  boardConnections,
  boardSuggestions,
  onUpdate,
  docCount,
  anchor,
  extraBody,
  onOpenDocs,
  onToggleTurnLog,
  onOpenInspector,
  onOpenBrief,
  onOpenPinDialog,
  onClose,
  onPromoteToFocus,
  isTurnLogOpen = false,
}: BloomCardProps): React.ReactElement {
  const view = useIdeaConversationView({
    idea,
    boardIdeas,
    boardConnections,
    boardSuggestions,
    conversationLimit: 6,
  });
  const actions = useIdeaPhaseActions({ idea, onUpdate });

  const title = (idea.rawText || 'Untitled idea').trim();
  const activePhase = view.phases.find(p => p.status === 'active');
  const phaseHeadline = activePhase ? `▸ ${String(activePhase.number)} live` : '—';

  // v1 positioning: center-screen with a slight tilt. The design recommends a
  // tether anchored to the clicked sticky; we leave the optional `anchor`
  // prop in place so a future patch can thread screen coords without a new
  // prop dance.
  const positionStyle: CSSProperties = anchor
    ? {
        position: 'fixed',
        left: Math.max(16, anchor.x),
        top: Math.max(80, anchor.y),
        transform: 'rotate(-0.6deg)',
        transformOrigin: 'top left',
      }
    : {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%) rotate(-0.6deg)',
      };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`Bloomed idea: ${title}`}
      style={{
        ...positionStyle,
        width: CARD_WIDTH,
        maxHeight: `${CARD_MAX_HEIGHT_VH}vh`,
        background: 'var(--paper)',
        border: '2px solid var(--ink)',
        borderRadius: 8,
        boxShadow: '6px 8px 0 var(--ink), 12px 18px 36px rgba(26,24,20,0.18)',
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        // The board needs to stay touchable around the card — only the card
        // itself captures pointer events.
        pointerEvents: 'auto',
      }}
    >
      {/* Sticky-yellow header strip */}
      <div
        style={{
          background: 'var(--sticky-yellow)',
          padding: '12px 16px 14px',
          borderBottom: '1.6px solid var(--ink)',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close bloom"
          title="Close bloom"
          style={{
            position: 'absolute',
            right: 12,
            top: 12,
            border: '1.4px solid var(--ink)',
            background: '#fffdf5',
            width: 28,
            height: 28,
            borderRadius: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--f-mono)',
            fontSize: 14,
            boxShadow: '0 2px 0 var(--ink)',
            cursor: 'pointer',
          }}
        >
          ×
        </button>
        <button
          type="button"
          onClick={onPromoteToFocus}
          title="Promote to focus mode"
          style={{
            position: 'absolute',
            right: 50,
            top: 14,
            fontFamily: 'var(--f-sans, Inter)',
            fontSize: 11,
            fontWeight: 600,
            background: '#fffdf5',
            border: '1.4px solid var(--ink)',
            padding: '4px 9px',
            borderRadius: 5,
            boxShadow: '0 2px 0 var(--ink)',
            cursor: 'pointer',
          }}
        >
          ⤢ focus
        </button>
        <div
          style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 9.5,
            letterSpacing: '0.11em',
            textTransform: 'uppercase',
            color: 'var(--ink-soft)',
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            marginBottom: 4,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#2e86c7',
              boxShadow: '0 0 0 0 rgba(46,134,199,0.4)',
            }}
          />
          Bloomed · open in place
        </div>
        <h3
          style={{
            fontFamily: 'var(--f-hand)',
            fontWeight: 700,
            fontSize: 30,
            lineHeight: 1,
            margin: '0 0 4px',
            letterSpacing: '-0.4px',
            color: 'var(--ink)',
          }}
        >
          {title.slice(0, 96)}
          {title.length > 96 ? '…' : ''}
        </h3>
        <div
          style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 10,
            color: 'var(--ink-soft)',
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {idea.providerUsed ? (
            <>
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
              <span>·</span>
            </>
          ) : null}
          <span>phase {String(idea.phase)}</span>
          <span>·</span>
          <span>{docCount} doc{docCount === 1 ? '' : 's'}</span>
        </div>
      </div>

      {/* Phase track */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: 'var(--paper)',
          borderBottom: '1px dashed rgba(26,24,20,0.3)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 8.5,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            flexShrink: 0,
          }}
        >
          phase
        </span>
        <div
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {view.phases.map(p => (
            <PhaseDot key={`phase-${String(p.number)}-${p.shortLabel}`} phase={p} />
          ))}
        </div>
        <span
          style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 8.5,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#2e86c7',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {phaseHeadline}
        </span>
      </div>

      {/* Scrollable body — conversation + extras */}
      <div
        style={{
          padding: '14px 18px',
          overflowY: 'auto',
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--f-mono)',
            fontSize: 9.5,
            letterSpacing: '0.11em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            marginBottom: 10,
          }}
        >
          <span>{activePhase ? `${String(activePhase.number)} · the conversation` : 'the conversation'}</span>
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
        {extraBody ? (
          <div style={{ marginTop: 12 }}>{extraBody}</div>
        ) : null}
      </div>

      {/* Footer — confirm/stay + the six action buttons */}
      <div
        style={{
          borderTop: '1.4px solid var(--ink)',
          background: 'var(--paper-dark)',
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 140,
              fontFamily: 'var(--f-hand)',
              fontSize: 18,
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 9,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#2e86c7',
                fontWeight: 700,
                display: 'block',
                marginBottom: 2,
              }}
            >
              ▸ next phase
            </span>
            Ready to move on?
          </div>
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
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            paddingTop: 4,
            borderTop: '1px dashed rgba(26,24,20,0.2)',
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
            title="Close the bloom and return to the board"
          >
            Back to board
          </button>
        </div>
      </div>
    </div>
  );
}

export default BloomCard;
