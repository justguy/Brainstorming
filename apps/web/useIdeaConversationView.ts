/**
 * useIdeaConversationView — projects an Idea (turnLog + briefState + beadState)
 * into the ConversationTurn[] / PhaseStep[] / NeighborIdea[] shapes consumed
 * by the IdeaFocusOverlay and IdeaBloomCard presentational components.
 *
 * This is the seam where the existing orchestrator state meets the new
 * conversation surface — keeping the LLM integration in one place so the UI
 * components stay pure and props-driven.
 */

import { useMemo } from 'react';
import type { Connection, Idea, LlmMessage, ScoutSuggestion } from '../../src/types';
import { deriveIdeaBeadState } from '../../src/orchestrator/beadState';
import { SUB_PHASES, findSubPhase } from '../../src/orchestrator/subPhases';
import type {
  ConversationDelta,
  ConversationOption,
  ConversationPersona,
  ConversationTurn,
  NeighborIdea,
  PhaseStep,
} from './ideaConversationTypes';

const NEIGHBOR_TONE_BY_KIND: Record<string, NeighborIdea['swatchTone']> = {
  builds_on: 'green',
  shared_theme: 'blue',
  contradicts: 'pink',
  revives_killed: 'lilac',
};

const NEIGHBOR_LABEL_BY_KIND: Record<string, { rel: NeighborIdea['relationship']; label: string }> = {
  builds_on: { rel: 'parent', label: '↑ builds on' },
  shared_theme: { rel: 'shares-theme', label: '⫶ shares theme' },
  contradicts: { rel: 'contradicts', label: '✕ contradicts' },
  revives_killed: { rel: 'overlaps', label: '↗ overlaps' },
};

