import type { CSSProperties, DragEvent, MouseEvent } from 'react';
import type { Idea } from '../../src/types';
import { IdeaConversation } from './IdeaConversation';
import type { ConversationTurn, PhaseStep } from './ideaConversationTypes';

export interface IdeaBloomCardProps {
  idea: Idea;
  conversation: ConversationTurn[];
  phases: PhaseStep[];
  showGuidance: boolean;
  /** Canvas-coordinate top-left for the bloom card. */
  position: { x: number; y: number };
  onClose: () => void;
  /** "⤢ focus" — caller swaps the bloom out for the focus overlay. */
  onPromoteToFocus: () => void;
  onJumpToPhase: (phaseNumber: number) => void;
  onConfirmAdvance: () => void;
  onStay: () => void;
  onTurnDragStart?: (turn: ConversationTurn) => void;
  onTurnDrop?: (turn: ConversationTurn) => void;
  /** Fired when an external drag enters this card — caller may highlight the drop target. */
  onTurnDragEnter?: () => void;
  /** Fired when the external drag leaves this card. */
  onTurnDragLeave?: () => void;
  isDragOver?: boolean;
}

function dotClass(phase: PhaseStep): string {
  const tokens: string[] = ['bo-bloom__pdot'];
  if (phase.status === 'done') tokens.push('bo-bloom__pdot--done');
  if (phase.status === 'active') tokens.push('bo-bloom__pdot--active');
  if (phase.status === 'queued') tokens.push('bo-bloom__pdot--queued');
  if (phase.status === 'locked') tokens.push('bo-bloom__pdot--locked');
  if (phase.optional) tokens.push('bo-bloom__pdot--opt');
  return tokens.join(' ');
}

function activePhaseLabel(phases: PhaseStep[]): string {
  const active = phases.find((entry) => entry.status === 'active');
  if (!active) return '—';
  return `▸ ${String(active.number)} ${active.meta || 'live'}`;
}

export function IdeaBloomCard({
  idea,
  conversation,
  phases,
  showGuidance,
  position,
  onClose,
  onPromoteToFocus,
  onJumpToPhase,
  onConfirmAdvance,
  onStay,
  onTurnDragStart,
  onTurnDrop,
  onTurnDragEnter,
  onTurnDragLeave,
  isDragOver = false,
}: IdeaBloomCardProps): JSX.Element {
  const positionStyle: CSSProperties = {
    left: `${position.x}px`,
    top: `${position.y}px`,
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (!onTurnDrop) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    if (!onTurnDrop) return;
    event.preventDefault();
    onTurnDragEnter?.();
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (!onTurnDrop) return;
    // relatedTarget is null when leaving the card to the page, or another
    // element outside the card subtree.
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    onTurnDragLeave?.();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (!onTurnDrop) return;
    event.preventDefault();
    const turnId = event.dataTransfer.getData('text/plain');
    if (!turnId) return;
    const matched = conversation.find((turn) => turn.id === turnId);
    if (matched) {
      onTurnDrop(matched);
    }
    onTurnDragLeave?.();
  };

  const wrapperClass = isDragOver
    ? 'bo-bloom__card bo-bloom__card--drag-over'
    : 'bo-bloom__card';

  const title = (idea.rawText || 'Untitled idea').trim();
  const phaseHeadline = activePhaseLabel(phases);

  return (
    <div
      className={wrapperClass}
      style={positionStyle}
      role="dialog"
      aria-label={`Bloomed idea: ${title}`}
      onDragOver={onTurnDrop ? handleDragOver : undefined}
      onDragEnter={onTurnDrop ? handleDragEnter : undefined}
      onDragLeave={onTurnDrop ? handleDragLeave : undefined}
      onDrop={onTurnDrop ? handleDrop : undefined}
    >
      <div className="bo-bloom__header">
        <button
          type="button"
          className="bo-bloom__closer"
          onClick={onClose}
          aria-label="Close bloom"
          title="Close this bloom"
        >
          ×
        </button>
        <button
          type="button"
          className="bo-bloom__collapse"
          onClick={onPromoteToFocus}
          title="Promote to focus mode (full-screen)"
        >
          ⤢ focus
        </button>
        <div className="bo-bloom__you-here">
          <span className="bo-bloom__pulse" aria-hidden="true" />
          Bloomed · open in place
        </div>
        <h3 className="bo-bloom__title">{title}</h3>
        <div className="bo-bloom__prov">
          {idea.providerUsed ? (
            <span className="bo-bloom__prov-model">{idea.providerUsed}</span>
          ) : null}
          {idea.providerUsed ? <span>·</span> : null}
          <span>phase {String(idea.phase)}</span>
        </div>
      </div>

      <div className="bo-bloom__phases">
        <span className="bo-bloom__phases-label">phase</span>
        <div className="bo-bloom__track" role="presentation">
          {phases.map((phase) => {
            const isClickable =
              phase.status === 'done' || phase.status === 'active';
            const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
              event.preventDefault();
              if (!isClickable) return;
              onJumpToPhase(phase.number);
            };
            return (
              <button
                key={`bloom-phase-${phase.number}-${phase.shortLabel}`}
                type="button"
                className={dotClass(phase)}
                title={`${String(phase.number)} · ${phase.longLabel}`}
                aria-label={`Phase ${String(phase.number)} · ${phase.longLabel}`}
                onClick={isClickable ? handleClick : undefined}
                disabled={!isClickable}
              />
            );
          })}
        </div>
        <span className="bo-bloom__phases-active">{phaseHeadline}</span>
      </div>

      <div className="bo-bloom__body">
        <div className="bo-bloom__conv-label">
          <span>conversation</span>
          <span className="bo-bloom__listening">listening</span>
        </div>
        <IdeaConversation
          turns={conversation}
          draggable
          onTurnDragStart={onTurnDragStart}
        />
      </div>

      <div className="bo-bloom__foot">
        <div className="bo-bloom__question">
          <span className="bo-bloom__qprompt">▸ next phase</span>
          Ready to move on?
        </div>
        <button
          type="button"
          className="bo-focus__cb-btn bo-focus__cb-btn--primary"
          onClick={onConfirmAdvance}
        >
          ✓ confirm · advance
        </button>
        <button
          type="button"
          className="bo-focus__cb-btn"
          onClick={onStay}
        >
          stay
        </button>
      </div>

      {showGuidance ? (
        <div className="bo-bloom__anno">
          ⤢ "focus" promotes this idea
          <br />
          to full focus mode · no state lost
        </div>
      ) : null}
    </div>
  );
}

export default IdeaBloomCard;
