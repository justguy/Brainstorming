/**
 * Screen 02 · Board canvas (host for `route.kind === 'board'`).
 *
 * Spec: Design/IMPLEMENTATION_PLAN.md §5 Screen 02 + §6 M2 — "Refactor App.tsx
 * body → BoardScreen.tsx". This component is a near-verbatim relocation of the
 * monolithic body that previously lived inside App.tsx. The motivation is to
 * make App.tsx a thin route dispatcher (`switch (route.kind)`) without
 * touching the canvas wiring. Hooks order, prop drilling, and state management
 * inside this screen are intentionally identical to the pre-refactor App body
 * so the diff stays a *move*, not a rewrite.
 *
 * NOTE for re-mergers: if you're resolving a 3-way merge against codex WIP that
 * still touches `apps/web/App.tsx`, the body it modifies has been transplanted
 * here unchanged. Re-apply WIP edits to *this* file (BoardScreen.tsx) — the
 * dispatcher in App.tsx no longer carries board state.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Connection,
  ConnectionKind,
  ConnectionStrength,
  LlmMessage,
  Panel,
} from '../../../src/types';
import { useBrainstormingTools, dispatchAndWait } from '../webmcp-tools';
import Workspace, { WorkspacePhaseFlow } from '../../../src/workspace/Workspace';
import { IdeaAttentionPanel } from '../../../src/workspace/IdeaAttentionPanel';
import { createLegacyToolIdea } from '../../../src/workspace/legacyPhaseAdapter';
import { useBrainstormAnalysisEvents } from '../useBrainstormAnalysisEvents';
import { useBrainstormLifecycleEvents } from '../useBrainstormLifecycleEvents';
import { useBrainstormSuggestionEvents } from '../useBrainstormSuggestionEvents';
import { useBoardSync } from '../useBoardSync';
import { useBrainstormSupportingDocEvents } from '../useBrainstormSupportingDocEvents';
import { useBrainstormWorkspaceEvents } from '../useBrainstormWorkspaceEvents';
import { useCanvasIdeaMutations } from '../useCanvasIdeaMutations';
import { AUTO_IDLE_MS, useCompanionAutomation } from '../useCompanionAutomation';
import { useBoardSessionActions } from '../useBoardSessionActions';
import { useBoardAnalysisActions } from '../useBoardAnalysisActions';
import { useBoardSuggestionActions } from '../useBoardSuggestionActions';
import { useBoardActivity } from '../useBoardActivity';
import { useBoardBeatRunner } from '../useBoardBeatRunner';
import { BoardAppView } from '../BoardAppView';
import { useBeatReviewActions } from '../useBeatReviewActions';
import { BeatReviewPanel } from '../BeatReviewPanel';
import {
  SynthesizerProposalNudges,
  type ClusterHintReviewItem,
} from '../SynthesizerProposalNudges';
import { BoardHistoryPanel } from '../BoardHistoryPanel';
import { BoardBeadStrip } from '../BoardBeadStrip';
import { IdeaDocsPanel } from '../IdeaDocsPanel';
import { IdeaTurnLogPanel } from '../IdeaTurnLogPanel';
import { PeerPresenceStrip } from '../PeerPresenceStrip';
import { runManualBoardBeat, selectBoardBeatReviewSurface } from '../boardBeatReviewSurface';
import { useBoardTheme } from '../useBoardTheme';
import { useFacilitatorSync } from '../useFacilitatorSync';
import { useProjectSync } from '../useProjectSync';
import { WorkspaceScoutInspector } from '../../../src/workspace/WorkspaceScoutInspector';
import {
  DEMO_FALLBACK_CONNECTIONS,
  DEMO_FALLBACK_CRITIQUES,
  DEMO_FALLBACK_IDEAS,
  DEMO_FALLBACK_SUGGESTIONS,
} from '../demoBoardFallback';
import { findLatestSafeAiUndoTarget } from '../../../src/storage/boardAiUndo';
import DiscardPile from '../../../src/canvas/DiscardPile';
import { usePromoteToPrinciple } from '../usePromoteToPrinciple';
import { useIdeaOpenModes } from '../useIdeaOpenModes';
import {
  ConnectionInspectorPopover,
  type ConnectionInspectorAnchor,
} from '../ConnectionInspectorPopover';

const DEV_COMPANION_PAUSED_TWEAK_KEY = 'companion.facilitatorPaused';
const CAPTURE_CANVAS_SELECTOR = '.bo-canvas';
const CAPTURE_REVEAL_PADDING = 32;
const CAPTURE_REVEAL_ATTEMPTS = 5;
const CAPTURE_HIGHLIGHT_CLEAR_MS = 2200;

type CaptureFeedback = {
  tone: 'success' | 'error';
  message: string;
} | null;

type CaptureReveal = {
  ideaId: string;
  panel: Panel;
  attempts: number;
};

type LatestCapture = {
  ideaId: string;
  panel: Panel;
};

function getCanvasElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(CAPTURE_CANVAS_SELECTOR);
}

function isPanelVisible(canvas: HTMLElement, panel: Panel): boolean {
  const visibleLeft = canvas.scrollLeft + CAPTURE_REVEAL_PADDING;
  const visibleTop = canvas.scrollTop + CAPTURE_REVEAL_PADDING;
  const visibleRight = canvas.scrollLeft + canvas.clientWidth - CAPTURE_REVEAL_PADDING;
  const visibleBottom = canvas.scrollTop + canvas.clientHeight - CAPTURE_REVEAL_PADDING;

  return (
    panel.x >= visibleLeft &&
    panel.y >= visibleTop &&
    panel.x + panel.width <= visibleRight &&
    panel.y + panel.height <= visibleBottom
  );
}

function centerPanelOnCanvas(canvas: HTMLElement, panel: Panel): void {
  const targetLeft = Math.max(0, panel.x - (canvas.clientWidth - panel.width) / 2);
  const targetTop = Math.max(0, panel.y - (canvas.clientHeight - panel.height) / 2);
  canvas.scrollTo({
    left: Math.round(targetLeft),
    top: Math.round(targetTop),
    behavior: 'auto',
  });
}

const TURN_LOG_TRANSFER_TAGS = ['turn-log'];

export interface BoardScreenProps {
  /**
   * Hop to a different route. Provided by the App-level dispatcher so
   * BoardScreen does not have to touch the routing layer directly. Today
   * BoardScreen only navigates to `#/options`; future board sub-routes
   * (brief / log / handoff / map) will flow through the same callback.
   */
  onNavigate: (hash: string) => void;
}

