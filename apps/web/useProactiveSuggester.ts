/**
 * useProactiveSuggester — debounced background coach.
 *
 * Watches user idle time and board readiness. When the user has been idle past
 * the threshold OR readiness has plateaued, fires a single low-volume LLM call
 * that returns 2-3 short coach lines. Each is committed as a ScoutSuggestion
 * with a "coach: <technique>" source label so the existing canvas ghost-panel
 * pipeline renders them — no new card type, no modal, fully dismissable.
 *
 * Cadence:
 *   - idle threshold: PROACTIVE_IDLE_MS (default 25s)
 *   - per-session cooldown: PROACTIVE_COOLDOWN_MS (default 60s)
 *   - plateau window:   inherits from detectReadinessPlateau (~45s)
 *
 * Gated by Settings.proactiveSuggestionsEnabled (default ON, easy to disable
 * from the Options page).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BeatName } from '../../src/beats/types';
import type { AutonomyLevel, Connection, Idea } from '../../src/types';
import { runProactiveSuggester, type ProactiveTrigger } from '../../src/orchestrator/proactiveSuggester';
import {
  appendReadinessSample,
  autonomyGateVerdict,
  computeReadinessScore,
  detectReadinessPlateau,
  type ReadinessSample,
} from '../../src/orchestrator/readinessGate';
import type { createBoardController } from '../../src/storage/boardController';
import type { BoardDocument } from '../../src/board/types';
import type { BoardHistoryState } from '../../src/storage/boardControllerTypes';
import type { SoftMode } from './softMode';
import { ghostPanelFor } from './suggestionActionHelpers';

export const PROACTIVE_IDLE_MS = 25_000;
export const PROACTIVE_COOLDOWN_MS = 60_000;
// Plateau gate degrades after this much time so the coach can re-nudge a
// genuinely-stuck board, instead of going silent forever once a score is hit.
const PROACTIVE_PLATEAU_REARM_MS = 4 * 60_000;
// Hard stop: if the user hasn't interacted in this long they've likely walked
// away. Stop firing — they may be back in an hour, a week, we can't know.
const PROACTIVE_DEEP_IDLE_MS = 8 * 60_000;
const READINESS_SAMPLE_INTERVAL_MS = 8_000;
const TICK_MS = 1_000;
const MAX_SUGGESTIONS_PER_BURST = 3;

interface UseProactiveSuggesterArgs {
  enabled: boolean;
  boardId: string;
  boardTitle?: string;
  ideas: Idea[];
  connections: Connection[];
  selectedIdea: Idea | null;
  softMode: SoftMode;
  lastInteractionAt: number;
  textEntryActive: boolean;
  dragActive: boolean;
  currentSuggestionCount: number;
  boardController: ReturnType<typeof createBoardController>;
  applyCommittedBoard: (document: BoardDocument, history: BoardHistoryState) => void;
  onBackgroundError?: (input: { source: 'scout'; error: unknown }) => void;
  /**
   * 4-stop autonomy dial from `Project.autonomyDial` (bo-141). When omitted,
   * the suggester uses today's behaviour. `silent` disables proactive nudges
   * entirely; `whispers` lengthens the idle/plateau windows; `takes-pen`
   * shortens them. Below `silent` the suggester returns early without sampling.
   */
  autonomyDial?: AutonomyLevel;
}

const SOFT_MODE_TO_BEAT: Record<SoftMode, BeatName> = {
  explore: 'scout',
  structure: 'connect',
  stress: 'critique',
  converge: 'summarise',
};

