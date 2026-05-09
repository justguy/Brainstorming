/**
 * IdeaFocusSlot — top-level full-screen overlay for the focused idea.
 * Mounts at most one IdeaFocusOverlay; handles the orchestrator wiring
 * (conversation projection, phase actions, board thumbnail).
 */

import React, { useMemo } from 'react';
import type { Connection, Idea, ScoutSuggestion } from '../../src/types';
import { IdeaFocusOverlay } from './IdeaFocusOverlay';
import { useIdeaConversationView } from './useIdeaConversationView';
import { useIdeaPhaseActions } from './useIdeaPhaseActions';

const TONE_FOR_HASH = ['#f5e27a', '#f4b4b0', '#b4d4e8', '#f4c88c', '#bcd9a8', '#c9bde0'];

function toneFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TONE_FOR_HASH[hash % TONE_FOR_HASH.length];
}

export interface IdeaFocusSlotProps {
  focusedIdea: Idea | null;
  ideas: Idea[];
  boardConnections: Connection[];
  boardSuggestions: ScoutSuggestion[];
  showGuidance: boolean;
  docCount: number;
  onUpdate: (idea: Idea) => void;
  onClose: () => void;
  onDemoteToBloom: (ideaId: string) => void;
  onJumpToIdea: (ideaId: string) => void;
  onOpenDocs?: (ideaId: string) => void;
  /**
   * bo-162 — invoked when the user clicks "Promote to principle" inside the
   * focus overlay. The slot forwards the focused idea's text; the parent
   * screen owns the project write.
   */
  onPromoteToPrinciple?: (idea: Idea) => Promise<boolean> | boolean;
}

export function IdeaFocusSlot({
  focusedIdea,
  ideas,
  boardConnections,
  boardSuggestions,
  showGuidance,
  docCount,
  onUpdate,
  onClose,
  onDemoteToBloom,
  onJumpToIdea,
  onOpenDocs,
  onPromoteToPrinciple,
}: IdeaFocusSlotProps): React.ReactElement | null {
  const view = useIdeaConversationView({
    idea: focusedIdea,
    boardIdeas: ideas,
    boardConnections,
    boardSuggestions,
    conversationLimit: 16,
  });
  const actions = useIdeaPhaseActions({ idea: focusedIdea, onUpdate });

  const thumbnailIdeas = useMemo(() => {
    if (!focusedIdea) return [];
    const positioned = ideas.filter(idea => idea.panel);
    if (positioned.length === 0) return [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const idea of positioned) {
      const panel = idea.panel!;
      minX = Math.min(minX, panel.x);
      minY = Math.min(minY, panel.y);
      maxX = Math.max(maxX, panel.x + panel.width);
      maxY = Math.max(maxY, panel.y + panel.height);
    }
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    return positioned.slice(0, 12).map(idea => {
      const panel = idea.panel!;
      return {
        id: idea.id,
        x: ((panel.x - minX) / width) * 90,
        y: ((panel.y - minY) / height) * 80,
        tone: toneFor(idea.id),
        isSelf: idea.id === focusedIdea.id,
      };
    });
  }, [focusedIdea, ideas]);

  const artifacts = useMemo(() => {
    if (!focusedIdea) return [];
    const list: { id: string; label: string; icon: '📎' | '🔗' | '+' | '⊕' }[] = [];
    if (docCount > 0) list.push({ id: 'docs', label: `${docCount} doc${docCount === 1 ? '' : 's'} attached`, icon: '📎' });
    if ((focusedIdea.briefState.approaches?.length ?? 0) > 0) list.push({ id: 'approaches', label: 'View approaches', icon: '🔗' });
    list.push({ id: 'add-artifact', label: 'add artifact', icon: '+' });
    list.push({ id: 'spawn-related', label: 'spawn related idea', icon: '⊕' });
    return list;
  }, [focusedIdea, docCount]);

  if (!focusedIdea) return null;

  return (
    <IdeaFocusOverlay
      idea={focusedIdea}
      conversation={view.conversation}
      phases={view.phases}
      neighbors={view.neighbors}
      artifacts={artifacts}
      showGuidance={showGuidance}
      onClose={onClose}
      onDemoteToBloom={() => onDemoteToBloom(focusedIdea.id)}
      onJumpToPhase={actions.jumpToPhase}
      onPickOption={key => {
        const option = view.conversation
          .flatMap(turn => turn.options ?? [])
          .find(opt => opt.key === key);
        if (option) void actions.pickOption(option);
      }}
      onConfirmAdvance={() => { void actions.confirmAdvance(); }}
      onStay={actions.stay}
      onSkip={() => { void actions.skip(); }}
      onJumpToIdea={ideaId => {
        if (onOpenDocs) {
          // Jumping to a neighbor demotes the current focus and switches subject.
        }
        onJumpToIdea(ideaId);
      }}
      onJumpToBoardThumbnail={onClose}
      boardThumbnailIdeas={thumbnailIdeas}
      onPromoteToPrinciple={
        onPromoteToPrinciple
          ? () => onPromoteToPrinciple(focusedIdea)
          : undefined
      }
    />
  );
}