export function BoardScreen({ onNavigate }: BoardScreenProps): React.ReactElement {
  const { boardTheme, setBoardTheme } = useBoardTheme();
  const {
    boardId, boardTitle, boardRepository, boardController, boardReady, ideas, groups, docs, selectedId, setSelectedId, hasApiKey,
    docCounts, setDocCounts, connections, critiques, suggestions, beatReviewSessions, beatReviewItems, tweaks,
    historyState, changeSets, applyCommittedBoard, updateBoardTweaks, createBeatReviewSession, keepBeatReviewItem,
    scratchBeatReviewItem,
    handleIdeaUpdate, loadBoard, loadIdeas, loadDocCounts, loadCritiques, supportingDocMutations, refineSupportingDoc,
  } = useBoardSync();
  const [newIdeaText, setNewIdeaText] = useState('');
  const [newIdeaTags, setNewIdeaTags] = useState('');
  const [creating, setCreating] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureFeedback, setCaptureFeedback] = useState<CaptureFeedback>(null);
  const [captureReveal, setCaptureReveal] = useState<CaptureReveal | null>(null);
  const [latestCapture, setLatestCapture] = useState<LatestCapture | null>(null);
  const [captureHighlightIds, setCaptureHighlightIds] = useState<string[]>([]);
  const [advancingFromTool, setAdvancingFromTool] = useState(false);
  const [canvasBusy, setCanvasBusy] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [linkModeEnabled, setLinkModeEnabled] = useState(false);
  const [docsIdeaId, setDocsIdeaId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [turnLogOpen, setTurnLogOpen] = useState(false);
  const [selectedAttentionItemId, setSelectedAttentionItemId] = useState<string | null>(null);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [hoverIdeaId, setHoverIdeaId] = useState<string | null>(null);
  const [dismissedDemoSuggestionIds, setDismissedDemoSuggestionIds] = useState<string[]>([]);
  const [dismissedDemoCritiqueIds, setDismissedDemoCritiqueIds] = useState<string[]>([]);
  // bo-143 — currently previewed Synthesizer cluster proposal. Held as the
  // full review item so the canvas can paint a halo around the proposed idea
  // ids without a second lookup, and so the NudgeCard list can flag the
  // matching card as "showing preview" without a separate id field.
  const [clusterPreviewItem, setClusterPreviewItem] = useState<ClusterHintReviewItem | null>(null);
  // Screen 05 — connection inspector. The popover is opened by clicking a
  // connection edge; the canvas hands us the connection id + a viewport
  // anchor point so we can position the popover near the click.
  const [connectionInspectorId, setConnectionInspectorId] = useState<string | null>(null);
  const [connectionInspectorAnchor, setConnectionInspectorAnchor] =
    useState<ConnectionInspectorAnchor | null>(null);
  const [connectionInspectorBusy, setConnectionInspectorBusy] = useState(false);
  const [connectionInspectorError, setConnectionInspectorError] = useState<string | null>(null);
  const lastSharedBoardMutationIdRef = useRef<string | null>(null);
  const { activity, setActivity, textEntryActive, markActivity } = useBoardActivity({ captureOpen });
  const { activeBeatRun, runBoardBeat } = useBoardBeatRunner();
  const persistedFacilitatorPaused = Boolean(tweaks?.values[DEV_COMPANION_PAUSED_TWEAK_KEY]);
  // bo-162 — promote-to-principle is wired into the inspector's actions row.
  // The hook owns dedupe + the IDB write through useProjectSync.
  const { promoteToPrinciple } = usePromoteToPrinciple();
  // Idea-focus / bloom WIP also exposes the persisted guidance-notes toggle
  // that AppHeaderBar surfaces. We only consume the guidance bits here so the
  // header has the props it expects; bloom/focus wiring lands separately.
  const { guidanceVisible, toggleGuidance } = useIdeaOpenModes();

  // These derive from `ideas` and a few collections; without memoization a
  // 1-second clock tick from useCompanionAutomation re-creates every array
  // on each render and forces React Flow to re-project + restyle every node.
  const visibleIdeas = useMemo(
    () => ideas.filter(i => i.status !== 'archived' && i.status !== 'discarded'),
    [ideas],
  );
  const discardedIdeas = useMemo(
    () => ideas.filter(i => i.status === 'discarded'),
    [ideas],
  );
  const usingDemoBoard = boardReady && visibleIdeas.length === 0 && connections.length === 0 && critiques.length === 0 && suggestions.length === 0;
  const demoSuggestions = useMemo(
    () => DEMO_FALLBACK_SUGGESTIONS.filter(suggestion => !dismissedDemoSuggestionIds.includes(suggestion.id)),
    [dismissedDemoSuggestionIds],
  );
  const demoCritiques = useMemo(
    () => DEMO_FALLBACK_CRITIQUES.filter(critique => !dismissedDemoCritiqueIds.includes(critique.id)),
    [dismissedDemoCritiqueIds],
  );
  const canvasIdeas = usingDemoBoard ? DEMO_FALLBACK_IDEAS : visibleIdeas;
  const canvasConnections = usingDemoBoard ? DEMO_FALLBACK_CONNECTIONS : connections;
  const selectedBoardIdea = usingDemoBoard ? null : ideas.find(i => i.id === selectedId) ?? null;
  const selectedCanvasIdea = canvasIdeas.find(idea => idea.id === selectedId) ?? null;
  const selectedSuggestion = (usingDemoBoard ? demoSuggestions : suggestions)
    .find(suggestion => suggestion.id === selectedSuggestionId) ?? null;
  const selectedSuggestionIdea = selectedSuggestion
    ? ideas.find(idea => selectedSuggestion.relatedIdeaIds?.includes(idea.id)) ?? null
    : null;
  const selectedLegacyToolIdea = createLegacyToolIdea(selectedBoardIdea);
  const activeCritiques = critiques.filter(critique => critique.status === 'active');
  const facilitatorSync = useFacilitatorSync(boardId, persistedFacilitatorPaused);
  // bo-141 — read the 4-stop autonomy dial from the active project so the
  // automation policy + proactive coach honour the user's persona setting.
  // `useProjectSync` resolves on mount; until it does the dial defaults to the
  // legacy `'active'` behaviour inside the gate, so there's no flicker window
  // where personas misbehave.
  const projectSync = useProjectSync();
  const autonomyDial = projectSync.project?.autonomyDial;
  const boardSubtitle = boardReady
    ? `${canvasIdeas.length} ideas · ${canvasConnections.length} connections`
    : 'Loading board…';

  useEffect(() => {
    if (!captureFeedback) return undefined;
    const timeout = window.setTimeout(() => {
      setCaptureFeedback(current => (current === captureFeedback ? null : current));
    }, captureFeedback.tone === 'success' ? 3200 : 5200);
    return () => window.clearTimeout(timeout);
  }, [captureFeedback]);

  useEffect(() => {
    if (!selectedBoardIdea) {
      setInspectorOpen(false);
      setTurnLogOpen(false);
    }
  }, [selectedBoardIdea]);

  useEffect(() => {
    if (!selectedSuggestionId) return;
    const availableSuggestions = usingDemoBoard ? demoSuggestions : suggestions;
    if (!availableSuggestions.some(suggestion => suggestion.id === selectedSuggestionId)) {
      setSelectedSuggestionId(null);
    }
  }, [demoSuggestions, selectedSuggestionId, suggestions, usingDemoBoard]);

  useEffect(() => {
    if (captureHighlightIds.length === 0) return undefined;
    const timeout = window.setTimeout(() => {
      setCaptureHighlightIds([]);
    }, CAPTURE_HIGHLIGHT_CLEAR_MS);
    return () => window.clearTimeout(timeout);
  }, [captureHighlightIds]);

  useEffect(() => {
    if (!usingDemoBoard) return;
    const canvas = getCanvasElement();
    if (!canvas) return;
    canvas.scrollTo({ left: 0, top: 0, behavior: 'auto' });
  }, [usingDemoBoard]);

  useBrainstormingTools(selectedLegacyToolIdea);

  const { handleCapture, handleDiscard, handleRestore, handleUndo, handleRedo } = useBoardSessionActions({
    ideas: visibleIdeas, newIdeaText, newIdeaTags, boardController, applyCommittedBoard, setCreating,
    setNewIdeaText, setNewIdeaTags, markActivity, onCaptureFeedback: setCaptureFeedback,
    onCaptureCommitted: capture => {
      setSelectedId(null);
      setInspectorOpen(false);
      setTurnLogOpen(false);
      setDocsIdeaId(null);
      setLatestCapture(capture);
      setCaptureReveal({ ...capture, attempts: 0 });
    },
  });
  const {
    findingConnections, lastConnectionsRunAt, highlightIds, critiqueBusyByIdea, animatedConnectionIds,
    animatedCritiqueIds, markConnectionsRunAt, handleHighlight, runConnectionFinder, createManualConnection, runCritiqueIdea,
    handleAcceptCritique, handleDismissCritique,
  } = useBoardAnalysisActions({
    boardId,
    ideas,
    connections,
    boardRepository,
    boardController,
    applyCommittedBoard,
    runBoardBeat,
    onCritiqueOutcome: ({ critiqueId, outcome }) => {
      facilitatorSync.setAiActionOutcomeForEntity(critiqueId, outcome);
      if (outcome === 'accepted') {
        facilitatorSync.recordRecoverySignal(`Critique ${critiqueId} was accepted.`);
      }
    },
  });
  const {
    scouting, lastScoutRunAt, suggestionBusy, animatedSuggestionIds, suggestionsExpanded,
    visibleCanvasSuggestions, suggestionOverflowCount, runScout, runCrossPollinate, handleAdmitSuggestion,
    handleElaborateSuggestion, handleDismissSuggestion, handleMoveSuggestion, expandSuggestions, collapseSuggestions,
  } = useBoardSuggestionActions({
    boardId,
    ideas,
    suggestions,
    boardRepository,
    boardController,
    applyCommittedBoard,
    runBoardBeat,
    markActivity,
    onSuggestionOutcome: ({ suggestionId, outcome }) => {
      facilitatorSync.setAiActionOutcomeForEntity(suggestionId, outcome);
      if (outcome === 'accepted') {
        facilitatorSync.recordRecoverySignal(`Suggestion ${suggestionId} was admitted.`);
      }
    },
  });
  const { handleMove, handleGroup, handleGroupSelection, handleUngroup, handleMerge } = useCanvasIdeaMutations({
    ideas, boardController, applyCommittedBoard, setCanvasBusy, setSelectedId, markActivity,
  });
  const {
    activeSession: activeBeatReviewSession, activeItems: activeBeatReviewItems, busyByItem: beatReviewBusyByItem,
    batchBusy: beatReviewBatchBusy, presentBeatReview, handleKeep: handleKeepBeatReviewItem,
    handleScratch: handleScratchBeatReviewItem, handleKeepAll: handleKeepAllBeatReviewItems,
    handleScratchAll: handleScratchAllBeatReviewItems, closeActiveSession: closeBeatReviewSession,
    focusSession: focusBeatReviewSession,
  } = useBeatReviewActions({ ideas, beatReviewSessions, beatReviewItems, boardController, applyCommittedBoard, createBeatReviewSession, keepBeatReviewItem, scratchBeatReviewItem });

  useBrainstormSupportingDocEvents({ boardId, ideas, loadDocCounts, markActivity, supportingDocMutations, refineSupportingDoc });
  useBrainstormAnalysisEvents({
    boardId, ideas, connections, boardController, applyCommittedBoard, markConnectionsRunAt,
    handleHighlight, loadCritiques, runConnectionFinder, runCritiqueIdea, handleDismissCritique,
  });
  useBrainstormLifecycleEvents({
    boardId, ideas, boardController, applyCommittedBoard, loadIdeas, setSelectedId, setAdvancingFromTool, setCreating,
  });
  useBrainstormSuggestionEvents({
    boardId, boardTitle, ideas, groups, connections, suggestions, runConnectionFinder, runCritiqueIdea, runScout, runCrossPollinate, runBoardBeat,
    presentBeatReview,
    handleMoveSuggestion,
    handleAdmitSuggestion, handleElaborateSuggestion, handleDismissSuggestion,
  });
  useBrainstormWorkspaceEvents({
    boardId, ideas, boardController, applyCommittedBoard, loadBoard, loadIdeas, setSelectedId, handleMove, handleGroup, handleUngroup, handleMerge,
  });

  useEffect(() => {
    const sharedBoardMutation = facilitatorSync.lastBoardMutation;
    if (!sharedBoardMutation) return;
    if (lastSharedBoardMutationIdRef.current === sharedBoardMutation.id) return;
    lastSharedBoardMutationIdRef.current = sharedBoardMutation.id;
    if (sharedBoardMutation.clientId === facilitatorSync.localClientId) return;
    void loadBoard();
  }, [facilitatorSync.lastBoardMutation, facilitatorSync.localClientId, loadBoard]);

  const { boardBeatReviewSession, boardBeatReviewItems } = selectBoardBeatReviewSurface({ beatReviewSessions, beatReviewItems, activeBeatReviewSession });

  // bo-143 — drop the preview if the item was applied / scratched / removed
  // out from under us, so the dashed halo doesn't linger on the canvas.
  useEffect(() => {
    if (!clusterPreviewItem) return;
    const live = beatReviewItems.find(item => item.id === clusterPreviewItem.id);
    if (!live || live.status !== 'pending' || live.candidate.kind !== 'cluster_hint') {
      setClusterPreviewItem(null);
    }
  }, [beatReviewItems, clusterPreviewItem]);
  const clusterPreviewIdeaIds = clusterPreviewItem
    ? clusterPreviewItem.candidate.payload.ideaIds ?? clusterPreviewItem.candidate.affectedIdeaIds ?? null
    : null;

  const {
    facilitatorPaused, idleMs, softModeAssessment, interactionSuppressed, softModeBusy,
    lastMeaningfulActivity, pendingBoardChange, autoRunReady, autoRunCountdownMs,
    showSoftModeHint, companionActionLabel, handleSoftModeAction, toggleFacilitatorPause, lastAiAction, dismissHint,
  } = useCompanionAutomation({
    activity,
    setActivity,
    dragActive,
    textEntryActive,
    activeBeatRun,
    persistedFacilitatorPaused,
    persistFacilitatorPaused: async paused => {
      await updateBoardTweaks(
        { [DEV_COMPANION_PAUSED_TWEAK_KEY]: paused },
        { type: 'user', source: 'canvas', label: 'devCompanion' },
        paused ? 'Paused dev companion automation' : 'Resumed dev companion automation',
      );
    },
    sharedFacilitatorPaused: facilitatorSync.sharedPause,
    isAiHost: facilitatorSync.isAiHost,
    syncBoardChangeAt: facilitatorSync.lastBoardActivityAt,
    sharedAiAction: facilitatorSync.lastAiAction,
    setSharedFacilitatorPause: facilitatorSync.setSharedPause,
    recordSharedAiAction: facilitatorSync.recordAiAction,
    scouting,
    findingConnections,
    critiqueBusyByIdea,
    visibleIdeas,
    discardedIdeasCount: discardedIdeas.length,
    connectionsCount: connections.length,
    suggestionsCount: suggestions.length,
    docCounts,
    selectedBoardIdea,
    activeCritiques,
    recentSessionEvents: facilitatorSync.recentSessionEvents,
    autonomyState: facilitatorSync.autonomyState,
    recentAiActionOutcomes: facilitatorSync.recentAiActionOutcomes,
    runScout,
    runConnectionFinder,
    runCritiqueIdea,
    setAutonomyEffectiveMode: facilitatorSync.setAutonomyEffectiveMode,
    setAutonomyBackoffState: facilitatorSync.setAutonomyBackoffState,
    recordRecoverySignal: facilitatorSync.recordRecoverySignal,
    addStagedInsight: facilitatorSync.addStagedInsight,
    autonomyDial,
  });

  const critiqueFocusIdeaId = hoverIdeaId ?? selectedId ?? null;
  const editingIdeaId = textEntryActive ? selectedId : null;
  const suppressRevealAnimations = dragActive || textEntryActive;
  const highlightedIdeaIds = [...new Set([
    ...highlightIds,
    ...captureHighlightIds,
    ...(selectedSuggestion?.relatedIdeaIds ?? []),
  ])];
  const canvasSuggestions = usingDemoBoard ? demoSuggestions : visibleCanvasSuggestions;
  const canvasCritiques = usingDemoBoard ? demoCritiques : critiques;
  const openOptions = () => onNavigate('#/options');
  const closeSuggestionDrawer = () => setSelectedSuggestionId(null);
  const openSuggestionDrawer = (suggestionId: string) => {
    setSelectedAttentionItemId(null);
    setInspectorOpen(false);
    setTurnLogOpen(false);
    setDocsIdeaId(null);
    setSelectedId(null);
    setSelectedSuggestionId(suggestionId);
  };
  const openCaptureComposer = () => {
    setCaptureFeedback(null);
    setCaptureOpen(true);
  };
  const toggleCaptureComposer = () => {
    setCaptureFeedback(null);
    setCaptureOpen(value => !value);
  };
  const closeCaptureComposer = () => setCaptureOpen(false);
  const openDocsPanel = (ideaId: string) => {
    setTurnLogOpen(false);
    setDocsIdeaId(ideaId);
  };
  const handleCaptureTextChange = (value: string) => {
    setCaptureFeedback(current => (current?.tone === 'error' ? null : current));
    setNewIdeaText(value);
  };
  const handleCaptureTagsChange = (value: string) => {
    setCaptureFeedback(current => (current?.tone === 'error' ? null : current));
    setNewIdeaTags(value);
  };
  const revealCreatedIdea = (ideaId: string, fallbackPanel?: Panel): boolean => {
    const canvas = getCanvasElement();
    const liveIdea = visibleIdeas.find(idea => idea.id === ideaId);
    const panel = liveIdea?.panel ?? fallbackPanel;
    if (!canvas || !panel) return false;

    centerPanelOnCanvas(canvas, panel);
    setCaptureHighlightIds([ideaId]);
    return isPanelVisible(canvas, panel);
  };

  async function handleTransferFromTurnLog(entry: LlmMessage): Promise<void> {
    const rawText = entry.content.trim();
    if (!rawText) {
      setCaptureFeedback({
        tone: 'error',
        message: 'Turn-log entry is empty.',
      });
      return;
    }

    const sourcePanel = selectedBoardIdea?.panel;
    const panel = sourcePanel
      ? {
          ...sourcePanel,
          x: sourcePanel.x + sourcePanel.width + 32,
        }
      : undefined;

    try {
      const result = await boardController.captureIdea({
        rawText,
        tags: [entry.role, ...TURN_LOG_TRANSFER_TAGS],
        actor: { type: 'user', source: 'canvas', label: 'turn-log-transfer' },
        panel,
      });
      applyCommittedBoard(result.document, result.history);
      setSelectedId(result.idea.id);
      setCaptureHighlightIds([result.idea.id]);
      markActivity('edit');
      setCaptureFeedback({
        tone: 'success',
        message: 'Turn-log entry transferred to note.',
      });
    } catch (err) {
      console.error('[BoardScreen] transfer turn log entry failed:', err);
      setCaptureFeedback({
        tone: 'error',
        message: 'Could not transfer turn-log entry.',
      });
    }
  }

  useEffect(() => {
    if (!captureReveal) return undefined;

    const liveIdea = visibleIdeas.find(idea => idea.id === captureReveal.ideaId);
    const panel = liveIdea?.panel ?? captureReveal.panel;
    if (!panel) {
      setCaptureFeedback({
        tone: 'error',
        message: 'Note was saved, but its board position is missing.',
      });
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const revealed = revealCreatedIdea(captureReveal.ideaId, panel);
      if (revealed) {
        setCaptureFeedback({
          tone: 'success',
          message: 'Note added and centered on the board.',
        });
        setCaptureReveal(null);
        return;
      }

      if (captureReveal.attempts + 1 >= CAPTURE_REVEAL_ATTEMPTS) {
        setCaptureFeedback({
          tone: 'error',
          message: 'Note was saved, but we could not confirm it onscreen.',
        });
        setCaptureReveal(null);
        return;
      }

      setCaptureReveal(current => (
        current && current.ideaId === captureReveal.ideaId
          ? { ...current, attempts: current.attempts + 1, panel }
          : current
      ));
    }, 90);

    return () => window.clearTimeout(timer);
  }, [captureReveal, setSelectedId, visibleIdeas]);

  const aiUndoTarget = findLatestSafeAiUndoTarget(changeSets, historyState.cursor);
  const triggerManualBoardBeat = (beat: 'cluster' | 'summarise'): void => {
    void runManualBoardBeat({ beat, boardId, boardTitle, ideas, groups, connections, runBoardBeat, presentBeatReview }).catch(err => {
      console.error(`[BoardScreen] ${beat} beat failed:`, err);
    });
  };
  const applyStagedInsight = (insightId: string): void => {
    const insight = facilitatorSync.stagedInsights?.find(item => item.id === insightId);
    if (!insight) return;

    const acceptAndRecover = () => {
      facilitatorSync.setAiActionOutcomeForPendingInsight(insightId, 'accepted');
      facilitatorSync.recordRecoverySignal(`Staged insight ${insightId} was adopted.`);
    };

    if (insight.kind === 'scout') {
      const drafts = Array.isArray((insight.payload as { drafts?: unknown[] } | undefined)?.drafts)
        ? (insight.payload as { drafts: Array<Record<string, unknown>> }).drafts
        : [];
      const draft = drafts[0];
      if (!draft) return;
      void boardController.createSuggestion({
        rawText: typeof draft.rawText === 'string' ? draft.rawText : insight.summary,
        rationale: typeof draft.rationale === 'string' ? draft.rationale : insight.summary,
        source: typeof draft.source === 'string' ? draft.source : 'Robot note',
        sourceIdeaIds: Array.isArray(draft.sourceIdeaIds) ? draft.sourceIdeaIds.filter((value): value is string => typeof value === 'string') : undefined,
        relatedIdeaIds: Array.isArray(draft.relatedIdeaIds) ? draft.relatedIdeaIds.filter((value): value is string => typeof value === 'string') : undefined,
        actor: { type: 'user', source: 'canvas', label: 'robotNotes' },
      }).then(result => (
        boardController.admitSuggestion({
          suggestionId: result.suggestion.id,
          actor: { type: 'user', source: 'canvas', label: 'robotNotes' },
        })
      )).then(result => {
        applyCommittedBoard(result.document, result.history);
        acceptAndRecover();
      }).catch(err => {
        console.error('[BoardScreen] apply staged scout insight failed:', err);
      });
      return;
    }

    if (insight.kind === 'critique') {
      const payload = insight.payload as { ideaId?: string; critique?: string; evidenceAsk?: string } | undefined;
      if (!payload?.ideaId || !payload.critique || !payload.evidenceAsk) return;
      void boardController.createCritique({
        ideaId: payload.ideaId,
        critique: payload.critique,
        evidenceAsk: payload.evidenceAsk,
        actor: { type: 'user', source: 'canvas', label: 'robotNotes' },
      }).then(result => {
        applyCommittedBoard(result.document, result.history);
        acceptAndRecover();
      }).catch(err => {
        console.error('[BoardScreen] apply staged critique insight failed:', err);
      });
      return;
    }

    if (insight.kind === 'connection') {
      const drafts = Array.isArray((insight.payload as { drafts?: unknown[] } | undefined)?.drafts)
        ? (insight.payload as { drafts: Array<Record<string, unknown>> }).drafts
        : [];
      if (drafts.length === 0) return;
      const stagedConnections = drafts
        .filter(draft => Array.isArray(draft.ideaIds) && typeof draft.kind === 'string' && typeof draft.rationale === 'string' && typeof draft.strength === 'string')
        .map(draft => ({
          id: crypto.randomUUID(),
          boardId,
          ideaIds: (draft.ideaIds as unknown[]).filter((value): value is string => typeof value === 'string'),
          kind: draft.kind as Connection['kind'],
          rationale: draft.rationale as string,
          strength: draft.strength as Connection['strength'],
          supportingDocIds: Array.isArray(draft.supportingDocIds)
            ? (draft.supportingDocIds as unknown[]).filter((value): value is string => typeof value === 'string')
            : undefined,
          createdAt: Date.now(),
        }))
        .filter(connection => connection.ideaIds.length >= 2);
      if (stagedConnections.length === 0) return;
      void boardController.replaceConnections({
        connections: [...connections, ...stagedConnections],
        actor: { type: 'user', source: 'canvas', label: 'robotNotes' },
        summary: `Accepted ${stagedConnections.length} staged connection${stagedConnections.length === 1 ? '' : 's'}`,
      }).then(result => {
        applyCommittedBoard(result.document, result.history);
        acceptAndRecover();
      }).catch(err => {
        console.error('[BoardScreen] apply staged connection insight failed:', err);
      });
    }
  };

  // Screen 05 — connection inspector handlers. Click on a connection edge
  // opens a small popover anchored at the click point; the user can edit
  // the connection's kind/strength/rationale and we persist via the same
  // `replaceConnections` mutation that the rest of the board uses.
  const inspectorConnection = connectionInspectorId
    ? connections.find(connection => connection.id === connectionInspectorId) ?? null
    : null;

  function handleConnectionClick(
    ideaIds: string[],
    connectionId?: string,
    clientPosition?: { x: number; y: number },
  ): void {
    // Always preserve the existing highlight-on-click behaviour so the
    // canvas's idea path lights up regardless of whether the inspector
    // opens. Demo boards skip the inspector — their connections aren't
    // backed by real changeSets.
    handleHighlight(ideaIds);
    if (usingDemoBoard) return;
    if (!connectionId) return;
    setConnectionInspectorError(null);
    setConnectionInspectorId(connectionId);
    setConnectionInspectorAnchor(clientPosition ?? null);
  }

  function closeConnectionInspector(): void {
    setConnectionInspectorId(null);
    setConnectionInspectorAnchor(null);
    setConnectionInspectorError(null);
    setConnectionInspectorBusy(false);
  }

  async function handleConnectionInspectorSave(input: {
    connectionId: string;
    kind: ConnectionKind;
    strength: ConnectionStrength;
    rationale: string;
  }): Promise<void> {
    const target = connections.find(connection => connection.id === input.connectionId);
    if (!target) {
      setConnectionInspectorError('Connection no longer exists.');
      return;
    }
    setConnectionInspectorBusy(true);
    setConnectionInspectorError(null);
    try {
      const nextConnections: Connection[] = connections.map(connection =>
        connection.id === input.connectionId
          ? {
              ...connection,
              kind: input.kind,
              strength: input.strength,
              rationale: input.rationale,
            }
          : connection,
      );
      const result = await boardController.replaceConnections({
        connections: nextConnections,
        actor: { type: 'user', source: 'canvas', label: 'connectionInspector' },
        summary: `Edited connection ${input.connectionId}`,
      });
      applyCommittedBoard(result.document, result.history);
      closeConnectionInspector();
    } catch (err) {
      console.error('[BoardScreen] save connection edit failed:', err);
      setConnectionInspectorError(err instanceof Error ? err.message : 'Could not save changes.');
      setConnectionInspectorBusy(false);
    }
  }

  // If the underlying connection disappears (e.g. removed by another peer
  // or by an undo) close the inspector so we never render a stale view.
  useEffect(() => {
    if (!connectionInspectorId) return;
    if (connections.some(connection => connection.id === connectionInspectorId)) return;
    closeConnectionInspector();
  }, [connectionInspectorId, connections]);

  return (
    <BoardAppView
      header={{
        advancingFromTool,
        boardTheme,
        boardSubtitle,
        captureActionLabel: latestCapture ? (captureReveal ? 'Centering…' : 'Show note') : null,
        canvasBusy,
        captureFeedback,
        captureOpen,
        creating,
        historyState,
        historyOpen,
        linkModeEnabled,
        boardTitle,
        onCaptureAction: captureReveal
          ? () => {
            const pending = captureReveal;
            void Promise.resolve().then(() => {
              const revealed = revealCreatedIdea(pending.ideaId, pending.panel);
              setCaptureFeedback({
                tone: revealed ? 'success' : 'error',
                message: revealed
                  ? 'Note centered on the board.'
                  : 'Note was saved, but is still not confirmed onscreen.',
              });
            });
          }
          : latestCapture
            ? () => {
              const revealed = revealCreatedIdea(latestCapture.ideaId, latestCapture.panel);
              setCaptureFeedback({
                tone: revealed ? 'success' : 'error',
                message: revealed
                  ? 'Note centered on the board.'
                  : 'Note was saved, but is still not confirmed onscreen.',
              });
            }
            : undefined,
        onOpenCapture: openCaptureComposer,
        onUndo: handleUndo,
        onRedo: handleRedo,
        onToggleLinkMode: () => setLinkModeEnabled(value => !value),
        onToggleHistory: () => setHistoryOpen(value => !value),
        onSetBoardTheme: setBoardTheme,
        onOpenOptions: openOptions,
        guidanceNotesEnabled: guidanceVisible,
        onToggleGuidanceNotes: toggleGuidance,
      }}
      showApiKeyBanner={hasApiKey === false}
      onOpenOptions={openOptions}
      beadStrip={selectedCanvasIdea ? (
        <BoardBeadStrip
          idea={selectedCanvasIdea}
          onOpenInspector={usingDemoBoard ? undefined : () => setInspectorOpen(true)}
        />
      ) : null}
      discardPile={discardedIdeas.length > 0 ? (
        <DiscardPile
          ideas={discardedIdeas}
          onRestore={handleRestore}
          onPreview={id => {
            setSelectedId(id);
            setInspectorOpen(true);
          }}
        />
      ) : null}
      turnLogPanel={turnLogOpen && selectedBoardIdea ? (
        <IdeaTurnLogPanel
          idea={selectedBoardIdea}
          open={turnLogOpen}
          onClose={() => setTurnLogOpen(false)}
          onTransfer={handleTransferFromTurnLog}
          onOpenInspector={selectedBoardIdea ? () => setInspectorOpen(true) : undefined}
        />
      ) : null}
      peerStrip={facilitatorSync.peers.length > 0 ? (
        <PeerPresenceStrip
          hostClientId={facilitatorSync.hostClientId}
          localClientId={facilitatorSync.localClientId}
          peers={facilitatorSync.peers}
        />
      ) : null}
      historyPanel={historyOpen ? (
        <BoardHistoryPanel
          changeSets={changeSets}
          cursor={historyState.cursor}
          totalChanges={Math.max(0, historyState.nextSeq - 1)}
          canUndo={historyState.canUndo}
          canRedo={historyState.canRedo}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
      reviewPanel={activeBeatReviewSession && activeBeatReviewItems.length > 0 ? (
        <BeatReviewPanel
          session={activeBeatReviewSession}
          items={activeBeatReviewItems}
          busyByItem={beatReviewBusyByItem}
          batchBusy={beatReviewBatchBusy}
          onKeep={itemId => { void handleKeepBeatReviewItem(itemId); }}
          onScratch={itemId => { void handleScratchBeatReviewItem(itemId); }}
          onKeepAll={() => { void handleKeepAllBeatReviewItems(); }}
          onScratchAll={() => { void handleScratchAllBeatReviewItems(); }}
          onClose={closeBeatReviewSession}
        />
      ) : null}
      companionRail={{
        hasApiKey, facilitatorPaused, activeBeatRun, softModeAssessment, interactionSuppressed, idleMs,
        autoIdleMs: AUTO_IDLE_MS, lastAiAction, lastScoutRunAt, lastConnectionsRunAt, companionActionLabel,
        softModeBusy, lastMeaningfulActivity, pendingBoardChange, autoRunReady, autoRunCountdownMs,
        showSoftModeHint, ideas: canvasIdeas, connections: canvasConnections, findingConnections, scouting, suggestions: canvasSuggestions, handleSoftModeAction, toggleFacilitatorPause,
        undoRobotLabel: aiUndoTarget?.tooltip,
        runConnectionFinder: () => {
          facilitatorSync.recordRecoverySignal('Direct connection request from the dock.');
          void runConnectionFinder();
        },
        runScout: () => {
          facilitatorSync.recordRecoverySignal('Direct scout request from the dock.');
          void runScout();
        },
        dismissHint,
        onOpenTurnLog: selectedBoardIdea
          ? () => {
            setDocsIdeaId(null);
            setTurnLogOpen(true);
          }
          : undefined,
        turnLogCount: selectedBoardIdea?.turnLog.length ?? 0,
        onUndoRobot: aiUndoTarget
          ? () => {
            void boardController.undoAiChange({
              changeSetId: aiUndoTarget.changeSetId,
              actor: { type: 'user', source: 'canvas', label: 'undoRobot' },
            }).then(result => {
              if (result) applyCommittedBoard(result.document, result.history);
            }).catch(err => {
              console.error('[BoardScreen] undo robot failed:', err);
            });
          }
          : undefined,
        boardBeatReviewSession,
        boardBeatReviewItems,
        onOpenBoardBeatReview: boardBeatReviewSession ? () => focusBeatReviewSession(boardBeatReviewSession.id) : undefined,
        onRunClusterBeat: () => triggerManualBoardBeat('cluster'),
        onRunSummariseBeat: () => triggerManualBoardBeat('summarise'),
        autonomy: {
          sharedPause: facilitatorSync.sharedPause,
          autonomyState: facilitatorSync.autonomyState,
          recentAiActionOutcomes: facilitatorSync.recentAiActionOutcomes,
          stagedInsightCount: facilitatorSync.stagedInsights?.length ?? 0,
        },
        robotNotes: {
          items: facilitatorSync.stagedInsights ?? [],
          onApply: applyStagedInsight,
          onDismiss: insightId => facilitatorSync.setAiActionOutcomeForPendingInsight(insightId, 'rejected'),
        },
        synthesizerProposals: (
          <SynthesizerProposalNudges
            items={boardBeatReviewItems}
            ideas={ideas}
            previewItemId={clusterPreviewItem?.id ?? null}
            busyByItem={beatReviewBusyByItem}
            onAccept={itemId => {
              if (clusterPreviewItem?.id === itemId) {
                setClusterPreviewItem(null);
              }
              void handleKeepBeatReviewItem(itemId);
            }}
            onPreviewToggle={item => setClusterPreviewItem(item)}
            onDismiss={itemId => {
              if (clusterPreviewItem?.id === itemId) {
                setClusterPreviewItem(null);
              }
              void handleScratchBeatReviewItem(itemId);
            }}
          />
        ),
        session: {
          localClientId: facilitatorSync.localClientId,
          hostClientId: facilitatorSync.hostClientId,
          manualHostClientId: facilitatorSync.manualHostClientId,
          sharedPause: facilitatorSync.sharedPause,
          peers: facilitatorSync.peers,
          lastAiAction: facilitatorSync.lastAiAction,
          lastBoardMutation: facilitatorSync.lastBoardMutation,
          recentSessionEvents: facilitatorSync.recentSessionEvents,
        },
      }}
      canvasStage={{
        boardTheme,
        ideas: canvasIdeas, groups, connections: canvasConnections, critiques: canvasCritiques, critiqueBusyByIdea, critiqueFocusIdeaId, hoverIdeaId, editingIdeaId,
        selectedIdeaId: selectedCanvasIdea?.id ?? null,
        showClarificationOverlay: false,
        clusterPreviewIdeaIds,
        clusterPreviewKey: clusterPreviewItem?.id ?? null,
        animatedConnectionIds, animatedCritiqueIds, animatedSuggestionIds, suppressAnimations: suppressRevealAnimations, docCounts, highlightIds: highlightedIdeaIds,
        suggestions: canvasSuggestions,
        suggestionOverflowCount, suggestionsExpanded, suggestionBusy,
        onDismissCritique: usingDemoBoard
          ? critiqueId => setDismissedDemoCritiqueIds(current => (current.includes(critiqueId) ? current : [...current, critiqueId]))
          : handleDismissCritique,
        onAcceptCritique: usingDemoBoard
          ? critiqueId => setDismissedDemoCritiqueIds(current => (current.includes(critiqueId) ? current : [...current, critiqueId]))
          : handleAcceptCritique,
        onConnectionClick: handleConnectionClick, onFocusIdeaChange: setHoverIdeaId, onDragStateChange: setDragActive, onMove: handleMove,
        linkModeEnabled,
        onOpen: id => {
          setSelectedSuggestionId(null);
          setInspectorOpen(false);
          setSelectedAttentionItemId(null);
          setSelectedId(id);
        },
        onOpenSuggestion: openSuggestionDrawer,
        onOpenDocs: openDocsPanel,
        onGroup: usingDemoBoard ? (() => {}) : handleGroup,
        onGroupSelection: usingDemoBoard ? (async () => {}) : handleGroupSelection,
        onUngroup: usingDemoBoard ? (() => {}) : handleUngroup,
        onMerge: usingDemoBoard ? (() => {}) : handleMerge,
        onDiscard: usingDemoBoard ? undefined : handleDiscard,
        onCreateConnection: usingDemoBoard ? undefined : createManualConnection,
        onAdmitSuggestion: usingDemoBoard
          ? suggestionId => setDismissedDemoSuggestionIds(current => (current.includes(suggestionId) ? current : [...current, suggestionId]))
          : handleAdmitSuggestion,
        onElaborateSuggestion: usingDemoBoard ? (() => {}) : handleElaborateSuggestion,
        onDismissSuggestion: usingDemoBoard
          ? suggestionId => setDismissedDemoSuggestionIds(current => (current.includes(suggestionId) ? current : [...current, suggestionId]))
          : handleDismissSuggestion,
        onMoveSuggestion: usingDemoBoard ? (() => {}) : handleMoveSuggestion,
        onExpandSuggestions: expandSuggestions, onCollapseSuggestions: collapseSuggestions,
        onIdeaUpdate: handleIdeaUpdate,
        onActivateAttentionItem: ({ ideaId, attentionId }) => {
          setSelectedSuggestionId(null);
          setInspectorOpen(false);
          setSelectedId(ideaId);
          setSelectedAttentionItemId(attentionId);
        },
      }}
      workspaceOverlays={{
        ideas, selectedBoardIdea: selectedCanvasIdea, docCounts,
        isInspectorOpen: Boolean(selectedSuggestion) || (!usingDemoBoard && inspectorOpen),
        capturePopover: {
          open: captureOpen, creating, feedback: captureFeedback, text: newIdeaText, tags: newIdeaTags, onToggle: toggleCaptureComposer,
          onTextChange: handleCaptureTextChange, onTagsChange: handleCaptureTagsChange, onClose: closeCaptureComposer,
          onSubmit: handleCapture,
        },
        docsPanel: (
          <IdeaDocsPanel
            boardId={boardId}
            idea={ideas.find(idea => idea.id === docsIdeaId) ?? null}
            open={Boolean(docsIdeaId)}
            onClose={() => setDocsIdeaId(null)}
            onDocsChanged={(id, count) => setDocCounts(prev => ({ ...prev, [id]: count }))}
            docMutations={supportingDocMutations}
            refineDoc={refineSupportingDoc}
          />
        ),
        inspectorContent: selectedSuggestion ? (
          <WorkspaceScoutInspector
            idea={selectedSuggestionIdea}
            boardIdeas={ideas}
            suggestion={selectedSuggestion}
            onUpdate={selectedSuggestionIdea ? handleIdeaUpdate : undefined}
            docCount={selectedSuggestionIdea ? (docCounts[selectedSuggestionIdea.id] ?? 0) : 0}
            onOpenDocs={selectedSuggestionIdea ? openDocsPanel : undefined}
            onAdmitSuggestion={usingDemoBoard
              ? suggestionId => setDismissedDemoSuggestionIds(current => (current.includes(suggestionId) ? current : [...current, suggestionId]))
              : handleAdmitSuggestion}
            onElaborateSuggestion={usingDemoBoard ? undefined : handleElaborateSuggestion}
            onDismissSuggestion={usingDemoBoard
              ? suggestionId => setDismissedDemoSuggestionIds(current => (current.includes(suggestionId) ? current : [...current, suggestionId]))
              : handleDismissSuggestion}
            suggestionBusy={selectedSuggestionId ? (suggestionBusy[selectedSuggestionId] ?? null) : null}
            onClose={closeSuggestionDrawer}
          />
        ) : selectedBoardIdea ? (
          <Workspace
            idea={selectedBoardIdea}
            onUpdate={handleIdeaUpdate}
            docCount={docCounts[selectedBoardIdea.id] ?? 0}
            onOpenDocs={openDocsPanel}
            onClose={() => setInspectorOpen(false)}
            onPromoteToPrinciple={promoteToPrinciple}
          />
        ) : null,
        isTurnLogOpen: !usingDemoBoard && turnLogOpen,
        onToggleTurnLog: usingDemoBoard ? undefined : () => {
          setDocsIdeaId(null);
          setTurnLogOpen(value => !value);
        },
        onOpenDocs: usingDemoBoard ? undefined : openDocsPanel,
        onOpenInspector: usingDemoBoard ? undefined : () => {
          setSelectedSuggestionId(null);
          setInspectorOpen(true);
        },
        onCloseInspector: () => {
          setSelectedSuggestionId(null);
          setInspectorOpen(false);
        },
        onCloseSelectedIdea: () => {
          setInspectorOpen(false);
          setTurnLogOpen(false);
          setDocsIdeaId(null);
          setSelectedAttentionItemId(null);
          setSelectedSuggestionId(null);
          setSelectedId(null);
        },
      }}
      selectedIdeaDockContent={selectedCanvasIdea ? (
        usingDemoBoard
          ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-900">Demo note preview</p>
              <p className="text-sm text-gray-600">
                This board is showing fallback demo notes. Selection is live, but editing and inspector actions stay disabled until real board data exists.
              </p>
            </div>
          )
          : (
            <>
              <IdeaAttentionPanel
                idea={selectedCanvasIdea}
                critiques={canvasCritiques}
                highlightedAttentionId={selectedAttentionItemId}
              />
              <WorkspacePhaseFlow
                idea={selectedCanvasIdea}
                onUpdate={handleIdeaUpdate}
                source="canvas"
                ambiguityPresentation="full"
              />
            </>
          )
      ) : null}
      extraOverlays={
        <ConnectionInspectorPopover
          open={Boolean(inspectorConnection)}
          connection={inspectorConnection}
          ideas={ideas}
          anchor={connectionInspectorAnchor}
          onSave={handleConnectionInspectorSave}
          onClose={closeConnectionInspector}
          busy={connectionInspectorBusy}
          error={connectionInspectorError}
        />
      }
    />
  );
}

// Re-export dispatchAndWait for use in event listeners above (suppress unused warning)
void dispatchAndWait;

export default BoardScreen;
