/**
 * IdeaBloomLayer — renders one IdeaBloomCard per bloomed idea, anchored at
 * the idea's panel position on the canvas. The wrapping div sits inside the
 * ReactFlow viewport-transform layer so cards pan and zoom with the board.
 *
 * Conversation turns are draggable between blooms — the layer tracks which
 * card is being hovered to show a drop affordance.
 */

import React, { useState } from 'react';
import type { Connection, Idea, ScoutSuggestion } from '../../src/types';
import { IdeaBloomCard } from './IdeaBloomCard';
import { useIdeaConversationView } from './useIdeaConversationView';
import { useIdeaPhaseActions } from './useIdeaPhaseActions';
import type { ConversationTurn } from './ideaConversationTypes';

const BLOOM_OFFSET_X = 16;
const BLOOM_OFFSET_Y = -8;

export interface IdeaBloomLayerProps {
  ideas: Idea[];
  bloomedIdeaIds: string[];
  boardConnections: Connection[];
  boardSuggestions: ScoutSuggestion[];
  showGuidance: boolean;
  onUpdate: (idea: Idea) => void;
  onClose: (ideaId: string) => void;
  onPromoteToFocus: (ideaId: string) => void;
  onTransferTurn?: (sourceIdeaId: string, targetIdeaId: string, turn: ConversationTurn) => void;
}

export function IdeaBloomLayer({
  ideas,
  bloomedIdeaIds,
  boardConnections,
  boardSuggestions,
  showGuidance,
  onUpdate,
  onClose,
  onPromoteToFocus,
  onTransferTurn,
}: IdeaBloomLayerProps): React.ReactElement | null {
  const [activeDrag, setActiveDrag] = useState<{ sourceIdeaId: string; turn: ConversationTurn } | null>(null);
  const [dragOverIdeaId, setDragOverIdeaId] = useState<string | null>(null);

  if (bloomedIdeaIds.length === 0) return null;

  return (
    <div className="bo-bloom__layer">
      {bloomedIdeaIds.map(ideaId => {
        const idea = ideas.find(item => item.id === ideaId);
        if (!idea) return null;
        return (
          <BloomSlot
            key={ideaId}
            idea={idea}
            ideas={ideas}
            boardConnections={boardConnections}
            boardSuggestions={boardSuggestions}
            showGuidance={showGuidance}
            isDragOver={dragOverIdeaId === ideaId && activeDrag !== null && activeDrag.sourceIdeaId !== ideaId}
            onUpdate={onUpdate}
            onClose={() => onClose(ideaId)}
            onPromoteToFocus={() => onPromoteToFocus(ideaId)}
            onTurnDragStart={turn => {
              setActiveDrag({ sourceIdeaId: ideaId, turn });
              setDragOverIdeaId(null);
            }}
            onTurnDragEnter={() => {
              if (activeDrag && activeDrag.sourceIdeaId !== ideaId) {
                setDragOverIdeaId(ideaId);
              }
            }}
            onTurnDragLeave={() => {
              setDragOverIdeaId(current => (current === ideaId ? null : current));
            }}
            onTurnDrop={turn => {
              if (activeDrag && activeDrag.sourceIdeaId !== ideaId && onTransferTurn) {
                onTransferTurn(activeDrag.sourceIdeaId, ideaId, turn);
              }
              setActiveDrag(null);
              setDragOverIdeaId(null);
            }}
          />
        );
      })}
    </div>
  );
}

interface BloomSlotProps {
  idea: Idea;
  ideas: Idea[];
  boardConnections: Connection[];
  boardSuggestions: ScoutSuggestion[];
  showGuidance: boolean;
  isDragOver: boolean;
  onUpdate: (idea: Idea) => void;
  onClose: () => void;
  onPromoteToFocus: () => void;
  onTurnDragStart: (turn: ConversationTurn) => void;
  onTurnDragEnter: () => void;
  onTurnDragLeave: () => void;
  onTurnDrop: (turn: ConversationTurn) => void;
}

function BloomSlot({
  idea,
  ideas,
  boardConnections,
  boardSuggestions,
  showGuidance,
  isDragOver,
  onUpdate,
  onClose,
  onPromoteToFocus,
  onTurnDragStart,
  onTurnDragEnter,
  onTurnDragLeave,
  onTurnDrop,
}: BloomSlotProps): React.ReactElement {
  const view = useIdeaConversationView({
    idea,
    boardIdeas: ideas,
    boardConnections,
    boardSuggestions,
    conversationLimit: 6,
  });
  const actions = useIdeaPhaseActions({ idea, onUpdate });

  const panel = idea.panel;
  const x = (panel?.x ?? 0) + (panel?.width ?? 200) + BLOOM_OFFSET_X;
  const y = (panel?.y ?? 0) + BLOOM_OFFSET_Y;

  return (
    <IdeaBloomCard
      idea={idea}
      conversation={view.conversation}
      phases={view.phases}
      showGuidance={showGuidance}
      position={{ x, y }}
      onClose={onClose}
      onPromoteToFocus={onPromoteToFocus}
      onJumpToPhase={actions.jumpToPhase}
      onConfirmAdvance={() => { void actions.confirmAdvance(); }}
      onStay={actions.stay}
      onTurnDragStart={onTurnDragStart}
      onTurnDragEnter={onTurnDragEnter}
      onTurnDragLeave={onTurnDragLeave}
      onTurnDrop={onTurnDrop}
      isDragOver={isDragOver}
    />
  );
}