function relativeWhen(from: number, now: number): string {
  const diff = Math.max(0, now - from);
  if (diff < 60_000) return 'now';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function personaFromMessage(message: LlmMessage): { persona: ConversationPersona; role: string } {
  const meta = message.meta;
  const roleId = meta?.roleId ?? '';
  if (message.role === 'user') {
    if (meta?.entryKind === 'note') return { persona: 'historian', role: 'note' };
    return { persona: 'user', role: meta?.source === 'user_input' ? 'edit' : 'asks' };
  }
  if (roleId.includes('devils') || roleId.includes('devil')) return { persona: 'devil', role: 'contradicts' };
  if (roleId.includes('lens')) return { persona: 'scout', role: 'challenger' };
  if (roleId.includes('approach') || roleId.includes('clarif')) return { persona: 'synth', role: 'connects' };
  if (roleId.includes('readiness') || roleId.includes('review')) return { persona: 'historian', role: 'recalls' };
  if (meta?.entryKind === 'fallback') return { persona: 'historian', role: 'fallback' };
  return { persona: 'scout', role: 'asks' };
}

function deltasFromMessage(message: LlmMessage): ConversationDelta[] | undefined {
  const meta = message.meta;
  const out: ConversationDelta[] = [];
  if (meta?.phaseLabel) out.push({ kind: 'info', label: meta.phaseLabel });
  if (meta?.entryKind === 'fallback') out.push({ kind: 'warn', label: 'fallback' });
  if (out.length === 0) return undefined;
  return out;
}

function optionsFromBriefState(idea: Idea, activePhase: number): ConversationOption[] | undefined {
  // Surface the most relevant choice cards for the active phase: lenses at 0.5,
  // approaches at 2, challenges at 2.5. A/B/C keys plus an explicit "none" exit.
  const items: { key: string; text: string }[] = [];
  if (Math.abs(activePhase - 0.5) < 1e-9 && idea.briefState.lenses.length > 0) {
    idea.briefState.lenses.slice(0, 3).forEach((lens, idx) => {
      items.push({ key: String.fromCharCode(65 + idx), text: `**${lens.frame}** · ${lens.insight}` });
    });
  } else if (Math.abs(activePhase - 2) < 1e-9 && idea.briefState.approaches.length > 0) {
    idea.briefState.approaches.slice(0, 3).forEach((approach, idx) => {
      items.push({ key: String.fromCharCode(65 + idx), text: `**${approach.label}** · ${approach.summary}` });
    });
  } else if (Math.abs(activePhase - 2.5) < 1e-9 && idea.briefState.challenges.length > 0) {
    idea.briefState.challenges.slice(0, 3).forEach((challenge, idx) => {
      items.push({ key: String.fromCharCode(65 + idx), text: `**${challenge.critique}** · evidence: ${challenge.evidenceAsk}` });
    });
  }
  if (items.length === 0) return undefined;
  items.push({ key: String.fromCharCode(65 + items.length), text: '**None of these** · write your own' });
  return items;
}

export interface UseIdeaConversationViewArgs {
  idea: Idea | null;
  boardIdeas: Idea[];
  boardConnections: Connection[];
  boardSuggestions?: ScoutSuggestion[];
  now?: number;
  /** Cap the conversation surface to the most recent N turns (full log lives in IdeaTurnLogPanel). */
  conversationLimit?: number;
}

export interface IdeaConversationView {
  conversation: ConversationTurn[];
  phases: PhaseStep[];
  neighbors: NeighborIdea[];
  activePhase: number;
}

export function useIdeaConversationView({
  idea,
  boardIdeas,
  boardConnections,
  boardSuggestions,
  now,
  conversationLimit = 12,
}: UseIdeaConversationViewArgs): IdeaConversationView {
  const _ = boardSuggestions; // reserved for future "ghost" insertions
  void _;
  return useMemo<IdeaConversationView>(() => {
    if (!idea) return { conversation: [], phases: [], neighbors: [], activePhase: 0 };

    const t0 = now ?? Date.now();
    const beadState = deriveIdeaBeadState(idea);
    const activePhase = beadState.currentPhase;

    const phases: PhaseStep[] = SUB_PHASES.map<PhaseStep>(spec => {
      const bead = beadState.beads.find(b => b.id === spec.id);
      const status: PhaseStep['status'] = bead?.status === 'completed'
        ? 'done'
        : bead?.status === 'active'
          ? 'active'
          : bead?.status === 'soft_nudge' || bead?.status === 'needs_attention'
            ? 'queued'
            : 'locked';
      const meta = status === 'active'
        ? 'live'
        : status === 'done'
          ? '✓'
          : status === 'queued'
            ? 'queued'
            : spec.skippable ? 'opt' : '—';
      return {
        number: spec.number,
        shortLabel: spec.shortLabel,
        longLabel: spec.label,
        status,
        optional: spec.skippable,
        meta,
      };
    });

    const recentTurns = idea.turnLog.slice(-conversationLimit);
    const baseTurns: ConversationTurn[] = recentTurns.map((message, idx) => {
      const { persona, role } = personaFromMessage(message);
      const whenAt = idea.lastTurnAt ?? idea.updatedAt ?? t0;
      const offset = (recentTurns.length - 1 - idx) * 60_000;
      return {
        id: `${idea.id}-turn-${idx}`,
        persona,
        role,
        whenLabel: relativeWhen(whenAt - offset, t0),
        body: message.content.length > 480 ? `${message.content.slice(0, 480)}…` : message.content,
        deltas: deltasFromMessage(message),
      };
    });

    // Empty-state: idea has no turns yet. Surface a Scout welcome turn so the
    // conversation surface feels alive on first open and points the user at
    // the active phase.
    if (baseTurns.length === 0) {
      const activeSpec = findSubPhase(activePhase);
      const focusLabel = activeSpec?.label ?? 'this idea';
      baseTurns.push({
        id: `${idea.id}-welcome`,
        persona: 'scout',
        role: 'opens',
        whenLabel: 'now',
        body: `Fresh idea — let's start at <em>${focusLabel}</em>. Confirm to advance, or pick a phase from the lifecycle to begin elsewhere.`,
      });
    }

    // Append a synthetic Scout-asks turn for the active phase that surfaces
    // the choice options in A/B/C form, and lets the user "borrow from" one.
    const options = optionsFromBriefState(idea, activePhase);
    const conversation: ConversationTurn[] = [...baseTurns];
    if (options) {
      const activeSpec = findSubPhase(activePhase);
      conversation.push({
        id: `${idea.id}-active-prompt`,
        persona: 'scout',
        role: 'asks',
        whenLabel: 'now',
        body: `Pick one to actually <em>borrow from</em> before we leave the ${activeSpec?.shortLabel ?? 'phase'} step:`,
        options,
      });
    }

    // Neighbors: traverse the board's connections graph for ideas linked to
    // this one, then label by connection kind.
    const neighbors: NeighborIdea[] = [];
    const seen = new Set<string>();
    for (const connection of boardConnections) {
      if (!connection.ideaIds.includes(idea.id)) continue;
      for (const otherId of connection.ideaIds) {
        if (otherId === idea.id || seen.has(otherId)) continue;
        const other = boardIdeas.find(i => i.id === otherId);
        if (!other) continue;
        seen.add(otherId);
        const labels = NEIGHBOR_LABEL_BY_KIND[connection.kind] ?? { rel: 'shares-theme' as const, label: '⫶ related' };
        neighbors.push({
          ideaId: other.id,
          relationship: labels.rel,
          relationshipLabel: labels.label,
          title: other.rawText.slice(0, 60),
          why: connection.rationale,
          swatchTone: NEIGHBOR_TONE_BY_KIND[connection.kind] ?? 'peach',
        });
        if (neighbors.length >= 6) break;
      }
      if (neighbors.length >= 6) break;
    }

    return { conversation, phases, neighbors, activePhase };
  }, [idea, boardIdeas, boardConnections, conversationLimit, now]);
}