export function useProactiveSuggester(args: UseProactiveSuggesterArgs): { busy: boolean; lastFiredAt: number | null } {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [lastFiredAt, setLastFiredAt] = useState<number | null>(null);
  const samplesRef = useRef<ReadinessSample[]>([]);
  const lastSampleAtRef = useRef<number>(0);
  const plateauHandledRef = useRef<{ score: number; at: number } | null>(null);
  const idleHandledRef = useRef<boolean>(false);
  const inflightRef = useRef<boolean>(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const visibleIdeas = useMemo(
    () => args.ideas.filter(idea => idea.status !== 'archived' && idea.status !== 'discarded'),
    [args.ideas],
  );

  const score = useMemo(
    () => computeReadinessScore({ ideas: visibleIdeas, connectionCount: args.connections.length }),
    [args.connections.length, visibleIdeas],
  );

  // Reset idle gating once the user moves again so a future pause re-triggers.
  useEffect(() => {
    idleHandledRef.current = false;
  }, [args.lastInteractionAt]);

  // Reset plateau gating once the score actually shifts.
  useEffect(() => {
    const handled = plateauHandledRef.current;
    if (handled !== null && handled.score !== score) {
      plateauHandledRef.current = null;
    }
  }, [score]);

  // bo-141 — derive the autonomy verdict once per render. `silent` returns
  // an `idleScale === 0` and `allowProactive === false`, which short-circuits
  // sampling and firing. Other levels scale the idle/plateau windows.
  const dialVerdict = autonomyGateVerdict(args.autonomyDial);

  useEffect(() => {
    if (!args.enabled) return;
    if (!dialVerdict.allowProactive) return;
    if (now - lastSampleAtRef.current < READINESS_SAMPLE_INTERVAL_MS) return;
    lastSampleAtRef.current = now;
    samplesRef.current = appendReadinessSample(samplesRef.current, { at: now, score });
  }, [args.enabled, dialVerdict.allowProactive, now, score]);

  useEffect(() => {
    if (!args.enabled) return;
    if (!dialVerdict.allowProactive) return;
    if (inflightRef.current) return;
    if (args.textEntryActive || args.dragActive) return;
    if (visibleIdeas.length === 0) return;

    const cooldownActive = lastFiredAt !== null && now - lastFiredAt < PROACTIVE_COOLDOWN_MS;
    if (cooldownActive) return;

    const idleMs = Math.max(0, now - args.lastInteractionAt);
    if (idleMs > PROACTIVE_DEEP_IDLE_MS) return;

    // Scale the idle threshold by the autonomy dial (`takes-pen` shortens it,
    // `whispers` stretches it). `idleScale` is clamped to a sane minimum so we
    // don't divide by zero — `silent` is already filtered above.
    const scaledIdleMs = Math.max(1, Math.round(PROACTIVE_IDLE_MS * dialVerdict.idleScale));
    const idleReady = idleMs >= scaledIdleMs && !idleHandledRef.current;
    const plateau = detectReadinessPlateau({
      samples: samplesRef.current,
      now,
      autonomyDial: args.autonomyDial,
    });
    const plateauHandled = plateauHandledRef.current;
    const plateauReady = plateau && (
      plateauHandled === null
      || plateauHandled.score !== score
      || now - plateauHandled.at >= PROACTIVE_PLATEAU_REARM_MS
    );

    if (!idleReady && !plateauReady) return;

    const trigger: ProactiveTrigger = plateauReady
      ? { kind: 'plateau', detail: `Score ${score} held flat for the recent window.` }
      : { kind: 'idle', detail: `Idle for ${(idleMs / 1000).toFixed(0)}s.` };

    const beat = SOFT_MODE_TO_BEAT[args.softMode];
    const focusIdea = args.selectedIdea && visibleIdeas.includes(args.selectedIdea)
      ? args.selectedIdea
      : null;
    const recentTurnLog = focusIdea?.turnLog?.slice(-4);
    const lastUserMessage = focusIdea?.turnLog
      ?.slice()
      .reverse()
      .find(entry => entry.role === 'user')?.content;

    inflightRef.current = true;
    setBusy(true);

    void (async () => {
      try {
        const result = await runProactiveSuggester({
          beat,
          trigger,
          boardTitle: args.boardTitle,
          liveIdeas: visibleIdeas.map(idea => ({ id: idea.id, rawText: idea.rawText, tags: idea.tags })),
          recentTurnLog,
          lastUserMessage,
        });

        if (!result.ok) {
          console.warn('[proactiveSuggester] run failed:', result.reason, result.error);
          args.onBackgroundError?.({ source: 'scout', error: result.error ?? new Error(`Proactive suggester ${result.reason}.`) });
          return;
        }

        const suggestions = result.suggestions;
        if (suggestions.length === 0) return;

        const ideaIdSet = new Set(visibleIdeas.map(idea => idea.id));
        const sourceLabel = `coach: ${beat}`;
        let lastCommit: Awaited<ReturnType<typeof args.boardController.createSuggestion>> | null = null;

        for (let index = 0; index < Math.min(MAX_SUGGESTIONS_PER_BURST, suggestions.length); index += 1) {
          const suggestion = suggestions[index];
          lastCommit = await args.boardController.createSuggestion({
            rawText: suggestion.rawText,
            rationale: suggestion.rationale,
            source: suggestion.source ? `${sourceLabel} · ${suggestion.source}` : sourceLabel,
            relatedIdeaIds: focusIdea && ideaIdSet.has(focusIdea.id) ? [focusIdea.id] : undefined,
            panel: ghostPanelFor(args.currentSuggestionCount + index),
            actor: { type: 'ai', source: 'beat', beat, label: 'proactiveSuggester' },
            automationKey: `proactive:${trigger.kind}:${beat}:${Date.now()}:${index}`,
          });
        }

        if (lastCommit) {
          args.applyCommittedBoard(lastCommit.document, lastCommit.history);
        }

        if (plateauReady) plateauHandledRef.current = { score, at: now };
        if (idleReady) idleHandledRef.current = true;
        setLastFiredAt(now);
      } catch (err) {
        console.warn('[proactiveSuggester] run failed:', err);
        args.onBackgroundError?.({ source: 'scout', error: err });
      } finally {
        inflightRef.current = false;
        setBusy(false);
      }
    })();
  }, [
    args,
    lastFiredAt,
    now,
    score,
    visibleIdeas,
  ]);

  return { busy, lastFiredAt };
}
