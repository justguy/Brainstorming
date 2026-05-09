/**
 * useIdeaPhaseActions — bridges the Focus / Bloom conversation surface to the
 * existing orchestrator state machine. Provides the user-facing actions
 * (confirm-advance, stay, skip, pickOption, jumpToPhase) that fire the
 * underlying LLM role runs and persist the resulting idea state.
 *
 * Idempotency: while a phase is running, all actions are blocked except
 * "stay". The caller can read `busy` and `error` to surface feedback.
 */

import { useCallback, useMemo, useState } from 'react';
import type { Idea } from '../../src/types';
import { advance } from '../../src/orchestrator/stateMachine';
import { findSubPhase } from '../../src/orchestrator/subPhases';
import type { ConversationOption } from './ideaConversationTypes';

export interface UseIdeaPhaseActionsArgs {
  idea: Idea | null;
  onUpdate: (idea: Idea) => void;
  onError?: (source: 'advance' | 'skip' | 'pick' | 'jump', error: unknown) => void;
}

export interface IdeaPhaseActions {
  busy: boolean;
  lastError: string | null;
  confirmAdvance: () => Promise<void>;
  stay: () => void;
  skip: () => Promise<void>;
  pickOption: (option: ConversationOption) => Promise<void>;
  jumpToPhase: (phaseNumber: number) => void;
}

export function useIdeaPhaseActions({ idea, onUpdate, onError }: UseIdeaPhaseActionsArgs): IdeaPhaseActions {
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const run = useCallback(async (
    source: 'advance' | 'skip' | 'pick',
    fn: () => Promise<Idea>,
  ): Promise<void> => {
    if (!idea || busy) return;
    setBusy(true);
    setLastError(null);
    try {
      const next = await fn();
      onUpdate(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLastError(message);
      onError?.(source, err);
    } finally {
      setBusy(false);
    }
  }, [idea, busy, onUpdate, onError]);

  const confirmAdvance = useCallback(async () => {
    if (!idea) return;
    await run('advance', () => advance(idea));
  }, [idea, run]);

  const stay = useCallback(() => {
    setLastError(null);
  }, []);

  const skip = useCallback(async () => {
    if (!idea) return;
    const spec = findSubPhase(idea.phase);
    if (!spec?.skippable) {
      setLastError(`Phase ${idea.phase} is not skippable.`);
      return;
    }
    await run('skip', () => advance(idea, undefined, true));
  }, [idea, run]);

  const pickOption = useCallback(async (option: ConversationOption) => {
    if (!idea) return;
    const userInput = `Pick option ${option.key}: ${option.text.replace(/\*\*/g, '')}`;
    await run('pick', () => advance(idea, userInput));
  }, [idea, run]);

  const jumpToPhase = useCallback((phaseNumber: number) => {
    if (!idea) return;
    if (Math.abs(phaseNumber - idea.phase) < 1e-9) return;
    try {
      const now = Date.now();
      const updated: Idea = {
        ...idea,
        phase: phaseNumber,
        updatedAt: now,
        lastTurnAt: now,
        turnLog: [
          ...idea.turnLog,
          {
            role: 'system',
            content: `[Manual rewind] Jumped from ${idea.phase} to ${phaseNumber}`,
            meta: { source: 'user_input', phase: phaseNumber, entryKind: 'note' },
          },
        ],
      };
      onUpdate(updated);
    } catch (err) {
      onError?.('jump', err);
    }
  }, [idea, onUpdate, onError]);

  return useMemo<IdeaPhaseActions>(() => ({
    busy,
    lastError,
    confirmAdvance,
    stay,
    skip,
    pickOption,
    jumpToPhase,
  }), [busy, lastError, confirmAdvance, stay, skip, pickOption, jumpToPhase]);
}
